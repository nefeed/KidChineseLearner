import test from 'node:test';
import assert from 'node:assert/strict';
import { pointAlongStroke, strokeProgress, type Point } from '../src/trace';

test('the star travels equal distances through uneven median segments and turns', () => {
  const median: Point[] = [[100, 100], [120, 100], [120, 180]];
  assert.deepEqual(pointAlongStroke(median, 0), [100, 100]);
  assert.deepEqual(pointAlongStroke(median, .2), [120, 100]);
  assert.deepEqual(pointAlongStroke(median, .5), [120, 130]);
  assert.deepEqual(pointAlongStroke(median, 1), [120, 180]);
  assert.deepEqual(pointAlongStroke([...median].reverse(), .5), [120, 130]);
});

test('a nearby finger positions the guide on the correct part of a turning stroke', () => {
  const median: Point[] = [[100, 100], [120, 100], [120, 180]];
  assert.equal(strokeProgress(median, [110, 96]), .1);
  assert.equal(strokeProgress(median, [124, 150]), .7);
  assert.equal(strokeProgress(median, [120, 220]), 1);
  assert.equal(strokeProgress(median, [80, 100]), 0);
  assert.deepEqual(pointAlongStroke(median, strokeProgress(median, [124, 150])), [120, 150]);
});

test('empty, repeated and zero-length guide data produce finite positions', () => {
  assert.deepEqual(pointAlongStroke([], .5), [0, 0]);
  assert.equal(strokeProgress([], [0, 0]), 0);
  const dot: Point[] = [[400, 500], [400, 500]];
  assert.deepEqual(pointAlongStroke(dot, .5), [400, 500]);
  assert.equal(strokeProgress(dot, [400, 500]), 0);
  const repeated: Point[] = [[0, 0], [0, 0], [100, 0]];
  assert.deepEqual(pointAlongStroke(repeated, .5), [50, 0]);
  assert.deepEqual(pointAlongStroke(repeated, -1), [0, 0]);
  assert.deepEqual(pointAlongStroke(repeated, 2), [100, 0]);
  assert.deepEqual(pointAlongStroke(repeated, NaN), [0, 0]);
});
