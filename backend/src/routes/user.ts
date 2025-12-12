import express from 'express';
import prisma from '../config/database';
import { isWeightUnit } from '../utils/weight';

const router = express.Router();

const isAuthenticated = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/me', (req, res) => {
  const user = req.user as any;
  res.json({ user: { id: user.id, email: user.email, weight_unit: user.weight_unit } });
});

router.patch('/preferences', async (req, res) => {
  const user = req.user as any;
  const { weight_unit } = req.body;

  if (!isWeightUnit(weight_unit)) {
    return res.status(400).json({ message: 'Invalid weight_unit' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { weight_unit },
    });

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        weight_unit: updatedUser.weight_unit,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

