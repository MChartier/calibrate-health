import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { DUMMY_AUTH_PASSWORD_HASH, normalizeEmailCredential, validatePasswordCredential } from '../utils/authCredentials';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';
import {
    exchangeWearPairingCredential,
    formatMobileAuthResponse,
    issueMobileAuthPayload,
    issueWearPairingCredential,
    listMobileSessionsForUser,
    normalizePairingServerOrigin,
    parseMobileDevicePayload,
    refreshMobileSession,
    revokeMobileSessionByAccessToken,
    revokeMobileSessionByRefreshToken,
    revokeMobileSessionForUser,
    revokeOtherMobileSessionsForUser
} from '../services/mobileAuth';
import { diagnosticsRegistry, logSafeOperationalError } from '../observability';
import { clearSessionCookie } from '../utils/sessionCookie';

/**
 * Session-based auth endpoints (register/login/logout/me).
 *
 * Routes return a sanitized user payload for client state hydration.
 */
const router = express.Router();

const INVALID_LOGIN_MESSAGE = 'Invalid email or password';
const REGISTRATION_FAILED_MESSAGE = 'Unable to create account';

const isUniqueConstraintError = (err: unknown): boolean =>
    Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002');

router.post('/register', async (req, res) => {
    const email = normalizeEmailCredential(req.body?.email);
    if (!email) {
        return res.status(400).json({ message: 'Invalid email' });
    }

    const password = req.body?.password;
    const passwordError = validatePasswordCredential(password);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }

    try {
        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true }
        });
        if (existingUser) {
            return res.status(400).json({ message: REGISTRATION_FAILED_MESSAGE });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                email,
                password_hash
            },
            // Keep response/session payloads free of sensitive columns.
            select: USER_CLIENT_SELECT
        });

        // Establish the session immediately after successful registration.
        req.login(newUser, (err) => {
            if (err) {
                logSafeOperationalError('auth.register_session', err, res.locals?.requestId);
                res.status(500).json({ message: 'Server error' });
                return;
            }
            res.json({
                user: serializeUserForClient(newUser)
            });
        });
    } catch (err) {
        if (isUniqueConstraintError(err)) {
            return res.status(400).json({ message: REGISTRATION_FAILED_MESSAGE });
        }
        logSafeOperationalError('auth.register', err, res.locals?.requestId);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/register', async (req, res) => {
    const email = normalizeEmailCredential(req.body?.email);
    if (!email) {
        return res.status(400).json({ message: 'Invalid email' });
    }

    const password = req.body?.password;
    const passwordError = validatePasswordCredential(password);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }

    const device = parseMobileDevicePayload(req.body);
    if (!device.ok) {
        return res.status(400).json({ message: device.message });
    }
    if (device.device.devicePlatform === 'WEAR_OS') {
        return res.status(400).json({ message: 'Wear OS sessions require phone pairing' });
    }

    try {
        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true }
        });
        if (existingUser) {
            return res.status(400).json({ message: REGISTRATION_FAILED_MESSAGE });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const newUser = await prisma.user.create({
            data: {
                email,
                password_hash
            },
            select: USER_CLIENT_SELECT
        });

        const authPayload = await issueMobileAuthPayload({
            userId: newUser.id,
            device: device.device
        });
        if (!authPayload) {
            return res.status(500).json({ message: 'Server error' });
        }

        res.json(formatMobileAuthResponse(authPayload));
    } catch (err) {
        if (isUniqueConstraintError(err)) {
            return res.status(400).json({ message: REGISTRATION_FAILED_MESSAGE });
        }
        logSafeOperationalError('auth.mobile_register', err, res.locals?.requestId);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', (req, res, next) => {
    const email = normalizeEmailCredential(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ message: INVALID_LOGIN_MESSAGE });
    }

    // Keep LocalStrategy lookup normalized while still letting Passport own session establishment.
    req.body.email = email;

    passport.authenticate('local', (err: Error | null, user: Express.User | false | null) => {
        if (err) return next(err);
        if (!user) {
            return res.status(401).json({ message: INVALID_LOGIN_MESSAGE });
        }

        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            return res.json({
                user: serializeUserForClient(user as any)
            });
        });
    })(req, res, next);
});

router.post('/mobile/login', async (req, res) => {
    const email = normalizeEmailCredential(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ message: INVALID_LOGIN_MESSAGE });
    }

    const device = parseMobileDevicePayload(req.body);
    if (!device.ok) {
        return res.status(400).json({ message: device.message });
    }
    if (device.device.devicePlatform === 'WEAR_OS') {
        return res.status(400).json({ message: 'Wear OS sessions require phone pairing' });
    }

    try {
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { ...USER_CLIENT_SELECT, password_hash: true }
        });
        const isMatch = await bcrypt.compare(password, user?.password_hash ?? DUMMY_AUTH_PASSWORD_HASH);
        if (!user || !isMatch) {
            return res.status(401).json({ message: INVALID_LOGIN_MESSAGE });
        }

        const authPayload = await issueMobileAuthPayload({
            userId: user.id,
            device: device.device
        });
        if (!authPayload) {
            return res.status(500).json({ message: 'Server error' });
        }

        res.json(formatMobileAuthResponse(authPayload));
    } catch (err) {
        logSafeOperationalError('auth.mobile_login', err, res.locals?.requestId);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/refresh', async (req, res) => {
    const startedAt = Date.now();
    const refreshToken =
        req.body && typeof req.body === 'object' && typeof (req.body as { refresh_token?: unknown }).refresh_token === 'string'
            ? (req.body as { refresh_token: string }).refresh_token.trim()
            : '';

    if (!refreshToken) {
        diagnosticsRegistry.recordOperation('auth_mobile_refresh', 'rejected', Date.now() - startedAt);
        return res.status(400).json({ message: 'refresh_token is required' });
    }

    try {
        const authPayload = await refreshMobileSession(refreshToken);
        if (!authPayload) {
            diagnosticsRegistry.recordOperation('auth_mobile_refresh', 'rejected', Date.now() - startedAt);
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }

        diagnosticsRegistry.recordOperation('auth_mobile_refresh', 'success', Date.now() - startedAt);
        res.json(formatMobileAuthResponse(authPayload));
    } catch (err) {
        diagnosticsRegistry.recordOperation('auth_mobile_refresh', 'failure', Date.now() - startedAt);
        logSafeOperationalError('auth.mobile_refresh', err, res.locals?.requestId);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/wear/pairing-credential', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const user = req.user as { id: number };
    const issuingSessionId = res.locals.mobileAuthSessionId as number | undefined;
    if (!issuingSessionId) {
        return res.status(403).json({
            message: 'Wear pairing requires an authenticated Android phone session',
            code: 'PAIRING_PHONE_SESSION_REQUIRED',
            retryable: false
        });
    }
    const pairingRequest = req.body && typeof req.body === 'object'
        ? req.body as Record<string, unknown>
        : {};
    const serverOrigin = pairingRequest.server_origin;
    const normalizedServerOrigin = normalizePairingServerOrigin(serverOrigin);
    if (!normalizedServerOrigin) {
        return res.status(400).json({
            message: 'valid server_origin is required',
            code: 'INVALID_PAIRING_REQUEST',
            retryable: false
        });
    }

    try {
        const result = await issueWearPairingCredential({
            userId: user.id,
            issuingSessionId,
            serverOrigin: normalizedServerOrigin,
            watchDeviceId: pairingRequest.watch_device_id,
            watchDeviceName: pairingRequest.watch_device_name,
            protocolVersion: pairingRequest.protocol_version,
            watchPublicKeySpki: pairingRequest.watch_public_key_spki
        });
        if (!result.ok) {
            return res.status(result.status).json({
                message: result.message,
                code: result.code,
                retryable: false
            });
        }
        const credential = result.credential;
        return res.status(201).json({
            pairing_token: credential.pairingToken,
            server_origin: credential.serverOrigin,
            watch_device_id: credential.watchDeviceId,
            protocol_version: credential.protocolVersion,
            challenge: credential.challenge,
            expires_at: credential.expiresAt.toISOString()
        });
    } catch (error) {
        logSafeOperationalError('auth.wear_pairing_issue', error, res.locals?.requestId);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/wear/pair', async (req, res) => {
    try {
        const result = await exchangeWearPairingCredential(req.body);
        if (!result.ok) {
            return res.status(result.status).json({
                message: result.message,
                code: result.code,
                retryable: false
            });
        }
        return res.json(formatMobileAuthResponse(result.payload));
    } catch (error) {
        logSafeOperationalError('auth.wear_pairing_exchange', error, res.locals?.requestId);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((destroyError) => {
            if (destroyError) return next(destroyError);
            clearSessionCookie(res);
            res.json({ message: 'Logged out' });
        });
    });
});

router.post('/mobile/logout', async (req, res) => {
    const refreshToken =
        req.body && typeof req.body === 'object' && typeof (req.body as { refresh_token?: unknown }).refresh_token === 'string'
            ? (req.body as { refresh_token: string }).refresh_token.trim()
            : '';
    const authorization = req.get('authorization');
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    try {
        if (refreshToken) {
            await revokeMobileSessionByRefreshToken(refreshToken);
        } else if (accessToken) {
            await revokeMobileSessionByAccessToken(accessToken);
        }

        res.json({ ok: true });
    } catch (err) {
        logSafeOperationalError('auth.mobile_logout', err, res.locals?.requestId);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/mobile/sessions', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = req.user as { id: number };
    const sessions = await listMobileSessionsForUser(user.id, res.locals.mobileAuthSessionId);
    res.json({ sessions });
});

router.delete('/mobile/sessions/:sessionId', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const sessionId = Number(req.params.sessionId);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ message: 'Invalid mobile session id' });
    }

    const user = req.user as { id: number };
    const revoked = await revokeMobileSessionForUser(user.id, sessionId);
    res.json({ ok: true, revoked });
});

router.post('/mobile/sessions/revoke-others', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = req.user as { id: number };
    const revoked = await revokeOtherMobileSessionsForUser(user.id, res.locals.mobileAuthSessionId);
    res.json({ ok: true, revoked });
});

router.get('/me', async (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user as any;
        try {
            // Refresh from the database to avoid stale session snapshots.
            const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: USER_CLIENT_SELECT });
            if (!dbUser) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            res.json({ user: serializeUserForClient(dbUser) });
        } catch (err) {
            logSafeOperationalError('auth.me', err, res.locals?.requestId);
            res.status(500).json({ message: 'Server error' });
        }
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

export default router;
