import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';

/**
 * Session-based auth endpoints (register/login/logout/me).
 *
 * Routes return a sanitized user payload for client state hydration.
 */
const router = express.Router();

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

router.post('/login', passport.authenticate('local'), (req, res) => {
    // Passport already attached the authenticated user to req.user.
    const user = req.user as any;
    res.json({
        user: serializeUserForClient(user)
    });
});

router.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.json({ message: 'Logged out' });
    });
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
