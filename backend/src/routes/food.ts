import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import { getSafeUtcTodayDateOnlyInTimeZone, parseLocalDateOnly } from '../utils/date';

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
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const localDateParam = typeof req.query.local_date === 'string' ? req.query.local_date : undefined;
    const requestedDate = localDateParam ?? dateParam;

    let whereClause: any = { user_id: user.id };
    if (requestedDate !== undefined) {
        try {
            whereClause.local_date = parseLocalDateOnly(requestedDate);
        } catch {
            return res.status(400).json({ message: 'Invalid date' });
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
        let local_date: Date;
        if (date === undefined || date === null || (typeof date === 'string' && date.trim().length === 0)) {
            local_date = getSafeUtcTodayDateOnlyInTimeZone(user.timezone);
        } else {
            try {
                local_date = parseLocalDateOnly(date);
            } catch {
                return res.status(400).json({ message: 'Invalid date' });
            }
        }

        const entryTimestamp = date ? new Date(date) : new Date();
        if (Number.isNaN(entryTimestamp.getTime())) {
            return res.status(400).json({ message: 'Invalid date' });
        }

        const caloriesValue = Number.parseInt(String(calories), 10);
        if (!Number.isFinite(caloriesValue)) {
            return res.status(400).json({ message: 'Invalid calories' });
        }

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name,
                calories: caloriesValue,
                meal_period,
                date: entryTimestamp,
                local_date
            }
        });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
