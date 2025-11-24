import { Router } from 'express';
import { prisma } from '../prisma';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const CALORIES_PER_POUND = 3500;

function normalizeDate(dateString?: string) {
  const date = dateString ? new Date(dateString) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const dateParam = req.query.date ? String(req.query.date) : undefined;
  const date = normalizeDate(dateParam);
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);

  const [foods, weightEntry, user] = await Promise.all([
    prisma.foodEntry.findMany({
      where: { userId: req.userId, date: { gte: date, lt: next } },
    }),
    prisma.dailyWeight.findFirst({ where: { userId: req.userId, date }, orderBy: { date: 'desc' } }),
    prisma.user.findUnique({ where: { id: req.userId } }),
  ]);

  const caloriesIn = foods.reduce((sum, f) => sum + f.calories, 0);
  const caloriesOutEstimate = 2000; // placeholder until richer metabolism calc
  const targetDeficit = user?.targetCalorieDeficit || 0;
  const netCalories = caloriesIn - caloriesOutEstimate;

  let projectedGoalDate: string | null = null;
  if (user?.targetWeight && weightEntry?.weight && targetDeficit > 0) {
    const dailyLossLbs = targetDeficit / CALORIES_PER_POUND;
    if (dailyLossLbs > 0) {
      const poundsToLose = weightEntry.weight - user.targetWeight;
      if (poundsToLose > 0) {
        const days = Math.ceil(poundsToLose / dailyLossLbs);
        const projection = new Date();
        projection.setDate(projection.getDate() + days);
        projectedGoalDate = projection.toISOString();
      }
    }
  }

  res.json({
    date: date.toISOString(),
    caloriesIn,
    caloriesOutEstimate,
    netCalories,
    targetDeficit,
    projectedGoalDate,
    weight: weightEntry?.weight ?? null,
  });
});

router.get('/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  const limit = parseInt(String(req.query.limit || '30'), 10);
  const weights = await prisma.dailyWeight.findMany({
    where: { userId: req.userId },
    orderBy: { date: 'asc' },
    take: Math.max(1, Math.min(limit, 180)),
  });
  res.json({ weights });
});

export default router;
