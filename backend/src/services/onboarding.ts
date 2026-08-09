import type {
  ActivityLevel,
  HeightUnit,
  OnboardingDraft,
  Prisma,
  Sex,
  WeightUnit
} from '@prisma/client';
import {
  evaluateCaloriePlan,
  isPolicyDailyDeficit,
  isPolicyHeight,
  isPolicyWeight,
  normalizeDateOfBirth
} from '../../../shared/caloriePolicy';
import prisma from '../config/database';
import { getUtcTodayDateOnlyInTimeZone, isValidIanaTimeZone } from '../utils/date';
import { isActivityLevel, isSex } from '../utils/profile';
import { isHeightUnit, isWeightUnit } from '../utils/units';
import {
  serializeUserForClient,
  USER_CLIENT_SELECT,
  type UserClientPayload
} from '../utils/userSerialization';
import type { MutationDatabase, MutationResult } from './clientOperations';

export const ONBOARDING_DRAFT_SCHEMA_VERSION = 1 as const;

const MIN_ACCOUNT_AGE_YEARS = 18;

export const ONBOARDING_STEPS = [
  'goal',
  'about',
  'burn',
  'pace',
  'import',
  'review'
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingDraftDataV1 = {
  weight_unit?: WeightUnit;
  height_unit?: HeightUnit;
  timezone?: string;
  date_of_birth?: string;
  sex?: Sex;
  height_mm?: number;
  activity_level?: ActivityLevel;
  current_weight_grams?: number;
  target_weight_grams?: number;
  daily_deficit?: number;
};

export type CompleteOnboardingDataV1 = Required<OnboardingDraftDataV1>;

export type OnboardingDraftWire = {
  schema_version: typeof ONBOARDING_DRAFT_SCHEMA_VERSION;
  revision: number;
  current_step: OnboardingStep | null;
  data: OnboardingDraftDataV1;
  created_at: string;
  updated_at: string;
};

export type OnboardingCompletionReceipt = {
  operation_id: string;
  completed_at: string;
  goal_id: number;
  metric_id: number;
  sync_cursor: string;
};

export type OnboardingCompletionResponse = {
  receipt: OnboardingCompletionReceipt;
  user: UserClientPayload;
};

export type OnboardingWriteStage =
  | 'profile'
  | 'metric'
  | 'goal'
  | 'sync_marker'
  | 'completion'
  | 'draft_delete';

export type DraftPutInput = {
  revision?: number;
  currentStep: OnboardingStep | null;
  data: OnboardingDraftDataV1;
};

export type CompleteOnboardingInput = {
  expectedRevision?: number;
  data: CompleteOnboardingDataV1;
};

export type OnboardingParseFailure = {
  ok: false;
  code: 'INVALID_ONBOARDING_DRAFT' | 'ONBOARDING_DRAFT_VERSION_UNSUPPORTED';
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type OnboardingParseResult<T> = { ok: true; value: T } | OnboardingParseFailure;

export class OnboardingDraftConflictError extends Error {
  readonly currentDraft: OnboardingDraftWire;

  constructor(currentDraft: OnboardingDraftWire) {
    super('The onboarding draft changed on another device.');
    this.name = 'OnboardingDraftConflictError';
    this.currentDraft = currentDraft;
  }
}

export class OnboardingDraftStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingDraftStateError';
  }
}

const onboardingStepSet = new Set<string>(ONBOARDING_STEPS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidField(field: string, message: string): OnboardingParseFailure {
  return {
    ok: false,
    code: 'INVALID_ONBOARDING_DRAFT',
    message: 'Invalid onboarding draft.',
    fieldErrors: { [field]: [message] }
  };
}

function parseRevision(value: unknown, field: string): OnboardingParseResult<number | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return invalidField(field, 'Use a positive draft revision.');
  }
  return { ok: true, value };
}

function parseSchemaVersion(value: unknown): OnboardingParseFailure | null {
  if (value === ONBOARDING_DRAFT_SCHEMA_VERSION) return null;
  return {
    ok: false,
    code: 'ONBOARDING_DRAFT_VERSION_UNSUPPORTED',
    message: 'This onboarding draft version is not supported.'
  };
}

function parseDraftData(
  value: unknown,
  requireComplete: boolean
): OnboardingParseResult<OnboardingDraftDataV1> {
  if (!isRecord(value)) return invalidField('data', 'Onboarding data is required.');

  const data: OnboardingDraftDataV1 = {};
  const required = (
    field: keyof CompleteOnboardingDataV1,
    raw: unknown
  ): OnboardingParseFailure | null =>
    requireComplete && raw === undefined
      ? invalidField(String(field), 'This field is required.')
      : null;

  const fields: Array<keyof CompleteOnboardingDataV1> = [
    'weight_unit',
    'height_unit',
    'timezone',
    'date_of_birth',
    'sex',
    'height_mm',
    'activity_level',
    'current_weight_grams',
    'target_weight_grams',
    'daily_deficit'
  ];
  for (const field of fields) {
    const failure = required(field, value[field]);
    if (failure) return failure;
  }

  if (value.weight_unit !== undefined) {
    if (!isWeightUnit(value.weight_unit)) {
      return invalidField('weight_unit', 'Choose a supported weight unit.');
    }
    data.weight_unit = value.weight_unit;
  }
  if (value.height_unit !== undefined) {
    if (!isHeightUnit(value.height_unit)) {
      return invalidField('height_unit', 'Choose a supported height unit.');
    }
    data.height_unit = value.height_unit;
  }
  if (value.timezone !== undefined) {
    if (!isValidIanaTimeZone(value.timezone)) {
      return invalidField('timezone', 'Choose a valid IANA timezone.');
    }
    data.timezone = value.timezone.trim();
  }
  if (value.date_of_birth !== undefined) {
    const normalized = normalizeDateOfBirth(value.date_of_birth);
    if (!normalized || normalized !== value.date_of_birth) {
      return invalidField('date_of_birth', 'Use a valid date in YYYY-MM-DD format.');
    }
    data.date_of_birth = normalized;
  }
  if (value.sex !== undefined) {
    if (!isSex(value.sex)) return invalidField('sex', 'Choose a supported sex value.');
    data.sex = value.sex;
  }
  if (value.height_mm !== undefined) {
    if (!isPolicyHeight(value.height_mm)) {
      return invalidField('height_mm', 'Enter a height within the supported range.');
    }
    data.height_mm = value.height_mm;
  }
  if (value.activity_level !== undefined) {
    if (!isActivityLevel(value.activity_level)) {
      return invalidField('activity_level', 'Choose a supported activity level.');
    }
    data.activity_level = value.activity_level;
  }
  if (value.current_weight_grams !== undefined) {
    if (!isPolicyWeight(value.current_weight_grams)) {
      return invalidField('current_weight_grams', 'Enter a weight within the supported range.');
    }
    data.current_weight_grams = value.current_weight_grams;
  }
  if (value.target_weight_grams !== undefined) {
    if (!isPolicyWeight(value.target_weight_grams)) {
      return invalidField('target_weight_grams', 'Enter a weight within the supported range.');
    }
    data.target_weight_grams = value.target_weight_grams;
  }
  if (value.daily_deficit !== undefined) {
    if (!isPolicyDailyDeficit(value.daily_deficit)) {
      return invalidField('daily_deficit', 'Choose an available calorie plan option.');
    }
    data.daily_deficit = value.daily_deficit;
  }

  if (
    data.current_weight_grams !== undefined &&
    data.target_weight_grams !== undefined &&
    data.daily_deficit !== undefined
  ) {
    if (
      (data.daily_deficit > 0 && data.current_weight_grams <= data.target_weight_grams) ||
      (data.daily_deficit < 0 && data.current_weight_grams >= data.target_weight_grams)
    ) {
      return invalidField('target_weight_grams', 'The target weight does not match the selected plan direction.');
    }
  }

  if (requireComplete) {
    const complete = data as CompleteOnboardingDataV1;
    const evaluation = evaluateCaloriePlan({
      profile: {
        timezone: complete.timezone,
        dateOfBirth: complete.date_of_birth,
        sex: complete.sex,
        heightMm: complete.height_mm,
        activityLevel: complete.activity_level
      },
      latestWeightGrams: complete.current_weight_grams,
      goal: {
        startWeightGrams: complete.current_weight_grams,
        targetWeightGrams: complete.target_weight_grams,
        dailyDeficit: complete.daily_deficit,
        reviewStatus: 'CLEAR'
      }
    });
    const accountAgeYears = evaluation.eligibility.ageYears;
    if (
      evaluation.eligibility.status !== 'eligible'
      || accountAgeYears === null
      || accountAgeYears < MIN_ACCOUNT_AGE_YEARS
    ) {
      return invalidField(
        'date_of_birth',
        'Calibrate accounts require age 18 or older.'
      );
    }
    if (evaluation.status !== 'available') {
      return invalidField('daily_deficit', 'Choose an available calorie plan option.');
    }
  }

  return { ok: true, value: data };
}

export function parseDraftPutBody(body: unknown): OnboardingParseResult<DraftPutInput> {
  if (!isRecord(body)) return invalidField('body', 'An onboarding draft is required.');
  const versionFailure = parseSchemaVersion(body.schema_version);
  if (versionFailure) return versionFailure;

  const revision = parseRevision(body.revision, 'revision');
  if (!revision.ok) return revision;

  if (
    body.current_step !== null &&
    (typeof body.current_step !== 'string' || !onboardingStepSet.has(body.current_step))
  ) {
    return invalidField('current_step', 'Choose a supported onboarding step.');
  }

  const parsedData = parseDraftData(body.data, false);
  if (!parsedData.ok) return parsedData;
  return {
    ok: true,
    value: {
      revision: revision.value,
      currentStep: body.current_step as OnboardingStep | null,
      data: parsedData.value
    }
  };
}

export function parseCompleteOnboardingBody(
  body: unknown
): OnboardingParseResult<CompleteOnboardingInput> {
  if (!isRecord(body)) return invalidField('body', 'Onboarding data is required.');
  const versionFailure = parseSchemaVersion(body.schema_version);
  if (versionFailure) return versionFailure;

  const revision = parseRevision(body.expected_revision, 'expected_revision');
  if (!revision.ok) return revision;
  const parsedData = parseDraftData(body.data, true);
  if (!parsedData.ok) return parsedData;
  return {
    ok: true,
    value: {
      expectedRevision: revision.value,
      data: parsedData.value as CompleteOnboardingDataV1
    }
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Upgrade the only pre-release draft shape. Version 0 used camelCase for the three
 * measurement fields; all other values already matched the V1 canonical shape.
 */
export function upgradeOnboardingDraftData(
  schemaVersion: number,
  value: unknown
): OnboardingDraftDataV1 {
  if (schemaVersion > ONBOARDING_DRAFT_SCHEMA_VERSION || schemaVersion < 0 || !isRecord(value)) {
    throw new OnboardingDraftStateError('Unsupported stored onboarding draft.');
  }
  const upgraded = schemaVersion === 0
    ? {
        ...value,
        height_mm: value.height_mm ?? value.heightMm,
        current_weight_grams: value.current_weight_grams ?? value.currentWeightGrams,
        target_weight_grams: value.target_weight_grams ?? value.targetWeightGrams
      }
    : value;
  const parsed = parseDraftData(upgraded, false);
  if (!parsed.ok) throw new OnboardingDraftStateError('Stored onboarding draft is invalid.');
  return parsed.value;
}

function parseStoredStep(value: string | null): OnboardingStep | null {
  return value !== null && onboardingStepSet.has(value) ? value as OnboardingStep : null;
}

function serializeDraft(
  draft: Pick<OnboardingDraft, 'schema_version' | 'revision' | 'current_step' | 'data' | 'created_at' | 'updated_at'>
): OnboardingDraftWire {
  return {
    schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
    revision: draft.revision,
    current_step: parseStoredStep(draft.current_step),
    data: upgradeOnboardingDraftData(draft.schema_version, draft.data),
    created_at: draft.created_at.toISOString(),
    updated_at: draft.updated_at.toISOString()
  };
}

async function lockUser(tx: MutationDatabase, userId: number): Promise<void> {
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
    userId
  );
}

async function upgradeStoredDraft(
  tx: MutationDatabase,
  draft: OnboardingDraft
): Promise<OnboardingDraft> {
  if (draft.schema_version === ONBOARDING_DRAFT_SCHEMA_VERSION) return draft;
  const data = upgradeOnboardingDraftData(draft.schema_version, draft.data);
  return tx.onboardingDraft.update({
    where: { user_id: draft.user_id },
    data: {
      schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
      revision: { increment: 1 },
      data: toInputJson(data)
    }
  });
}

function deriveLegacyCurrentStep(data: OnboardingDraftDataV1): OnboardingStep {
  if (data.current_weight_grams === undefined || data.target_weight_grams === undefined) return 'goal';
  if (data.date_of_birth === undefined || data.sex === undefined) return 'about';
  if (
    data.height_mm === undefined ||
    data.activity_level === undefined ||
    data.timezone === undefined
  ) return 'burn';
  if (data.daily_deficit === undefined) return 'pace';
  return 'review';
}

function buildLegacyDraftData(user: {
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  timezone: string;
  date_of_birth: Date | null;
  sex: Sex | null;
  height_mm: number | null;
  activity_level: ActivityLevel | null;
  metrics: Array<{ weight_grams: number }>;
  goals: Array<{
    start_weight_grams: number;
    target_weight_grams: number;
    daily_deficit: number;
  }>;
}): OnboardingDraftDataV1 {
  const latestMetric = user.metrics[0];
  const latestGoal = user.goals[0];
  return {
    weight_unit: user.weight_unit,
    height_unit: user.height_unit,
    timezone: user.timezone,
    ...(user.date_of_birth
      ? { date_of_birth: user.date_of_birth.toISOString().slice(0, 10) }
      : {}),
    ...(user.sex ? { sex: user.sex } : {}),
    ...(user.height_mm === null ? {} : { height_mm: user.height_mm }),
    ...(user.activity_level ? { activity_level: user.activity_level } : {}),
    ...(latestMetric ? { current_weight_grams: latestMetric.weight_grams } : {}),
    ...(latestGoal
      ? {
          current_weight_grams: latestMetric?.weight_grams ?? latestGoal.start_weight_grams,
          target_weight_grams: latestGoal.target_weight_grams,
          daily_deficit: latestGoal.daily_deficit
        }
      : {})
  };
}

function hasLegacyProgress(user: {
  timezone: string;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  date_of_birth: Date | null;
  sex: Sex | null;
  height_mm: number | null;
  activity_level: ActivityLevel | null;
  metrics: unknown[];
  goals: unknown[];
}): boolean {
  return Boolean(
    user.date_of_birth ||
    user.sex ||
    user.height_mm ||
    user.activity_level ||
    user.metrics.length > 0 ||
    user.goals.length > 0 ||
    user.timezone !== 'UTC' ||
    user.weight_unit !== 'KG' ||
    user.height_unit !== 'CM'
  );
}

const onboardingStateSelect = {
  onboarding_completed_at: true,
  weight_unit: true,
  height_unit: true,
  timezone: true,
  date_of_birth: true,
  sex: true,
  height_mm: true,
  activity_level: true,
  onboarding_draft: true,
  metrics: {
    orderBy: [{ date: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { weight_grams: true }
  },
  goals: {
    orderBy: [{ created_at: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: {
      start_weight_grams: true,
      target_weight_grams: true,
      daily_deficit: true
    }
  }
} satisfies Prisma.UserSelect;

export async function getOnboardingDraftState(userId: number): Promise<{
  draft: OnboardingDraftWire | null;
  recovered_from_legacy: boolean;
  onboarding_completed_at: string | null;
} | null> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: onboardingStateSelect
    });
    if (!user) return null;
    if (user.onboarding_completed_at) {
      return {
        draft: null,
        recovered_from_legacy: false,
        onboarding_completed_at: user.onboarding_completed_at.toISOString()
      };
    }

    if (user.onboarding_draft) {
      const draft = await upgradeStoredDraft(tx, user.onboarding_draft);
      return {
        draft: serializeDraft(draft),
        recovered_from_legacy: false,
        onboarding_completed_at: null
      };
    }

    if (!hasLegacyProgress(user)) {
      return {
        draft: null,
        recovered_from_legacy: false,
        onboarding_completed_at: null
      };
    }

    const data = buildLegacyDraftData(user);
    const draft = await tx.onboardingDraft.create({
      data: {
        user_id: userId,
        schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
        current_step: deriveLegacyCurrentStep(data),
        data: toInputJson(data)
      }
    });
    return {
      draft: serializeDraft(draft),
      recovered_from_legacy: true,
      onboarding_completed_at: null
    };
  });
}

export async function putOnboardingDraft(
  userId: number,
  input: DraftPutInput
): Promise<OnboardingDraftWire | null> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { onboarding_completed_at: true, onboarding_draft: true }
    });
    if (!user) return null;
    if (user.onboarding_completed_at) {
      throw new OnboardingDraftStateError('Onboarding is already complete.');
    }

    let current = user.onboarding_draft;
    if (current) current = await upgradeStoredDraft(tx, current);
    if (current && input.revision !== current.revision) {
      throw new OnboardingDraftConflictError(serializeDraft(current));
    }

    const draft = current
      ? await tx.onboardingDraft.update({
          where: { user_id: userId },
          data: {
            revision: { increment: 1 },
            current_step: input.currentStep,
            data: toInputJson(input.data)
          }
        })
      : await tx.onboardingDraft.create({
          data: {
            user_id: userId,
            schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
            current_step: input.currentStep,
            data: toInputJson(input.data)
          }
        });
    return serializeDraft(draft);
  });
}

export async function deleteOnboardingDraft(userId: number): Promise<void> {
  await prisma.onboardingDraft.deleteMany({ where: { user_id: userId } });
}

function completionConflictBody(draft: OnboardingDraftWire) {
  return {
    message: 'The onboarding draft changed on another device.',
    code: 'ONBOARDING_DRAFT_CONFLICT',
    retryable: true,
    draft
  };
}

async function existingCompletionResponse(
  tx: MutationDatabase,
  userId: number
): Promise<OnboardingCompletionResponse | null> {
  const operation = await tx.clientOperation.findFirst({
    where: {
      user_id: userId,
      operation_kind: 'onboarding.complete',
      response_status: 200,
      completed_at: { not: null }
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: { response_body: true }
  });
  return isRecord(operation?.response_body)
    ? operation.response_body as unknown as OnboardingCompletionResponse
    : null;
}

export async function completeOnboardingInTransaction(
  tx: MutationDatabase,
  userId: number,
  operationId: string,
  input: CompleteOnboardingInput,
  options: {
    now?: Date;
    afterWrite?: (stage: OnboardingWriteStage) => void | Promise<void>;
  } = {}
): Promise<MutationResult<OnboardingCompletionResponse | Record<string, unknown>>> {
  await lockUser(tx, userId);
  const current = await tx.user.findUnique({
    where: { id: userId },
    select: {
      onboarding_completed_at: true,
      onboarding_draft: true
    }
  });
  if (!current) return { status: 404, body: { message: 'User not found' } };

  if (current.onboarding_completed_at) {
    const existing = await existingCompletionResponse(tx, userId);
    if (existing) return { status: 200, body: existing };
    return {
      status: 409,
      body: {
        message: 'Onboarding is already complete.',
        code: 'ONBOARDING_ALREADY_COMPLETED',
        retryable: false
      }
    };
  }

  let draft = current.onboarding_draft;
  if (draft) draft = await upgradeStoredDraft(tx, draft);
  if (draft && input.expectedRevision !== draft.revision) {
    return { status: 409, body: completionConflictBody(serializeDraft(draft)) };
  }

  const now = options.now ?? new Date();
  const metricDate = getUtcTodayDateOnlyInTimeZone(input.data.timezone, now);
  const dateOfBirth = new Date(input.data.date_of_birth + 'T00:00:00.000Z');

  await tx.user.update({
    where: { id: userId },
    data: {
      weight_unit: input.data.weight_unit,
      height_unit: input.data.height_unit,
      timezone: input.data.timezone,
      date_of_birth: dateOfBirth,
      sex: input.data.sex,
      height_mm: input.data.height_mm,
      activity_level: input.data.activity_level
    }
  });
  await options.afterWrite?.('profile');

  const metric = await tx.bodyMetric.upsert({
    where: { user_id_date: { user_id: userId, date: metricDate } },
    update: { weight_grams: input.data.current_weight_grams },
    create: {
      user_id: userId,
      date: metricDate,
      weight_grams: input.data.current_weight_grams
    }
  });
  await options.afterWrite?.('metric');

  const existingGoal = await tx.goal.findFirst({
    where: { user_id: userId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    select: { id: true }
  });
  const goalData = {
    start_weight_grams: input.data.current_weight_grams,
    target_weight_grams: input.data.target_weight_grams,
    target_date: null,
    daily_deficit: input.data.daily_deficit,
    calorie_plan_review_status: 'CLEAR' as const,
    calorie_plan_review_reason: null
  };
  const goal = existingGoal
    ? await tx.goal.update({ where: { id: existingGoal.id }, data: goalData })
    : await tx.goal.create({ data: { user_id: userId, ...goalData } });
  await options.afterWrite?.('goal');

  const completedAt = now.toISOString();
  const syncMarker = await tx.syncChange.create({
    data: {
      user_id: userId,
      entity_type: 'onboarding_completion',
      entity_id: String(userId),
      action: 'upsert',
      operation_id: operationId,
      payload: toInputJson({
        schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
        completed_at: completedAt
      })
    }
  });
  await options.afterWrite?.('sync_marker');

  const completedUser = await tx.user.update({
    where: { id: userId },
    data: { onboarding_completed_at: now },
    select: USER_CLIENT_SELECT
  });
  await options.afterWrite?.('completion');

  await tx.onboardingDraft.deleteMany({ where: { user_id: userId } });
  await options.afterWrite?.('draft_delete');

  return {
    status: 200,
    body: {
      receipt: {
        operation_id: operationId,
        completed_at: completedAt,
        goal_id: goal.id,
        metric_id: metric.id,
        sync_cursor: syncMarker.id.toString()
      },
      user: serializeUserForClient(completedUser)
    }
  };
}
