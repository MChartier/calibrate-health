import 'dotenv/config';

import prisma from '../config/database';
import { dispatchReminderNotifications } from '../services/notificationDispatch';

/**
 * CLI entrypoint for running reminder notifications (intended for cron).
 */
const run = async (): Promise<void> => {
  await dispatchReminderNotifications();
};

run()
  .catch((error) => {
    console.error('Reminder dispatch failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
