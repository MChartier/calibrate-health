import express from 'express';
import {
  ClientOperationConflictError,
  parseClientOperationId
} from '../services/clientOperations';
import {
  buildWatchSnapshot,
  executeWatchMutation,
  parseWatchMutation,
  watchSnapshotEtag
} from '../services/watch';

const router = express.Router();

const etagMatches = (header: string | undefined, current: string): boolean => {
  if (!header) return false;
  const normalizedCurrent = current.replace(/^W\//, '');
  return header.split(',').some((entry) => {
    const candidate = entry.trim();
    return candidate === '*' || candidate === current || candidate.replace(/^W\//, '') === normalizedCurrent;
  });
};

router.use((req, res, next) => {
  if (
    res.locals.mobileDevicePlatform !== 'wear_os' ||
    typeof res.locals.mobileAuthSessionId !== 'number' ||
    !req.isAuthenticated()
  ) {
    return res.status(403).json({
      message: 'A Wear OS session is required',
      code: 'WATCH_SESSION_REQUIRED',
      retryable: false
    });
  }
  return next();
});

router.get('/', async (req, res) => {
  const user = req.user as { id: number };
  try {
    const snapshot = await buildWatchSnapshot({
      userId: user.id,
      mobileAuthSessionId: res.locals.mobileAuthSessionId
    });
    if (!snapshot) return res.status(404).json({ message: 'Account not found' });
    const etag = watchSnapshotEtag(snapshot.revision);
    res.set('ETag', etag);
    res.set('Cache-Control', 'private, no-cache');
    if (etagMatches(req.get('if-none-match'), etag)) return res.status(304).send();
    return res.json(snapshot);
  } catch (error) {
    console.error('Watch snapshot failed:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/mutations', async (req, res) => {
  const user = req.user as { id: number; timezone: string };
  const operationId = parseClientOperationId(req.get('x-client-operation-id'));
  if (operationId === undefined) {
    return res.status(400).json({ message: 'x-client-operation-id is required' });
  }
  if (operationId === null) {
    return res.status(400).json({ message: 'Invalid x-client-operation-id' });
  }
  const mutation = parseWatchMutation(req.body, { timezone: user.timezone });
  if (!mutation.ok) return res.status(mutation.status).json({ message: mutation.message });

  try {
    const result = await executeWatchMutation({
      userId: user.id,
      mobileAuthSessionId: res.locals.mobileAuthSessionId,
      operationId,
      mutation
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof ClientOperationConflictError) {
      return res.status(409).json({
        message: error.message,
        code: error.code,
        retryable: error.code === 'OPERATION_IN_PROGRESS'
      });
    }
    console.error('Watch mutation failed:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
