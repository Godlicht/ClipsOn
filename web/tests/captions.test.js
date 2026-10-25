import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionCues, captionAt, videoContentRect, captionFontSize } from '../src/caption-utils.js';

const word = (text, start, end) => ({ text, start, end });
test('caption changes use absolute word times, including silence and long offsets', () => {
  const cues = buildCaptionCues({segments:[{words:[word('Dzień',3601.123,3601.4),word('dobry.',3601.8,3602.1),word('Dalej',3604,3604.5)]}]});
  assert.equal(cues.length,2);
  assert.deepEqual(captionAt(cues,3601.2),{cue:0,word:0});
  assert.deepEqual(captionAt(cues,3601.5),{cue:0,word:-1});
  assert.deepEqual(captionAt(cues,3601.9),{cue:0,word:1});
  assert.deepEqual(captionAt(cues,3603),{cue:-1,word:-1});
  assert.deepEqual(captionAt(cues,3604.2),{cue:1,word:0});
});
test('short cues keep unaligned text without inventing its timestamp', () => {
  const cues=buildCaptionCues({segments:[{words:[word('W',1,1.2),word('2014',null,null),word('roku',1.5,2)]}]});
  assert.equal(cues[0].words[1].text,'2014');
  assert.equal(cues[0].words[1].start,null);
  assert.deepEqual(captionAt(cues,1.3),{cue:0,word:-1});
});
test('cue size changes do not shift source time', () => {
  const data={segments:[{words:Array.from({length:9},(_,i)=>word(`Słowo${i}`,i,i+.8))}]};
  const cues=buildCaptionCues(data,2);
  assert.ok(cues.every(cue=>cue.words.length<=2));
  assert.equal(cues.at(-1).end,8.8);
});
test('overlay follows the contained video, excluding pillarbox bars', () => {
  assert.deepEqual(videoContentRect(1080,1920,480,240),{x:172.5,y:0,width:135,height:240});
  const cue={words:[word('Napisy',1,2)],breakAfter:-1};
  assert.equal(captionFontSize(cue,1920,1080,6.5),70.2);
});
