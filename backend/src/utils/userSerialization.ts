import type { ActivityLevel, HeightUnit, Prisma, Sex, WeightUnit } from '@prisma/client';
import { buildBase64DataUrl } from './profileImage';

export type UserClientPayload = {
  id: number;
  email: string;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  timezone: string;
  date_of_birth: Date | null;
  sex: Sex | null;
  height_mm: number | null;
  activity_level: ActivityLevel | null;
  profile_image_url: string | null;
};

/**
 * Prisma select helper that matches the fields we expose to the frontend.
 * (Avoids accidentally returning sensitive columns like password_hash.)
 */
export const USER_CLIENT_SELECT = {
  id: true,
  email: true,
  weight_unit: true,
  height_unit: true,
  timezone: true,
  date_of_birth: true,
  sex: true,
  height_mm: true,
  activity_level: true,
  profile_image: true,
  profile_image_mime_type: true
} satisfies Prisma.UserSelect;

type UserForClient = Omit<UserClientPayload, 'profile_image_url'> & {
  profile_image?: Uint8Array | null;
  profile_image_mime_type?: string | null;
};

/**
 * Convert a Prisma user row into the subset (plus avatar) that the frontend expects.
 */
export const serializeUserForClient = (user: UserForClient): UserClientPayload => {
  const bytes = user.profile_image ?? null;
  const mimeType = user.profile_image_mime_type ?? null;

  return {
    id: user.id,
    email: user.email,
    weight_unit: user.weight_unit,
    height_unit: user.height_unit,
    timezone: user.timezone,
    date_of_birth: user.date_of_birth,
    sex: user.sex,
    height_mm: user.height_mm,
    activity_level: user.activity_level,
    profile_image_url: bytes && mimeType ? buildBase64DataUrl({ mimeType, bytes }) : null
  };
};
