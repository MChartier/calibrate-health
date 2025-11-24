import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
};

if (!config.databaseUrl) {
  console.warn('DATABASE_URL is not set. Prisma will fail to connect.');
}
