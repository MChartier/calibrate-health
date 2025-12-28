import type { ActivityLevel, HeightUnit, Sex, User as PrismaUser, WeightUnit } from '@prisma/client';

export type SerializedUserForClient = {
  id: number;
  email: string;
  created_at: string;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  timezone: string;
  date_of_birth: string | null;
  sex: Sex | null;
  height_mm: number | null;
  activity_level: ActivityLevel | null;
};

type UserClientFields = Pick<
  PrismaUser,
  | 'id'
  | 'email'
  | 'created_at'
  | 'weight_unit'
  | 'height_unit'
  | 'timezone'
  | 'date_of_birth'
  | 'sex'
  | 'height_mm'
  | 'activity_level'
>;

/**
 * Convert a Prisma User (or Passport session user) into the stable JSON shape the frontend expects.
 *
 * Centralizing this keeps auth + profile mutation responses consistent as we add fields (e.g. created_at).
 */
export function serializeUserForClient(user: UserClientFields): SerializedUserForClient {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at.toISOString(),
    weight_unit: user.weight_unit,
    height_unit: user.height_unit,
    timezone: user.timezone,
    date_of_birth: user.date_of_birth ? user.date_of_birth.toISOString() : null,
    sex: user.sex,
    height_mm: user.height_mm,
    activity_level: user.activity_level,
  };
}
