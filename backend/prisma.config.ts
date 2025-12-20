import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // Seed command used by `prisma db seed` (dev/test convenience only).
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: databaseUrl ? { url: databaseUrl } : undefined,
});
