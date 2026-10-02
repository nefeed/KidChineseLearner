import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Hand, Sparkles, Volume2 } from 'lucide-react';
import type { Hanzi } from '../types';
import hanziData from '../data/hanzi.json';
import Animal from './Animal';
import '../word-play.css';
import { useTabletViewport } from '../tablet-viewport';

type GameProps = { word: Hanzi; done: () => void; say: (text: string) => void };
const NUMBERS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const COLORS: Record<string, string> = { 红: '#e99583', 黄: '#efcf79', 蓝: '#91bed8', 绿: '#92b887', 白: '#fffcf0', 黑: '#53605d' };
const GROUPS: Record<string, string> = {
  sunrise: '日', night: '月', mountain: '山', water: '水', fire: '火', cloud: '云', rain: '雨', wind: '风', snow: '雪',
  plant: '木林森土树草花', feed: '猫狗牛羊马兔', swim: '鱼', fly: '鸟', compare: '大小多少长短', direction: '上下左右',
  number: '一二三四五六七八九十', wash: '手牙', mouth: '口', ear: '耳', eyes: '目眼', walk: '足脚', nod: '头', body: '身',
  kindness: '心友', open: '门窗家', bowl: '米面果豆菜肉饭糖', peel: '瓜蛋', color: '红黄蓝绿白黑', leaves: '叶虫',
};
export const SEMANTIC_WORDS = Object.fromEntries(Object.entries(GROUPS).flatMap(([game, chars]) => [...chars].map((char) => [char, game]))) as Record<string, string>;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** Reusable original vector props. Meaningful actions use real scene objects. */
function Art({ kind, size = 110, color }: { kind: string; size?: number; color?: string }) {
  if (['cat', 'dog', 'rabbit', 'bird', 'fish'].includes(kind)) {
    if (kind === 'cat' || kind === 'dog' || kind === 'rabbit') return <Animal species={kind} size={size}/>;
  }
  const leaf = color ?? '#93b789';
  let drawing: ReactNode;
  switch (kind) {
    case 'sun': drawing = <><g stroke="#edcb7c" strokeWidth="5" strokeLinecap="round">{[0,45,90,135,180,225,270,315].map((angle) => <path key={angle} d="M60 8V19" transform={`rotate(${angle} 60 60)`}/>)}</g><circle cx="60" cy="60" r="31" fill="#f4d893"/><path d="M44 63q5-7 10 0M67 63q5-7 10 0" fill="none" stroke="#9d885b" strokeWidth="3"/><path d="M53 76q7 7 14 0" fill="none" stroke="#9d885b" strokeWidth="3"/></>; break;
    case 'moon': drawing = <><path d="M82 18C30 1 8 67 42 95C66 116 96 100 108 77C65 98 39 45 82 18Z" fill="#f3df9e"/><path d="M41 58q5-7 10 0M58 69q9 6 15-1" stroke="#a29368" strokeWidth="3" fill="none" strokeLinecap="round"/></>; break;
    case 'star': drawing = <path d="M60 10L73 42L109 44L81 65L89 102L60 82L30 102L39 65L11 44L47 42Z" fill={color ?? '#efd388'} stroke="#d9b66b" strokeWidth="2"/>; break;
    case 'mountain': drawing = <><path d="M6 104L39 24L61 74L82 10L116 104Z" fill="#a5be90"/><path d="M30 47L39 24L49 49L41 43Z M72 35L82 10L94 39L82 31Z" fill="#f9f3db"/><path d="M34 103L65 49L97 104Z" fill="#83a47b"/></>; break;
    case 'cloud': drawing = <path d="M24 83C-1 82 2 45 24 43C31 13 68 16 75 41C104 26 126 72 101 85Z" fill={color ?? '#fffaf0'} stroke="#dce8e0" strokeWidth="2"/>; break;
    case 'drop': drawing = <><path d="M60 10C49 35 25 56 25 77C25 117 95 117 95 77C95 55 71 35 60 10Z" fill={color ?? "#96cadc"}/><path d="M42 70q-8 21 7 25" fill="none" stroke="#dff7f6" strokeWidth="6" strokeLinecap="round"/></>; break;
    case 'can': drawing = <><path d="M27 47H78L84 103H23Z" fill="#96b8ad"/><path d="M77 59L103 37L112 48L82 81" fill="#bad0b7"/><path d="M27 57C-3 46 1 94 26 89" fill="none" stroke="#81a599" strokeWidth="9"/><path d="M43 44V24H64V46" fill="none" stroke="#96b8ad" strokeWidth="7"/></>; break;
    case 'umbrella': drawing = <><path d="M11 58Q60-8 109 58Q93 46 79 59Q61 44 44 59Q28 45 11 58Z" fill="#e7a88f"/><path d="M60 20V100Q59 115 45 105" stroke="#aa8663" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M60 20Q40 39 44 59M60 20Q80 40 79 59" fill="none" stroke="#f9d4b5" strokeWidth="2"/></>; break;
    case 'snow': drawing = <><g stroke="#c5e2e9" strokeWidth="6" strokeLinecap="round">{[0,60,120].map((angle) => <g key={angle} transform={`rotate(${angle} 60 60)`}><path d="M60 10V110M60 27L45 16M60 27L75 16M60 93L45 104M60 93L75 104"/></g>)}</g></>; break;
    case 'fire': drawing = <><path d="M63 7C63 36 98 43 101 76C105 123 13 119 20 74Q25 49 40 41Q33 75 48 64Q61 49 63 7Z" fill="#e99975"/><path d="M61 53Q67 70 76 80C87 111 38 117 40 85Q43 73 52 70Q49 91 61 53Z" fill="#f1d18d"/></>; break;
    case 'tree': drawing = <><path d="M51 63H70V114H51Z" fill="#bd9972"/><circle cx="37" cy="54" r="26" fill={leaf}/><circle cx="78" cy="49" r="29" fill={leaf}/><circle cx="59" cy="27" r="25" fill={leaf}/><path d="M60 100V47M60 78L42 64M60 70L81 56" stroke="#789b70" strokeWidth="4" fill="none" strokeLinecap="round"/></>; break;
    case 'grass': drawing = <path d="M14 108Q23 86 17 66Q40 79 43 106Q34 58 40 31Q65 61 60 109Q62 66 83 41Q86 82 77 111Q88 79 109 69Q99 99 101 109Z" fill={leaf}/>; break;
    case 'seed': drawing = <><path d="M57 105V58" fill="none" stroke="#93ab76" strokeWidth="7"/><path d="M57 67Q20 68 20 30Q60 29 57 67M60 54Q59 16 101 16Q100 54 60 54Z" fill={leaf}/><ellipse cx="59" cy="107" rx="37" ry="9" fill="#b59675"/></>; break;
    case 'flower': drawing = <><path d="M60 105V60" fill="none" stroke="#93af7c" strokeWidth="6"/><path d="M60 91Q30 66 29 87Q37 106 60 101" fill="#a0bd8b"/>{[0,60,120,180,240,300].map((angle) => <ellipse key={angle} cx="60" cy="29" rx="13" ry="20" fill={color ?? '#e8aab4'} transform={`rotate(${angle} 60 50)`}/>)}<circle cx="60" cy="50" r="15" fill="#f3d68d"/></>; break;
    case 'leaf': drawing = <><path d="M18 91Q10 28 103 16Q105 103 18 91Z" fill={leaf}/><path d="M14 104L86 34M34 83L33 50M55 64L87 66" stroke="#688e6c" strokeWidth="4" strokeLinecap="round" fill="none"/></>; break;
    case 'fish': drawing = <><path d="M88 53L114 32V84L89 68" fill="#81b8cd"/><ellipse cx="52" cy="59" rx="43" ry="26" fill="#99c9d7"/><circle cx="28" cy="53" r="5" fill="#536b68"/><path d="M48 34L65 15L72 37M51 83L66 99L73 80" fill="#77adc2"/><path d="M45 47L49 62L45 76M59 47L64 61L59 76" fill="none" stroke="#c9e6e7" strokeWidth="3"/></>; break;
    case 'bird': drawing = <><ellipse cx="64" cy="71" rx="36" ry="27" fill="#a3c4d1"/><circle cx="82" cy="47" r="25" fill="#a3c4d1"/><path d="M103 43L118 50L103 55" fill="#e7be77"/><path d="M51 67Q17 24 9 46Q13 81 51 80" fill="#87aebb"/><path d="M30 84L9 100L41 94" fill="#87aebb"/><circle cx="88" cy="41" r="4" fill="#506563"/><path d="M54 97V110M73 96V110" stroke="#c4a071" strokeWidth="4"/></>; break;
    case 'cow': case 'sheep': case 'horse': drawing = <><ellipse cx="60" cy="88" rx="34" ry="24" fill={kind === 'sheep' ? '#f5efdc' : kind === 'cow' ? '#fff9e9' : '#c4a181'}/><path d="M32 101V116M49 105V116M78 105V116M89 99V116" stroke="#9a8970" strokeWidth="8" strokeLinecap="round"/><ellipse cx="73" cy="50" rx="30" ry="30" fill={kind === 'horse' ? '#c4a181' : '#fbf5e7'}/><ellipse cx="74" cy="64" rx="23" ry="13" fill="#dbc2b1"/><path d="M50 33L40 20L43 41M88 27L100 17L98 41" fill="#c9b99d"/><circle cx="61" cy="47" r="4" fill="#645c50"/><circle cx="84" cy="47" r="4" fill="#645c50"/>{kind === 'cow' && <><path d="M48 32L47 11M90 31L95 11" stroke="#ad9675" strokeWidth="7" strokeLinecap="round"/><ellipse cx="41" cy="82" rx="10" ry="12" fill="#77817a"/></>}{kind === 'sheep' && <g fill="#f6f0df" stroke="#e1d7c1" strokeWidth="2"><circle cx="47" cy="70" r="12"/><circle cx="33" cy="84" r="12"/><circle cx="54" cy="96" r="12"/><circle cx="80" cy="96" r="12"/><circle cx="71" cy="29" r="13"/></g>}{kind === 'horse' && <path d="M54 21Q42 48 51 65L41 62L38 40L46 16Z" fill="#92795b"/>}</>; break;
    case 'apple': case 'fruit': drawing = <><path d="M58 36C10 13 12 103 48 109Q59 114 64 106Q90 119 105 76C113 25 83 21 58 36Z" fill={color ?? '#e89983'}/><path d="M58 40L62 16" stroke="#ad8d67" strokeWidth="6"/><path d="M62 23Q75 2 96 12Q89 35 62 23" fill="#94b382"/></>; break;
    case 'carrot': drawing = <><path d="M31 37L91 52L27 110Z" fill="#e7a166"/><path d="M51 43L37 66M66 47L54 77" stroke="#c6864e" strokeWidth="3"/><path d="M62 41L32 10M63 41L68 4M65 41L98 11" stroke="#91b181" strokeWidth="9" strokeLinecap="round"/></>; break;
    case 'meat': drawing = <><ellipse cx="59" cy="79" rx="47" ry="22" fill="#a3c5bd"/><path d="M34 79C12 29 72 16 87 53C105 74 61 105 34 79Z" fill="#c39b78"/><path d="M42 68L57 46M60 79L77 58" stroke="#ead5b6" strokeWidth="5" strokeLinecap="round"/></>; break;
    case 'rice': case 'bowl': case 'noodles': case 'beans': drawing = <><ellipse cx="60" cy="61" rx="48" ry="16" fill="#dbe6d6"/><path d="M12 60Q22 110 60 111Q100 111 108 60Z" fill="#9cbdae"/><path d="M31 75Q60 90 92 75" fill="none" stroke="#cce0d0" strokeWidth="4"/>{kind === 'rice' && <g fill="#fffaf0">{[22,36,50,65,80,94,31,48,65,82].map((x,i) => <ellipse key={i} cx={x} cy={i < 6 ? 57 : 44} rx="8" ry="4" transform={`rotate(${i*19} ${x} ${i<6?57:44})`}/>)}</g>}{kind === 'noodles' && <g stroke="#ead096" strokeWidth="5" strokeLinecap="round" fill="none">{[30,46,62,78].map((x) => <path key={x} d={`M${x} 56q-12-18 3-23t-1-19`}/>)}</g>}{kind === 'beans' && [29,46,65,85].map((x,i) => <ellipse key={x} cx={x} cy={48+i%2*9} rx="10" ry="7" fill="#bb8e80" transform={`rotate(20 ${x} ${48+i%2*9})`}/>)}</>; break;
    case 'candy': drawing = <><path d="M29 45L7 25L10 77L31 66M91 45L114 25L111 78L89 66" fill="#edb697"/><rect x="27" y="36" width="66" height="45" rx="13" fill="#e1a1b1"/><path d="M43 36V81M66 36V81" stroke="#f7d8db" strokeWidth="10"/></>; break;
    case 'egg': drawing = <><path d="M60 11C37 10 21 61 22 80C23 126 98 126 98 80C98 57 83 11 60 11Z" fill="#f3e7cb" stroke="#ddcda9" strokeWidth="2"/><circle cx="60" cy="78" r="24" fill="#edd086"/></>; break;
    case 'melon': drawing = <><path d="M8 53H113Q108 116 60 116Q12 115 8 53Z" fill="#8ead7b"/><path d="M17 53H105Q100 104 60 104Q23 104 17 53Z" fill="#e59887"/>{[31,51,72,90].map((x,i) => <ellipse key={x} cx={x} cy={72+i%2*14} rx="3" ry="5" fill="#836c5b"/>)}</>; break;
    case 'spoon': drawing = <><path d="M32 95L78 44" stroke="#c4b393" strokeWidth="12" strokeLinecap="round"/><ellipse cx="84" cy="31" rx="19" ry="25" transform="rotate(37 84 31)" fill="#dbc9a5"/><ellipse cx="84" cy="29" rx="12" ry="17" transform="rotate(37 84 29)" fill="#fff6de"/></>; break;
    case 'hand': drawing = <path d="M32 103L13 76C6 64 19 58 28 68L37 77V33C37 18 51 18 51 33V61V16C51 3 65 3 65 17V59V25C65 12 79 12 79 25V62V40C79 28 93 28 93 41V84Q93 111 72 115H49Q41 115 32 103Z" fill="#ecc5a6" stroke="#ceaa89" strokeWidth="2"/>; break;
    case 'tooth': drawing = <><path d="M24 23C3 52 30 65 31 92C30 126 46 119 54 80Q60 71 66 80C74 122 92 125 91 90C92 64 116 48 98 23Q89 9 60 20Q37 9 24 23Z" fill="#fffdf3" stroke="#d1ddd8" strokeWidth="3"/><path d="M47 35Q60 43 75 34" stroke="#e1e9dd" strokeWidth="4" fill="none"/></>; break;
    case 'ear': drawing = <><path d="M39 18C90-9 116 77 74 107C60 120 36 113 43 90C49 76 72 77 65 65C47 48 19 38 39 18Z" fill="#edc8a6" stroke="#cba281" strokeWidth="3"/><path d="M46 38Q68 17 85 47Q98 74 70 84M59 55Q75 50 72 64" fill="none" stroke="#c69778" strokeWidth="5" strokeLinecap="round"/></>; break;
    case 'bell': drawing = <><path d="M23 83Q34 66 33 42C33 6 89 6 87 43Q87 64 101 83Z" fill="#ecd088"/><ellipse cx="62" cy="83" rx="41" ry="7" fill="#d7b268"/><circle cx="62" cy="94" r="9" fill="#c5a266"/><path d="M62 11V4" stroke="#ad9264" strokeWidth="5" strokeLinecap="round"/></>; break;
    case 'drum': drawing = <><path d="M20 41H103V93Q62 110 20 93Z" fill="#dd9e8f"/><ellipse cx="61" cy="40" rx="42" ry="15" fill="#f4d4af"/><path d="M21 44L35 94L48 46L65 98L79 46L93 94L102 44" stroke="#f7e4bd" strokeWidth="4" fill="none"/><path d="M31 15L76 45M97 10L63 40" stroke="#b39a76" strokeWidth="6" strokeLinecap="round"/></>; break;
    case 'ball': drawing = <><circle cx="60" cy="60" r="44" fill={color ?? '#dfaa8d'}/><path d="M30 29Q46 64 91 76M48 103Q74 68 90 29" stroke="#fff0cf" strokeWidth="6" fill="none"/></>; break;
    case 'basket': drawing = <><path d="M17 51H104L94 110H27Z" fill="#d3b18a"/><path d="M36 51C29 4 96 4 87 51" fill="none" stroke="#bd9c75" strokeWidth="9"/><path d="M31 68H90M28 88H94M43 55V108M63 54V109M82 55V108" stroke="#e4c79f" strokeWidth="4"/></>; break;
    case 'heart': drawing = <path d="M60 33C27-13-12 47 19 75L60 110L101 75C139 42 92-12 60 33Z" fill="#dda2b1"/>; break;
    case 'foot': drawing = <><ellipse cx="57" cy="76" rx="20" ry="33" fill="#dfbba0" transform="rotate(-20 57 76)"/><circle cx="32" cy="25" r="11" fill="#dfbba0"/><circle cx="50" cy="20" r="9" fill="#dfbba0"/><circle cx="66" cy="25" r="8" fill="#dfbba0"/><circle cx="78" cy="37" r="7" fill="#dfbba0"/></>; break;
    case 'worm': drawing = <><g fill="#a0bd7c">{[22,41,60,79,98].map((x,i) => <circle key={x} cx={x} cy={78-i*6} r="17"/>)}</g><circle cx="100" cy="41" r="21" fill="#b5cb8d"/><circle cx="96" cy="37" r="3" fill="#647352"/><circle cx="110" cy="35" r="3" fill="#647352"/><path d="M90 23L85 12M107 21L112 10" stroke="#829e69" strokeWidth="3" strokeLinecap="round"/></>; break;
    case 'child': default: drawing = <><path d="M40 75L32 110M81 75L88 110" stroke="#96b5ad" strokeWidth="13" strokeLinecap="round"/><path d="M27 86L40 68H82L97 87" stroke="#dda991" strokeWidth="13" fill="none" strokeLinecap="round"/><rect x="36" y="58" width="51" height="39" rx="13" fill="#9ebdb0"/><g className="wp-child-head"><circle cx="61" cy="35" r="27" fill="#ecc7a5"/><path d="M34 31Q34-3 69 10Q85 12 88 32L73 19Q50 36 34 31Z" fill="#8d775e"/><circle cx="52" cy="34" r="3" fill="#695c4b"/><circle cx="71" cy="34" r="3" fill="#695c4b"/><path d="M55 46Q62 52 69 44" stroke="#ac8168" strokeWidth="2.5" strokeLinecap="round" fill="none"/></g></>; break;
  }
  return <svg className={`wp-art wp-art--${kind}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">{drawing}</svg>;
}

function Controls({ children }: { children: ReactNode }) { return <div className="wp-controls">{children}</div>; }
function Action({ children, onClick, label, disabled = false }: { children: ReactNode; onClick: () => void; label?: string; disabled?: boolean }) { return <button className="wp-action" aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>; }
function Stage({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`wp-stage ${className}`}><div className="wp-land"/>{children}</div>; }
function Instruction({ title, children }: { title: string; children: ReactNode }) { return <div className="play-instruction"><span className="mini-label"><Hand size={16}/>动动小手</span><h2>{title}</h2><p>{children}</p></div>; }

function Sunrise({ word, done, say }: GameProps) {
  const [height, setHeight] = useState(0);
  const night = word.char === '月';
  const [stars, setStars] = useState<number[]>([]);
  return <><Instruction title={night ? '点亮夜空，陪月亮出来' : '让太阳慢慢升到山上'}>{night ? '点亮三颗星星，看看月亮弯弯的样子。' : '把下面的太阳滑块向右拖，太阳会升起来。'}</Instruction><Stage className={night ? 'wp-night' : 'wp-dawn'}><div className="wp-sun-rise" style={{ bottom: `${night ? 12 + stars.length * 13 : 12 + height * .4}%`, opacity: night ? stars.length / 3 : 1 }}><Art kind={night ? 'moon' : 'sun'} size={130}/></div><div className="wp-mountain-range"><Art kind="mountain" size={200}/><Art kind="mountain" size={175}/><Art kind="mountain" size={180}/></div>{night && [0,1,2].map((index) => <button key={index} className={`wp-star-button ${stars.includes(index) ? 'is-lit' : ''}`} style={{ left: `${20 + index * 27}%`, top: `${18 + index % 2 * 10}%` }} aria-label={`点亮第${index+1}颗星星`} onClick={() => { if(stars.includes(index)) return; const next = [...stars,index]; setStars(next); say('星星亮了，月亮在夜空里。'); if(next.length === 3) done(); }}><Art kind="star" size={64}/></button>)}</Stage>{!night && <Controls><label className="wp-slider-label">太阳升起来<input type="range" min="0" max="100" value={height} aria-label="太阳升起高度" onChange={(event) => { const value = Number(event.target.value); setHeight(value); if(value >= 95) { say('太阳升起来了，太阳也叫日。'); done(); } }}/></label><Action onClick={() => { const next = Math.min(100,height+34); setHeight(next); say('太阳升高一点点。'); if(next === 100) done(); }}>升高一点点<ArrowUp size={18}/></Action></Controls>}</>;
}

function Water({ done, say }: GameProps) {
  const [water, setWater] = useState(0);
  return <><Instruction title="给口渴的小花浇水">轻轻倒三次水，看看小花怎样长高。</Instruction><Stage className="wp-garden"><div className="wp-growing-flower" style={{ transform: `translateX(-50%) scale(${.55 + water*.18})` }}><Art kind="flower" size={175}/></div><div className={`wp-watering-can ${water ? 'is-pouring' : ''}`} key={water}><Art kind="can" size={118}/>{water>0 && <span className="wp-water-stream"/>}</div><div className="wp-water-level" aria-label={`浇水进度${water}/3`}>{[0,1,2].map((i) => <Art key={i} kind="drop" size={42} color={i<water?'#8fbfce':'#d7e3d6'}/>)}</div></Stage><Controls><Action disabled={water>=3} onClick={() => { const next=water+1; setWater(next); say(next===3?'水让小花长高了。水可以流动。':'小花喝了一点水。'); if(next===3)done(); }}><Art kind="can" size={40}/>浇一点水</Action></Controls></>;
}

function DragScene({ word, done, say }: GameProps) {
  const umbrella = word.char === '雨';
  const kindness = word.char === '心' || word.char === '友';
  const kind = umbrella ? 'umbrella' : kindness ? 'heart' : 'spoon';
  const target = umbrella ? { x: 72, y: 43 } : kindness ? { x: 72, y: 65 } : { x: 72, y: 60 };
  const start = { x: 22, y: 62 };
  const [point,setPoint]=useState(start),[picked,setPicked]=useState(false),[delivered,setDelivered]=useState(0),[notice,setNotice]=useState('');
  const ref=useRef<HTMLDivElement>(null),drag=useRef<number|null>(null),livePoint=useRef(start),suppressClick=useRef(false);
  const required=umbrella?1:kindness?2:3;
  const deliver=()=>{const next=delivered+1;setDelivered(next);livePoint.current=umbrella?target:start;setPoint(umbrella?target:start);setPicked(false);setNotice(umbrella?'雨伞挡住雨点，小朋友不会淋湿啦。':kindness?'把关心送给朋友，心里暖暖的。':'嘴巴吃到一口饭，慢慢嚼一嚼。');say(umbrella?'雨点落下来，我们用雨伞挡住雨。':kindness?'谢谢你的关心。':'用口吃饭，慢慢嚼。');if(next>=required)done();};
  const position=(event:PointerEvent)=>{const r=ref.current!.getBoundingClientRect();if(!r.width||!r.height||event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return null;return{x:(event.clientX-r.left)/r.width*100,y:(event.clientY-r.top)/r.height*100};};
  const cancelDrag=(event:PointerEvent<HTMLButtonElement>)=>{if(drag.current!==event.pointerId)return;drag.current=null;livePoint.current=start;setPoint(start);setPicked(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  return <><Instruction title={umbrella?'把雨伞移到小朋友头顶':kindness?'把爱心送给小伙伴':'把小勺里的饭送到嘴巴'}>拖动{umbrella?'雨伞':kindness?'爱心':'小勺'}，也可以先点它，再点虚线圈。{!umbrella&&`完成 ${required} 次。`}</Instruction><div ref={ref} className={`wp-stage ${umbrella?'wp-rain':'wp-home-scene'}`} onPointerMove={(event)=>{if(drag.current===event.pointerId){const next=position(event);if(next){livePoint.current=next;setPoint(next);}}}}><div className="wp-land"/>{umbrella&&<div className={`wp-raindrops ${delivered?'is-sheltered':''}`}>{Array.from({length:14},(_,i)=><i key={i} style={{left:`${5+i*7}%`,animationDelay:`${i*.13}s`}}/>)}</div>}<div className={`wp-scene-child ${!umbrella&&delivered?'is-chewing':''}`} style={{left:'72%',top:'64%'}}><Art kind="child" size={155}/></div>{!umbrella&&!kindness&&<div className="wp-rice-bowl"><Art kind="rice" size={95}/></div>}<button className={`wp-drop-target ${picked?'is-ready':''}`} style={{left:`${target.x}%`,top:`${target.y}%`}} aria-label={umbrella?'把伞撑在小朋友头顶':kindness?'把关心送给朋友':'把饭送到嘴巴'} onClick={()=>{if(picked&&delivered<required)deliver();else{setNotice('先拿起左边的物品，再送过来。');say('先拿起左边的物品。');}}}>{umbrella?'伞放这里':kindness?'送给朋友':'嘴巴在这里'}</button><button className={`wp-drag-prop ${picked?'is-picked':''}`} style={{left:`${point.x}%`,top:`${point.y}%`}} aria-label={`拿起${umbrella?'雨伞':kindness?'爱心':'饭勺'}`} disabled={delivered>=required} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setPicked(true);setNotice('拿好了，送到虚线圈里。');}} onPointerDown={(event)=>{if(delivered>=required||drag.current!==null||!event.isPrimary||event.button!==0)return;event.preventDefault();drag.current=event.pointerId;suppressClick.current=false;setPicked(true);event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={(event)=>{if(drag.current!==event.pointerId)return;const next=position(event);drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(next&&Math.hypot(next.x-target.x,next.y-target.y)<16){suppressClick.current=true;deliver();}else {livePoint.current=start;setPoint(start);}}} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}><Art kind={kind} size={umbrella?112:85}/></button><span className="wp-step-counter">{delivered} / {required}</span></div><p className="wp-game-note" role="status">{notice||'先观察画面，再动动小手。'}</p></>;
}

function Snow({ done, say }: GameProps) {
  const [heat,setHeat]=useState(0);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null),finished=useRef(false),activePointer=useRef<number|null>(null);
  const stop=(event?:PointerEvent<HTMLButtonElement>)=>{if(event&&activePointer.current!==event.pointerId)return;activePointer.current=null;if(timer.current)clearInterval(timer.current);timer.current=null;if(event?.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  useEffect(()=>()=>stop(),[]);
  useEffect(()=>{if(heat>=100&&!finished.current){finished.current=true;stop();say('雪遇到温暖，慢慢变成水。');done();}},[heat,done,say]);
  return <><Instruction title="把温暖送给小雪花">按住太阳按钮，雪花会慢慢融化成水。</Instruction><Stage className="wp-snow-scene"><div className="wp-warm-sun"><Art kind="sun" size={100}/></div><div className="wp-melting-snow" style={{transform:`translate(-50%,-50%) scale(${Math.max(.03,1-heat/100)})`,opacity:heat>=100?0:1}}><Art kind="snow" size={165}/></div><div className="wp-snow-puddle" style={{transform:`translateX(-50%) scaleX(${.2+heat/100})`,opacity:heat/100}}/><span className="wp-step-counter">融化 {heat}%</span></Stage><Controls><button className="wp-action wp-hold-action" onPointerDown={(event)=>{if(activePointer.current!==null||!event.isPrimary||event.button!==0)return;event.preventDefault();activePointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);if(!timer.current)timer.current=setInterval(()=>setHeat((value)=>Math.min(100,value+4)),65);}} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={(event)=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();setHeat((value)=>Math.min(100,value+20));}}} disabled={heat>=100}><Art kind="sun" size={42}/>按住送温暖</button></Controls></>;
}

function Wind({ done, say }: GameProps) {
  const [gust,setGust]=useState(0);
  return <><Instruction title="送一阵风，让风车转起来">点三次吹风按钮，看空气怎样推着风车转。</Instruction><Stage className="wp-wind-scene"><div className="wp-windmill-post"/><div className="wp-windmill-blades" style={{transform:`translate(-50%,-50%) rotate(${gust*170}deg)`}}>{[0,90,180,270].map((angle,i)=><span key={angle} style={{transform:`rotate(${angle}deg)`,background:['#dca798','#e8cd98','#9bbfba','#adc491'][i]}}/>)}</div><div className="wp-wind-streaks" key={gust}>{gust>0&&<><i/><i/><i/></>}</div><div className="wp-grass-waving"><Art kind="grass" size={95}/></div><span className="wp-step-counter">{gust} / 3 阵风</span></Stage><Controls><Action disabled={gust>=3} onClick={()=>{const next=gust+1;setGust(next);say('呼，风是流动的空气。风车转起来啦。');if(next>=3)done();}}>呼——吹一阵风<ArrowRight size={21}/></Action></Controls></>;
}

function Plant({ word, done, say }: GameProps) {
  const total=word.char==='森'?3:word.char==='林'?2:word.char==='花'||word.char==='草'?3:1;
  const art=word.char==='草'?'grass':word.char==='花'?'flower':'tree';
  const [seeds,setSeeds]=useState<number[]>([]),[grown,setGrown]=useState<number[]>([]);
  return <><Instruction title={word.char==='土'?'给种子盖上松软的泥土':`种出${total===1?'一棵':total===2?'两棵':'三棵'}${art==='flower'?'小花':art==='grass'?'小草':'树'}`}>先点土坑放种子，再点浇水按钮。{word.char==='林'?'两棵木，组成林。':word.char==='森'?'三棵木，组成森。':'植物在土里扎根，喝水长大。'}</Instruction><Stage className="wp-plant-scene"><div className="wp-plant-plots">{Array.from({length:total},(_,i)=><button key={i} className={`wp-soil-plot ${seeds.includes(i)?'is-seeded':''} ${grown.includes(i)?'is-grown':''}`} aria-label={`第${i+1}个土坑种种子`} onClick={()=>{if(seeds.includes(i))return;setSeeds([...seeds,i]);say('种子躺进泥土里，再给它浇水。');}}>{grown.includes(i)?<Art kind={art} size={140}/>:seeds.includes(i)?<Art kind="seed" size={72}/>:<span className="wp-empty-soil">点这里种</span>}<span className="wp-soil-mound"/></button>)}</div></Stage><Controls><Action disabled={!seeds.length||grown.length===total} onClick={()=>{const next=[...seeds];setGrown(next);say(word.char==='土'?'泥土保护种子，种子发芽了。':`${next.length}棵${art==='flower'?'小花':art==='grass'?'小草':'树'}长出来啦。`);if(next.length===total)done();}}><Art kind="can" size={40}/>给种子浇水</Action></Controls></>;
}

const PETS: Record<string,{kind:string;food:string;name:string;hint:string}> = {
  猫:{kind:'cat',food:'fish',name:'小猫',hint:'小猫吃适合它的鱼肉。'},狗:{kind:'dog',food:'meat',name:'小狗',hint:'小狗吃适合它的肉食。'},牛:{kind:'cow',food:'grass',name:'小牛',hint:'小牛喜欢吃草。'},羊:{kind:'sheep',food:'grass',name:'小羊',hint:'小羊喜欢吃草。'},马:{kind:'horse',food:'grass',name:'小马',hint:'小马喜欢吃草。'},兔:{kind:'rabbit',food:'grass',name:'小兔',hint:'小兔主要吃草，也可以吃一点胡萝卜。'},
};
function Feed({ word, done, say }: GameProps) {
  const pet=PETS[word.char],foods=pet.food==='fish'?['fish','grass','apple']:pet.food==='meat'?['meat','grass','apple']:['grass','fish','candy'];
  const [food,setFood]=useState(''),[bites,setBites]=useState(0),[notice,setNotice]=useState('');
  return <><Instruction title={`给${pet.name}送适合的食物`}>{pet.hint}先选食物，再点动物送过去。</Instruction><Stage className="wp-pet-scene"><button className={`wp-pet ${bites?'is-fed':''}`} key={bites} aria-label={`把食物送给${pet.name}`} onClick={()=>{if(!food){setNotice('先选一份食物。');say('先选一份食物。');return;}if(food!==pet.food){setNotice(`这份不适合。${pet.hint}`);say(`这份不适合。${pet.hint}`);return;}const next=bites+1;setBites(next);setFood('');setNotice(`${pet.name}吃了一口，${next>=2?'小肚子饱了。':'再喂一口吧。'}`);say(`${pet.name}吃了一口。${word.char}。`);if(next>=2)done();}} disabled={bites>=2}><Art kind={pet.kind} size={180}/></button><span className="wp-step-counter">{bites} / 2 口</span><div className="wp-food-tray">{foods.map((item)=><button key={item} className={food===item?'is-selected':''} aria-label={`选${item==='grass'?'青草':item==='fish'?'小鱼':item==='meat'?'动物专用肉食':item==='candy'?'糖果':'苹果'}`} onClick={()=>{setFood(item);setNotice('选好了，点动物，把食物送过去。');}}><Art kind={item} size={67}/></button>)}</div></Stage><p className="wp-game-note" role="status">{notice||'每一种动物，有自己喜欢的食物。'}</p></>;
}

function Travel({ word, done, say }: GameProps) {
  const fly=word.char==='鸟',walk=word.char==='足'||word.char==='脚';
  const [step,setStep]=useState(0);
  const positions=walk?[20,45,72]:[35,58,80];
  return <><Instruction title={fly?'帮小鸟飞回树上的窝':walk?'沿着小脚印，一步一步走':'让小鱼在水里游过三个泡泡'}>{fly?'依次点亮三个飞行圈，小鸟拍翅膀飞起来。':walk?'依次点三双脚印，小脚带我们向前走。':'先点近处，再点远处。鱼住在水里。'}</Instruction><Stage className={fly?'wp-flight':walk?'wp-walk-scene':'wp-underwater'}><div className={`wp-traveller ${fly?'is-flying':''}`} style={{left:`${step===0?12:positions[step-1]}%`,top:`${fly?73-step*15:walk?50:51+step%2*8}%`}}><Art kind={fly?'bird':walk?'child':'fish'} size={fly?95:105}/></div>{fly&&<div className="wp-destination-tree"><Art kind="tree" size={170}/><span className="wp-nest"/></div>}{!fly&&!walk&&<><div className="wp-water-weeds"><Art kind="grass" size={115}/></div><div className="wp-water-waves"/></>}{positions.map((x,i)=><button key={i} className={`wp-travel-stop ${i<step?'is-passed':''}`} style={{left:`${x}%`,top:`${fly?65-i*15:walk?80:53+i%2*8}%`}} aria-label={`第${i+1}${walk?'双脚印':fly?'个飞行圈':'个水泡'}`} onClick={()=>{if(i!==step){say('先走到离我们最近的下一个。');return;}const next=step+1;setStep(next);say(fly?'小鸟拍翅膀，飞高一点。':walk?'小脚向前走一步。':'小鱼在水里游。');if(next===3)done();}}>{walk?<Art kind="foot" size={50}/>:i<step?<Check size={25}/>:i+1}</button>)}</Stage></>;
}

function Compare({ word, done, say }: GameProps) {
  const [chosen,setChosen]=useState<number|null>(null),[notice,setNotice]=useState('');
  const size=['大','小'].includes(word.char),quantity=['多','少'].includes(word.char),target=['大','多','长'].includes(word.char)?1:0;
  return <><Instruction title={`比一比，找到${size?word.char+'的皮球':quantity?'苹果'+word.char+'的篮子':word.char+'的绳子'}`}>先看看两个实物的不同，再点你找到的那个。</Instruction><Stage className="wp-compare-scene"><div className="wp-comparison-pair">{[0,1].map((index)=><button key={index} className={`wp-comparison-object ${chosen===index?'is-correct':''}`} aria-label={`${index===0?'左':'右'}边的${size?'皮球':quantity?'苹果篮':'绳子'}`} onClick={()=>{if(index!==target){setNotice(`再比一比：${size?'一个大，一个小。':quantity?'一篮只有一个，另一篮有四个。':'一根短，一根长。'}`);say('再比一比两个实物。');return;}setChosen(index);say(`你找到了${word.char}的${size?'皮球':quantity?'数量':'绳子'}。`);done();}}>{size?<Art kind="ball" size={index===0?79:155}/>:quantity?<><Art kind="basket" size={155}/><div className="wp-basket-fruit">{Array.from({length:index===0?1:4},(_,i)=><Art key={i} kind="apple" size={43}/>)}</div></>:<span className="wp-rope" style={{width:index===0?65:160}}/>}{chosen===index&&<Check className="wp-answer-tick" size={25}/>}</button>)}</div></Stage><p className="wp-game-note" role="status">{notice||'慢慢观察，不着急。'}</p></>;
}

function Direction({ word, done, say }: GameProps) {
  const [position,setPosition]=useState({x:1,y:1});
  const target:Record<string,{x:number;y:number}>={上:{x:1,y:0},下:{x:1,y:2},左:{x:0,y:1},右:{x:2,y:1}};
  const move=(dx:number,dy:number)=>{const next={x:Math.max(0,Math.min(2,position.x+dx)),y:Math.max(0,Math.min(2,position.y+dy))};setPosition(next);say(dx<0?'向左。':dx>0?'向右。':dy<0?'向上。':'向下。');if(next.x===target[word.char].x&&next.y===target[word.char].y)done();};
  return <><Instruction title={`让小朋友走到${word.char}面的花旁边`}>我们面向同一个方向。点方向箭头，小朋友会真的移动。</Instruction><Stage className="wp-direction-scene"><div className="wp-direction-grid">{Array.from({length:9},(_,i)=><span key={i} className="wp-grid-cell"/>)}<div className="wp-direction-person" style={{left:`${position.x*33.33+16.66}%`,top:`${position.y*33.33+16.66}%`}}><Art kind="child" size={74}/></div><div className="wp-direction-flower" style={{left:`${target[word.char].x*33.33+16.66}%`,top:`${target[word.char].y*33.33+16.66}%`}}><Art kind="flower" size={66}/></div></div></Stage><Controls><Action label="向左移动" onClick={()=>move(-1,0)}><ArrowLeft size={24}/>左</Action><Action label="向上移动" onClick={()=>move(0,-1)}><ArrowUp size={24}/>上</Action><Action label="向下移动" onClick={()=>move(0,1)}><ArrowDown size={24}/>下</Action><Action label="向右移动" onClick={()=>move(1,0)}><ArrowRight size={24}/>右</Action></Controls></>;
}

function Counting({ word, done, say }: GameProps) {
  const total=NUMBERS[word.char], [stars,setStars]=useState<number[]>([]);
  return <><Instruction title={`点亮 ${total} 颗小星星`}>点一个，数一个。点完后，这个数量会变成汉字「{word.char}」。</Instruction><Stage className="wp-number-scene"><div className="wp-number-stars">{Array.from({length:total},(_,index)=><button key={index} className={stars.includes(index)?'is-counted':''} aria-label={`第${index+1}颗星星`} onClick={()=>{if(stars.includes(index))return;const next=[...stars,index];setStars(next);say(String(next.length));if(next.length===total)done();}}><Art kind="star" size={58}/>{stars.includes(index)&&<span>{stars.indexOf(index)+1}</span>}</button>)}</div><span className="wp-step-counter">已数 {stars.length} / {total}</span></Stage></>;
}

function Wash({ word, done, say }: GameProps) {
  const tooth=word.char==='牙', [soaped,setSoaped]=useState(false),[washed,setWashed]=useState<number[]>([]),[cursor,setCursor]=useState<{x:number;y:number}|null>(null);
  const hold=useRef<number|null>(null),previous=useRef<{x:number;y:number}|null>(null),travel=useRef(0),clean=useRef(new Set<number>());
  const dirt=[{x:39,y:36},{x:59,y:39},{x:48,y:57},{x:61,y:67}];
  const point=(event:PointerEvent<HTMLDivElement>)=>{const rect=event.currentTarget.getBoundingClientRect();if(!rect.width||!rect.height||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return null;return{x:(event.clientX-rect.left)/rect.width*100,y:(event.clientY-rect.top)/rect.height*100};};
  const rub=(event:PointerEvent<HTMLDivElement>)=>{if(hold.current!==event.pointerId||!soaped)return;const p=point(event);if(!p){previous.current=null;travel.current=0;setCursor(null);return;}const before=previous.current??p;previous.current=p;setCursor(p);const dx=p.x-before.x,dy=p.y-before.y,length=dx*dx+dy*dy;travel.current+=Math.sqrt(length);if(travel.current<2)return;dirt.forEach((mark,i)=>{if(clean.current.has(i))return;const t=length?Math.max(0,Math.min(1,((mark.x-before.x)*dx+(mark.y-before.y)*dy)/length)):0;if(Math.hypot(mark.x-before.x-t*dx,mark.y-before.y-t*dy)<8)clean.current.add(i);});const next=[...clean.current];if(next.length===washed.length)return;setWashed(next);say(tooth?'刷掉一块小污点。':'洗掉一块小泥点。');if(next.length===dirt.length)done();};
  const stopRub=(event:PointerEvent<HTMLDivElement>)=>{if(hold.current!==event.pointerId)return;hold.current=null;previous.current=null;travel.current=0;setCursor(null);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  return <><Instruction title={tooth?'给牙齿刷一个泡泡澡':'把小手洗干净'}>先点{tooth?'牙膏':'肥皂'}，再按住画面拖动泡泡。单点不会洗掉污点。</Instruction><Stage className="wp-wash-scene"><div className="wp-wash-object"><Art kind={tooth?'tooth':'hand'} size={210}/></div><div className={`wp-rub-surface ${soaped?'is-soaped':''}`} aria-label={tooth?'拖动泡泡刷牙':'拖动泡泡洗手'} onPointerDown={(event)=>{if(hold.current!==null||!event.isPrimary||event.button!==0)return;if(!soaped){say(`先点${tooth?'牙膏':'肥皂'}。`);return;}const next=point(event);if(!next)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);hold.current=event.pointerId;travel.current=0;previous.current=next;setCursor(next);}} onPointerMove={rub} onPointerUp={stopRub} onPointerCancel={stopRub} onLostPointerCapture={stopRub}>{dirt.map((p,i)=>!washed.includes(i)&&<span key={i} className="wp-wash-dirt" style={{left:`${p.x}%`,top:`${p.y}%`}}/>)}{cursor&&<span className="wp-scrub-bubbles" style={{left:`${cursor.x}%`,top:`${cursor.y}%`}}>○<i>○</i><i>○</i></span>}</div><span className="wp-step-counter">洗净 {washed.length} / 4 块</span></Stage><Controls><Action onClick={()=>{setSoaped(true);say(tooth?'挤一点牙膏，轻轻刷。':'搓出肥皂泡泡，轻轻洗。');}}>{soaped?<Check size={21}/>:<Sparkles size={21}/>}加一点{tooth?'牙膏':'肥皂'}</Action></Controls></>;
}

function Hearing({ done, say }: GameProps) {
  const [round,setRound]=useState(0),[listened,setListened]=useState(false),[notice,setNotice]=useState('');
  const target=round===0?'bell':'drum';
  return <><Instruction title="用耳朵听，谁在响呢？">先听拟声朗读，再选画面。听完两种声音，认识「耳」。</Instruction><Stage className="wp-hearing-scene"><Art kind="ear" size={140}/><div className="wp-sound-choices">{['bell','drum'].map((kind)=><button key={kind} aria-label={kind==='bell'?'选择铃铛':'选择小鼓'} onClick={()=>{if(!listened){setNotice('先点听一听，用耳朵听。');say('先听一听。');return;}if(kind!==target){setNotice('再听一遍：铃铛叮铃铃，小鼓咚咚咚。');say('再听一遍。');return;}const next=round+1;setRound(next);setListened(false);setNotice('耳朵听到了声音。');say('耳朵帮助我们听声音。');if(next>=2)done();}} disabled={round>=2}><Art kind={kind} size={87}/></button>)}</div><span className="wp-step-counter">已听懂 {round} / 2 种</span></Stage><Controls><Action disabled={round>=2} onClick={()=>{setListened(true);say(target==='bell'?'叮铃铃，叮铃铃，铃铛响了。':'咚咚咚，咚咚咚，小鼓响了。');setNotice('这是拟声朗读。用耳朵听，再选一选。');}}><Volume2 size={21}/>听一听</Action></Controls><p className="wp-game-note" role="status">{notice||'点听一听，再选出响起来的物品。'}</p></>;
}

function Eyes({ done, say }: GameProps) {
  const [found,setFound]=useState<number[]>([]);
  return <><Instruction title="用眼睛找出两颗小皮球">仔细看树叶和花朵之间，圆圆的皮球藏在哪里？</Instruction><Stage className="wp-search-scene">{['tree','ball','flower','leaf','ball','cloud'].map((kind,index)=><button key={index} className={`wp-search-item ${found.includes(index)?'is-found':''}`} aria-label={`观察第${index+1}幅小图`} style={{left:`${17+index%3*33}%`,top:`${29+Math.floor(index/3)*39}%`}} onClick={()=>{if(kind!=='ball'){say('用眼睛再看看，找圆圆的皮球。');return;}if(found.includes(index))return;const next=[...found,index];setFound(next);say('眼睛发现了一颗皮球。');if(next.length===2)done();}}><Art kind={kind} size={80}/>{found.includes(index)&&<Check size={23}/>}</button>)}</Stage></>;
}

function Body({ word, done, say }: GameProps) {
  const [step,setStep]=useState(0),nod=word.char==='头';
  return <><Instruction title={nod?'和小朋友一起点点头':'小身体转一转，伸伸手'}>点动作按钮三次，看看{nod?'头怎样轻轻点动':'身体怎样变换姿势'}，也可以和家长一起做。</Instruction><Stage className="wp-body-scene"><div className={`wp-moving-person ${nod?'is-nodding':'is-turning'}`} key={step} style={!nod?{transform:`translate(-50%,-50%) rotate(${step%2?-8:8}deg) scaleX(${step%2?-1:1})`}:undefined}><Art kind="child" size={190}/>{nod&&step>0&&<span className="wp-nod-arrow">↓</span>}</div><span className="wp-step-counter">{step} / 3 次</span></Stage><Controls><Action disabled={step>=3} onClick={()=>{const next=step+1;setStep(next);say(nod?'轻轻点点头。头在身体的上面。':'身体转一转，再伸伸手。');if(next===3)done();}}>{nod?'点点头':'转转身'}<Hand size={19}/></Action></Controls></>;
}

function Opening({ word, done, say }: GameProps) {
  const [opened,setOpened]=useState(0),window=word.char==='窗';
  return <><Instruction title={window?'把窗帘慢慢拉开':'轻轻打开小屋的门'}>拖动下面的滑块，{window?'阳光会从窗进来':'门后的家会出现在眼前'}。</Instruction><Stage className="wp-opening-scene"><div className="wp-house-roof"/><div className="wp-house-wall"><div className={`wp-house-opening ${window?'is-window':''}`}><div className="wp-room-family"><Art kind="child" size={100}/><Art kind="flower" size={56}/></div>{window?<><div className="wp-curtain wp-curtain-left" style={{transform:`translateX(-${opened*.85}%)`}}/><div className="wp-curtain wp-curtain-right" style={{transform:`translateX(${opened*.85}%)`}}/></>:<div className="wp-door-panel" style={{transform:`perspective(400px) rotateY(-${opened*.9}deg)`}}><span/></div>}</div></div></Stage><Controls><label className="wp-slider-label">{window?'拉开窗帘':'慢慢开门'}<input type="range" min="0" max="100" aria-label={window?'窗帘打开程度':'门打开程度'} value={opened} onChange={(event)=>{const value=Number(event.target.value);setOpened(value);if(value>=95){say(window?'窗打开了，阳光照进来。':'门打开了，欢迎回家。');done();}}}/></label><Action onClick={()=>{const next=Math.min(100,opened+34);setOpened(next);if(next===100){say(window?'窗让阳光进来。':'打开门，回到家。');done();}}}>{window?'拉开一点':'打开一点'}<ArrowRight size={18}/></Action></Controls></>;
}

const FOOD_WORDS: Record<string,{art:string;name:string}>={米:{art:'rice',name:'米粒'},面:{art:'noodles',name:'面条'},果:{art:'apple',name:'水果'},豆:{art:'beans',name:'豆子'},菜:{art:'leaf',name:'青菜'},肉:{art:'meat',name:'熟肉'},饭:{art:'rice',name:'米饭'},糖:{art:'candy',name:'糖果'}};
function Bowl({ word, done, say }: GameProps) {
  const food=FOOD_WORDS[word.char], [filled,setFilled]=useState<number[]>([]);
  const choices=[food.art,food.art==='apple'?'noodles':'apple',food.art,'ball',food.art];
  return <><Instruction title={`把三份${food.name}放进干净的小碗`}>点选{food.name}，其他东西留在原处。{word.char==='糖'?'糖果只吃一点点，记得刷牙。':'好好吃饭，也要珍惜食物。'}</Instruction><Stage className="wp-bowl-scene"><div className="wp-serving-bowl"><Art kind="bowl" size={160}/><div className="wp-served-food">{filled.map((index)=><Art key={index} kind={food.art} size={53}/>)}</div></div><div className="wp-serving-choices">{choices.map((kind,index)=><button key={index} aria-label={`第${index+1}份食物或物品`} className={filled.includes(index)?'is-served':''} disabled={filled.includes(index)} onClick={()=>{if(kind!==food.art){say(`这不是${food.name}，再看看。`);return;}const next=[...filled,index];setFilled(next);say(`${food.name}放进碗里。${word.char}。`);if(next.length===3)done();}}><Art kind={kind} size={65}/></button>)}</div></Stage></>;
}

function Peel({ word, done, say }: GameProps) {
  const egg=word.char==='蛋', [peeled,setPeeled]=useState<number[]>([]),[split,setSplit]=useState(0);
  return <><Instruction title={egg?'剥开熟鸡蛋的小外壳':'把画里的西瓜分成两半'}>{egg?'点开三块蛋壳，看蛋白和蛋黄。':'拖动滑块分开瓜，不用真的刀子。'}</Instruction><Stage className="wp-peel-scene">{egg?<div className="wp-egg-peel"><Art kind="egg" size={195}/>{[0,1,2].map((i)=>!peeled.includes(i)&&<button key={i} className={`wp-egg-shell wp-egg-shell-${i}`} aria-label={`剥开第${i+1}块熟蛋壳`} onClick={()=>{const next=[...peeled,i];setPeeled(next);say('熟蛋壳剥下来，里面是蛋白和蛋黄。');if(next.length===3)done();}}/>)}</div>:<div className="wp-melon-halves"><span style={{transform:`translateX(-${split*.48}px) rotate(-${split*.1}deg)`}}><Art kind="melon" size={160}/></span><span style={{transform:`translateX(${split*.48}px) rotate(${split*.1}deg)`}}><Art kind="melon" size={160}/></span></div>}</Stage>{!egg&&<Controls><label className="wp-slider-label">分开西瓜<input type="range" min="0" max="100" value={split} aria-label="西瓜分开程度" onChange={(event)=>{const value=Number(event.target.value);setSplit(value);if(value>=95){say('西瓜打开了，里面有果肉和瓜子。');done();}}}/></label><Action onClick={()=>{const next=Math.min(100,split+34);setSplit(next);if(next===100){say('瓜有果肉和瓜子。');done();}}}>分开一点<ArrowRight size={18}/></Action></Controls>}</>;
}

function Color({ word, done, say }: GameProps) {
  const [color,setColor]=useState(''),[petals,setPetals]=useState<number[]>([]),[notice,setNotice]=useState('');
  return <><Instruction title={`用${word.char}色给小花涂颜色`}>先选{word.char}色颜料，再点花瓣，涂好三片。</Instruction><Stage className="wp-color-scene"><div className="wp-paint-flower"><svg viewBox="0 0 200 210" aria-hidden="true"><path d="M100 200V104" stroke="#99b784" strokeWidth="9"/><path d="M100 174Q47 132 51 166Q54 188 100 189" fill="#a5be91"/><circle cx="100" cy="97" r="25" fill="#eed394"/></svg>{[0,1,2].map((i)=><button key={i} aria-label={`涂第${i+1}片花瓣`} className="wp-paint-petal" style={{left:`${[18,50,82][i]}%`,top:`${[37,12,37][i]}%`,background:petals.includes(i)?COLORS[word.char]:'#f3eee0'}} onClick={()=>{if(color!==word.char){setNotice(`请先选${word.char}色。`);say(`先选${word.char}色。`);return;}if(petals.includes(i))return;const next=[...petals,i];setPetals(next);setNotice(next.length===3?'三片花瓣都涂好了！':`涂好了${next.length}片花瓣，再涂下一片。`);say(`${word.char}色的花瓣。`);if(next.length===3)done();}}/>)}</div><div className="wp-palette">{Object.entries(COLORS).map(([char,value])=><button key={char} className={color===char?'is-selected':''} style={{background:value}} aria-label={`选择${char}色`} onClick={()=>{setColor(char);setNotice(char===word.char?`${char}色选好啦，点一片花瓣。`:`这是${char}色，找找${word.char}色。`);say(`${char}色。`);}}>{color===char&&<Check size={23}/>}</button>)}</div></Stage><p className="wp-game-note" role="status">{notice||'先观察颜色，再给花涂一涂。'}</p></>;
}

function Nature({ word, done, say }: GameProps) {
  const game=SEMANTIC_WORDS[word.char], [picked,setPicked]=useState<number[]>([]);
  const art=game==='mountain'?'mountain':game==='cloud'?'cloud':game==='fire'?'fire':word.char==='虫'?'worm':'leaf';
  const total=game==='fire'?3:3;
  return <><Instruction title={game==='mountain'?'点亮三座山峰，看山的形状':game==='cloud'?'把三朵白云聚到天空中':game==='fire'?'点亮画里的三束火光':word.char==='虫'?'在叶子之间找到三只小虫':'把三片落叶收进小篮子'}>{game==='fire'?'只在画里看火光。真的火不能用手摸，要找大人帮忙。':game==='mountain'?'一座山峰高，两边的山峰低，像「山」的形状。':game==='cloud'?'云在天空里，轻轻飘来飘去。':word.char==='虫'?'观察小虫，不抓它、不伤害它。':'叶子从树上落下来，我们收好落叶。'}</Instruction><Stage className={`wp-nature-scene wp-nature-${game}`}><div className="wp-nature-items">{Array.from({length:total},(_,i)=><button key={i} aria-label={game==='fire'?`点亮第${i+1}束画里的火光`:game==='mountain'?`第${i+1}座山峰`:game==='cloud'?`第${i+1}朵白云`:word.char==='虫'?`第${i+1}只小虫`:`第${i+1}片落叶`} className={picked.includes(i)?'is-picked':''} onClick={()=>{if(picked.includes(i))return;const next=[...picked,i];setPicked(next);say(game==='fire'?'画里的火有亮光。':game==='mountain'?'高高的山峰。':game==='cloud'?'白云在天空。':word.char==='虫'?'找到小虫啦。':'落叶收好了。');if(next.length===total)done();}}><Art kind={art} size={game==='mountain'?(i===1?157:111):110}/>{picked.includes(i)&&<Check size={25}/>}</button>)}</div>{game==='leaves'&&word.char!=='虫'&&<div className="wp-leaf-basket"><Art kind="basket" size={100}/></div>}</Stage></>;
}

function Generic({ word, done, say }: GameProps) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const [heard, setHeard] = useState(false);
  const [phase, setPhase] = useState<'word' | 'meaning' | 'done'>('word');
  const [notice, setNotice] = useState('');
  const dragging = useRef<number|null>(null);
  const target = word.words[0] || word.char;
  const revealing = word.interaction === 'reveal';
  const revealReady = !revealing || revealed.length >= 8;
  const vocabulary = [target, ...['小鱼', '小手', '月亮', '米饭', '大树', '白云', '小兔'].filter((item) => !item.includes(word.char) && !word.words.includes(item)).slice(0, 2)].sort((a, b) => a.localeCompare(b));
  const examples = (hanziData as Hanzi[]).filter((item) => ['猫', '手', '树', '饭', '鱼', '门', '一'].includes(item.char) && item.theme !== word.theme && item.char !== word.char && !word.meaning.includes(item.char)).slice(0, 2);
  const definitions = [{ correct: true, text: word.meaning }, ...examples.map((item) => ({ correct: false, text: item.meaning }))].sort((a, b) => a.text.localeCompare(b.text));
  const stopReveal = (event: PointerEvent<HTMLDivElement>) => {if(dragging.current!==event.pointerId)return;dragging.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  const uncover = (index: number) => setRevealed((previous) => previous.includes(index) ? previous : [...previous, index]);
  return <>
    <Instruction title={phase !== 'word' ? `哪一个意思在说「${target}」？` : `听生活句子，找「${word.char}」的词语朋友`}>
      {phase !== 'word' ? '听听每张意思卡，再选择和刚才词语相符的一张。' : '先听生活句子，选出含这个字的词语，再选择正确意思。两步都完成才能进入认字。'}
    </Instruction>
    {revealing && !revealReady ? <Stage className="wp-fallback-scene">
      <div className="wp-fallback-card"
        onPointerDown={(event) => { if(dragging.current!==null||!event.isPrimary||event.button!==0)return;dragging.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={stopReveal}
        onPointerCancel={stopReveal}
        onLostPointerCapture={stopReveal}
        onPointerMove={(event) => {
          if (dragging.current!==event.pointerId) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if(!rect.width||!rect.height||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
          const x = Math.min(3, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * 4)));
          const y = Math.min(2, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * 3)));
          uncover(y * 4 + x);
        }}>
        <strong>{word.char}</strong>
        <div className="wp-fallback-tiles">{Array.from({ length: 12 }, (_, index) => <button key={index} aria-label={`擦开第${index + 1}块字卡盖子`} className={revealed.includes(index) ? 'is-revealed' : ''} onClick={() => uncover(index)}/>)}</div>
      </div>
      <span className="wp-step-counter">先打开字卡 {revealed.length} / 8</span>
    </Stage> : phase === 'word' ? <Stage className="wp-fallback-scene">
      <button className="wp-sentence-card" onClick={() => { setHeard(true); say(`${target}。${word.sentence}`); setNotice('句子里的词语朋友是哪一个？'); }}>
        <Volume2 size={25}/><strong>{target}</strong><span>{word.sentence}</span>
      </button>
      <div className="wp-vocabulary-options">{vocabulary.map((text) => <button key={text} onClick={() => {
        if (!heard) { setNotice('先点生活句子卡听一听。'); say('先听一遍生活句子。'); return; }
        if (text !== target) { setNotice(`这张词卡没有「${word.char}」。再听句子，找找「${target}」。`); say(`再听句子，找找${target}。`); return; }
        setPhase('meaning'); setNotice('词语找对了，再想想它的意思。'); say(`${target}。${word.meaning}`);
      }}>{text}</button>)}</div>
      <span className="wp-step-counter">第 1 步 · 找词语</span>
    </Stage> : <div className="wp-definition-scene">
      <button className="wp-definition-listen" onClick={() => say(`${target}。${word.sentence}`)}><Volume2 size={21}/>再听生活句子</button>
      <div className="wp-definition-options">{definitions.map((definition,index) => <div className="wp-definition-card" key={definition.text}><button className="wp-definition-audio" aria-label={`听第${index+1}张意思卡`} onClick={()=>say(definition.text)}><Volume2 size={22}/></button><button className={phase === 'done' && definition.correct ? 'is-correct' : ''} onClick={() => {
        if (!definition.correct) { setNotice(`这个意思和「${target}」不相符。再听一听：${word.meaning}`); say(word.meaning); return; }
        setPhase('done'); setNotice(`两步完成了。「${word.char}」：${word.meaning}`); say(`${word.char}。${word.meaning}`); done();
      }}>{definition.text}{phase === 'done' && definition.correct && <Check size={22}/>}</button></div>)}</div>
      <span className="wp-definition-step">第 2 步 · 想意思</span>
    </div>}
    <p className="wp-game-note" role="status">{notice || '点小喇叭听一听，和家长一起找一找。'}</p>
  </>;
}

export default function WordPlay({ word, onComplete, onSpeak }: { word: Hanzi; onComplete: () => void; onSpeak: (text: string) => void }) {
  const {tablet}=useTabletViewport();
  const [complete,setComplete]=useState(false);
  useEffect(()=>setComplete(false),[word.id]);
  const done=()=>setComplete(true),props:GameProps={word,done,say:onSpeak};
  const game=SEMANTIC_WORDS[word.char];
  const association = game === 'feed' ? PETS[word.char].kind : game === 'bowl' ? FOOD_WORDS[word.char].art : game === 'wash' ? (word.char === '牙' ? 'tooth' : 'hand') : game === 'plant' ? (word.char === '草' ? 'grass' : word.char === '花' ? 'flower' : 'tree') : ({sunrise:'sun',night:'moon',mountain:'mountain',water:'drop',fire:'fire',cloud:'cloud',rain:'umbrella',wind:'grass',snow:'snow',swim:'fish',fly:'bird',number:'star',ear:'ear',mouth:'spoon',kindness:'heart',walk:'foot',leaves:word.char==='虫'?'worm':'leaf',peel:word.char==='蛋'?'egg':'melon',color:'flower'} as Record<string,string>)[game];
  const Component=game==='sunrise'||game==='night'?Sunrise:game==='water'?Water:game==='rain'||game==='mouth'||game==='kindness'?DragScene:game==='snow'?Snow:game==='wind'?Wind:game==='plant'?Plant:game==='feed'?Feed:game==='swim'||game==='fly'||game==='walk'?Travel:game==='compare'?Compare:game==='direction'?Direction:game==='number'?Counting:game==='wash'?Wash:game==='ear'?Hearing:game==='eyes'?Eyes:game==='nod'||game==='body'?Body:game==='open'?Opening:game==='bowl'?Bowl:game==='peel'?Peel:game==='color'?Color:game==='mountain'||game==='fire'||game==='cloud'||game==='leaves'?Nature:Generic;
  return <div className={`word-play semantic-play ${complete?'is-complete':''}`}>{(!tablet||!complete)&&<div className="wp-game-content"><Component key={word.id} {...props}/></div>}<div className={`wp-word-discovery ${complete?'is-visible':''}`} aria-live="polite">{complete&&<>{association?<span className="wp-origin-picture"><Art kind={association} size={58}/></span>:<Sparkles size={24}/>}<strong>{word.char}</strong><span>{word.pinyin}<small>{word.meaning}</small></span></>}</div>{complete&&<button className="primary-button" onClick={onComplete}>认识这个字<Sparkles size={20}/></button>}</div>;
}
