import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolvePrismaCliUrl } from './src/config/databaseUtils';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: { url: resolvePrismaCliUrl() },
});
