import express from 'express';
import { z } from 'zod';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../middleware/authenticatedUser';
import { getServerFeatures, isServerAdmin } from '../services/serverSettings';
import {
  listServerUsers, ServerAccessError, updateServerFeaturesAsAdmin, updateServerUserRole
} from '../services/serverAccess';

const router = express.Router();
const settingsInput = z.strictObject({
  features: z.strictObject({ nutrition_label_scanning: z.boolean() })
});
const positiveId = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2_147_483_647));
const usersQuery = z.strictObject({
  search: z.string().trim().max(254).optional(),
  cursor: positiveId.optional(),
  limit: positiveId.pipe(z.number().max(100)).optional()
});
const roleInput = z.strictObject({ role: z.enum(['admin', 'member']) });

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuthenticatedUser);

router.get('/', async (req, res) => {
  const [features, isAdmin] = await Promise.all([
    getServerFeatures(), isServerAdmin(getAuthenticatedUser(req).id)
  ]);
  res.json({ features, is_admin: isAdmin });
});

router.patch('/', async (req, res) => {
  const parsed = settingsInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Provide a boolean nutrition_label_scanning feature setting.' });
    return;
  }
  const features = await updateServerFeaturesAsAdmin(getAuthenticatedUser(req).id, parsed.data.features.nutrition_label_scanning);
  res.json({ features, is_admin: true });
});

router.get('/users', async (req, res) => {
  const parsed = usersQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: 'Provide valid search, cursor, and limit values.' });
    return;
  }
  res.json(await listServerUsers(getAuthenticatedUser(req).id, { ...parsed.data, limit: parsed.data.limit ?? 25 }));
});

router.patch('/users/:id/role', async (req, res) => {
  const id = positiveId.safeParse(req.params.id);
  const parsed = roleInput.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ message: 'Provide a valid user id and an admin or member role.' });
    return;
  }
  res.json(await updateServerUserRole(getAuthenticatedUser(req).id, id.data, parsed.data.role));
});

router.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof ServerAccessError) {
    res.status(error.status).json({ message: error.message, code: error.code, retryable: false });
    return;
  }
  next(error);
});

export default router;
