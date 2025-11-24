import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const goalSchema = z.object({
  currentWeight: z.number().positive().optional(),
  targetWeight: z.number().positive().optional(),
  targetCalorieDeficit: z.union([z.literal(250), z.literal(500), z.literal(750), z.literal(1000)]).optional(),
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({
    currentWeight: user.currentWeight,
    targetWeight: user.targetWeight,
    targetCalorieDeficit: user.targetCalorieDeficit,
  });
});

router.put('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid goal payload' });
  const data = parsed.data;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data,
  });
  return res.json({
    currentWeight: user.currentWeight,
    targetWeight: user.targetWeight,
    targetCalorieDeficit: user.targetCalorieDeficit,
  });
});

export default router;
