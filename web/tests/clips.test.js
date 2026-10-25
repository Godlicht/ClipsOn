import test from 'node:test';
import assert from 'node:assert/strict';
import {validClipRange} from '../src/clip-utils.js';

test('edited cuts must fit the actual source and keep a nonempty finite range',()=>{
  assert.equal(validClipRange(3601.123,3661.123,7200),true);
  for(const [start,end,duration] of [[5,4,10],[0,181,200],[0,.1,10],[0,20,10],[NaN,5,10],[0,Infinity,10]]) {
    assert.equal(validClipRange(start,end,duration),false);
  }
});
