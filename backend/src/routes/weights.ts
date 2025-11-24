import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const weightSchema = z.object({
  date: z.string().optional(),
  weight: z.number().positive(),
});

function normalizeDate(dateString?: string) {
  const date = dateString ? new Date(dateString) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = weightSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid weight payload' });
  const { date: dateString, weight } = parsed.data;
  const date = normalizeDate(dateString);
  const entry = await prisma.dailyWeight.upsert({
    where: { userId_date: { userId: req.userId!, date } },
    update: { weight },
    create: { userId: req.userId!, date, weight },
  });
  return res.status(201).json(entry);
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { start, end } = req.query;
  const startDate = start ? normalizeDate(String(start)) : undefined;
  const endDate = end ? normalizeDate(String(end)) : undefined;

  const weights = await prisma.dailyWeight.findMany({
    where: {
      userId: req.userId,
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
    },
    orderBy: { date: 'asc' },
  });
  return res.json(weights);
});

export default router;
