import express from 'express';
import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import { isHeightUnit, isWeightUnit } from '../utils/units';
import { ActivityLevel, HeightUnit, Sex, WeightUnit } from '@prisma/client';
import { buildCalorieSummary, isActivityLevel, isSex } from '../utils/profile';
import { isValidIanaTimeZone } from '../utils/date';
import { resolveHeightMmUpdate } from '../utils/height';
import { isSupportedLanguage, type SupportedLanguage } from '../utils/language';
import { MAX_PROFILE_IMAGE_BYTES, parseBase64DataUrl } from '../utils/profileImage';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';

/**
 * Authenticated user account routes (profile, preferences, password, avatar).
 *
 * These endpoints keep the session user payload aligned with the latest stored profile fields.
 */
const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;
// bcrypt truncates long passwords; keep a conservative cap to avoid surprises.
const MAX_PASSWORD_LENGTH = 72;

type PasswordChangeParseResult =
  | { ok: true; currentPassword: string; newPassword: string }
  | { ok: false; message: string };

/**
 * Validate and normalize the password change request payload.
 *
 * This performs lightweight shape/length checks; the current password is verified
 * against the stored hash in the route handler.
 */
const parsePasswordChangePayload = (body: unknown): PasswordChangeParseResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Invalid request body' };
  }

  const record = body as Record<string, unknown>;
  const currentPassword = record.current_password;
  const newPassword = record.new_password;

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return { ok: false, message: 'Current password is required' };
  }

  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    return { ok: false, message: 'New password is required' };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `New password must be at most ${MAX_PASSWORD_LENGTH} characters` };
  }

  return { ok: true, currentPassword, newPassword };
};

/**
 * Ensure the session is authenticated before accessing user settings.
 */
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

router.get('/me', async (req, res) => {
  const user = req.user as any;
  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: USER_CLIENT_SELECT });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: serializeUserForClient(dbUser) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profile-image', async (req, res) => {
  const user = req.user as any;
  const dataUrl = (req.body as { data_url?: unknown } | undefined)?.data_url;

  if (typeof dataUrl !== 'string' || dataUrl.trim().length === 0) {
    return res.status(400).json({ message: 'Missing data_url' });
  }

  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) {
    return res.status(400).json({ message: 'Invalid profile image payload' });
  }

  if (parsed.bytes.byteLength > MAX_PROFILE_IMAGE_BYTES) {
    return res.status(413).json({ message: 'Profile image is too large' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        profile_image: parsed.bytes,
        profile_image_mime_type: parsed.mimeType
      },
      select: USER_CLIENT_SELECT
    });

    res.json({ user: serializeUserForClient(updatedUser) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/profile-image', async (req, res) => {
  const user = req.user as any;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        profile_image: null,
        profile_image_mime_type: null
      },
      select: USER_CLIENT_SELECT
    });

    res.json({ user: serializeUserForClient(updatedUser) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/password', async (req, res) => {
  const user = req.user as any;
  const parsed = parsePasswordChangePayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  if (parsed.currentPassword === parsed.newPassword) {
    return res.status(400).json({ message: 'New password must be different from current password' });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, password_hash: true }
    });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(parsed.currentPassword, dbUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(parsed.newPassword, 10);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { password_hash }
    });

    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/preferences', async (req, res) => {
  const user = req.user as any;
  const { weight_unit, height_unit, language } = req.body as {
    weight_unit?: unknown;
    height_unit?: unknown;
    language?: unknown;
  };

  if (weight_unit === undefined && height_unit === undefined && language === undefined) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  const updateData: Partial<{ weight_unit: WeightUnit; height_unit: HeightUnit; language: SupportedLanguage }> = {};

  if (weight_unit !== undefined) {
    if (!isWeightUnit(weight_unit)) {
      return res.status(400).json({ message: 'Invalid weight_unit' });
    }
    updateData.weight_unit = weight_unit as WeightUnit;
  }

  if (height_unit !== undefined) {
    if (!isHeightUnit(height_unit)) {
      return res.status(400).json({ message: 'Invalid height_unit' });
    }
    updateData.height_unit = height_unit as HeightUnit;
  }

  if (language !== undefined) {
    if (!isSupportedLanguage(language)) {
      return res.status(400).json({ message: 'Invalid language' });
    }
    updateData.language = language;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: USER_CLIENT_SELECT
    });

    res.json({
      user: serializeUserForClient(updatedUser)
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

    // Shape the profile subset used by the settings UI and calorie math.
    const profile = {
      timezone: dbUser.timezone,
      date_of_birth: dbUser.date_of_birth,
      sex: dbUser.sex,
      height_mm: dbUser.height_mm,
      activity_level: dbUser.activity_level,
      weight_unit: dbUser.weight_unit,
      height_unit: dbUser.height_unit
    };

    // Summarize calorie targets using the freshest weight and goal on record.
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
    if (date_of_birth === null || date_of_birth === '') {
      updateData.date_of_birth = null;
    } else {
      const parsedDate = new Date(date_of_birth);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date_of_birth' });
      }
      updateData.date_of_birth = parsedDate;
    }
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

  const resolvedHeight = resolveHeightMmUpdate({ height_mm, height_cm, height_feet, height_inches });
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
      data: updateData,
      select: USER_CLIENT_SELECT
    });

    res.json({
      user: serializeUserForClient(updatedUser)
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
