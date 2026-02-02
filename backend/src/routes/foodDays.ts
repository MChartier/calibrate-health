import express from 'express';
import prisma from '../config/database';
import { parseLocalDateOnly } from '../utils/date';

/**
 * Daily food log completion status endpoints.
 *
 * Completion is stored per local-day using the user's timezone-derived date.
 */
const router = express.Router();

/**
 * Ensure the session is authenticated before accessing food log day data.
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

function formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function parseRequestedDate(value: unknown): { ok: true; dateValue: Date; dateKey: string } | { ok: false } {
    if (typeof value !== 'string') return { ok: false };

    try {
        const dateValue = parseLocalDateOnly(value);
        return { ok: true, dateValue, dateKey: formatDateKey(dateValue) };
    } catch {
        return { ok: false };
    }
}

router.get('/', async (req, res) => {
    const user = req.user as any;
    const dateParam =
        typeof req.query.date === 'string'
            ? req.query.date
            : typeof req.query.local_date === 'string'
              ? req.query.local_date
              : undefined;

    const parsedDate = parseRequestedDate(dateParam);
    if (!parsedDate.ok) {
        return res.status(400).json({ message: 'Invalid date' });
    }

    try {
        const existing = await prisma.foodLogDay.findUnique({
            where: { user_id_local_date: { user_id: user.id, local_date: parsedDate.dateValue } }
        });

        if (!existing) {
            return res.json({ date: parsedDate.dateKey, is_complete: false, completed_at: null });
        }

        return res.json({
            date: parsedDate.dateKey,
            is_complete: existing.is_complete,
            completed_at: existing.completed_at
        });
    } catch (err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/', async (req, res) => {
    const user = req.user as any;
    if (typeof req.body !== 'object' || req.body === null) {
        return res.status(400).json({ message: 'Invalid request body' });
    }

    const { date, local_date, is_complete } = req.body as {
        date?: unknown;
        local_date?: unknown;
        is_complete?: unknown;
    };

    const parsedDate = parseRequestedDate(date ?? local_date);
    if (!parsedDate.ok) {
        return res.status(400).json({ message: 'Invalid date' });
    }

    if (typeof is_complete !== 'boolean') {
        return res.status(400).json({ message: 'Invalid is_complete' });
    }

    const completedAt = is_complete ? new Date() : null;

    try {
        const updated = await prisma.foodLogDay.upsert({
            where: { user_id_local_date: { user_id: user.id, local_date: parsedDate.dateValue } },
            update: { is_complete, completed_at: completedAt },
            create: {
                user_id: user.id,
                local_date: parsedDate.dateValue,
                is_complete,
                completed_at: completedAt
            }
        });

        return res.json({
            date: parsedDate.dateKey,
            is_complete: updated.is_complete,
            completed_at: updated.completed_at
        });
    } catch (err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

export default router;
