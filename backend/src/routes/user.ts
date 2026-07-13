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
import { MAX_AUTH_PASSWORD_LENGTH, MIN_AUTH_PASSWORD_LENGTH } from '../utils/authCredentials';
import { revokeOtherMobileSessionsForUser } from '../services/mobileAuth';
import { deleteAccountData, exportAccountData } from '../services/accountLifecycle';
import {
  ClientOperationConflictError,
  executeIdempotentMutation,
  parseClientOperationId,
  recordSyncChange
} from '../services/clientOperations';
import { logSafeOperationalError } from '../observability';

/**
 * Authenticated user account routes (profile, preferences, password, avatar).
 *
 * These endpoints keep the session user payload aligned with the latest stored profile fields.
 */
const router = express.Router();

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

  if (newPassword.length < MIN_AUTH_PASSWORD_LENGTH) {
    return { ok: false, message: `New password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters` };
  }

  if (newPassword.length > MAX_AUTH_PASSWORD_LENGTH) {
    return { ok: false, message: `New password must be at most ${MAX_AUTH_PASSWORD_LENGTH} characters` };
  }

  return { ok: true, currentPassword, newPassword };
};

const parseCurrentPassword = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') return null;
  const currentPassword = (body as Record<string, unknown>).current_password;
  return typeof currentPassword === 'string' && currentPassword.length > 0 ? currentPassword : null;
};

const destroyRequestSession = (req: express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.destroy((error) => error ? reject(error) : resolve());
  });

const clearSessionCookie = (res: express.Response): void => {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  res.clearCookie(process.env.SESSION_COOKIE_NAME || 'cal.sid', {
    path: '/',
    ...(domain ? { domain } : {})
  });
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
    await revokeOtherMobileSessionsForUser(dbUser.id, res.locals.mobileAuthSessionId);

    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/account/export', async (req, res) => {
  const user = req.user as { id: number };
  try {
    const accountExport = await exportAccountData(user.id);
    if (!accountExport) {
      return res.status(404).json({ message: 'User not found' });
    }

    const exportDate = accountExport.exported_at.slice(0, 10);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-disposition', `attachment; filename="calibrate-account-export-${exportDate}.json"`);
    res.json(accountExport);
  } catch (error) {
    logSafeOperationalError('account.export', error, res.locals?.requestId);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/account', async (req, res) => {
  const user = req.user as { id: number };
  const currentPassword = parseCurrentPassword(req.body);
  if (!currentPassword) {
    return res.status(400).json({ message: 'Current password is required' });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true }
    });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const deleted = await deleteAccountData(user.id);
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      await destroyRequestSession(req);
    } catch (error) {
      // The user row and linked sessions are already gone; clearing the browser cookie completes logout.
      logSafeOperationalError('account.session_cleanup', error, res.locals?.requestId, console.warn);
    }
    clearSessionCookie(res);
    res.status(204).send();
  } catch (error) {
    logSafeOperationalError('account.delete', error, res.locals?.requestId);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/preferences', async (req, res) => {
  const user = req.user as any;
  const { weight_unit, height_unit, language, reminder_log_weight_enabled, reminder_log_food_enabled, haptics_enabled } = req.body as {
    weight_unit?: unknown;
    height_unit?: unknown;
    language?: unknown;
    reminder_log_weight_enabled?: unknown;
    reminder_log_food_enabled?: unknown;
    haptics_enabled?: unknown;
  };

  if (
    weight_unit === undefined &&
    height_unit === undefined &&
    language === undefined &&
    reminder_log_weight_enabled === undefined &&
    reminder_log_food_enabled === undefined &&
    haptics_enabled === undefined
  ) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  const updateData: Partial<{
    weight_unit: WeightUnit;
    height_unit: HeightUnit;
    language: SupportedLanguage;
    reminder_log_weight_enabled: boolean;
    reminder_log_food_enabled: boolean;
    haptics_enabled: boolean;
  }> = {};

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

  if (reminder_log_weight_enabled !== undefined) {
    if (typeof reminder_log_weight_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid reminder_log_weight_enabled' });
    }
    updateData.reminder_log_weight_enabled = reminder_log_weight_enabled;
  }

  if (reminder_log_food_enabled !== undefined) {
    if (typeof reminder_log_food_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid reminder_log_food_enabled' });
    }
    updateData.reminder_log_food_enabled = reminder_log_food_enabled;
  }

  if (haptics_enabled !== undefined) {
    if (typeof haptics_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid haptics_enabled' });
    }
    updateData.haptics_enabled = haptics_enabled;
  }

  try {
    const operationId = parseClientOperationId(
      req.get?.('x-client-operation-id') ?? req.headers?.['x-client-operation-id']
    );
    if (operationId === null) {
      return res.status(400).json({ message: 'Invalid x-client-operation-id' });
    }

    const result = await executeIdempotentMutation<unknown>({
      userId: user.id,
      operationId,
      operationKind: 'user.preferences.update',
      requestPayload: req.body,
      mutate: async (tx, claimedOperationId) => {
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: updateData,
          select: USER_CLIENT_SELECT
        });
        const body = { user: serializeUserForClient(updatedUser) };
        await recordSyncChange({
          tx,
          userId: user.id,
          entityType: 'user_preferences',
          entityId: user.id,
          action: 'upsert',
          operationId: claimedOperationId,
          payload: body.user
        });
        return { status: 200, body };
      }
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof ClientOperationConflictError) {
      return res.status(409).json({
        message: err.message,
        code: err.code,
        retryable: err.code === 'OPERATION_IN_PROGRESS'
      });
    }
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
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
