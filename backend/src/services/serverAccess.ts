import { Prisma, ServerRole, type ServerAccessState } from '@prisma/client';
import prisma from '../config/database';
import { USER_CLIENT_SELECT } from '../utils/userSerialization';

const SERVER_ACCESS_ID = 1;
// User ids are PostgreSQL INTEGERs. Never preserve ids for accounts that do not exist yet.
const MAX_USER_ID = 2_147_483_647;

export class ServerAccessError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function parseLegacyAdminUserIds(value: string | undefined): number[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim())
    .filter((part) => /^[1-9]\d*$/.test(part))
    .map(Number).filter((id) => Number.isSafeInteger(id) && id <= MAX_USER_ID))];
}

/** The managed flag disables ownership claiming even outside production/staging. */
export function allowsFirstUserAdmin(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.CALIBRATE_HOSTED_SERVICE?.trim().toLowerCase();
  return flag === undefined || flag === '' || flag === 'false';
}

async function initializeLockedAccess(tx: Prisma.TransactionClient, state: ServerAccessState) {
  if (state.legacy_admin_imported_at) return;
  const ids = parseLegacyAdminUserIds(process.env.ADMIN_USER_IDS);
  if (ids.length > 0) {
    // Match only existing accounts once. Verification is still required for effective access.
    await tx.user.updateMany({ where: { id: { in: ids } }, data: { server_role: ServerRole.admin } });
  }
  const hasUsers = await tx.user.count() > 0;
  const updated = await tx.serverAccessState.update({
    where: { id: SERVER_ACCESS_ID },
    data: {
      legacy_admin_imported_at: new Date(),
      first_user_bootstrap_available: state.first_user_bootstrap_available && !hasUsers && allowsFirstUserAdmin()
    }
  });
  Object.assign(state, updated);
}

/** Serialize ownership changes; READ COMMITTED sees changes made by the previous lock holder. */
export async function withServerAccessLock<T>(
  action: (tx: Prisma.TransactionClient, state: ServerAccessState) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const [state] = await tx.$queryRaw<ServerAccessState[]>`
      SELECT "id", "first_user_bootstrap_available", "legacy_admin_imported_at"
      FROM "ServerAccessState" WHERE "id" = 1 FOR UPDATE
    `;
    if (!state) throw new Error('Server access migration is required before serving requests.');
    await initializeLockedAccess(tx, state);
    return action(tx, state);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function initializeServerAccess(): Promise<void> {
  await withServerAccessLock(async () => undefined);
}

export async function createRegisteredUser(data: Prisma.UserCreateInput) {
  return withServerAccessLock(async (tx, state) => {
    const isFirstUser = state.first_user_bootstrap_available && allowsFirstUserAdmin() && await tx.user.count() === 0;
    const user = await tx.user.create({
      data: { ...data, server_role: isFirstUser ? ServerRole.admin : ServerRole.member },
      select: USER_CLIENT_SELECT
    });
    if (state.first_user_bootstrap_available) {
      await tx.serverAccessState.update({
        where: { id: SERVER_ACCESS_ID }, data: { first_user_bootstrap_available: false }
      });
    }
    return user;
  });
}

/** Failed email delivery must not remove a newly claimed owner or reopen ownership claiming. */
export async function cleanupFailedRegistration(userId: number): Promise<boolean> {
  return withServerAccessLock(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { server_role: true, email_verified_at: true } });
    if (!user || user.server_role === ServerRole.admin || user.email_verified_at) return false;
    // Verification uses its own token transaction, so recheck eligibility in the DELETE itself.
    return (await tx.user.deleteMany({
      where: { id: userId, server_role: ServerRole.member, email_verified_at: null }
    })).count > 0;
  });
}

async function assertServerAdmin(tx: Pick<Prisma.TransactionClient, 'user'>, userId: number): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId }, select: { server_role: true, email_verified_at: true }
  });
  if (user?.server_role !== ServerRole.admin || !user.email_verified_at) {
    throw new ServerAccessError(403, 'ADMIN_REQUIRED', 'Server administrator access is required.');
  }
}

export async function isServerAdmin(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { server_role: true, email_verified_at: true }
  });
  return user?.server_role === ServerRole.admin && Boolean(user.email_verified_at);
}

export async function assertCanRemoveServerAdmin(tx: Prisma.TransactionClient, userId: number): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { server_role: true } });
  if (user?.server_role !== ServerRole.admin) return;
  const otherAdmins = await tx.user.count({
    where: { id: { not: userId }, server_role: ServerRole.admin, email_verified_at: { not: null } }
  });
  if (otherAdmins === 0) {
    throw new ServerAccessError(409, 'LAST_ADMIN_REQUIRED', 'Add another verified administrator before removing this administrator.');
  }
}

// Keep the administrator directory strictly separate from profile, health, and credential data.
const SERVER_USER_SELECT = {
  id: true, email: true, server_role: true, created_at: true, email_verified_at: true
} satisfies Prisma.UserSelect;

type ServerUserRow = Prisma.UserGetPayload<{ select: typeof SERVER_USER_SELECT }>;
const serializeServerUser = (user: ServerUserRow) => ({
  id: user.id,
  email: user.email,
  role: user.server_role,
  created_at: user.created_at.toISOString(),
  email_verified: Boolean(user.email_verified_at)
});

export async function listServerUsers(actorId: number, query: { search?: string; cursor?: number; limit: number }) {
  await assertServerAdmin(prisma, actorId);
  const users = await prisma.user.findMany({
    where: {
      ...(query.search ? { email: { contains: query.search, mode: 'insensitive' as const } } : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {})
    },
    orderBy: { id: 'asc' }, take: query.limit + 1, select: SERVER_USER_SELECT
  });
  // Reads must not serialize ownership changes. Recheck a revocation that committed during the scan.
  await assertServerAdmin(prisma, actorId);
  const page = users.slice(0, query.limit);
  return {
    users: page.map(serializeServerUser),
    next_cursor: users.length > query.limit ? page[page.length - 1].id : null
  };
}

export async function updateServerUserRole(actorId: number, userId: number, role: ServerRole) {
  return withServerAccessLock(async (tx) => {
    await assertServerAdmin(tx, actorId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: SERVER_USER_SELECT });
    if (!user) throw new ServerAccessError(404, 'USER_NOT_FOUND', 'User not found.');
    if (role === ServerRole.admin && !user.email_verified_at) {
      throw new ServerAccessError(409, 'EMAIL_VERIFICATION_REQUIRED', 'This account must verify its email before becoming an administrator.');
    }
    if (role === ServerRole.member) await assertCanRemoveServerAdmin(tx, userId);
    return { user: serializeServerUser(await tx.user.update({
      where: { id: userId }, data: { server_role: role }, select: SERVER_USER_SELECT
    })) };
  });
}

export async function updateServerFeaturesAsAdmin(actorId: number, nutritionLabelScanning: boolean) {
  return withServerAccessLock(async (tx) => {
    await assertServerAdmin(tx, actorId);
    const settings = await tx.serverSettings.upsert({
      where: { id: 1 },
      create: { id: 1, nutrition_label_scanning_enabled: nutritionLabelScanning },
      update: { nutrition_label_scanning_enabled: nutritionLabelScanning }
    });
    return { nutrition_label_scanning: settings.nutrition_label_scanning_enabled };
  });
}

/** Explicit operator-only recovery; never creates accounts or reserves grants for future signups. */
export async function grantServerAdminToExistingAccount(identity: string | number) {
  return withServerAccessLock(async (tx) => {
    const users = await tx.user.findMany({
      where: typeof identity === 'number' ? { id: identity } : { email: { equals: identity, mode: 'insensitive' } },
      orderBy: { id: 'asc' }, take: 2, select: SERVER_USER_SELECT
    });
    if (users.length > 1) {
      throw new ServerAccessError(409, 'AMBIGUOUS_ACCOUNT', 'Multiple accounts match that email. Confirm the intended account ID and use --id.');
    }
    const user = users[0];
    if (!user) throw new ServerAccessError(404, 'USER_NOT_FOUND', 'Create the account before granting administrator access.');
    if (!user.email_verified_at) {
      throw new ServerAccessError(409, 'EMAIL_VERIFICATION_REQUIRED', 'Verify this account before granting administrator access.');
    }
    return serializeServerUser(await tx.user.update({
      where: { id: user.id }, data: { server_role: ServerRole.admin }, select: SERVER_USER_SELECT
    }));
  });
}
