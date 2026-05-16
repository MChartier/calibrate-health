import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';
import {
    formatMobileAuthResponse,
    issueMobileAuthPayload,
    parseMobileDevicePayload,
    refreshMobileSession,
    revokeMobileSessionByAccessToken,
    revokeMobileSessionByRefreshToken
} from '../services/mobileAuth';

/**
 * Session-based auth endpoints (register/login/logout/me).
 *
 * Routes return a sanitized user payload for client state hydration.
 */
const router = express.Router();

type CredentialParseResult =
    | { ok: true; email: string; password: string }
    | { ok: false; message: string };

const parseCredentials = (body: unknown): CredentialParseResult => {
    if (!body || typeof body !== 'object') {
        return { ok: false, message: 'Invalid request body' };
    }

    const record = body as Record<string, unknown>;
    const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
    const password = typeof record.password === 'string' ? record.password : '';

    if (!email || !password) {
        return { ok: false, message: 'Email and password are required' };
    }

    return { ok: true, email, password };
};

router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
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
        console.error('Auth register failed:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/mobile/register', async (req, res) => {
    const credentials = parseCredentials(req.body);
    if (!credentials.ok) {
        return res.status(400).json({ message: credentials.message });
    }

    const device = parseMobileDevicePayload(req.body);
    if (!device.ok) {
        return res.status(400).json({ message: device.message });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(credentials.password, salt);
        const newUser = await prisma.user.create({
            data: {
                email: credentials.email,
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
        console.error('Mobile auth register failed:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', passport.authenticate('local'), (req, res) => {
    // Passport already attached the authenticated user to req.user.
    const user = req.user as any;
    res.json({
        user: serializeUserForClient(user)
    });
});

router.post('/mobile/login', async (req, res) => {
    const credentials = parseCredentials(req.body);
    if (!credentials.ok) {
        return res.status(400).json({ message: credentials.message });
    }

    const device = parseMobileDevicePayload(req.body);
    if (!device.ok) {
        return res.status(400).json({ message: device.message });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: { ...USER_CLIENT_SELECT, password_hash: true }
        });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
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
