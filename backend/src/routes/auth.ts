import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';

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
            }
        });

        req.login(newUser, (err) => {
            if (err) throw err;
            res.json({ user: { id: newUser.id, email: newUser.email, weight_unit: newUser.weight_unit } });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', passport.authenticate('local'), (req, res) => {
    // If this function gets called, authentication was successful.
    // `req.user` contains the authenticated user.
    const user = req.user as any;
    res.json({ user: { id: user.id, email: user.email, weight_unit: user.weight_unit } });
});

router.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.json({ message: 'Logged out' });
    });
});

router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user as any;
        res.json({ user: { id: user.id, email: user.email, weight_unit: user.weight_unit } });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

router.put('/settings', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = req.user as any;
    const { weight_unit } = req.body;

    try {
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { weight_unit }
        });
        res.json({ user: { id: updatedUser.id, email: updatedUser.email, weight_unit: updatedUser.weight_unit } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
