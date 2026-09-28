import prisma from '../config/database';

// A single row owns instance-wide settings; a missing row keeps experiments off.
const SERVER_SETTINGS_ID = 1;

export async function getServerFeatures() {
  const settings = await prisma.serverSettings.findUnique({ where: { id: SERVER_SETTINGS_ID } });
  return { nutrition_label_scanning: settings?.nutrition_label_scanning_enabled ?? false };
}

export async function updateServerFeatures(nutritionLabelScanning: boolean) {
  const settings = await prisma.serverSettings.upsert({
    where: { id: SERVER_SETTINGS_ID },
    create: { id: SERVER_SETTINGS_ID, nutrition_label_scanning_enabled: nutritionLabelScanning },
    update: { nutrition_label_scanning_enabled: nutritionLabelScanning }
  });
  return { nutrition_label_scanning: settings.nutrition_label_scanning_enabled };
}

export async function isServerAdmin(userId: number): Promise<boolean> {
  const allowedEmails = new Set((process.env.ADMIN_EMAILS ?? '').split(',')
    .map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (allowedEmails.size === 0) return false;
  // Read current identity from the database for every request, never from client claims.
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { email: true, email_verified_at: true }
  });
  return Boolean(user?.email_verified_at && allowedEmails.has(user.email.trim().toLowerCase()));
}
