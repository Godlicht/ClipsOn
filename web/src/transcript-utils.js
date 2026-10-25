export function timeLabel(seconds, precise = false) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const base = `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${base}${precise ? `.${String(milliseconds % 1000).padStart(3, '0')}` : ''}`;
}

export function isTimedWord(word) {
  return Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end > word.start;
}

export function activeWordIndex(words, time) {
  // Binary search on source times, without rounding to subtitle frames.
  let low = 0, high = words.length - 1, result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (words[mid].start <= time) { result = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return result >= 0 && time < words[result].end ? result : -1;
}

export function validateTranscriptImport(data, videoDuration) {
  const fail = () => { throw new Error('Wybierz transkrypcję JSON zapisaną przez ClipsON dla tego samego wideo.'); };
  if (!data || data.version !== 1 || data.timebase !== 'source-media-seconds' || !Array.isArray(data.segments)
      || !Number.isFinite(data.duration) || data.duration < 0 || typeof data.language !== 'string') fail();
  if (Number.isFinite(videoDuration) && data.duration > videoDuration + 1) {
    throw new Error('Ta transkrypcja jest dłuższa od wybranego wideo. Wczytaj wynik dla tego samego nagrania.');
  }
  for (const segment of data.segments) {
    if (!segment || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0
        || segment.end <= segment.start || typeof segment.text !== 'string' || !Array.isArray(segment.words)) fail();
    for (const word of segment.words) {
      if (!word || typeof word.text !== 'string' || (!isTimedWord(word) && !(word.start === null && word.end === null))) fail();
      if (isTimedWord(word) && (word.start < segment.start || word.end > segment.end)) fail();
    }
  }
  return data;
}
