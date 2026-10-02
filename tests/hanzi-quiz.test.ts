import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHanziQuestions, selectHanziDistractors } from '../src/hanzi-quiz';
import type { Hanzi } from '../src/types';

const words = JSON.parse(readFileSync(new URL('../src/data/hanzi.json', import.meta.url), 'utf8')) as Hanzi[];

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('all 1000 character lessons offer three distinct choices and one valid word answer', () => {
  assert.equal(words.length, 1000);
  for (const word of words) {
    for (const random of [() => 0, () => 0.999999, seededRandom(1), seededRandom(37)]) {
      const distractors = selectHanziDistractors(word, words, random);
      assert.equal(distractors.length, 2, `${word.char}: two distractors`);
      for (const sound of [true, false]) {
        const { practice, finalQuiz } = createHanziQuestions(word, distractors, sound);
        for (const question of [...practice, ...finalQuiz]) {
          assert.equal(question.options.length, 3, `${word.char}: ${question.prompt}`);
          assert.equal(new Set(question.options).size, 3, `${word.char}: unique ${question.prompt}`);
        }
        const spokenWord = word.words[0] || word.char;
        assert.deepEqual(finalQuiz[0].options.filter(char => spokenWord.includes(char)), [word.char], `${word.char}: only one character occurs in ${spokenWord}`);
        assert.deepEqual(finalQuiz[1].options.filter(term => term.includes(word.char)), [spokenWord], `${word.char}: only one term contains the target`);
        assert.equal(finalQuiz[0].audio, sound ? spokenWord : undefined);
        assert.equal(practice[0].audio, sound ? word.char : undefined);
      }
    }
  }
});

test('shared terms and other characters from the spoken word cannot become wrong answers', () => {
  const water = words.find(word => word.char === '水')!;
  const ambiguous = ['果', '杯', '喝'].map(char => words.find(word => word.char === char)!);
  const safe = ['日', '月'].map(char => words.find(word => word.char === char)!);
  const distractors = selectHanziDistractors(water, [water, ...ambiguous, ...safe], () => 0);
  assert.deepEqual(new Set(distractors.map(word => word.char)), new Set(['日', '月']));
  const { finalQuiz } = createHanziQuestions(water, distractors, true);
  assert.deepEqual(finalQuiz[1].options, ['喝水', ...distractors.map(word => word.words[0])]);
});

test('the selector searches beyond familiar characters when those candidates repeat a term', () => {
  const target = words.find(word => word.char === '水')!;
  const repeated = words.find(word => word.char === '日')!;
  const later = words.find(word => word.char === '月')!;
  const pool = [target, ...Array.from({ length: 200 }, (_, index) => ({ ...repeated, id: `repeat-${index}` })), later];
  const selected = selectHanziDistractors(target, pool, () => 0);
  assert.equal(selected.length, 2);
  assert.deepEqual(new Set(selected.map(word => word.char)), new Set(['日', '月']));
});
