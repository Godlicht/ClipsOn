import { isTimedWord } from './transcript-utils.js';

export const CAPTION_PRESETS = {
  'box-yellow': { name: 'Żółty akcent', accent: '#ffe447', box: true },
  'box-red': { name: 'Czerwony akcent', accent: '#ff4b5c', box: true },
  outline: { name: 'Klasyczny obrys', accent: '#ffe447', box: false },
  'box-violet': { name: 'Fioletowy puls', accent: '#c49aff', box: true },
  'box-cyan': { name: 'Błękitny akcent', accent: '#48dfff', box: true },
  'box-green': { name: 'Limonka', accent: '#b7ff5b', box: true },
  pink: { name: 'Różowy obrys', accent: '#ff63c7', box: false },
  neon: { name: 'Neon', accent: '#48dfff', box: false },
  red: { name: 'Czerwony obrys', accent: '#ff4b5c', box: false },
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

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Explicit line breaks are shared with the ASS renderer; resizing never changes timing.
export function captionLayout(cue, width, height, percent, fieldWidth = .88) {
  const available = width * fieldWidth;
  const longest = Math.max(...cue.words.map(word => [...word.text].length), 1);
  let size = Math.min(height * percent / 100, available / ((longest + .6) * .66));
  let breaks = [], length = 0;
  cue.words.forEach((word, index) => {
    const count = [...word.text].length;
    if (index && length && (length + 1 + count + .6) * size * .66 > available) {
      breaks.push(index - 1); length = count;
    } else length += (length ? 1 : 0) + count;
  });
  size = Math.min(size, height * .9 / ((breaks.length + 1) * 1.3 + .24));
  return { breaks, size, height: size * ((breaks.length + 1) * 1.3 + .24) };
}

export function captionTransform(settings, cues, width, height) {
  const fieldWidth = clamp(settings.width, .2, .96);
  const size = clamp(settings.size, 2, 20);
  const maxHeight = Math.max(.04, ...cues.map(cue => captionLayout(cue, width, height, size, fieldWidth).height / height));
  return { width: fieldWidth, size, x: clamp(settings.x, fieldWidth / 2 + .02, .98 - fieldWidth / 2),
    y: clamp(settings.y, maxHeight / 2 + .02, .98 - maxHeight / 2) };
}
