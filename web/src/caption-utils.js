import { isTimedWord } from './transcript-utils.js';

export const CAPTION_PRESETS = {
  'box-yellow': { name: 'Żółty akcent', accent: '#ffe447', box: true },
  'box-red': { name: 'Czerwony akcent', accent: '#ff4b5c', box: true },
  outline: { name: 'Klasyczny obrys', accent: '#ffe447', box: false },
};

export function buildCaptionCues(transcript, maxWords = 4) {
  const cues = [];
  let buffer = [];
  function flush() {
    const timed = buffer.filter(isTimedWord);
    if (timed.length) {
      const words = buffer.map(({ text, start, end }) => ({ text, start, end }));
      const chars = words.map(word => word.text.length);
      let breakAfter = -1;
      if (chars.reduce((sum, length) => sum + length + 1, 0) > 23 && words.length > 1) {
        const half = chars.reduce((sum, length) => sum + length + 1, 0) / 2;
        let length = 0, closest = Infinity;
        for (let i = 0; i < words.length - 1; i++) {
          length += chars[i] + 1;
          if (Math.abs(half - length) < closest) { closest = Math.abs(half - length); breakAfter = i; }
        }
      }
      cues.push({ start: Math.min(...timed.map(word => word.start)), end: Math.max(...timed.map(word => word.end)), words, breakAfter });
    }
    buffer = [];
  }
  for (const segment of transcript?.segments || []) {
    for (const source of segment.words || []) {
      const word = { text: String(source.text || '').trim(), start: source.start, end: source.end };
      if (!word.text) continue;
      const timed = buffer.filter(isTimedWord), previous = timed.at(-1);
      if (previous && isTimedWord(word) && (word.start - previous.end > 0.55 || word.start - timed[0].start > 3
          || buffer.length >= maxWords || buffer.map(value => value.text).join(' ').length + word.text.length > 36)) flush();
      buffer.push(word);
      if (isTimedWord(word) && /[.!?…]$/.test(word.text)) flush();
    }
  }
  flush();
  return cues.sort((a, b) => a.start - b.start);
}

export function captionAt(cues, time) {
  let low = 0, high = cues.length - 1, index = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cues[mid].start <= time) { index = mid; low = mid + 1; } else high = mid - 1;
  }
  if (index < 0 || time >= cues[index].end) return { cue: -1, word: -1 };
  let active = -1;
  cues[index].words.forEach((word, i) => { if (isTimedWord(word) && word.start <= time && time < word.end) active = i; });
  return { cue: index, word: active };
}

export function captionFontSize(cue, width, height, percent) {
  const lines = ['', ''];
  cue.words.forEach((word, i) => { lines[cue.breakAfter >= 0 && i > cue.breakAfter ? 1 : 0] += `${word.text} `; });
  return Math.max(10, Math.min(height * percent / 100, width * .88 / (Math.max(...lines.map(line => [...line.trim()].length), 1) * .66)));
}

export function videoContentRect(width, height, boxWidth, boxHeight) {
  if (![width, height, boxWidth, boxHeight].every(value => value > 0)) return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { x: (boxWidth - width * scale) / 2, y: (boxHeight - height * scale) / 2, width: width * scale, height: height * scale };
}
