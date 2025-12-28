/**
 * Convert a Prisma User (or Passport session user) into the stable JSON shape the frontend expects.
 *
 * Centralizing this keeps auth + profile mutation responses consistent as we add fields (e.g. created_at).
 */
export function serializeUserForClient(user: any) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    weight_unit: user.weight_unit,
    height_unit: user.height_unit,
    timezone: user.timezone,
    date_of_birth: user.date_of_birth,
    sex: user.sex,
    height_mm: user.height_mm,
    activity_level: user.activity_level,
  };
}

