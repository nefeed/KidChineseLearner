import { useEffect, useRef, useState } from 'react';
import { Check, Volume2 } from 'lucide-react';
export interface Question { prompt: string; options: string[]; answer: number; explanation: string; audio?: string }
export function shuffledQuestion(question: Question): Question {
  const indexed = question.options.map((v, i) => ({ v, i }));
  for (let i = indexed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [indexed[i], indexed[j]] = [indexed[j], indexed[i]]; }
  return { ...question, options: indexed.map(x => x.v), answer: indexed.findIndex(x => x.i === question.answer) };
}
export default function Quiz({ questions, onComplete, onMistake, onSpeak, savedRound = 0, onCheckpoint }: { questions: Question[]; onComplete: () => void; onMistake: () => void; onSpeak: (text: string) => void; savedRound?: number; onCheckpoint?: (round:number)=>void }) {
  const [round, setRound] = useState(() => Math.min(Math.max(0, savedRound), questions.length - 1));
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [q, setQ] = useState(() => shuffledQuestion(questions[Math.min(Math.max(0, savedRound), questions.length - 1)]));
  const speakRef = useRef(onSpeak); speakRef.current = onSpeak;
  useEffect(() => { if(q.audio)speakRef.current(q.audio); }, [q]);
  function answer(i: number) {
    if (correct) return;
    setSelected(i);
    if (i === q.answer) { setCorrect(true); setFeedback(`找对啦！${q.explanation}`); onSpeak(`找对啦！${q.explanation}`); }
    else { setFeedback('再听一听，看看其他小卡片。'); onSpeak('没关系，再听一听。'); onMistake(); }
  }
  function next() {
    if (round === questions.length - 1) { onComplete(); return; }
    const r = round + 1; setRound(r); setQ(shuffledQuestion(questions[r])); setCorrect(false); setSelected(null); setFeedback(''); onCheckpoint?.(r);
  }
  return <div className="quiz"><div className="quiz-heading"><span className="mini-label">小挑战 {round + 1} / {questions.length}</span><h2>{q.prompt}</h2><button className="pill-button audio-prompt" onClick={() => onSpeak(q.audio??q.prompt)}><Volume2 size={22}/>{q.audio?'点我听一听':'听一听题目'}</button></div>
    <div className={`answer-grid ${q.options.every(s => [...s].length <= 2) ? 'character-answers' : ''}`}>{q.options.map((option, i) => <div className="answer-option" key={`${round}-${i}`}><button className={`answer-card ${selected === i ? correct ? 'correct' : 'try-again' : ''}`} onClick={() => answer(i)}>{option}{correct && selected === i && <Check className="answer-check" size={24}/>}</button>{[...option].length>2&&<button className="answer-audio" aria-label={`听选项：${option}`} onClick={()=>onSpeak(option)}><Volume2 size={19}/></button>}</div>)}</div>
    <p className={`quiz-feedback ${correct ? 'good' : ''}`} role="status">{feedback || '不用着急，想好了再点。'}</p>
    {correct && <button className="primary-button" onClick={next}>{round === questions.length - 1 ? '挑战完成' : '下一小题'}<Check size={20}/></button>}
  </div>;
}
