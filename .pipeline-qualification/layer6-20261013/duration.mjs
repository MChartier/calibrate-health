export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 0 || seconds > 359999) {
    throw new RangeError('seconds must be an integer from 0 through 359999');
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((component) => String(component).padStart(2, '0'))
    .join(':');
}
