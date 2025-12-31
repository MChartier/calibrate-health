import express from 'express';
import prisma from '../config/database';
import { resetDevTestUserToPreOnboardingState } from '../services/devTestData';
import { serializeUserForClient, USER_CLIENT_SELECT } from '../utils/userSerialization';

const router = express.Router();

/**
 * Ensure a request is only handled in non-production environments.
 *
 * We mount these routes only in dev, but keeping a runtime guard makes the intent explicit
 * and prevents accidental exposure if routing changes in the future.
 */
const requireNonProduction = (
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  next();
};

router.use(requireNonProduction);

/**
 * Reset the deterministic dev test account to a pre-onboarding state.
 *
 * This keeps the session intact (same user id), but clears profile/goal/metrics data so the app
 * routes users back through onboarding without requiring a separate account.
 */
router.post('/reset-test-user-onboarding', async (_req, res) => {
  try {
    const userId = await resetDevTestUserToPreOnboardingState();

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_CLIENT_SELECT
    });

    res.json({
      ok: true,
      user: updatedUser ? serializeUserForClient(updatedUser) : null
    });
  } catch (error) {
    console.error('Dev test route: unable to reset test user onboarding state:', error);
    res.status(500).json({ message: 'Failed to reset test user' });
  }
});

export default router;

