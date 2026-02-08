import express from 'express';
import prisma from '../config/database';
import { MS_PER_DAY, addUtcDays, parseLocalDateOnly } from '../utils/date';

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

const MONTH_QUERY_PATTERN = /^(\d{4})-(\d{2})$/;
const MAX_RANGE_QUERY_DAYS = 366; // Cap range queries to one year so calendar/status lookups remain bounded.

type ParsedDateRange =
    | {
          ok: true;
          startDateValue: Date;
          endDateValue: Date;
          startDateKey: string;
          endDateKey: string;
      }
    | {
          ok: false;
          message: string;
      };

/**
 * Count inclusive UTC calendar days between two DATE-normalized values.
 *
 * We use UTC day steps to stay aligned with Postgres DATE semantics and avoid DST skew.
 */
function countInclusiveUtcDays(startDateValue: Date, endDateValue: Date): number {
    return Math.floor((endDateValue.getTime() - startDateValue.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Parse and validate a date-range query for completion lookups.
 *
 * Supported query shapes:
 * - `start=YYYY-MM-DD&end=YYYY-MM-DD` (also accepts `start_date`/`end_date`)
 * - `month=YYYY-MM` (expands to the full calendar month)
 */
function parseRequestedRange(query: Record<string, unknown>): ParsedDateRange {
    const monthParam = typeof query.month === 'string' ? query.month : undefined;
    const startParam =
        typeof query.start === 'string'
            ? query.start
            : typeof query.start_date === 'string'
              ? query.start_date
              : undefined;
    const endParam =
        typeof query.end === 'string'
            ? query.end
            : typeof query.end_date === 'string'
              ? query.end_date
              : undefined;

    if (monthParam) {
        if (startParam || endParam) {
            return { ok: false, message: 'Provide either month or start/end' };
        }

        const monthMatch = monthParam.match(MONTH_QUERY_PATTERN);
        if (!monthMatch) {
            return { ok: false, message: 'Invalid month' };
        }

        const year = Number.parseInt(monthMatch[1], 10);
        const month = Number.parseInt(monthMatch[2], 10);
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return { ok: false, message: 'Invalid month' };
        }

        const startDateValue = parseLocalDateOnly(`${monthMatch[1]}-${monthMatch[2]}-01`);
        const endDateValue = new Date(Date.UTC(year, month, 0));

        return {
            ok: true,
            startDateValue,
            endDateValue,
            startDateKey: formatDateKey(startDateValue),
            endDateKey: formatDateKey(endDateValue)
        };
    }

    if (!startParam || !endParam) {
        return { ok: false, message: 'Provide start and end dates' };
    }

    const parsedStart = parseRequestedDate(startParam);
    const parsedEnd = parseRequestedDate(endParam);
    if (!parsedStart.ok || !parsedEnd.ok) {
        return { ok: false, message: 'Invalid date range' };
    }

    if (parsedStart.dateValue > parsedEnd.dateValue) {
        return { ok: false, message: 'Invalid date range' };
    }

    const rangeDays = countInclusiveUtcDays(parsedStart.dateValue, parsedEnd.dateValue);
    if (rangeDays > MAX_RANGE_QUERY_DAYS) {
        return { ok: false, message: 'Date range too large' };
    }

    return {
        ok: true,
        startDateValue: parsedStart.dateValue,
        endDateValue: parsedEnd.dateValue,
        startDateKey: parsedStart.dateKey,
        endDateKey: parsedEnd.dateKey
    };
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

router.get('/range', async (req, res) => {
    const user = req.user as any;
    const parsedRange = parseRequestedRange(req.query as Record<string, unknown>);
    if (!parsedRange.ok) {
        return res.status(400).json({ message: parsedRange.message });
    }

    try {
        const daysInRange = await prisma.foodLogDay.findMany({
            where: {
                user_id: user.id,
                local_date: {
                    gte: parsedRange.startDateValue,
                    lte: parsedRange.endDateValue
                }
            },
            orderBy: { local_date: 'asc' }
        });

        const byDateKey = new Map(daysInRange.map((day) => [formatDateKey(day.local_date), day]));
        const days = [];
        for (let cursor = parsedRange.startDateValue; cursor <= parsedRange.endDateValue; cursor = addUtcDays(cursor, 1)) {
            const dateKey = formatDateKey(cursor);
            const existing = byDateKey.get(dateKey);
            days.push({
                date: dateKey,
                is_complete: existing?.is_complete ?? false,
                completed_at: existing?.completed_at ?? null
            });
        }

        return res.json({
            start_date: parsedRange.startDateKey,
            end_date: parsedRange.endDateKey,
            days
        });
    } catch {
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
