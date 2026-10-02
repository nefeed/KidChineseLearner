import type { LessonProgress, Profile, SaveData } from './types';
import {ANIMALS,BUILDINGS,REWARDS} from './data/rewards';

export const STORAGE_KEY = 'ziyou-island-v1';
export const BACKUP_KEY = STORAGE_KEY + '-backup';
const day = 86_400_000;
export const REVIEW_DAYS = [1, 3, 7, 14, 30];

export function createProfile(name = '小小探险家', avatar = '🐰', now = Date.now()): Profile {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `child-${now}-${Math.random().toString(36).slice(2)}`,
    name: name.trim().slice(0, 16) || '小小探险家', avatar, stars: 0, hanzi: {}, poems: {},
    zoo: { name: '我的小小动物园', animals: { 'welcome-rabbit': { id: 'rabbit', name: '棉花糖', fullness: 65, cleanliness: 70, affection: 0, x: 27, y: 60 } }, buildings: {}, claimed: [] },
    settings: { sound: true, dailyGoal: 3, sessionMinutes: 10, speechRate: 0.8, music: true, musicVolume: 0.22 },
    createdAt: now, updatedAt: now,
  };
}
export function createSave(): SaveData {
  const profile = createProfile();
  return { version: 1, activeId: profile.id, profiles: [profile], savedAt: Date.now() };
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = (x: unknown, max = 100): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const integer = (x: unknown, min=0, max=Number.MAX_SAFE_INTEGER): x is number => finite(x,min,max)&&Number.isInteger(x);
const lessonId = (id:string,prefix:string,max:number) => {const number=Number(id.slice(prefix.length));return id===prefix+String(number).padStart(3,'0')&&integer(number,1,max);};
const animalIds=new Set<string>(ANIMALS.map(a=>a.id)),buildingIds=new Set<string>(BUILDINGS.map(b=>b.id)),rewardIds=new Set<string>(REWARDS.map(r=>r.id));
export function validateProgress(x: unknown): x is LessonProgress {
  return record(x) && finite(x.stage, 0, 6) && Number.isInteger(x.stage) && typeof x.completed === 'boolean' &&
    integer(x.attempts) && finite(x.reviewAt) && integer(x.reviewCount) && finite(x.updatedAt) &&
    (x.strokeIndex === undefined || (finite(x.strokeIndex, 0, 100) && Number.isInteger(x.strokeIndex))) &&
    (x.activityDone === undefined || typeof x.activityDone === 'boolean') &&
    (x.recitationDone === undefined || typeof x.recitationDone === 'boolean') &&
    (x.firstCompletedAt === undefined || finite(x.firstCompletedAt)) &&
    (x.quizRound === undefined || (finite(x.quizRound, 0, 100) && Number.isInteger(x.quizRound))) &&
    (x.mistakes === undefined || (finite(x.mistakes) && Number.isInteger(x.mistakes))) &&
    (x.reviewSession === undefined || typeof x.reviewSession === 'boolean') &&
    (x.heardWord === undefined || typeof x.heardWord === 'boolean') &&
    (x.heardSentence === undefined || typeof x.heardSentence === 'boolean') &&
    (x.listenedLines === undefined || (Array.isArray(x.listenedLines) && new Set(x.listenedLines).size===x.listenedLines.length && x.listenedLines.every(n => integer(n, 0, 100)))) &&
    (x.recitation === undefined || (record(x.recitation) && finite(x.recitation.phase, 0, 2) && Number.isInteger(x.recitation.phase) && finite(x.recitation.chunk, 0, 100) && Number.isInteger(x.recitation.chunk) && finite(x.recitation.clozeRound, 0, 100) && Number.isInteger(x.recitation.clozeRound) && Array.isArray(x.recitation.selected) && x.recitation.selected.length <= 4 && x.recitation.selected.every((n, i) => n === i)));
}
export function validateSave(x: unknown): x is SaveData {
  if (!record(x) || x.version !== 1 || !text(x.activeId) || !Array.isArray(x.profiles) || !x.profiles.length || x.profiles.length > 20 || !finite(x.savedAt)) return false;
  const ids = new Set();
  for (const p of x.profiles) {
    if (!record(p) || !text(p.id) || ids.has(p.id) || !text(p.name, 16) || !text(p.avatar, 12) || !integer(p.stars) || !finite(p.createdAt) || !finite(p.updatedAt)) return false;
    ids.add(p.id);
    if (!record(p.hanzi) || !record(p.poems) || !Object.values(p.hanzi).every(validateProgress) || !Object.values(p.poems).every(validateProgress)) return false;
    if (Object.keys(p.hanzi).length > 1000 || Object.keys(p.poems).length > 300) return false;
    if(!Object.keys(p.hanzi).every(id=>lessonId(id,'hz-',1000))||!Object.keys(p.poems).every(id=>lessonId(id,'poem-',300)))return false;
    const z = p.zoo;
    if (!record(z) || !text(z.name, 30) || !record(z.animals) || !record(z.buildings) || !Array.isArray(z.claimed) || !z.claimed.every(v => text(v))) return false;
    if(Object.keys(z.animals).length>121||Object.keys(z.buildings).length>40||new Set(z.claimed).size!==z.claimed.length||!z.claimed.every(v=>rewardIds.has(v)))return false;
    if (!Object.values(z.animals).every(a => record(a) && text(a.id) && animalIds.has(a.id) && text(a.name, 30) && finite(a.fullness, 0, 100) && finite(a.cleanliness, 0, 100) && finite(a.affection, 0, 100) && finite(a.x, 0, 100) && finite(a.y, 0, 100))) return false;
    if (!Object.values(z.buildings).every(a => record(a) && text(a.id) && buildingIds.has(a.id) && finite(a.x, 0, 100) && finite(a.y, 0, 100))) return false;
    const s = p.settings;
    if (!record(s) || typeof s.sound !== 'boolean' || !integer(s.dailyGoal, 1, 20) || !integer(s.sessionMinutes, 3, 60) || !finite(s.speechRate, 0.4, 1.2)) return false;
    if ((s.music !== undefined && typeof s.music !== 'boolean') || (s.musicVolume !== undefined && !finite(s.musicVolume, 0, 1))) return false;
    if (p.lastActivity !== undefined && (!record(p.lastActivity) || !['hanzi', 'poems'].includes(p.lastActivity.kind as string) || !text(p.lastActivity.id))) return false;
  }
  return ids.has(x.activeId);
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadSave(storage: StorageLike): { data: SaveData; error?: string; recovered?: boolean; corrupted?: string } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { data: createSave() };
    const parsed = JSON.parse(raw);
    if (validateSave(parsed)) return { data: parsed };
  } catch { /* try recovery without overwriting original */ }
  try {
    const backup = storage.getItem(BACKUP_KEY);
    if (backup) {
      const data = JSON.parse(backup);
      if (validateSave(data)) return { data, recovered: true, error: '主存档无法读取，已载入上一份备份。请在家长区导出备份后恢复保存。', corrupted: raw ?? undefined };
    }
  } catch { /* retain raw data for export */ }
  return { data: createSave(), error: '本机存档无法读取，暂未覆盖旧文件。请到家长区导出原始存档或导入备份。', corrupted: raw ?? undefined };
}
export function persistSave(storage: StorageLike, data: SaveData): void {
  if (!validateSave(data)) throw new Error('档案格式不完整，已保留旧存档');
  const previous = storage.getItem(STORAGE_KEY);
  if (previous) {
    try { if (validateSave(JSON.parse(previous))) storage.setItem(BACKUP_KEY, previous); } catch (e) { if (e instanceof Error && e.name === 'QuotaExceededError') throw e; }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export function initialProgress(now = Date.now()): LessonProgress {
  return { stage: 0, completed: false, attempts: 0, reviewAt: 0, reviewCount: 0, updatedAt: now };
}
export function updateLesson(profile: Profile, kind: 'hanzi' | 'poems', id: string, patch: Partial<LessonProgress>, now = Date.now()): Profile {
  const old = profile[kind][id] ?? initialProgress(now);
  return { ...profile, [kind]: { ...profile[kind], [id]: { ...old, ...patch, updatedAt: now } }, lastActivity: { kind, id }, updatedAt: now };
}
export function finishLesson(profile: Profile, kind: 'hanzi' | 'poems', id: string, now = Date.now()): Profile {
  const old = profile[kind][id] ?? initialProgress(now);
  // The UI must have completed all learning stages before committing mastery/rewards.
  if (old.stage < 5) return profile;
  if (old.completed && !old.reviewSession) return profile;
  const reviewCount = old.completed ? old.reviewCount + 1 : 0;
  const interval = REVIEW_DAYS[Math.min(reviewCount, REVIEW_DAYS.length - 1)];
  const next = updateLesson(profile, kind, id, { stage: 6, completed: true, reviewSession: false, reviewCount, firstCompletedAt: old.firstCompletedAt ?? (old.completed ? old.updatedAt : now), reviewAt: now + interval * day, attempts: old.attempts + 1 }, now);
  return { ...next, stars: profile.stars + (old.completed ? 0 : kind === 'hanzi' ? 3 : 8) };
}
export function startReview(profile: Profile, kind: 'hanzi' | 'poems', id: string, now = Date.now()): Profile {
  return updateLesson(profile, kind, id, { stage: 2, reviewSession: true, strokeIndex: 0, mistakes: 0, quizRound: 0, heardWord: false, heardSentence: false, activityDone: false, recitationDone: false, recitation: undefined }, now);
}
export function lessonMistake(profile: Profile, kind: 'hanzi' | 'poems', id: string): Profile {
  const old = profile[kind][id] ?? initialProgress();
  return updateLesson(profile, kind, id, { mistakes: (old.mistakes ?? 0) + 1, reviewAt: old.completed ? Date.now() + day : old.reviewAt });
}
export function completedCount(progress: Record<string, LessonProgress>): number { return Object.values(progress).filter(p => p.completed).length; }
export function newlyCompletedToday(progress: Record<string, LessonProgress>, now = Date.now()): number {
  return Object.values(progress).filter(p => p.completed && new Date(p.firstCompletedAt ?? (p.reviewCount === 0 && !p.reviewSession ? p.updatedAt : 0)).toDateString() === new Date(now).toDateString()).length;
}
export function dueLessons(profile: Profile, now = Date.now()) {
  return (['hanzi', 'poems'] as const).flatMap(kind => Object.entries(profile[kind]).filter(([, p]) => p.completed && p.reviewAt <= now).map(([id]) => ({ kind, id })));
}
