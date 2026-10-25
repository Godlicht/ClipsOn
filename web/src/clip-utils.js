export function validClipRange(start, end, duration) {
  return [start, end, duration].every(Number.isFinite) && start >= 0 && end <= duration && end - start >= .5 && end - start <= 180;
}

export function clipDurationLabel(seconds) {
  return `${Math.max(0, seconds).toFixed(1).replace('.', ',')} s`;
}
