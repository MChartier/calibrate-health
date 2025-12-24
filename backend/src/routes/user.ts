import express from 'express';
import prisma from '../config/database';
import { isUnitSystem, isWeightUnit, unitSystemToWeightUnit } from '../utils/weight';
import { ActivityLevel, Sex, UnitSystem, WeightUnit } from '@prisma/client';
import { buildCalorieSummary, isActivityLevel, isSex } from '../utils/profile';
import { isValidIanaTimeZone } from '../utils/date';

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
  res.json({
    user: {
      id: user.id,
      email: user.email,
      weight_unit: user.weight_unit,
      unit_system: user.unit_system,
      timezone: user.timezone,
      date_of_birth: user.date_of_birth,
      sex: user.sex,
      height_mm: user.height_mm,
      activity_level: user.activity_level
    }
  });
});

router.patch('/preferences', async (req, res) => {
  const user = req.user as any;
  const { weight_unit, unit_system } = req.body as {
    weight_unit?: unknown;
    unit_system?: unknown;
  };

  if (weight_unit === undefined && unit_system === undefined) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  if (weight_unit !== undefined && !isWeightUnit(weight_unit)) {
    return res.status(400).json({ message: 'Invalid weight_unit' });
  }

  if (unit_system !== undefined && !isUnitSystem(unit_system)) {
    return res.status(400).json({ message: 'Invalid unit_system' });
  }

  const resolvedUnitSystem = (unit_system as UnitSystem | undefined) ??
    (weight_unit ? (weight_unit === 'LB' ? UnitSystem.IMPERIAL : UnitSystem.METRIC) : undefined);

  const resolvedWeightUnit = (weight_unit as WeightUnit | undefined) ??
    (resolvedUnitSystem ? unitSystemToWeightUnit(resolvedUnitSystem) : undefined);

  if (!resolvedUnitSystem || !resolvedWeightUnit) {
    return res.status(400).json({ message: 'Invalid unit preference' });
  }

  if (
    weight_unit !== undefined &&
    unit_system !== undefined &&
    unitSystemToWeightUnit(resolvedUnitSystem) !== resolvedWeightUnit
  ) {
    return res.status(400).json({ message: 'unit_system and weight_unit must align' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { weight_unit: resolvedWeightUnit, unit_system: resolvedUnitSystem },
    });

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        weight_unit: updatedUser.weight_unit,
        unit_system: updatedUser.unit_system,
        timezone: updatedUser.timezone,
        date_of_birth: updatedUser.date_of_birth,
        sex: updatedUser.sex,
        height_mm: updatedUser.height_mm,
        activity_level: updatedUser.activity_level
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/profile', async (req, res) => {
  const user = req.user as any;
  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const latestGoal = await prisma.goal.findFirst({
      where: { user_id: user.id },
      orderBy: { created_at: 'desc' },
      select: { daily_deficit: true }
    });

    const latestMetric = await prisma.bodyMetric.findFirst({
      where: { user_id: user.id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: { weight_grams: true }
    });

    const profile = {
      timezone: dbUser.timezone,
      date_of_birth: dbUser.date_of_birth,
      sex: dbUser.sex,
      height_mm: dbUser.height_mm,
      activity_level: dbUser.activity_level,
      weight_unit: dbUser.weight_unit,
      unit_system: dbUser.unit_system
    };

    const calorieSummary = buildCalorieSummary({
      weight_grams: latestMetric?.weight_grams ?? null,
      profile,
      daily_deficit: latestGoal?.daily_deficit ?? null
    });

    res.json({
      profile,
      latest_weight_grams: latestMetric?.weight_grams ?? null,
      goal_daily_deficit: latestGoal?.daily_deficit ?? null,
      calorieSummary
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/profile', async (req, res) => {
  const user = req.user as any;
  const { timezone, date_of_birth, sex, height_cm, height_mm, height_feet, height_inches, activity_level } = req.body;

  const updateData: Partial<{
    timezone: string;
    date_of_birth: Date | null;
    sex: Sex | null;
    height_mm: number | null;
    activity_level: ActivityLevel | null;
  }> = {};

  // PATCH semantics: omitted fields are left unchanged. For timezone, a provided null/empty string
  // explicitly resets to our default ("UTC").
  if (timezone !== undefined) {
    if (timezone === null || timezone === '') {
      updateData.timezone = 'UTC';
    } else if (isValidIanaTimeZone(timezone)) {
      updateData.timezone = timezone.trim();
    } else {
      return res.status(400).json({ message: 'Invalid timezone' });
    }
  }

  if (date_of_birth !== undefined) {
    const parsedDate = new Date(date_of_birth);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date_of_birth' });
    }
    updateData.date_of_birth = parsedDate;
  }

  if (sex !== undefined) {
    if (sex === null || sex === '') {
      updateData.sex = null;
    } else if (isSex(sex)) {
      updateData.sex = sex;
    } else {
      return res.status(400).json({ message: 'Invalid sex' });
    }
  }

  const resolveHeightMm = (): { provided: boolean; value: number | null; valid: boolean } => {
    if (height_mm !== undefined) {
      if (height_mm === null || height_mm === '') return { provided: true, value: null, valid: true };
      const parsed = Number(height_mm);
      if (!Number.isFinite(parsed) || parsed <= 0) return { provided: true, value: null, valid: false };
      return { provided: true, value: Math.round(parsed), valid: true };
    }
    if (height_cm !== undefined) {
      if (height_cm === null || height_cm === '') return { provided: true, value: null, valid: true };
      const parsed = Number(height_cm);
      if (!Number.isFinite(parsed) || parsed <= 0) return { provided: true, value: null, valid: false };
      return { provided: true, value: Math.round(parsed * 10), valid: true };
    }
    if (height_feet !== undefined || height_inches !== undefined) {
      const feetNum = height_feet === undefined || height_feet === '' ? 0 : Number(height_feet);
      const inchesNum = height_inches === undefined || height_inches === '' ? 0 : Number(height_inches);
      if (!Number.isFinite(feetNum) || !Number.isFinite(inchesNum)) return { provided: true, value: null, valid: false };
      const totalInches = feetNum * 12 + inchesNum;
      if (totalInches <= 0) return { provided: true, value: null, valid: false };
      const mm = totalInches * 25.4;
      return { provided: true, value: Math.round(mm), valid: true };
    }
    return { provided: false, value: null, valid: true };
  };

  const resolvedHeight = resolveHeightMm();
  if (resolvedHeight.provided) {
    if (!resolvedHeight.valid) {
      return res.status(400).json({ message: 'Invalid height' });
    }
    updateData.height_mm = resolvedHeight.value;
  }

  if (activity_level !== undefined) {
    if (activity_level === null || activity_level === '') {
      updateData.activity_level = null;
    } else if (isActivityLevel(activity_level)) {
      updateData.activity_level = activity_level;
    } else {
      return res.status(400).json({ message: 'Invalid activity_level' });
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        weight_unit: updatedUser.weight_unit,
        unit_system: updatedUser.unit_system,
        timezone: updatedUser.timezone,
        date_of_birth: updatedUser.date_of_birth,
        sex: updatedUser.sex,
        height_mm: updatedUser.height_mm,
        activity_level: updatedUser.activity_level
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
