import prisma from '../config/database';

// A single row owns instance-wide settings; a missing row keeps experiments off.
const SERVER_SETTINGS_ID = 1;

export async function getServerFeatures() {
  const settings = await prisma.serverSettings.findUnique({ where: { id: SERVER_SETTINGS_ID } });
  return { nutrition_label_scanning: settings?.nutrition_label_scanning_enabled ?? false };
}

export { isServerAdmin } from './serverAccess';
