import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWordIndex, isTimedWord, timeLabel } from '../src/transcript-utils.js';

test('source-clock highlighting excludes silence and uses exclusive end times', () => {
  const words = [{ start: 1.25, end: 1.739 }, { start: 3.012, end: 3.9 }, { start: 3601.002, end: 3601.22 }];
  assert.equal(activeWordIndex(words, 0), -1);
  assert.equal(activeWordIndex(words, 1.25), 0);
  assert.equal(activeWordIndex(words, 1.738), 0);
  assert.equal(activeWordIndex(words, 1.739), -1);
  assert.equal(activeWordIndex(words, 2.5), -1);
  assert.equal(activeWordIndex(words, 3.013), 1);
  assert.equal(activeWordIndex(words, 3601.1), 2);
  assert.equal(activeWordIndex(words, 3700), -1);
});

test('word timing is never manufactured for missing or invalid alignment', () => {
  assert.equal(isTimedWord({ start: null, end: null }), false);
  assert.equal(isTimedWord({ start: 1, end: 1 }), false);
  assert.equal(isTimedWord({ start: -1, end: 2 }), false);
  assert.equal(isTimedWord({ start: NaN, end: 3 }), false);
  assert.equal(isTimedWord({ start: 1.001, end: 1.05 }), true);
});

test('time labels retain hour and millisecond accuracy across long videos', () => {
  assert.equal(timeLabel(3661.027, true), '01:01:01.027');
  assert.equal(timeLabel(59.9996, true), '01:00.000');
  assert.equal(timeLabel(0), '00:00');
});
