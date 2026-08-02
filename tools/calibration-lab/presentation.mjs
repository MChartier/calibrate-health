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
