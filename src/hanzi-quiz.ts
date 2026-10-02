import type { Question } from './components/Quiz';
import type { Hanzi } from './types';

const firstWord = (word: Hanzi) => word.words[0] || word.char;

export function selectHanziDistractors(word: Hanzi, words: readonly Hanzi[], random = Math.random): Hanzi[] {
  const spokenWord = firstWord(word);
  const candidates = words.filter(candidate => candidate.id !== word.id
    && candidate.char !== word.char && candidate.meaning !== word.meaning
    && !firstWord(candidate).includes(word.char) && !spokenWord.includes(candidate.char));
  const selected: Hanzi[] = [];
  function pick(pool: Hanzi[]) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const candidate of pool) {
      if (selected.some(other => other.char === candidate.char || other.meaning === candidate.meaning
        || firstWord(other) === firstWord(candidate))) continue;
      selected.push(candidate);
      if (selected.length === 2) break;
    }
  }
  // Prefer familiar characters, with the rest of the library available if needed.
  pick(candidates.slice(0, 200));
  if (selected.length < 2) pick(candidates.slice(200));
  return selected;
}

export function createHanziQuestions(word: Hanzi, distractors: readonly Hanzi[], sound: boolean): { practice: Question[]; finalQuiz: Question[] } {
  return {
    practice: [
      { prompt: sound ? '听一听，找出这个字' : '找出刚才认识的字', audio: sound ? word.char : undefined, options: [word.char, ...distractors.map(w => w.char)], answer: 0, explanation: `${word.char}，读作${word.char}。` },
      { prompt: `“${word.char}”是什么意思？`, options: [word.meaning, ...distractors.map(w => w.meaning)], answer: 0, explanation: word.sentence },
    ],
    finalQuiz: [
      { prompt: sound ? '听一听，词语里有哪个字？' : '哪个字在刚才的词语里？', audio: sound ? firstWord(word) : undefined, options: [word.char, ...distractors.map(w => w.char)], answer: 0, explanation: firstWord(word) },
      { prompt: `哪个词里有“${word.char}”？`, options: [firstWord(word), ...distractors.map(firstWord)], answer: 0, explanation: word.sentence },
    ],
  };
}
