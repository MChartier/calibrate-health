import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { normalizeEmailCredential, validatePasswordCredential } from '../utils/authCredentials';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';
import {
    formatMobileAuthResponse,
    issueMobileAuthPayload,
    listMobileSessionsForUser,
    parseMobileDevicePayload,
    refreshMobileSession,
    revokeMobileSessionByAccessToken,
    revokeMobileSessionByRefreshToken,
    revokeMobileSessionForUser,
    revokeOtherMobileSessionsForUser
} from '../services/mobileAuth';

/**
 * Session-based auth endpoints (register/login/logout/me).
 *
 * Routes return a sanitized user payload for client state hydration.
 */
const router = express.Router();

const INVALID_LOGIN_MESSAGE = 'Invalid email or password';

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
            return res.status(400).json({ message: 'User already exists' });
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
                console.error('Auth register: unable to establish session:', err);
                res.status(500).json({ message: 'Server error' });
                return;
            }
            res.json({
                user: serializeUserForClient(newUser)
            });
        });
    } catch (err) {
        if (isUniqueConstraintError(err)) {
            return res.status(400).json({ message: 'User already exists' });
        }
        console.error('Auth register failed:', err);
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

    try {
        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
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
            return res.status(400).json({ message: 'User already exists' });
        }
        console.error('Mobile auth register failed:', err);
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

    try {
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { ...USER_CLIENT_SELECT, password_hash: true }
        });
        if (!user) {
            return res.status(401).json({ message: INVALID_LOGIN_MESSAGE });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
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
        console.error('Mobile auth login failed:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/refresh', async (req, res) => {
    const refreshToken =
        req.body && typeof req.body === 'object' && typeof (req.body as { refresh_token?: unknown }).refresh_token === 'string'
            ? (req.body as { refresh_token: string }).refresh_token.trim()
            : '';

    if (!refreshToken) {
        return res.status(400).json({ message: 'refresh_token is required' });
    }

    try {
        const authPayload = await refreshMobileSession(refreshToken);
        if (!authPayload) {
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }

        res.json(formatMobileAuthResponse(authPayload));
    } catch (err) {
        console.error('Mobile auth refresh failed:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.json({ message: 'Logged out' });
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
        console.error('Mobile auth logout failed:', err);
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
            console.error('Auth me failed:', err);
            res.status(500).json({ message: 'Server error' });
        }
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

export default router;
