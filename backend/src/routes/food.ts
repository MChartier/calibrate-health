import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const foodSchema = z.object({
  date: z.string(),
  label: z.string().min(1),
  calories: z.number().int().positive(),
  meal: z.enum(['BREAKFAST', 'MORNING', 'LUNCH', 'AFTERNOON', 'DINNER', 'EVENING']),
});

const updateSchema = foodSchema.partial({ date: true });

function normalizeDate(dateString: string) {
  const date = new Date(dateString);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = foodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid food payload' });
  const { date, label, calories, meal } = parsed.data;
  const entry = await prisma.foodEntry.create({
    data: {
      userId: req.userId!,
      date: normalizeDate(date),
      label,
      calories,
      meal,
    },
  });
  return res.status(201).json(entry);
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const dateParam = req.query.date as string | undefined;
  const where = { userId: req.userId } as any;
  if (dateParam) {
    const date = normalizeDate(dateParam);
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    where.date = { gte: date, lt: next };
  }
  const entries = await prisma.foodEntry.findMany({
    where,
    orderBy: { date: 'desc' },
  });
  return res.json(entries);
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid update payload' });
  const { id } = req.params;
  const data: any = { ...parsed.data };
  if (data.date) data.date = normalizeDate(data.date);
  const existing = await prisma.foodEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: 'Entry not found' });
  const entry = await prisma.foodEntry.update({
    where: { id },
    data,
  });
  return res.json(entry);
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = await prisma.foodEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: 'Entry not found' });
  await prisma.foodEntry.delete({ where: { id } });
  return res.json({ success: true });
});

export default router;
