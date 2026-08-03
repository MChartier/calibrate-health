function addDays(date, delta) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

export function buildPreviewStatus(result, fingerprint, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    inputFingerprint: fingerprint,
    evaluation: result,
    recommendation: result.recommendation ? {
      id: 1,
      status: 'pending',
      inputFingerprint: fingerprint,
      effectiveLocalDate: addDays(result.asOfDate, 1)
    } : null,
    scheduledChange: null
  };
}

export function applyPreviewRecommendation(status, recommendationId) {
  const recommendation = status?.evaluation.recommendation;
  const metadata = status?.recommendation;
  if (!status || !recommendation || !metadata || metadata.id !== recommendationId) return status;
  return {
    ...status,
    recommendation: null,
    scheduledChange: {
      recommendationId,
      targetAdjustmentKcal: recommendation.recommendedTargetAdjustmentKcal,
      dailyCalorieBudgetKcal: recommendation.recommendedTargetKcal,
      effectiveLocalDate: metadata.effectiveLocalDate
    }
  };
}

export function cancelPreviewScheduledChange(status, recommendationId) {
  if (!status || status.scheduledChange?.recommendationId !== recommendationId) return status;
  return {
    ...status,
    recommendation: {
      id: recommendationId,
      status: 'pending',
      inputFingerprint: status.inputFingerprint ?? 'lab-preview',
      effectiveLocalDate: status.scheduledChange.effectiveLocalDate
    },
    scheduledChange: null
  };
}
