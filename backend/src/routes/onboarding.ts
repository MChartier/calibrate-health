import express from 'express';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../middleware/authenticatedUser';
import {
  ClientOperationConflictError,
  executeIdempotentMutation,
  parseClientOperationId
} from '../services/clientOperations';
import {
  completeOnboardingInTransaction,
  deleteOnboardingDraft,
  getOnboardingDraftState,
  OnboardingDraftConflictError,
  OnboardingDraftStateError,
  parseCompleteOnboardingBody,
  parseDraftPutBody,
  putOnboardingDraft
} from '../services/onboarding';
import { logSafeOperationalError } from '../observability';

const router = express.Router();
router.use(requireAuthenticatedUser);

function parseFailureBody(failure: {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}) {
  return {
    message: failure.message,
    code: failure.code,
    retryable: false,
    ...(failure.fieldErrors ? { field_errors: failure.fieldErrors } : {})
  };
}

router.get('/draft', async (req, res) => {
  const user = getAuthenticatedUser(req);
  try {
    const state = await getOnboardingDraftState(user.id);
    if (!state) return res.status(404).json({ message: 'User not found' });
    res.setHeader('cache-control', 'no-store');
    return res.json(state);
  } catch (error) {
    logSafeOperationalError('onboarding.draft_load', error, res.locals?.requestId);
    return res.status(500).json({
      message: 'Unable to load onboarding progress.',
      code: 'ONBOARDING_LOAD_FAILED',
      retryable: true
    });
  }
});

router.put('/draft', async (req, res) => {
  const user = getAuthenticatedUser(req);
  const parsed = parseDraftPutBody(req.body);
  if (!parsed.ok) {
    return res.status(parsed.code === 'ONBOARDING_DRAFT_VERSION_UNSUPPORTED' ? 409 : 400)
      .json(parseFailureBody(parsed));
  }

  try {
    const draft = await putOnboardingDraft(user.id, parsed.value);
    if (!draft) return res.status(404).json({ message: 'User not found' });
    res.setHeader('cache-control', 'no-store');
    return res.json({ draft });
  } catch (error) {
    if (error instanceof OnboardingDraftConflictError) {
      return res.status(409).json({
        message: error.message,
        code: 'ONBOARDING_DRAFT_CONFLICT',
        retryable: true,
        draft: error.currentDraft
      });
    }
    if (error instanceof OnboardingDraftStateError) {
      return res.status(409).json({
        message: error.message,
        code: 'ONBOARDING_ALREADY_COMPLETED',
        retryable: false
      });
    }
    logSafeOperationalError('onboarding.draft_save', error, res.locals?.requestId);
    return res.status(500).json({
      message: 'Unable to save onboarding progress.',
      code: 'ONBOARDING_SAVE_FAILED',
      retryable: true
    });
  }
});

router.delete('/draft', async (req, res) => {
  const user = getAuthenticatedUser(req);
  try {
    await deleteOnboardingDraft(user.id);
    return res.status(204).send();
  } catch (error) {
    logSafeOperationalError('onboarding.draft_delete', error, res.locals?.requestId);
    return res.status(500).json({
      message: 'Unable to clear onboarding progress.',
      code: 'ONBOARDING_DELETE_FAILED',
      retryable: true
    });
  }
});

router.post('/complete', async (req, res) => {
  const user = getAuthenticatedUser(req);
  const operationId = parseClientOperationId(
    req.get?.('x-client-operation-id') ?? req.headers?.['x-client-operation-id']
  );
  if (!operationId) {
    return res.status(400).json({
      message: 'A valid x-client-operation-id is required.',
      code: 'INVALID_CLIENT_OPERATION_ID',
      retryable: false
    });
  }

  const parsed = parseCompleteOnboardingBody(req.body);
  if (!parsed.ok) {
    return res.status(parsed.code === 'ONBOARDING_DRAFT_VERSION_UNSUPPORTED' ? 409 : 400)
      .json(parseFailureBody(parsed));
  }

  try {
    const result = await executeIdempotentMutation<unknown>({
      userId: user.id,
      operationId,
      operationKind: 'onboarding.complete',
      requestPayload: req.body,
      mutate: (tx) =>
        completeOnboardingInTransaction(tx, user.id, operationId, parsed.value)
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
    logSafeOperationalError('onboarding.complete', error, res.locals?.requestId);
    return res.status(500).json({
      message: 'Unable to complete onboarding.',
      code: 'ONBOARDING_COMPLETION_FAILED',
      retryable: true
    });
  }
});

export default router;
