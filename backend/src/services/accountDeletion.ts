import type { AccountDeletion, PrismaClient } from '@prisma/client';
import { MS_PER_MINUTE } from '../utils/time';

type Identity = { userId: number; installationId: string; sourceId: string; projectId: string; uid: string };
type Observation = { identity: Identity; status: 'present' | 'absent' };
type Authentication = { identity: Identity; authenticatedAt: Date };

/** No implementation or runtime construction is shipped. Tests supply the entire provider. */
interface DeletionProvider {
  authenticate(identity: Identity, password: string, signal: AbortSignal): Promise<Authentication | null>;
  inspect(identity: Identity, signal: AbortSignal): Promise<Observation>;
  delete(identity: Identity, signal: AbortSignal): Promise<void>;
}

const identityOf = (row: Pick<AccountDeletion, 'user_id' | 'installation_id' | 'source_id' | 'project_id' | 'uid'>): Identity => ({
  userId: row.user_id, installationId: row.installation_id, sourceId: row.source_id, projectId: row.project_id, uid: row.uid
});
const sameIdentity = (a: Identity, b: Identity): boolean => Boolean(b) &&
  a.userId === b.userId && a.installationId === b.installationId && a.sourceId === b.sourceId && a.projectId === b.projectId && a.uid === b.uid;
const operationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF_TTL_MS = MS_PER_MINUTE;
const CLAIM_TTL_MS = MS_PER_MINUTE;
type Proof = { identity: Identity; version: number; expiresAt: number };
class IdentityMismatch extends Error {}

/** Dormant internal coordinator: explicit dependencies, no HTTP, queue, timer or production caller. */
export class AccountDeletionCoordinator {
  private readonly proofs = new WeakMap<object, Proof>();

  constructor(private readonly database: PrismaClient, private readonly provider: DeletionProvider,
    private readonly timeoutMs = 5000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw Error('Invalid provider timeout');
  }

  private async bounded<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => work(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error('Provider unavailable')); }, this.timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  /** Produces an unforgeable, process-local proof; password/provider credentials are never retained. */
  async authenticate(userId: number, password: string): Promise<object | null> {
    const user = await this.database.user.findUnique({
      where: { id: userId, deletion_pending: false },
      select: { credential_security_version: true, firebase_identity: true }
    });
    if (!user?.firebase_identity) return null;
    const identity = identityOf(user.firebase_identity);
    let authenticated: Authentication | null;
    try { authenticated = await this.bounded(signal => this.provider.authenticate({ ...identity }, password, signal)); }
    catch { return null; }
    const time = authenticated?.authenticatedAt instanceof Date ? authenticated.authenticatedAt.getTime() : NaN;
    const now = Date.now();
    if (!authenticated || !sameIdentity(identity, authenticated.identity) || !Number.isFinite(time) ||
      time! > now || time! < now - PROOF_TTL_MS) return null;
    const proof = Object.freeze({});
    this.proofs.set(proof, { identity, version: user.credential_security_version, expiresAt: time! + PROOF_TTL_MS });
    return proof;
  }

  async begin(operationId: string, proof: object): Promise<string> {
    const verified = this.proofs.get(proof);
    if (!operationPattern.test(operationId) || !verified || verified.expiresAt <= Date.now()) throw Error('Invalid deletion proof');
    return this.database.$transaction(async tx => {
      // All successful intent writers first serialize on the immutable application account.
      const locked = await tx.user.updateMany({
        where: { id: verified.identity.userId, deletion_pending: false, credential_security_version: verified.version },
        data: { credential_security_version: verified.version }
      });
      if (locked.count !== 1) {
        const previous = await tx.accountDeletion.findUnique({ where: { operation_id: operationId } });
        if (previous && previous.credential_version === verified.version && sameIdentity(verified.identity, identityOf(previous))) return previous.state;
        throw Error('Deletion proof is no longer current');
      }
      if (verified.expiresAt <= Date.now()) throw Error('Deletion proof expired');
      const identity = await tx.firebaseIdentity.findUnique({ where: { user_id: verified.identity.userId } });
      if (!identity || !sameIdentity(verified.identity, identityOf(identity))) throw Error('Deletion identity changed');
      const userId = identity.user_id;
      await tx.accountDeletion.create({ data: {
        operation_id: operationId, user_id: userId, installation_id: identity.installation_id,
        source_id: identity.source_id, project_id: identity.project_id, uid: identity.uid,
        credential_version: verified.version
      } });
      const now = new Date();
      await tx.pushSubscription.deleteMany({ where: { user_id: userId } });
      await tx.sessionStore.deleteMany({ where: { user_id: userId } });
      await tx.mobileAuthSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
      await tx.mcpOAuthGrant.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
      await tx.mcpOAuthAuthorizationCode.deleteMany({ where: { user_id: userId } });
      await tx.wearPairingCredential.updateMany({ where: { user_id: userId, consumed_at: null }, data: { consumed_at: now } });
      await tx.nativePushSubscription.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
      await tx.accountActionToken.updateMany({ where: { user_id: userId, consumed_at: null }, data: { consumed_at: now } });
      await tx.user.update({ where: { id: userId }, data: { deletion_pending: true, credential_security_version: { increment: 1 } } });
      return 'pending_provider';
    });
  }

  /** One bounded attempt. A future authorized dispatcher may rediscover noncomplete rows after restart. */
  async resume(operationId: string): Promise<'complete' | 'pending' | 'busy' | 'held' | 'missing'> {
    const now = new Date();
    const operation = await this.database.$transaction(async tx => {
      const claimed = await tx.accountDeletion.updateMany({
        where: { operation_id: operationId, state: { not: 'complete' }, OR: [{ claim_until: null }, { claim_until: { lte: now } }] },
        data: { claim_generation: { increment: 1 }, claim_until: new Date(now.getTime() + CLAIM_TTL_MS), last_outcome: null }
      });
      return claimed.count === 1 ? tx.accountDeletion.findUniqueOrThrow({ where: { operation_id: operationId } }) : null;
    });
    if (!operation) {
      const row = await this.database.accountDeletion.findUnique({ where: { operation_id: operationId } });
      return !row ? 'missing' : row.state === 'complete' ? 'complete' : 'busy';
    }
    if (!operation.claim_until || operation.claim_until <= new Date()) return 'busy';
    const identity = identityOf(operation);
    const fence = { operation_id: operationId, claim_generation: operation.claim_generation, claim_until: { gt: new Date() }, state: { not: 'complete' } };
    try {
      if (operation.state !== 'provider_confirmed') {
        const inspect = async () => {
          const observation = await this.bounded(signal => this.provider.inspect({ ...identity }, signal));
          if (!sameIdentity(identity, observation?.identity) || !['present', 'absent'].includes(observation?.status)) throw new IdentityMismatch();
          return observation.status;
        };
        if (await inspect() === 'present') {
          await this.bounded(signal => this.provider.delete({ ...identity }, signal));
          if (await inspect() !== 'absent') throw Error('Provider outcome unresolved');
        }
        const confirmed = await this.database.accountDeletion.updateMany({
          where: { ...fence, claim_until: { gt: new Date() }, state: 'pending_provider' }, data: { state: 'provider_confirmed' }
        });
        if (confirmed.count !== 1) return 'busy';
      }
      return await this.database.$transaction(async tx => {
        const finished = await tx.accountDeletion.updateMany({
          where: { ...fence, claim_until: { gt: new Date() }, state: 'provider_confirmed' },
          data: { state: 'complete', completed_at: new Date(), claim_until: null, last_outcome: null }
        });
        if (finished.count !== 1) return 'busy' as const;
        const current = await tx.firebaseIdentity.findUnique({ where: { user_id: operation.user_id } });
        if (!current || !sameIdentity(identity, identityOf(current))) throw new IdentityMismatch();
        const deleted = await tx.user.deleteMany({ where: { id: operation.user_id, deletion_pending: true } });
        if (deleted.count !== 1) throw new IdentityMismatch();
        return 'complete' as const;
      });
    } catch (error) {
      const held = error instanceof IdentityMismatch;
      await this.database.accountDeletion.updateMany({
        where: { operation_id: operationId, claim_generation: operation.claim_generation, state: { not: 'complete' } },
        data: { claim_until: null, last_outcome: held ? 'identity_mismatch' : 'retryable_or_unknown' }
      });
      return held ? 'held' : 'pending';
    }
  }
}
