export function formatDayCount(days) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function getWindowMetric(result) {
  if (result.selectedWindowDays !== null) {
    return {
      label: 'evaluation window',
      value: formatDayCount(result.selectedWindowDays)
    };
  }

  return {
    label: 'history observed',
    value: formatDayCount(result.dataQuality.observationDays)
  };
}

export function formatBudgetChange(stepKcal) {
  return `${Math.abs(stepKcal)} kcal ${stepKcal < 0 ? 'less' : 'more'}`;
}

export function formatBudgetInterval(value) {
  if (!value) return 'Not enough evidence';
  if (value.high < 0) {
    return `${Math.abs(Math.round(value.midpoint)).toLocaleString()} kcal/day lower (${Math.abs(Math.round(value.high)).toLocaleString()} to ${Math.abs(Math.round(value.low)).toLocaleString()})`;
  }
  if (value.low > 0) {
    return `${Math.round(value.midpoint).toLocaleString()} kcal/day higher (${Math.round(value.low).toLocaleString()} to ${Math.round(value.high).toLocaleString()})`;
  }
  return `Near baseline (${Math.abs(Math.round(value.low)).toLocaleString()} lower to ${Math.round(value.high).toLocaleString()} higher)`;
}

export function formatWeightInterval(value, weightUnit) {
  if (!value) return 'Not enough evidence';
  const multiplier = weightUnit === 'LB' ? 2.2046226218 : 1;
  const unit = weightUnit === 'LB' ? 'lb/week' : 'kg/week';
  return `${(value.midpoint * multiplier).toFixed(2)} ${unit} (${(value.low * multiplier).toFixed(2)} to ${(value.high * multiplier).toFixed(2)})`;
}
