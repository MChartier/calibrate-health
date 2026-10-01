import 'dotenv/config';
import { normalizeEmailCredential } from '../utils/authCredentials';

async function main() {
  const args = process.argv.slice(2);
  let identity: string | number | null = null;
  if (args.length === 2 && args[0] === '--email') identity = normalizeEmailCredential(args[1]);
  if (args.length === 2 && args[0] === '--id' && /^[1-9]\d*$/.test(args[1])) {
    const id = Number(args[1]);
    if (Number.isSafeInteger(id) && id <= 2_147_483_647) identity = id;
  }
  if (identity === null) {
    console.error('Usage: admin:grant -- --email existing@example.com (or --id 7 for a confirmed existing account)');
    process.exitCode = 1;
    return;
  }

  // Parse arguments before loading database configuration, including for the container's Node entrypoint.
  const { disconnectDatabase } = await import('../config/database');
  try {
    const { grantServerAdminToExistingAccount, ServerAccessError } = await import('../services/serverAccess');
    try {
      const user = await grantServerAdminToExistingAccount(identity);
      console.log(`Administrator access granted to existing account ${user.id}. Manage future role changes in Settings.`);
    } catch (error) {
      if (!(error instanceof ServerAccessError)) throw error;
      console.error(error.message);
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
  }
}

void main().catch(() => {
  console.error('Could not grant access. Check database configuration and applied migrations.');
  process.exitCode = 1;
});
