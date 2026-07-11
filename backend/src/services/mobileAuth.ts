import crypto from 'node:crypto';
import { MobileDevicePlatform } from '@prisma/client';
import prisma from '../config/database';
import { MS_PER_DAY, MS_PER_MINUTE } from '../utils/time';
import { serializeUserForClient, USER_CLIENT_SELECT, type UserClientPayload } from '../utils/userSerialization';
import { MOBILE_DEVICE_PLATFORMS, type MobileDevicePlatform as MobileDevicePlatformWire } from '../../../shared/domain';

const TOKEN_BYTES = 32;
const ACCESS_TOKEN_TTL_MS = 15 * MS_PER_MINUTE; // Short-lived token limits exposure if device storage is compromised.
const REFRESH_TOKEN_TTL_MS = 30 * MS_PER_DAY; // Native clients can stay signed in without storing passwords.
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_DEVICE_NAME_LENGTH = 120;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

export type MobileAuthSessionPayload = TokenPair & {
  user: UserClientPayload;
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
  | { ok: true; user: UserClientPayload; sessionId: number }
  | { ok: false; status: number; message: string };

const randomToken = (): string => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

export const hashMobileToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

const buildTokenPair = (now = new Date()): TokenPair => ({
  accessToken: randomToken(),
  refreshToken: randomToken(),
  accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
  refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
});

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
}): Promise<TokenPair> {
  const tokens = buildTokenPair();

  await prisma.mobileAuthSession.create({
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

  return tokens;
}

export async function issueMobileAuthPayload(opts: {
  userId: number;
  device: ParsedMobileDevice;
}): Promise<MobileAuthSessionPayload | null> {
  const [user, tokens] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.userId }, select: USER_CLIENT_SELECT }),
    issueMobileSession(opts)
  ]);

  if (!user) {
    return null;
  }

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

  return {
    user: serializeUserForClient(updated.user),
    ...tokens
  };
}

/**
 * Revoke a mobile session by refresh token. Repeated logout calls remain idempotent.
 */
export async function revokeMobileSessionByRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashMobileToken(refreshToken);
  await prisma.mobileAuthSession.updateMany({
    where: {
      refresh_token_hash: tokenHash,
      revoked_at: null
    },
    data: {
      revoked_at: new Date()
    }
  });
}

/**
 * Revoke a mobile session by access token when the refresh token is not available.
 */
export async function revokeMobileSessionByAccessToken(accessToken: string): Promise<void> {
  const tokenHash = hashMobileToken(accessToken);
  await prisma.mobileAuthSession.updateMany({
    where: {
      access_token_hash: tokenHash,
      revoked_at: null
    },
    data: {
      revoked_at: new Date()
    }
  });
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
    user: serializeUserForClient(session.user),
    sessionId: session.id
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
