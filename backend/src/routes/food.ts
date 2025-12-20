import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import { normalizeToUtcDateOnly } from '../utils/date';

const router = express.Router();

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

/**
 * Prefer an explicit language code, otherwise fall back to the request locale hint.
 */
const getLanguageCode = (req: express.Request): string | undefined => {
    const raw = typeof req.query.lc === 'string' ? req.query.lc.trim().toLowerCase() : undefined;
    if (raw) {
        return raw;
    }
    const header = req.headers['accept-language'];
    if (!header || typeof header !== 'string') {
        return undefined;
    }
    const primary = header.split(',')[0]?.trim();
    if (!primary) {
        return undefined;
    }
    return primary.split('-')[0]?.toLowerCase();
};

router.get('/search', async (req, res) => {
    const provider = getFoodDataProvider();
    const query = (req.query.q as string) || (req.query.query as string);
    const barcode = req.query.barcode as string | undefined;

    if (!query && !barcode) {
        return res.status(400).json({ message: 'Provide a search query or barcode.' });
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
    const quantityInGrams = req.query.grams ? parseFloat(req.query.grams as string) : undefined;
    const languageCode = getLanguageCode(req);

    try {
        const result = await provider.searchFoods({
            query: query || undefined,
            barcode,
            page,
            pageSize,
            quantityInGrams,
            languageCode
        });

        res.json({
            provider: provider.name,
            supportsBarcodeLookup: provider.supportsBarcodeLookup,
            ...result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Unable to search foods right now.' });
    }
});

router.get('/', async (req, res) => {
    const user = req.user as any;
    const { date, start, end } = req.query;

    let whereClause: any = { user_id: user.id };

    /**
     * Parse query/body inputs into a UTC date-only value (midnight UTC).
     *
     * Accepts either `YYYY-MM-DD` or an ISO datetime string (we take the date portion).
     */
    const parseDateOnlyInput = (input: unknown): Date => {
        if (typeof input === 'string') {
            const datePart = input.split('T')[0] ?? '';
            return normalizeToUtcDateOnly(datePart);
        }
        if (input instanceof Date) {
            return normalizeToUtcDateOnly(input);
        }
        throw new Error('Invalid date');
    };

    if (typeof date === 'string' && date) {
        try {
            whereClause.date = parseDateOnlyInput(date);
        } catch {
            return res.status(400).json({ message: 'Invalid date' });
        }
    } else if (typeof start === 'string' || typeof end === 'string') {
        whereClause.date = {};
        try {
            if (typeof start === 'string' && start) whereClause.date.gte = parseDateOnlyInput(start);
            if (typeof end === 'string' && end) whereClause.date.lte = parseDateOnlyInput(end);
        } catch {
            return res.status(400).json({ message: 'Invalid date range' });
        }
    }

    try {
        const logs = await prisma.foodLog.findMany({
            where: whereClause,
            orderBy: { created_at: 'asc' }
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { name, calories, meal_period, date } = req.body;
    try {
        let logDate: Date;
        try {
            logDate = date ? normalizeToUtcDateOnly(String(date).split('T')[0]) : normalizeToUtcDateOnly(new Date());
        } catch {
            return res.status(400).json({ message: 'Invalid date' });
        }

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name,
                calories: parseInt(calories),
                meal_period,
                date: logDate
            }
        });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
