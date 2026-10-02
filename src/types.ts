export type Screen = 'home' | 'hanzi' | 'poems' | 'zoo' | 'parents';
export type Theme = string;
export interface Hanzi {
  id: string; char: string; pinyin: string; meaning: string; words: string[];
  sentence: string; theme: string; icon: string; interaction: 'collect' | 'reveal' | 'match' | 'count';
  prompt: string; level: number;
}
export interface Poem {
  id: string; title: string; author: string; dynasty: '唐' | '宋'; kind: '诗' | '词';
  lines: string[]; pinyin: string[][]; theme: string; icon: string; level: number;
  background: string; backgroundSource: string; interpretation: string[]; activity: string;
  question: { prompt: string; options: string[]; answer: number; explanation: string };
  keywords: string[]; reviewStatus: 'edited' | 'draft';
}
export interface LessonProgress {
  stage: number; completed: boolean; attempts: number; reviewAt: number;
  reviewCount: number; updatedAt: number;
  strokeIndex?: number; activityDone?: boolean; recitationDone?: boolean;
  mistakes?: number; reviewSession?: boolean;
  firstCompletedAt?: number; quizRound?: number;
  heardWord?: boolean; heardSentence?: boolean;
  listenedLines?: number[];
  recitation?: { phase: number; chunk: number; selected: number[]; clozeRound: number };
}
export interface ZooAnimal {
  id: string; name: string; fullness: number; cleanliness: number; affection: number; x: number; y: number;
}
export interface ZooBuilding { id: string; x: number; y: number }
export interface Profile {
  id: string; name: string; avatar: string; stars: number;
  hanzi: Record<string, LessonProgress>; poems: Record<string, LessonProgress>;
  zoo: { name: string; animals: Record<string, ZooAnimal>; buildings: Record<string, ZooBuilding>; claimed: string[] };
  settings: { sound: boolean; dailyGoal: number; sessionMinutes: number; speechRate: number; music?: boolean; musicVolume?: number };
  lastActivity?: { kind: 'hanzi' | 'poems'; id: string };
  createdAt: number; updatedAt: number;
}
export interface SaveData { version: 1; activeId: string; profiles: Profile[]; savedAt: number }
export interface StrokeData { strokes: string[]; medians: number[][][]; radicalStrokes?: number[] }
