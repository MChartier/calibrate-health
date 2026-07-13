import crypto from 'node:crypto';
import { MobileDevicePlatform, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { MS_PER_DAY, MS_PER_MINUTE } from '../utils/time';
import { serializeUserForClient, USER_CLIENT_SELECT, type UserClientPayload } from '../utils/userSerialization';
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '../utils/language';
import { isProductionOrStagingEnv } from '../config/environment';
import { MOBILE_DEVICE_PLATFORMS, type MobileDevicePlatform as MobileDevicePlatformWire } from '../../../shared/domain';

const TOKEN_BYTES = 32;
const ACCESS_TOKEN_TTL_MS = 15 * MS_PER_MINUTE; // Short-lived token limits exposure if device storage is compromised.
const REFRESH_TOKEN_TTL_MS = 30 * MS_PER_DAY; // Native clients can stay signed in without storing passwords.
const WEAR_PAIRING_TTL_MS = 5 * MS_PER_MINUTE; // Nearby transfer should finish quickly; stale codes must become useless.
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_DEVICE_NAME_LENGTH = 120;
const MAX_PAIRING_TOKEN_LENGTH = 256;
const MAX_WEAR_PUBLIC_KEY_LENGTH = 2_048;
const MAX_WEAR_SIGNATURE_LENGTH = 512;
const WEAR_PAIRING_CHALLENGE_BYTES = 32;
const MAX_ACTIVE_WEAR_PAIRING_CREDENTIALS = 5;
export const WEAR_PAIRING_PROTOCOL_VERSION = 1;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

type IssuedMobileSession = TokenPair & { sessionId: number };

export type WearAuthPrincipal = Pick<
  UserClientPayload,
  'id' | 'timezone' | 'language' | 'weight_unit' | 'height_unit'
>;

type MobileAuthPrincipal = UserClientPayload | WearAuthPrincipal;

const serializeWearAuthPrincipal = (user: {
  id: number;
  timezone: string;
  language: string;
  weight_unit: UserClientPayload['weight_unit'];
  height_unit: UserClientPayload['height_unit'];
}): WearAuthPrincipal => ({
  id: user.id,
  timezone: user.timezone,
  language: isSupportedLanguage(user.language) ? user.language : SUPPORTED_LANGUAGES.EN,
  weight_unit: user.weight_unit,
  height_unit: user.height_unit
});

export type MobileAuthSessionPayload = TokenPair & {
  user: MobileAuthPrincipal;
};

export type WearPairingCredentialPayload = {
  pairingToken: string;
  serverOrigin: string;
  watchDeviceId: string;
  protocolVersion: number;
  challenge: string;
  expiresAt: Date;
};

export type WearPairingErrorCode =
  | 'INVALID_PAIRING_REQUEST'
  | 'PAIRING_PHONE_SESSION_REQUIRED'
  | 'INVALID_PAIRING_CREDENTIAL'
  | 'PAIRING_CREDENTIAL_EXPIRED'
  | 'PAIRING_CREDENTIAL_USED'
  | 'PAIRING_RESPONSE_LOST'
  | 'PAIRING_BINDING_MISMATCH'
  | 'PAIRING_SIGNATURE_INVALID';

type WearPairingFailure = {
  ok: false;
  status: 400 | 401 | 403 | 409 | 410;
  code: WearPairingErrorCode;
  message: string;
};

export type WearPairingIssueResult =
  | { ok: true; credential: WearPairingCredentialPayload }
  | WearPairingFailure;

export type WearPairingExchangeResult =
  | { ok: true; payload: MobileAuthSessionPayload }
  | WearPairingFailure;

export type MobileSessionSummary = {
  id: number;
  device_id: string;
  device_platform: MobileDevicePlatformWire;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
  refresh_expires_at: string;
  current: boolean;
};

type ParsedMobileDevice = {
  deviceId: string;
  devicePlatform: MobileDevicePlatform;
  deviceName: string | null;
};

type ParseMobileDeviceResult =
  | { ok: true; device: ParsedMobileDevice }
  | { ok: false; message: string };

type AuthenticateAccessTokenResult =
  | {
      ok: true;
      user: MobileAuthPrincipal;
      sessionId: number;
      deviceId: string;
      devicePlatform: MobileDevicePlatformWire;
    }
  | { ok: false; status: number; message: string };

const randomToken = (): string => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

export const hashMobileToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

const hashWearExchangeId = (exchangeId: string): string => hashMobileToken(exchangeId);

const buildTokenPair = (now = new Date()): TokenPair => ({
  accessToken: randomToken(),
  refreshToken: randomToken(),
  accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
  refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
});

const isLocalPairingHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '10.0.2.2' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.local')
  ) return true;
  if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
};

/** Match the Android client policy: HTTPS remotely, HTTP only on loopback/private/LAN hosts. */
let hasWarnedAboutInsecureWearPairing = false;
export const normalizePairingServerOrigin = (
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn
): string | null => {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.protocol === 'http:' && !isLocalPairingHostname(parsed.hostname)) return null;
    if (parsed.protocol === 'http:' && isProductionOrStagingEnv(env.NODE_ENV)) {
      if (env.ALLOW_INSECURE_WEAR_PAIRING !== 'true') return null;
      if (!hasWarnedAboutInsecureWearPairing) {
        warn(
          'ALLOW_INSECURE_WEAR_PAIRING=true permits Wear pairing over cleartext LAN HTTP; ' +
          'pairing credentials and health data can be intercepted. Configure HTTPS and unset this override.'
        );
        hasWarnedAboutInsecureWearPairing = true;
      }
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

type ParsedWearPublicKey = {
  normalizedSpki: string;
  key: crypto.KeyObject;
};

/** Accept only P-256 SubjectPublicKeyInfo keys generated by Android Keystore. */
export function parseWearPublicKeySpki(value: unknown): ParsedWearPublicKey | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_WEAR_PUBLIC_KEY_LENGTH) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const der = Buffer.from(value, 'base64');
    if (der.length === 0 || der.toString('base64') !== value) return null;
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return { normalizedSpki: der.toString('base64'), key };
  } catch {
    return null;
  }
}

/** Bytes the watch signs with SHA256withECDSA for pairing protocol v1. */
export function buildWearPairingChallengePayload(options: {
  serverOrigin: string;
  watchDeviceId: string;
  exchangeId: string;
  challenge: string;
}): Buffer {
  return Buffer.from(
    `calibrate-wear-pairing-v1\n${options.serverOrigin}\n${options.watchDeviceId}\n${options.exchangeId}\n${options.challenge}`,
    'utf8'
  );
}

const normalizeExchangeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
};

function parseWearSignature(value: unknown): Buffer | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_WEAR_SIGNATURE_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const signature = Buffer.from(value, 'base64url');
    return signature.length > 0 ? signature : null;
  } catch {
    return null;
  }
}

const pairingFailure = (
  status: WearPairingFailure['status'],
  code: WearPairingErrorCode,
  message: string
): WearPairingFailure => ({ ok: false, status, code, message });

const normalizeRequiredText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const parseMobileDevicePlatform = (value: unknown): MobileDevicePlatform | null => {
  if (value === undefined || value === null || value === MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE) {
    return MobileDevicePlatform.ANDROID_PHONE;
  }
  if (value === MOBILE_DEVICE_PLATFORMS.WEAR_OS) {
    return MobileDevicePlatform.WEAR_OS;
  }
  return null;
};

export const serializeMobileDevicePlatform = (
  value: MobileDevicePlatform
): MobileDevicePlatformWire =>
  value === MobileDevicePlatform.WEAR_OS
    ? MOBILE_DEVICE_PLATFORMS.WEAR_OS
    : MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE;

/**
 * Validate native device metadata sent with login/register.
 */
export const parseMobileDevicePayload = (body: unknown): ParseMobileDeviceResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Invalid request body' };
  }

  const record = body as Record<string, unknown>;
  const deviceId = normalizeRequiredText(record.device_id, MAX_DEVICE_ID_LENGTH);
  if (!deviceId) {
    return { ok: false, message: 'device_id is required' };
  }

  const devicePlatform = parseMobileDevicePlatform(record.device_platform);
  if (!devicePlatform) {
    return { ok: false, message: 'Invalid device_platform' };
  }

  return {
    ok: true,
    device: {
      deviceId,
      devicePlatform,
      deviceName: normalizeOptionalText(record.device_name, MAX_DEVICE_NAME_LENGTH)
    }
  };
};

/**
 * Create a mobile session and return the one-time visible token pair.
 */
export async function issueMobileSession(opts: {
  userId: number;
  device: ParsedMobileDevice;
  now?: Date;
}, database: Prisma.TransactionClient | typeof prisma = prisma): Promise<IssuedMobileSession> {
  const tokens = buildTokenPair(opts.now);

  const session = await database.mobileAuthSession.create({
    data: {
      user_id: opts.userId,
      device_id: opts.device.deviceId,
      device_platform: opts.device.devicePlatform,
      device_name: opts.device.deviceName,
      access_token_hash: hashMobileToken(tokens.accessToken),
      refresh_token_hash: hashMobileToken(tokens.refreshToken),
      access_expires_at: tokens.accessExpiresAt,
      refresh_expires_at: tokens.refreshExpiresAt
    }
  });

  return { ...tokens, sessionId: session.id };
}

/** Issue one active, one-time Wear credential from a live Android phone session. */
export async function issueWearPairingCredential(opts: {
  userId: number;
  issuingSessionId: number;
  serverOrigin: string;
  watchDeviceId: unknown;
  watchDeviceName?: unknown;
  protocolVersion: unknown;
  watchPublicKeySpki: unknown;
  now?: Date;
}): Promise<WearPairingIssueResult> {
  const serverOrigin = normalizePairingServerOrigin(opts.serverOrigin);
  const device = parseMobileDevicePayload({
    device_id: opts.watchDeviceId,
    device_name: opts.watchDeviceName,
    device_platform: MOBILE_DEVICE_PLATFORMS.WEAR_OS
  });
  const publicKey = parseWearPublicKeySpki(opts.watchPublicKeySpki);
  if (
    !serverOrigin ||
    !device.ok ||
    opts.protocolVersion !== WEAR_PAIRING_PROTOCOL_VERSION ||
    !publicKey
  ) {
    return pairingFailure(400, 'INVALID_PAIRING_REQUEST', 'Invalid Wear pairing request');
  }
  const now = opts.now ?? new Date();
  const pairingToken = `wear_pair_${randomToken()}`;
  const challenge = crypto.randomBytes(WEAR_PAIRING_CHALLENGE_BYTES).toString('base64url');
  const expiresAt = new Date(now.getTime() + WEAR_PAIRING_TTL_MS);

  return prisma.$transaction(async (tx) => {
    // A harmless timestamp update takes a row lock and serializes issuance with revocation and
    // other issuances from this phone session.
    const phoneSession = await tx.mobileAuthSession.updateMany({
      where: {
        id: opts.issuingSessionId,
        user_id: opts.userId,
        device_platform: MobileDevicePlatform.ANDROID_PHONE,
        revoked_at: null,
        refresh_expires_at: { gt: now }
      },
      data: { last_used_at: now }
    });
    if (phoneSession.count !== 1) {
      return pairingFailure(
        403,
        'PAIRING_PHONE_SESSION_REQUIRED',
        'Wear pairing requires an active Android phone session'
      );
    }

    await tx.wearPairingCredential.deleteMany({
      where: {
        issuing_mobile_session_id: opts.issuingSessionId,
        OR: [
          { consumed_at: { not: null }, created_mobile_session_id: null },
          { expires_at: { lte: now } }
        ]
      }
    });
    const overflow = await tx.wearPairingCredential.findMany({
      where: {
        issuing_mobile_session_id: opts.issuingSessionId,
        consumed_at: null,
        expires_at: { gt: now }
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: MAX_ACTIVE_WEAR_PAIRING_CREDENTIALS - 1,
      select: { id: true }
    });
    if (overflow.length > 0) {
      await tx.wearPairingCredential.deleteMany({
        where: { id: { in: overflow.map((credential) => credential.id) } }
      });
    }

    await tx.wearPairingCredential.create({
      data: {
        user_id: opts.userId,
        issuing_mobile_session_id: opts.issuingSessionId,
        token_hash: hashMobileToken(pairingToken),
        server_origin: serverOrigin,
        watch_device_id: device.device.deviceId,
        watch_device_name: device.device.deviceName,
        protocol_version: WEAR_PAIRING_PROTOCOL_VERSION,
        challenge,
        watch_public_key_spki: publicKey.normalizedSpki,
        expires_at: expiresAt
      }
    });

    return {
      ok: true,
      credential: {
        pairingToken,
        serverOrigin,
        watchDeviceId: device.device.deviceId,
        protocolVersion: WEAR_PAIRING_PROTOCOL_VERSION,
        challenge,
        expiresAt
      }
    } as const;
  });
}

/** Exchange a server-bound one-time credential for a normal revocable Wear OS session. */
export async function exchangeWearPairingCredential(
  body: unknown,
  now = new Date()
): Promise<WearPairingExchangeResult> {
  if (!body || typeof body !== 'object') {
    return pairingFailure(400, 'INVALID_PAIRING_REQUEST', 'Invalid request body');
  }
  const record = body as Record<string, unknown>;
  const pairingToken = normalizeRequiredText(record.pairing_token, MAX_PAIRING_TOKEN_LENGTH);
  const serverOrigin = normalizePairingServerOrigin(record.server_origin);
  const watchDeviceId = normalizeRequiredText(record.watch_device_id, MAX_DEVICE_ID_LENGTH);
  const exchangeId = normalizeExchangeId(record.exchange_id);
  const signature = parseWearSignature(record.challenge_signature);
  if (
    !pairingToken ||
    !serverOrigin ||
    !watchDeviceId ||
    !exchangeId ||
    record.protocol_version !== WEAR_PAIRING_PROTOCOL_VERSION ||
    !signature
  ) {
    return pairingFailure(400, 'INVALID_PAIRING_REQUEST', 'Invalid Wear pairing exchange request');
  }

  return prisma.$transaction(async (tx) => {
    const credential = await tx.wearPairingCredential.findUnique({
      where: { token_hash: hashMobileToken(pairingToken) }
    });
    if (!credential) {
      return pairingFailure(401, 'INVALID_PAIRING_CREDENTIAL', 'Invalid Wear pairing credential');
    }
    if (
      credential.server_origin !== serverOrigin ||
      credential.watch_device_id !== watchDeviceId ||
      credential.protocol_version !== WEAR_PAIRING_PROTOCOL_VERSION
    ) {
      return pairingFailure(409, 'PAIRING_BINDING_MISMATCH', 'Wear pairing binding does not match');
    }
    if (credential.expires_at <= now) {
      return pairingFailure(410, 'PAIRING_CREDENTIAL_EXPIRED', 'Wear pairing credential expired');
    }

    const publicKey = parseWearPublicKeySpki(credential.watch_public_key_spki);
    const signatureValid = publicKey
      ? crypto.verify(
          'sha256',
          buildWearPairingChallengePayload({
            serverOrigin,
            watchDeviceId,
            exchangeId,
            challenge: credential.challenge
          }),
          publicKey.key,
          signature
        )
      : false;
    if (!signatureValid) {
      return pairingFailure(401, 'PAIRING_SIGNATURE_INVALID', 'Wear pairing signature is invalid');
    }

    const exchangeIdHash = hashWearExchangeId(exchangeId);
    if (credential.consumed_at) {
      if (credential.exchange_id_hash === exchangeIdHash && credential.created_mobile_session_id) {
        // A retry of the same signed exchange UUID means the success response may have been lost.
        // Never replay credentials: revoke the possibly orphaned session and require fresh pairing.
        await tx.mobileAuthSession.updateMany({
          where: {
            id: credential.created_mobile_session_id,
            user_id: credential.user_id,
            device_platform: MobileDevicePlatform.WEAR_OS,
            revoked_at: null
          },
          data: { revoked_at: now }
        });
        await tx.nativePushSubscription.updateMany({
          where: { mobile_auth_session_id: credential.created_mobile_session_id, revoked_at: null },
          data: { revoked_at: now }
        });
        return pairingFailure(
          409,
          'PAIRING_RESPONSE_LOST',
          'Previous pairing session was revoked; start pairing again'
        );
      }
      return pairingFailure(409, 'PAIRING_CREDENTIAL_USED', 'Wear pairing credential was already used');
    }

    // The update takes a row lock until this transaction commits. A concurrent issuer revocation
    // therefore linearizes either before this check (exchange fails) or after session creation.
    const activeIssuer = await tx.mobileAuthSession.updateMany({
      where: {
        id: credential.issuing_mobile_session_id,
        user_id: credential.user_id,
        device_platform: MobileDevicePlatform.ANDROID_PHONE,
        revoked_at: null,
        refresh_expires_at: { gt: now }
      },
      data: { last_used_at: now }
    });
    if (activeIssuer.count !== 1) {
      return pairingFailure(401, 'INVALID_PAIRING_CREDENTIAL', 'Issuing phone session is no longer active');
    }
    const user = await tx.user.findUnique({
      where: { id: credential.user_id },
      select: {
        id: true,
        timezone: true,
        language: true,
        weight_unit: true,
        height_unit: true
      }
    });
    if (!user) {
      return pairingFailure(401, 'INVALID_PAIRING_CREDENTIAL', 'Invalid Wear pairing credential');
    }
    const claimed = await tx.wearPairingCredential.updateMany({
      where: {
        id: credential.id,
        token_hash: hashMobileToken(pairingToken),
        consumed_at: null,
        expires_at: { gt: now }
      },
      data: { consumed_at: now, exchange_id_hash: exchangeIdHash }
    });
    if (claimed.count !== 1) {
      return pairingFailure(409, 'PAIRING_CREDENTIAL_USED', 'Wear pairing credential was already used');
    }

    const issuedSession = await issueMobileSession({
      userId: credential.user_id,
      device: {
        deviceId: credential.watch_device_id,
        deviceName: credential.watch_device_name,
        devicePlatform: MobileDevicePlatform.WEAR_OS
      },
      now
    }, tx);
    await tx.wearPairingCredential.update({
      where: { id: credential.id },
      data: { created_mobile_session_id: issuedSession.sessionId }
    });
    const { sessionId: _sessionId, ...tokens } = issuedSession;
    return {
      ok: true,
      payload: {
        user: serializeWearAuthPrincipal(user),
        ...tokens
      }
    } as const;
  });
}

export async function issueMobileAuthPayload(opts: {
  userId: number;
  device: ParsedMobileDevice;
}): Promise<MobileAuthSessionPayload | null> {
  const [user, issuedSession] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.userId }, select: USER_CLIENT_SELECT }),
    issueMobileSession(opts)
  ]);

  if (!user) {
    return null;
  }

  const { sessionId: _sessionId, ...tokens } = issuedSession;

  return {
    user: serializeUserForClient(user),
    ...tokens
  };
}

/**
 * Rotate a refresh token into a new access/refresh pair for the same native session.
 */
export async function refreshMobileSession(refreshToken: string): Promise<MobileAuthSessionPayload | null> {
  const tokenHash = hashMobileToken(refreshToken);
  const now = new Date();
  const existing = await prisma.mobileAuthSession.findUnique({
    where: { refresh_token_hash: tokenHash },
    select: { id: true }
  });

  if (!existing) return null;

  const tokens = buildTokenPair(now);
  // Claim the presented refresh token in one database write. Concurrent replays can read the
  // same session, but only one can replace the matching hash and create a valid successor chain.
  const claimed = await prisma.mobileAuthSession.updateMany({
    where: {
      id: existing.id,
      refresh_token_hash: tokenHash,
      revoked_at: null,
      refresh_expires_at: { gt: now }
    },
    data: {
      access_token_hash: hashMobileToken(tokens.accessToken),
      refresh_token_hash: hashMobileToken(tokens.refreshToken),
      access_expires_at: tokens.accessExpiresAt,
      refresh_expires_at: tokens.refreshExpiresAt,
      last_used_at: now
    }
  });

  if (claimed.count !== 1) return null;

  const updated = await prisma.mobileAuthSession.findUnique({
    where: { id: existing.id },
    include: {
      user: {
        select: USER_CLIENT_SELECT
      }
    }
  });

  if (!updated) return null;

  const user = updated.device_platform === MobileDevicePlatform.WEAR_OS
    ? serializeWearAuthPrincipal(updated.user)
    : serializeUserForClient(updated.user);

  return {
    user,
    ...tokens
  };
}

/**
 * Revoke a mobile session by refresh token. Repeated logout calls remain idempotent.
 */
export async function revokeMobileSessionByRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashMobileToken(refreshToken);
  await revokeMobileSessionsAndPushSubscriptions({ refresh_token_hash: tokenHash });
}

/** Revoke sessions and every push endpoint authorized by them in the same database transaction. */
async function revokeMobileSessionsAndPushSubscriptions(tokenWhere: {
  access_token_hash?: string;
  refresh_token_hash?: string;
}): Promise<void> {
  const sessions = await prisma.mobileAuthSession.findMany({
    where: {
      ...tokenWhere,
      revoked_at: null
    },
    select: { id: true }
  });
  await revokeMobileSessionIds(sessions.map((session) => session.id));
}

/** Revoke a known set of owned sessions and their notification endpoints atomically. */
async function revokeMobileSessionIds(sessionIds: number[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const revokedAt = new Date();
  const [sessionResult] = await prisma.$transaction([
    prisma.mobileAuthSession.updateMany({
      where: { id: { in: sessionIds }, revoked_at: null },
      data: { revoked_at: revokedAt }
    }),
    prisma.nativePushSubscription.updateMany({
      where: { mobile_auth_session_id: { in: sessionIds }, revoked_at: null },
      data: { revoked_at: revokedAt }
    })
  ]);
  return sessionResult.count;
}

/**
 * Revoke a mobile session by access token when the refresh token is not available.
 */
export async function revokeMobileSessionByAccessToken(accessToken: string): Promise<void> {
  const tokenHash = hashMobileToken(accessToken);
  await revokeMobileSessionsAndPushSubscriptions({ access_token_hash: tokenHash });
}

/** List active native sessions without exposing credential hashes. */
export async function listMobileSessionsForUser(
  userId: number,
  currentSessionId?: number
): Promise<MobileSessionSummary[]> {
  const sessions = await prisma.mobileAuthSession.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
      refresh_expires_at: { gt: new Date() }
    },
    orderBy: [{ last_used_at: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      device_id: true,
      device_platform: true,
      device_name: true,
      created_at: true,
      last_used_at: true,
      refresh_expires_at: true
    }
  });

  return sessions.map((session) => ({
    id: session.id,
    device_id: session.device_id,
    device_platform: serializeMobileDevicePlatform(session.device_platform),
    device_name: session.device_name,
    created_at: session.created_at.toISOString(),
    last_used_at: session.last_used_at?.toISOString() ?? null,
    refresh_expires_at: session.refresh_expires_at.toISOString(),
    current: session.id === currentSessionId
  }));
}

/** Revoke one session only when it belongs to the authenticated account. */
export async function revokeMobileSessionForUser(userId: number, sessionId: number): Promise<boolean> {
  const owned = await prisma.mobileAuthSession.findFirst({
    where: { id: sessionId, user_id: userId, revoked_at: null },
    select: { id: true }
  });
  if (!owned) return false;
  return (await revokeMobileSessionIds([owned.id])) === 1;
}

/** Revoke every active native session except the caller's current bearer session, when present. */
export async function revokeOtherMobileSessionsForUser(
  userId: number,
  currentSessionId?: number
): Promise<number> {
  const sessions = await prisma.mobileAuthSession.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {})
    },
    select: { id: true }
  });
  return revokeMobileSessionIds(sessions.map((session) => session.id));
}

/**
 * Resolve and validate the Authorization header used by native clients.
 */
export async function authenticateMobileAccessToken(
  authorizationHeader: string
): Promise<AuthenticateAccessTokenResult> {
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, message: 'Invalid authorization header' };
  }

  const token = match[1]?.trim();
  if (!token) {
    return { ok: false, status: 401, message: 'Invalid authorization header' };
  }

  const now = new Date();
  const session = await prisma.mobileAuthSession.findUnique({
    where: { access_token_hash: hashMobileToken(token) },
    include: {
      user: {
        select: USER_CLIENT_SELECT
      }
    }
  });

  if (!session || session.revoked_at || session.access_expires_at <= now) {
    return { ok: false, status: 401, message: 'Invalid or expired access token' };
  }

  await prisma.mobileAuthSession.update({
    where: { id: session.id },
    data: { last_used_at: now }
  });

  return {
    ok: true,
    user: session.device_platform === MobileDevicePlatform.WEAR_OS
      ? serializeWearAuthPrincipal(session.user)
      : serializeUserForClient(session.user),
    sessionId: session.id,
    deviceId: session.device_id,
    devicePlatform: serializeMobileDevicePlatform(session.device_platform)
  };
}

export function formatMobileAuthResponse(payload: MobileAuthSessionPayload) {
  return {
    user: payload.user,
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
    access_expires_at: payload.accessExpiresAt.toISOString(),
    refresh_expires_at: payload.refreshExpiresAt.toISOString()
  };
}
