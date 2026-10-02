import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Gift, Heart, Move, PawPrint, Pencil, Sparkles, Utensils, Waves, X } from 'lucide-react';
import type { Profile } from '../types';
import { ANIMALS, BUILDINGS, FOODS, REWARDS, type ZooReward } from '../data/rewards';
import Animal from './Animal';
import '../zoo.css';

type Props = { profile: Profile; onUpdate: (updater: (p: Profile) => Profile) => void; onSpeak: (text: string) => void };
type Selection = { kind: 'animal' | 'building'; key: string };
type Point = { x: number; y: number };
const PAGE_SIZE = 12;
const COLLECTION_PAGE_SIZE = 4;
const REWARD_PAGE_SIZE = 6;
const FOOD_PAGE_SIZE = 4;
const DIRT: Point[] = [{ x: 34, y: 47 }, { x: 63, y: 45 }, { x: 43, y: 69 }, { x: 67, y: 73 }, { x: 54, y: 58 }];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const countLearned = (entries: Profile['hanzi']) => Object.values(entries).filter((progress) => progress.completed).length;

function zooItems(zoo: Profile['zoo']): (Selection & Point)[] {
  const keys = [...new Set(['welcome-rabbit', ...zoo.claimed, ...Object.keys(zoo.animals), ...Object.keys(zoo.buildings)])];
  return keys.flatMap<Selection & Point>((key) => zoo.animals[key] ? [{ kind: 'animal', key, x: zoo.animals[key].x, y: zoo.animals[key].y }] : zoo.buildings[key] ? [{ kind: 'building', key, x: zoo.buildings[key].x, y: zoo.buildings[key].y }] : []);
}

function mapPosition(item: Selection & Point, items: (Selection & Point)[]) {
  // Older saves and a full first grassland can contain the same position twice.
  // Spread that small stack only for display; moving still saves the pointer's
  // actual grassland position, and viewing never rewrites a child's layout.
  const stack = items.filter(other => Math.abs(other.x - item.x) < .01 && Math.abs(other.y - item.y) < .01);
  if (stack.length < 2) return { left: `${item.x}%`, top: `${item.y}%` };
  const index = stack.findIndex(other => other.key === item.key && other.kind === item.kind);
  const columns = Math.min(4, Math.ceil(Math.sqrt(stack.length)));
  const rows = Math.ceil(stack.length / columns);
  const axis = (position: number, slot: number, count: number, horizontal: boolean) => {
    const gap = horizontal ? 'var(--zoo-map-spacing-x,120px)' : 'var(--zoo-map-spacing-y,128px)';
    const half = horizontal ? 'var(--zoo-map-half-x,56px)' : 'var(--zoo-map-half-y,60px)';
    return `calc(clamp(${half}, calc(${position}% - ${(count - 1) / 2} * ${gap}), calc(100% - ${half} - ${count - 1} * ${gap})) + ${slot} * ${gap})`;
  };
  return { left: axis(stack[0].x, index % columns, columns, true), top: axis(stack[0].y, Math.floor(index / columns), rows, false) };
}

function FoodIcon({ food }: { food: string }) {
  return <svg viewBox="0 0 60 60" width="48" height="48" aria-hidden="true">
    {food === 'carrot' ? <><path d="M19 20L42 28L20 53Z" fill="#ed9b58"/><path d="M26 24L24 32M33 28L30 37" stroke="#cb7c43" strokeWidth="2"/><path d="M29 23L19 10M30 23L31 5M33 24L45 12" stroke="#75a780" strokeWidth="5" strokeLinecap="round"/></> :
      food === 'fish' ? <><path d="M43 28L55 19L55 41L43 34" fill="#82bbd3"/><ellipse cx="27" cy="30" rx="20" ry="14" fill="#9ac9db"/><circle cx="17" cy="27" r="3" fill="#4f6264"/><path d="M29 16L36 9L38 18M30 43L37 49L38 40" fill="#70abc4"/></> :
      food === 'fruit' ? <><path d="M30 18C4 8 5 46 21 50Q29 54 31 49Q45 55 50 38C54 15 39 10 30 18" fill="#e79584"/><path d="M30 20L32 8" stroke="#8b7154" strokeWidth="4"/><path d="M33 12Q42 1 48 9Q42 20 33 12" fill="#88b389"/></> :
      food === 'nuts' ? <><ellipse cx="29" cy="32" rx="17" ry="20" fill="#c49964"/><path d="M29 13Q20 31 29 50M30 14Q38 31 30 49" fill="none" stroke="#9d744b" strokeWidth="2"/><path d="M19 21L24 23M36 20L40 25M16 34L22 35M36 36L43 34" stroke="#a67e52" strokeWidth="2"/></> :
      food === 'seeds' ? <><path d="M12 22Q30 7 47 22L43 48H16Z" fill="#e9d19b"/><path d="M12 23H47" stroke="#b79b63" strokeWidth="3"/>{[20,30,40].map((x, i) => <ellipse key={x} cx={x} cy={31 + i * 3} rx="3" ry="6" fill="#a58851" transform={`rotate(20 ${x} ${31 + i * 3})`}/>)}</> :
      food === 'meat' ? <><ellipse cx="30" cy="42" rx="25" ry="9" fill="#a4c6c0"/><path d="M9 32Q30 41 51 32L48 42Q30 51 12 42Z" fill="#7ea9a0"/>{[17,26,36,44].map((x, i) => <circle key={x} cx={x} cy={28 + i % 2 * 4} r="7" fill={i % 2 ? '#b9986b' : '#cfaf7e'}/>)}</> :
      food === 'bamboo' ? <><path d="M20 51L24 10M34 52L37 13" stroke="#9ebd71" strokeWidth="8"/><path d="M19 38H27M20 24H29M32 40H41M33 25H42" stroke="#678d5a" strokeWidth="3"/><path d="M38 27Q48 7 54 17Q48 30 38 27M22 21Q5 6 6 20Q13 29 22 21" fill="#82ae76"/></> :
      <><path d="M30 53L30 15" stroke="#82a56b" strokeWidth="4"/><path d="M28 44Q8 43 10 25Q28 23 28 44M32 35Q48 32 51 15Q31 13 32 35M29 27Q17 19 21 7Q32 10 29 27" fill={food === 'eucalyptus' ? '#94bdb4' : '#91b980'}/></>}
  </svg>;
}

function Building({ species, size = 100 }: { species: string; size?: number }) {
  return <svg viewBox="0 0 130 130" width={size} height={size} className={`zoo-building zoo-building--${species}`} aria-hidden="true">
    <ellipse cx="65" cy="113" rx="49" ry="9" fill="#538964" opacity=".15"/>
    {species === 'pond' ? <><ellipse cx="65" cy="89" rx="50" ry="24" fill="#b8dacf"/><ellipse cx="65" cy="88" rx="43" ry="18" fill="#90cbd9"/><path d="M32 88Q42 82 53 88M69 96Q80 89 92 94" fill="none" stroke="#d6f2f0" strokeWidth="3"/><ellipse cx="89" cy="81" rx="10" ry="5" fill="#8fb786"/><path d="M25 77L23 59M25 70L31 57" stroke="#79a478" strokeWidth="4"/></> :
      species === 'bridge' ? <><path d="M17 95Q65 40 113 95L107 104Q65 55 23 104Z" fill="#d5ad7f"/><path d="M21 78Q65 26 109 78M24 77V108M42 58V91M65 51V82M88 58V91M107 77V108" fill="none" stroke="#a78059" strokeWidth="6" strokeLinecap="round"/></> :
      species === 'flowers' ? <><ellipse cx="65" cy="100" rx="47" ry="16" fill="#9ebe85"/>{[35,60,88].map((x, i) => <g key={x}><path d={`M${x} 100V${54 + i * 10}`} stroke="#75a478" strokeWidth="4"/><path d={`M${x} 89q-15-17-18-6q2 13 18 12`} fill="#84b489"/>{[0,72,144,216,288].map((angle) => <ellipse key={angle} cx={x} cy={49 + i * 10} rx="7" ry="12" fill={i % 2 ? '#edb276' : '#e5a3ba'} transform={`rotate(${angle} ${x} ${57 + i * 10})`}/>)}<circle cx={x} cy={57 + i * 10} r="6" fill="#f7db90"/></g>)}</> :
      species === 'bamboo' ? <><path d="M36 111L40 28M62 111L64 15M86 111L88 34" stroke="#9eb774" strokeWidth="9"/><path d="M32 53H46M34 79H45M57 41H71M57 68H71M80 57H94M80 84H94" stroke="#6b945e" strokeWidth="3"/><path d="M40 48Q10 35 18 26Q39 24 40 48M65 39Q95 3 102 19Q95 38 65 39M88 70Q117 40 120 56Q111 74 88 70M62 84Q24 54 32 47Q59 51 62 84" fill="#8eaf71"/></> :
      species === 'bench' ? <><rect x="24" y="49" width="82" height="15" rx="5" fill="#cfab7d"/><rect x="24" y="69" width="82" height="13" rx="4" fill="#cfab7d"/><rect x="18" y="86" width="94" height="13" rx="5" fill="#b48d61"/><path d="M31 51V112M99 51V112M25 93L21 110M105 93L109 110" stroke="#8e775b" strokeWidth="6" strokeLinecap="round"/></> :
      species === 'fountain' ? <><ellipse cx="65" cy="102" rx="43" ry="15" fill="#a6caca"/><path d="M22 98Q65 111 108 98L101 111Q65 125 29 111Z" fill="#82b2b5"/><path d="M65 45V97M65 56Q29 18 28 72M65 56Q103 18 103 72" fill="none" stroke="#a4d6e0" strokeWidth="6" strokeLinecap="round"/><circle cx="65" cy="41" r="7" fill="#c9eef0"/>{[25,46,87,106].map((x, i) => <circle key={x} cx={x} cy={80 - i % 2 * 14} r="4" fill="#bce1e7"/>)}</> :
      species === 'playground' ? <><path d="M25 104V44H66V104" fill="none" stroke="#c0a580" strokeWidth="6"/><path d="M20 42L47 22L72 42Z" fill="#e9a388"/><path d="M58 54Q76 88 110 98L105 112Q71 103 48 58Z" fill="#9ac8bc"/><path d="M25 68H43M25 83H43M25 98H43" stroke="#b9906d" strokeWidth="5"/></> :
      species === 'gate' ? <><path d="M25 111V44Q65 6 105 44V111" fill="none" stroke="#d0ad7b" strokeWidth="12"/><path d="M34 42Q65 17 96 42" fill="none" stroke="#ecc99b" strokeWidth="15"/><path d="M60 27L65 16L70 27L83 29L73 38L75 51L65 45L54 51L57 38L47 29Z" fill="#f2d287"/><path d="M14 96H36M94 96H116" stroke="#9fbc8c" strokeWidth="7"/></> :
      species === 'gazebo' ? <><path d="M30 53V105M100 53V105" stroke="#be9a71" strokeWidth="7"/><path d="M15 52L65 16L115 52Z" fill="#98bcad"/><path d="M22 105H108M33 86H97M49 86V105M81 86V105" stroke="#c3a375" strokeWidth="6" strokeLinecap="round"/><path d="M59 27L65 17L71 27L82 29L73 36L75 47L65 41L55 47L57 36L48 29Z" fill="#f1dc98"/></> :
      <>
        {species === 'treehouse' && <><path d="M57 121L57 34H72V121" fill="#b9916d"/><circle cx="34" cy="39" r="27" fill="#a5bf8d"/><circle cx="68" cy="24" r="30" fill="#a5bf8d"/><circle cx="99" cy="39" r="27" fill="#9fbc8d"/></>}
        <path d={species === 'treehouse' ? 'M28 59H103V98H28Z' : 'M31 54H99V111H31Z'} fill="#f0d5ab" stroke="#c6a379" strokeWidth="2"/>
        <path d={species === 'treehouse' ? 'M17 60L65 29L114 60Z' : 'M19 55L65 24L111 55Z'} fill={species === 'library' ? '#e8a68d' : '#a0bead'}/>
        <rect x="54" y={species === 'treehouse' ? 72 : 80} width="22" height="31" rx="11" fill="#a4c7c0"/><rect x="35" y="66" width="13" height="14" rx="3" fill="#fff3cd"/><rect x="82" y="66" width="13" height="14" rx="3" fill="#fff3cd"/>
        {species === 'library' && <><rect x="47" y="48" width="37" height="24" rx="4" fill="#fff8e9"/><path d="M65 53V67M52 54Q59 52 65 57Q71 52 79 54V65Q71 63 65 67Q59 63 52 65Z" fill="#93b3a0"/></>}
        {species === 'windmill' && <g className="zoo-windmill"><path d="M65 50L47 9L29 18L59 57L18 75L27 93L67 64L85 105L103 96L73 57L114 39L105 21Z" fill="#fff1ce" stroke="#c8ad82" strokeWidth="2"/><circle cx="66" cy="57" r="8" fill="#d89c7c"/></g>}
      </>}
  </svg>;
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="zoo-meter"><div><span>{label}</span><span>{Math.round(value)} / 100</span></div><div className="zoo-meter-track"><span style={{ width: `${clamp(value, 0, 100)}%`, background: color }}/></div></div>;
}

function PagePicker({ label, page, pages, onPage }: { label: string; page: number; pages: number; onPage: (page: number) => void }) {
  return <nav className="zoo-pagination" aria-label={label}><button aria-label={`${label}上一页`} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={22}/></button><label>{label}<select aria-label={`选择${label}页码`} value={page} onChange={event => onPage(Number(event.target.value))}>{Array.from({length:pages},(_,index) => <option key={index} value={index}>{index + 1} / {pages}</option>)}</select></label><button aria-label={`${label}下一页`} disabled={page === pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={22}/></button></nav>;
}

export default function Zoo({ profile, onUpdate, onSpeak }: Props) {
  const [view, setView] = useState<'care' | 'rewards'>('care');
  const [selected, setSelected] = useState<Selection>({ kind: 'animal', key: 'welcome-rabbit' });
  const [care, setCare] = useState<'feed' | 'bath'>('feed');
  const [feedback, setFeedback] = useState('小兔已经来到你的岛！学会每 10 个字，或每 5 首诗词，就能邀请新朋友、领取建筑。');
  const [mood, setMood] = useState<'idle' | 'eat' | 'bath' | 'happy'>('idle');
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState<'zoo' | 'animal' | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [mapPage, setMapPage] = useState(0);
  const [collectionPage, setCollectionPage] = useState(0);
  const [rewardPage, setRewardPage] = useState(0);
  const [foodPage, setFoodPage] = useState(0);
  const [bubble, setBubble] = useState<Point | null>(null);
  const [dirtyMarks, setDirtyMarks] = useState<Set<number>>(new Set());
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ selection: Selection; pointerId: number; target: HTMLButtonElement } | null>(null);
  const bathRef = useRef<{ pointerId: number | null; previous: Point | null; dirty: Set<number>; travel: number }>({ pointerId: null, previous: null, dirty: new Set(), travel: 0 });
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animal = selected.kind === 'animal' ? profile.zoo.animals[selected.key] : undefined;
  const species = ANIMALS.find((item) => item.id === animal?.id);
  const building = selected.kind === 'building' ? profile.zoo.buildings[selected.key] : undefined;
  const buildingInfo = BUILDINGS.find((item) => item.id === building?.id);
  const learned = countLearned(profile.hanzi);
  const learnedPoems = countLearned(profile.poems);
  const claimed = new Set(profile.zoo.claimed);
  const mapItems = zooItems(profile.zoo);
  const pageCount = Math.max(1, Math.ceil(mapItems.length / PAGE_SIZE));
  const visibleItems = mapItems.slice(mapPage * PAGE_SIZE, (mapPage + 1) * PAGE_SIZE);
  const visibleKeys = new Set(visibleItems.map((item) => `${item.kind}:${item.key}`));
  const eligible = REWARDS.filter((reward) => !claimed.has(reward.id) && (reward.source === 'hanzi' ? learned : learnedPoems) >= reward.threshold);
  const upcomingHanzi = REWARDS.find((reward) => reward.source === 'hanzi' && reward.threshold > learned);
  const upcomingPoems = REWARDS.find((reward) => reward.source === 'poems' && reward.threshold > learnedPoems);
  const rewardChoices = showAll ? REWARDS : [...eligible, ...[upcomingHanzi, upcomingPoems].filter((reward): reward is ZooReward => !!reward)].filter((reward, index, array) => array.findIndex((r) => r.id === reward.id) === index);
  const rewardPageCount = Math.max(1, Math.ceil(rewardChoices.length / REWARD_PAGE_SIZE));
  const currentRewardPage = Math.min(rewardPage, rewardPageCount - 1);
  const rewardsShown = rewardChoices.slice(currentRewardPage * REWARD_PAGE_SIZE, (currentRewardPage + 1) * REWARD_PAGE_SIZE);
  const collectionPageCount = Math.max(1, Math.ceil(visibleItems.length / COLLECTION_PAGE_SIZE));
  const currentCollectionPage = Math.min(collectionPage, collectionPageCount - 1);
  const collectionShown = visibleItems.slice(currentCollectionPage * COLLECTION_PAGE_SIZE, (currentCollectionPage + 1) * COLLECTION_PAGE_SIZE);
  const foodPageCount = Math.ceil(FOODS.length / FOOD_PAGE_SIZE);
  const foodsShown = FOODS.slice(foodPage * FOOD_PAGE_SIZE, (foodPage + 1) * FOOD_PAGE_SIZE);

  useEffect(() => {
    setSelected({ kind: 'animal', key: Object.keys(profile.zoo.animals)[0] ?? 'welcome-rabbit' });
    setMoving(false);
    setView('care');
    setMapPage(0);
    setCollectionPage(0);
    setRewardPage(0);
    setFoodPage(0);
    setRenaming(null);
    setFeedback('欢迎回到你的动物园。点一位朋友，就能喂食、洗澡、给它起名字。');
  }, [profile.id]);

  useEffect(() => {
    const dirty = new Set(DIRT.map((_, index) => index).filter((index) => (animal?.cleanliness ?? 100) < (index + 1) * 20));
    bathRef.current = { pointerId: null, previous: null, dirty, travel: 0 };
    setDirtyMarks(new Set(dirty));
    setBubble(null);
    setMood('idle');
  }, [selected.key, care, profile.id, view]);

  useEffect(() => () => { if (moodTimer.current) clearTimeout(moodTimer.current); }, []);

  const speakFeedback = (message: string) => { setFeedback(message); onSpeak(message); };
  const selectMember = (selection: Selection) => {
    setSelected(selection);
    const index = mapItems.findIndex((item) => item.kind === selection.kind && item.key === selection.key);
    if (index >= 0) {
      setMapPage(Math.floor(index / PAGE_SIZE));
      setCollectionPage(Math.floor(index % PAGE_SIZE / COLLECTION_PAGE_SIZE));
    }
  };
  const animate = (next: typeof mood) => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
    setMood(next);
    moodTimer.current = setTimeout(() => setMood('idle'), 2200);
  };

  const claimReward = (reward: ZooReward) => {
    // Re-check the authoritative profile inside the mutation: double taps cannot duplicate gifts.
    onUpdate((p) => {
      if (p.zoo.claimed.includes(reward.id) || countLearned(reward.source === 'hanzi' ? p.hanzi : p.poems) < reward.threshold) return p;
      const items = zooItems(p.zoo);
      const total = items.length;
      const currentPageItems = items.slice(Math.floor(total / PAGE_SIZE) * PAGE_SIZE);
      const slots = Array.from({ length: PAGE_SIZE }, (_, index) => ({ x: 18 + index % 4 * 21, y: 35 + Math.floor(index / 4) * 21 }));
      const preferred = slots[total % PAGE_SIZE];
      const location = [preferred, ...slots].find((slot) => currentPageItems.every((item) => Math.abs(item.x - slot.x) > 16 || Math.abs(item.y - slot.y) > 16)) ?? preferred;
      const zoo = { ...p.zoo, claimed: [...p.zoo.claimed, reward.id] };
      if (reward.kind === 'animal') zoo.animals = { ...zoo.animals, [reward.id]: { id: reward.species, name: `${reward.title}${Math.floor(total / 24) ? ` ${Math.floor(total / 24) + 1}` : ''}`, fullness: 60, cleanliness: 40, affection: 10, ...location } };
      else zoo.buildings = { ...zoo.buildings, [reward.id]: { id: reward.species, ...location } };
      return { ...p, zoo, updatedAt: Date.now() };
    });
    setSelected({ kind: reward.kind, key: reward.id });
    setMapPage(Math.floor(mapItems.length / PAGE_SIZE));
    setCollectionPage(Math.floor(mapItems.length % PAGE_SIZE / COLLECTION_PAGE_SIZE));
    animate('happy');
    speakFeedback(`${reward.title}来到动物园啦！点移动，再点草地，就能安排一个位置。`);
  };

  const feed = (foodId: string) => {
    if (!animal || !species) return;
    const food = FOODS.find((item) => item.id === foodId);
    if (!food) return;
    if (!species.foods.includes(foodId)) {
      speakFeedback(`谢谢你照顾${animal.name}。这份${food.name}不适合它。${species.foodHint}再选一份试试。`);
      return;
    }
    if (animal.fullness >= 100) {
      animate('happy');
      speakFeedback(`${animal.name}已经吃饱啦。我们可以陪它洗澡，或者看看动物园。`);
      return;
    }
    onUpdate((p) => {
      const current = p.zoo.animals[selected.key];
      if (!current) return p;
      return { ...p, zoo: { ...p.zoo, animals: { ...p.zoo.animals, [selected.key]: { ...current, fullness: Math.min(100, current.fullness + 22), affection: Math.min(100, current.affection + 5) } } }, updatedAt: Date.now() };
    });
    animate('eat');
    speakFeedback(`${animal.name}吃了一口${food.name}。${food.word}。${species.foodHint}`);
  };

  const saveName = () => {
    const cleaned = nameInput.trim().slice(0, 16);
    if (!cleaned) { speakFeedback('名字还没有写好，请和家长一起写一个名字。'); return; }
    const target = renaming;
    onUpdate((p) => {
      if (target === 'zoo') return { ...p, zoo: { ...p.zoo, name: cleaned }, updatedAt: Date.now() };
      const current = p.zoo.animals[selected.key];
      if (!current) return p;
      return { ...p, zoo: { ...p.zoo, animals: { ...p.zoo.animals, [selected.key]: { ...current, name: cleaned } } }, updatedAt: Date.now() };
    });
    setRenaming(null);
    speakFeedback(`新名字是${cleaned}，已经记住啦。`);
  };

  const moveTo = (selection: Selection, point: Point) => {
    const position = { x: clamp(point.x, 8, 92), y: clamp(point.y, 22, 86) };
    onUpdate((p) => {
      if (selection.kind === 'animal') {
        const current = p.zoo.animals[selection.key];
        if (!current) return p;
        return { ...p, zoo: { ...p.zoo, animals: { ...p.zoo.animals, [selection.key]: { ...current, ...position } } }, updatedAt: Date.now() };
      }
      const current = p.zoo.buildings[selection.key];
      if (!current) return p;
      return { ...p, zoo: { ...p.zoo, buildings: { ...p.zoo.buildings, [selection.key]: { ...current, ...position } } }, updatedAt: Date.now() };
    });
  };

  const boardPoint = (event: { clientX: number; clientY: number }): Point | null => {
    const board = boardRef.current, rect = board?.getBoundingClientRect();
    if (!board || !rect || !rect.width || !rect.height) return null;
    const scaleX = rect.width / board.offsetWidth, scaleY = rect.height / board.offsetHeight;
    return { x: (event.clientX - rect.left - board.clientLeft * scaleX) / (board.clientWidth * scaleX) * 100,
      y: (event.clientY - rect.top - board.clientTop * scaleY) / (board.clientHeight * scaleY) * 100 };
  };

  const beginMove = (event: PointerEvent<HTMLButtonElement>, selection: Selection) => {
    event.stopPropagation();
    if (!event.isPrimary || event.button !== 0 || dragRef.current) return;
    setSelected(selection);
    if (!moving) return;
    event.preventDefault();
    dragRef.current = { selection, pointerId: event.pointerId, target: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endMove = (event?: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    dragRef.current = null;
    if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
  };
  useEffect(() => {
    endMove();
  }, [moving, mapPage, profile.id, view]);

  const keyboardMove = (event: React.KeyboardEvent<HTMLButtonElement>, selection: Selection, position: Point) => {
    if (!moving || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    setSelected(selection);
    moveTo(selection, { x: position.x + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0), y: position.y + (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0) });
  };

  const bathPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
  };
  const endBath = (event: PointerEvent<HTMLDivElement>) => {
    if (bathRef.current.pointerId !== event.pointerId) return;
    bathRef.current.pointerId = null; bathRef.current.previous = null; bathRef.current.travel = 0;
    setBubble(null); setMood(animal && animal.cleanliness >= 100 ? 'happy' : 'idle');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!animal || bathRef.current.pointerId !== event.pointerId) return;
    const point = bathPoint(event);
    if (!point) { bathRef.current.previous = null; bathRef.current.travel = 0; setBubble(null); return; }
    setBubble(point);
    const before = bathRef.current.previous ?? point;
    bathRef.current.previous = point;
    const dx = point.x - before.x;
    const dy = point.y - before.y;
    const distance = dx * dx + dy * dy;
    bathRef.current.travel += Math.sqrt(distance);
    // A tap only starts the brush. Cleaning requires a real held pointer movement.
    if (bathRef.current.travel < 2) return;
    const hit = DIRT.map((dirt, index) => ({ dirt, index })).filter(({ dirt, index }) => {
      if (!bathRef.current.dirty.has(index)) return false;
      const t = distance ? clamp(((dirt.x - before.x) * dx + (dirt.y - before.y) * dy) / distance, 0, 1) : 0;
      return Math.hypot(dirt.x - (before.x + t * dx), dirt.y - (before.y + t * dy)) < 10;
    });
    if (!hit.length) return;
    hit.forEach(({ index }) => bathRef.current.dirty.delete(index));
    setDirtyMarks(new Set(bathRef.current.dirty));
    onUpdate((p) => {
      const current = p.zoo.animals[selected.key];
      if (!current) return p;
      const cleanliness = Math.min(100, current.cleanliness + hit.length * 20);
      return { ...p, zoo: { ...p.zoo, animals: { ...p.zoo.animals, [selected.key]: { ...current, cleanliness, affection: Math.min(100, current.affection + hit.length * 3) } } }, updatedAt: Date.now() };
    });
    setMood('bath');
    if (animal.cleanliness + hit.length * 20 >= 100) speakFeedback(`${animal.name}洗得干干净净！谢谢你轻轻地帮它洗澡。`);
    else setFeedback('泡泡把一块小泥点洗掉啦，继续轻轻擦一擦。');
  };

  return <section className={`zoo-page zoo-page--${view}`} aria-label="我的动物园">
    <div className="zoo-heading">
      <div><h1>{profile.zoo.name}<button className="zoo-icon-button" aria-label="给动物园改名" onClick={() => { setNameInput(profile.zoo.name); setRenaming('zoo'); }}><Pencil size={20}/></button></h1><p>{Object.keys(profile.zoo.animals).length} 位朋友 · {Object.keys(profile.zoo.buildings).length} 座建筑</p></div>
      {view === 'care' && <button className={`zoo-pill-button ${moving ? 'is-active' : ''}`} onClick={() => { setMoving(!moving); speakFeedback(moving ? '位置已经保存。' : '先点选一位朋友或建筑，然后拖动它，或点草地上的新位置。'); }}><Move size={20}/>{moving ? '摆放完成' : '布置动物园'}</button>}
    </div>
    <div className="zoo-view-switch" aria-label={`动物园页面`}><button aria-pressed={view === 'care'} onClick={() => setView('care')}><PawPrint size={21}/>照顾朋友</button><button aria-pressed={view === 'rewards'} onClick={() => { setView('rewards'); setMoving(false); }}><Gift size={21}/>小岛邀请函{eligible.length > 0 && <span>{eligible.length}</span>}</button></div>

    {renaming && <div className="zoo-name-overlay"><form className="zoo-name-form" role="dialog" aria-modal="true" aria-label={renaming === 'zoo' ? `动物园改名` : `朋友改名`} onSubmit={(event) => { event.preventDefault(); saveName(); }}><label htmlFor="zoo-name-input">{renaming === 'zoo' ? '动物园的名字' : '朋友的新名字'}</label><input id="zoo-name-input" value={nameInput} onChange={(event) => setNameInput(event.target.value)} onKeyDown={event => {if(event.key === 'Escape')setRenaming(null);}} maxLength={16} autoFocus/><button type="submit" className="zoo-pill-button"><Check size={19}/>记住名字</button><button type="button" className="zoo-icon-button" aria-label="取消改名" onClick={() => setRenaming(null)}><X size={20}/></button></form></div>}

    {view === 'care' ? <><div className="zoo-world-layout">
      <div className="zoo-map-panel">
        <div ref={boardRef} className={`zoo-board ${moving ? 'zoo-board--moving' : ''}`} onClick={(event) => { if (!moving || event.target !== event.currentTarget) return; const point = boardPoint(event); if (point) moveTo(selected, point); }} onPointerMove={(event) => { const drag = dragRef.current; if (!drag || event.pointerId !== drag.pointerId) return; const point = boardPoint(event); if (point) moveTo(drag.selection, point); }} onPointerUp={endMove} onPointerCancel={endMove} onLostPointerCapture={endMove}>
          <div className="zoo-cloud zoo-cloud-one"/><div className="zoo-cloud zoo-cloud-two"/><div className="zoo-sun"/><div className="zoo-hills"/><div className="zoo-map-pond"><span/><span/></div><div className="zoo-map-path"/><div className="zoo-fence"/>
          <span className="zoo-map-sign">{profile.zoo.name}</span>
          {moving && <div className="zoo-map-grid"/>}
          {Object.entries(profile.zoo.buildings).filter(([key]) => visibleKeys.has(`building:${key}`)).map(([key, item]) => <button key={key} className={`zoo-map-item zoo-map-item--building ${selected.key === key && selected.kind === 'building' ? 'is-selected' : ''}`} style={{ ...mapPosition({ ...item, kind: 'building', key }, visibleItems), zIndex: selected.kind === 'building' && selected.key === key ? 1000 : Math.round(item.y) }} aria-label={`选择${BUILDINGS.find((b) => b.id === item.id)?.name ?? `建筑`}`} onPointerDown={(event) => beginMove(event, { kind: 'building', key })} onKeyDown={(event) => keyboardMove(event, { kind: 'building', key }, item)} onClick={(event) => { event.stopPropagation(); selectMember({ kind: 'building', key }); }}><Building species={item.id} size={100}/><span>{BUILDINGS.find((b) => b.id === item.id)?.name}</span></button>)}
          {Object.entries(profile.zoo.animals).filter(([key]) => visibleKeys.has(`animal:${key}`)).map(([key, item]) => <button key={key} className={`zoo-map-item zoo-map-item--animal ${selected.key === key && selected.kind === 'animal' ? 'is-selected' : ''}`} style={{ ...mapPosition({ ...item, kind: 'animal', key }, visibleItems), zIndex: selected.kind === 'animal' && selected.key === key ? 1000 : Math.round(item.y) + 1 }} aria-label={`选择${item.name}`} onPointerDown={(event) => beginMove(event, { kind: 'animal', key })} onKeyDown={(event) => keyboardMove(event, { kind: 'animal', key }, item)} onClick={(event) => { event.stopPropagation(); selectMember({ kind: 'animal', key }); }}><Animal species={item.id} size={92} mood={selected.key === key ? mood : 'idle'}/><span>{item.name}</span></button>)}
        </div>
        <div aria-label="动物园草地区域"><PagePicker label={`草地`} page={mapPage} pages={pageCount} onPage={index => { const first = mapItems[index * PAGE_SIZE]; if (first) selectMember(first); setMapPage(index); setCollectionPage(0); }}/></div>
        <p className="zoo-board-hint"><Move size={17}/>{moving ? '拖动朋友或建筑，也可以选好后点一块草地。位置自动保存。' : '点朋友就能照顾它。所有朋友一直安全、健康地等你回来。'}</p>
        <div className="zoo-collection-strip" aria-label={`本片草地的朋友卡片`}>
          <button className="zoo-collection-arrow" aria-label={`上一页朋友卡片`} disabled={currentCollectionPage === 0} onClick={() => setCollectionPage(currentCollectionPage - 1)}><ChevronLeft size={21}/></button>
          <div className="zoo-collection" aria-label="动物和建筑列表">{collectionShown.map(item => {
            const member = item.kind === 'animal' ? profile.zoo.animals[item.key] : profile.zoo.buildings[item.key];
            const name = item.kind === 'animal' ? profile.zoo.animals[item.key].name : BUILDINGS.find(b => b.id === member.id)?.name ?? `建筑`;
            return <button key={`${item.kind}:${item.key}`} title={name} aria-label={`${item.kind === 'animal' ? `照顾` : `查看`}${name}`} className={selected.kind === item.kind && selected.key === item.key ? 'is-selected' : ''} onClick={() => selectMember(item)}>{item.kind === 'animal' ? <Animal species={member.id} size={48}/> : <Building species={member.id} size={48}/>}<span>{name}</span></button>;
          })}</div>
          <button className="zoo-collection-arrow" aria-label={`下一页朋友卡片`} disabled={currentCollectionPage === collectionPageCount - 1} onClick={() => setCollectionPage(currentCollectionPage + 1)}><ChevronRight size={21}/></button>
          <span className="zoo-collection-status">本片朋友卡片 {currentCollectionPage + 1} / {collectionPageCount}</span>
        </div>
      </div>

      <aside className={`zoo-care-panel zoo-care-panel--${care}`}>
        {animal && species ? <>
          <div className="zoo-care-title"><div><span className="zoo-kicker">{species.name} · 喜欢{species.habitat}</span><h2>{animal.name}</h2></div><button className="zoo-icon-button" aria-label="给动物改名" onClick={() => { setNameInput(animal.name); setRenaming('animal'); }}><Pencil size={19}/></button></div>
          <div className="zoo-care-tabs"><button className={care === 'feed' ? 'is-active' : ''} onClick={() => { setCare('feed'); onSpeak(`给${animal.name}选一份食物。${species.foodHint}`); }}><Utensils size={18}/>喂食</button><button className={care === 'bath' ? 'is-active' : ''} onClick={() => { setCare('bath'); onSpeak('按住泡泡，轻轻擦过身上的棕色小泥点。'); }}><Waves size={18}/>洗澡</button></div>
          <div className={`zoo-care-stage zoo-care-stage--${care}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); feed(event.dataTransfer.getData('application/zoo-food')); }}>
            <Animal species={animal.id} size={224} mood={mood}/>
            {care === 'bath' && <div className="zoo-bath-surface" role="application" aria-label="按住并拖动泡泡擦掉棕色泥点" onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0 || bathRef.current.pointerId !== null) return; const point = bathPoint(event); if (!point) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); bathRef.current.pointerId = event.pointerId; bathRef.current.previous = point; bathRef.current.travel = 0; setBubble(point); setMood('bath'); }} onPointerMove={scrub} onPointerUp={endBath} onPointerCancel={endBath} onLostPointerCapture={endBath}>
              {DIRT.map((point, index) => dirtyMarks.has(index) ? <span key={index} className="zoo-dirt" style={{ left: `${point.x}%`, top: `${point.y}%` }}/> : null)}
              {bubble && <span className="zoo-bubble-brush" style={{ left: `${bubble.x}%`, top: `${bubble.y}%` }}><i/><i/><i/><i/></span>}
              {!bubble && animal.cleanliness < 100 && <span className="zoo-bath-hand"><Waves size={22}/>拖动泡泡洗一洗</span>}
            </div>}
            {care === 'feed' && <span className="zoo-care-stage-caption">点食物喂给我</span>}
            {care === 'bath' && animal.cleanliness >= 100 && <span className="zoo-care-stage-caption"><Sparkles size={16}/>洗干净啦！</span>}
          </div>
          {care === 'feed' && <div className="zoo-food-choices"><div className="zoo-foods">{foodsShown.map((food) => <button key={food.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/zoo-food', food.id)} onClick={() => feed(food.id)} aria-label={`喂${food.name}`}><FoodIcon food={food.id}/><span>{food.name}</span></button>)}</div><nav className="zoo-food-pagination" aria-label={`食物页`}><button aria-label={`上一页食物`} disabled={foodPage === 0} onClick={() => setFoodPage(foodPage - 1)}><ChevronLeft size={19}/></button><span>{foodPage + 1} / {foodPageCount}</span><button aria-label={`下一页食物`} disabled={foodPage === foodPageCount - 1} onClick={() => setFoodPage(foodPage + 1)}><ChevronRight size={19}/></button></nav></div>}
          <div className="zoo-meters"><Meter label="小肚子" value={animal.fullness} color="#edb36e"/><Meter label="干净度" value={animal.cleanliness} color="#8ebdce"/><Meter label="亲密度" value={animal.affection} color="#dda2b1"/></div>
          <p className="zoo-food-hint">{care === 'feed' ? species.foodHint : `按住后拖动泡泡，逐块擦掉小泥点。每次洗掉的进度都会记住。`}</p>
        </> : buildingInfo ? <div className="zoo-building-details"><Building species={buildingInfo.id} size={200}/><span className="zoo-kicker">你的动物园建筑</span><h2>{buildingInfo.name}</h2><p>{buildingInfo.description}</p><button className="zoo-pill-button" onClick={() => { setMoving(true); speakFeedback(`给${buildingInfo.name}找个位置吧。拖动建筑，或点一块草地。`); }}><Move size={18}/>安排位置</button></div> : <div className="zoo-building-details"><Heart size={40}/><h2>选择一位朋友</h2><p>点草地上的动物，或下面的朋友卡片，就能开始照顾它。</p></div>}
      </aside>
    </div>
    <div className="zoo-feedback" aria-live="polite"><Heart size={22}/><p>{feedback}</p><button className="zoo-icon-button" onClick={() => onSpeak(feedback)} aria-label="再听一次提示"><Waves size={20}/></button></div>
    </> : <><section className="zoo-rewards" aria-label="学习奖励">
      <div className="zoo-reward-heading"><h2><Gift size={25}/>小岛邀请函</h2><button className="zoo-text-button" onClick={() => { setShowAll(!showAll); setRewardPage(0); }}>{showAll ? '收起奖励地图' : '查看全部 160 份奖励'}</button></div>
      <div className="zoo-learning-progress"><span>已学会 <strong>{learned}</strong> 字 / 1000</span><span>已学会 <strong>{learnedPoems}</strong> 首 / 300</span><span>已领取 <strong>{profile.zoo.claimed.length}</strong> 份</span></div>
      {rewardsShown.length > 0 ? <div className="zoo-reward-grid">{rewardsShown.map((reward) => {
        const received = claimed.has(reward.id);
        const current = reward.source === 'hanzi' ? learned : learnedPoems;
        const available = current >= reward.threshold;
        return <article key={reward.id} className={`zoo-reward-card ${available ? 'is-ready' : ''} ${received ? 'is-claimed' : ''}`}>
          <div className="zoo-reward-picture">{reward.kind === 'animal' ? <Animal species={reward.species} size={86} mood={available && !received ? 'happy' : 'idle'}/> : <Building species={reward.species} size={86}/>}</div>
          <div className="zoo-reward-copy"><span className="zoo-kicker">{reward.source === 'hanzi' ? '识字' : '诗词'} · 第 {reward.threshold / (reward.source === 'hanzi' ? 10 : 5)} 份</span><h3>{reward.title}</h3><p>学会 {reward.threshold} {reward.source === 'hanzi' ? '个字' : '首诗词'}</p></div>
          <button className="zoo-reward-claim" disabled={received || !available} onClick={() => claimReward(reward)}>{received ? <><Check size={17}/>已来到</> : available ? <><Gift size={17}/>邀请入园</> : <>还差 {reward.threshold - current} {reward.source === 'hanzi' ? '字' : '首'}</>}</button>
        </article>;
      })}</div> : <p className="zoo-reward-complete">全部邀请函都收到了！点照顾朋友，继续建设自己的动物园。</p>}
      <PagePicker label={`奖励`} page={currentRewardPage} pages={rewardPageCount} onPage={setRewardPage}/>
    </section>
    <div className="zoo-feedback" aria-live="polite"><Heart size={22}/><p>{feedback}</p><button className="zoo-icon-button" onClick={() => onSpeak(feedback)} aria-label="再听一次提示"><Waves size={20}/></button></div>
    </>}

  </section>;
}
