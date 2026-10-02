import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAAC} from '../scripts/audio-integrity.mjs';

test('local Mandarin audio has a finalized positive-duration AAC track',()=>{
  const manifest=JSON.parse(readFileSync('public/audio/manifest.json','utf8'));
  const bytes=readFileSync('public'+manifest.files['日']);
  assert.ok(inspectAAC(bytes)>0);
  assert.throws(()=>inspectAAC(bytes.subarray(0,Math.floor(bytes.length/2))));
});

test('a successful encoder exit cannot make an empty AAC container valid',()=>{
  // Regression: say/afconvert exited zero but produced only an empty mdat.
  const empty=Buffer.alloc(24);
  empty.writeUInt32BE(16,0);empty.write('ftyp',4,'ascii');
  empty.writeUInt32BE(8,16);empty.write('mdat',20,'ascii');
  assert.throws(()=>inspectAAC(empty),/missing audio payload/);
});
