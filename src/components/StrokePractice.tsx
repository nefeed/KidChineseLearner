import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Volume2 } from 'lucide-react';
import type { StrokeData } from '../types';
import { canContinueTrace, checkTrace, type Point } from '../trace';

const cache = new Map<string, StrokeData>();
const linePath = (m: number[][]) => m.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
export default function StrokePractice({ char, savedIndex, onStroke, onComplete, onSpeak }: { char: string; savedIndex: number; onStroke: (index: number) => void; onComplete: () => void; onSpeak: (text: string) => void }) {
  const [data, setData] = useState<StrokeData | null>(cache.get(char) ?? null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(savedIndex);
  const [demo, setDemo] = useState(false);
  const [demoIndex, setDemoIndex] = useState(-1);
  const [hint, setHint] = useState('跟着小星星，画好这一笔。');
  const [drawing, setDrawing] = useState<Point[]>([]);
  const path = useRef<Point[]>([]);
  const activePointer = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const completeCallback = useRef(onComplete);
  completeCallback.current = onComplete;
  useEffect(() => {
    const controller = new AbortController();
    if (cache.has(char)) { setData(cache.get(char)!); return; }
    fetch(`/data/strokes/${encodeURIComponent(char)}.json`, { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error('missing'); return r.json();
    }).then((d: StrokeData) => {
      if (!d.strokes?.length || d.strokes.length !== d.medians?.length) throw new Error('invalid');
      cache.set(char, d); setData(d);
    }).catch(e => { if (e.name !== 'AbortError') setError('这个字的笔顺暂时没有加载成功，请重试。'); });
    return () => controller.abort();
  }, [char]);
  useEffect(() => { if (data && index >= data.strokes.length) completeCallback.current(); }, [data, index]);
  useEffect(() => {
    if (!demo || !data) return;
    setDemoIndex(0);
    const timer = window.setInterval(() => setDemoIndex(i => { if (i >= data.strokes.length - 1) { setDemo(false); return -1; } return i + 1; }), 950);
    return () => clearInterval(timer);
  }, [demo, data]);
  const clearGesture = () => {
    const pointer = activePointer.current;
    activePointer.current = null; path.current = []; setDrawing([]);
    if (pointer !== null && svg.current?.hasPointerCapture(pointer)) svg.current.releasePointerCapture(pointer);
  };
  useEffect(() => {
    const resized = () => clearGesture();
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  const point = (e: React.PointerEvent): Point | null => {
    const canvas = svg.current, matrix = canvas?.getScreenCTM();
    if (!canvas || !matrix) return null;
    const client = canvas.createSVGPoint(); client.x = e.clientX; client.y = e.clientY;
    const local = client.matrixTransform(matrix.inverse());
    if (local.x < 0 || local.x > 1024 || local.y < 0 || local.y > 1024) return null;
    return [local.x, 900 - local.y];
  };
  const start = (e: React.PointerEvent<SVGSVGElement>) => {
    if (demo || !data || index >= data.strokes.length || activePointer.current !== null || !e.isPrimary || e.button !== 0) return;
    const p = point(e); if (!p) return;
    e.preventDefault(); activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const last=path.current.at(-1);
    path.current = last&&Math.hypot(last[0]-p[0],last[1]-p[1])<130?[...path.current,p]:[p]; setDrawing(path.current);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== e.pointerId) return;
    const p = point(e); if (!p) { clearGesture(); return; }
    if (Math.hypot(p[0] - path.current.at(-1)![0], p[1] - path.current.at(-1)![1]) > 8) { path.current.push(p); setDrawing([...path.current]); }
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== e.pointerId || !data) return;
    const p = point(e); if (!p) { clearGesture(); return; }
    activePointer.current = null; path.current.push(p);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const result = checkTrace(path.current, data.medians[index] as Point[]);
    if(result.correct){path.current=[];setDrawing([]);setHint(result.message);const next=index+1;setIndex(next);onStroke(next);if(next===data.strokes.length){setHint('每一笔都走完啦！');onComplete();}}
    else if(canContinueTrace(path.current,data.medians[index] as Point[])){setDrawing([...path.current]);setHint('画得很认真，可以从刚才停下的地方继续。');}
    else{path.current=[];setDrawing([]);setHint(result.message);onSpeak(result.message);}
  };
  if (error) return <div className="empty-note">{error}<button onClick={() => window.location.reload()}>重新载入</button></div>;
  if (!data) return <div className="loading">正在准备这个字的笔顺…</div>;
  const current = data.medians[Math.min(index, data.strokes.length - 1)];
  const done = index >= data.strokes.length;
  return <div className="stroke-practice">
    <div className="stroke-toolbar"><span>{done ? '描写完成' : `第 ${index + 1} / ${data.strokes.length} 笔`}</span><button className="text-button" onClick={() => { clearGesture();setDemo(!demo); onSpeak('看看这个字是怎样一笔一笔写成的。'); }}><Play size={18}/>{demo ? '停止示范' : '看笔顺'}</button><button className="icon-button" aria-label="重新描写" onClick={() => { clearGesture();setIndex(0); onStroke(0); setHint('从第一笔，再走一遍。'); }}><RotateCcw size={18}/></button></div>
    <svg ref={svg} className="trace-grid" viewBox="0 0 1024 1024" aria-label={`${char}字描写区，按笔顺从圆点沿箭头描写`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => { if (activePointer.current === event.pointerId) clearGesture(); }} onLostPointerCapture={event => { if (activePointer.current === event.pointerId) clearGesture(); }}>
      <defs>{data.strokes.map((s, i) => <clipPath key={i} id={`stroke-${char}-${i}`}><path d={s}/></clipPath>)}<marker id={`arrow-${char}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#d78965"/></marker></defs>
      <rect width="1024" height="1024" fill="#fffdf5" rx="48"/>
      <path d="M512 0V1024M0 512H1024M0 0L1024 1024M1024 0L0 1024" stroke="#dce6d6" strokeWidth="3" strokeDasharray="16 13"/>
      <g transform="translate(0 900) scale(1 -1)">
        {data.strokes.map((s, i) => <path key={i} d={s} fill={demo ? (i < demoIndex ? '#619780' : '#e3e7d9') : (i < index ? '#619780' : i === index ? '#f3d5ae' : '#e3e7d9')}/>)}
        {demo && demoIndex >= 0 && <path key={`demo-${demoIndex}`} d={linePath(data.medians[demoIndex])} clipPath={`url(#stroke-${char}-${demoIndex})`} fill="none" stroke="#619780" strokeWidth="180" strokeLinecap="round" className="stroke-demo" pathLength="1"/>}
        {!demo && !done && <><path d={linePath(current)} fill="none" stroke="#d78965" strokeWidth="9" strokeDasharray="18 12" markerEnd={`url(#arrow-${char})`}/><circle cx={current[0][0]} cy={current[0][1]} r="29" fill="#ebaa77" className="trace-start"/></>}
        {drawing.length > 0 && <path d={linePath(drawing)} fill="none" stroke="#62a88f" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/>}
      </g>
    </svg>
    <p className="gentle-hint" role="status"><Volume2 size={18}/>{hint}</p>
  </div>;
}
