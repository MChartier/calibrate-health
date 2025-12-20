import prisma from '../src/config/database';
import { seedDevTestData } from '../src/services/devTestData';

/**
 * Prisma seed entrypoint.
 *
 * Note: this script is intentionally safe to re-run; it creates or updates the
 * deterministic dev user and backfills the last week of sample data.
 */
const run = async (): Promise<void> => {
  await seedDevTestData();
};

run()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

