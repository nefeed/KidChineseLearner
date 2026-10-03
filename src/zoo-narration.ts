import { ZOO_REGIONS, rewardRegion } from './data/zoo-regions';
import { ANIMALS, BUILDINGS, FOODS, REWARDS, type AnimalSpecies } from './data/rewards';

type Food = typeof FOODS[number];

// Names entered by a family stay in the visual feedback. Spoken feedback uses
// these finite phrases so it can always have a matching local narration clip.
export const zooNarration = {
  intro: '小兔已经来到你的岛！学会每 10 个字，或每 5 首诗词，就能邀请新朋友、领取建筑。',
  welcomeRegions: '欢迎来到动物园！先选一个园区，看看哪位朋友在等你。',
  enterRegion: (name: string) => `我们来到${name}啦！点一位朋友，就能喂食、洗澡、给它起名字。还没有朋友时，点看看入园目标。`,
  welcomeCare: '欢迎回到你的动物园。点一位朋友，就能喂食、洗澡、给它起名字。',
  welcomeRewards: '点“邀请入园”，领取已解锁的朋友或建筑。还没解锁的邀请函会显示学习目标。',
  movement: '先点选一位朋友或建筑，然后拖动它，或点园区里的新位置。',
  positionSaved: '位置已经保存。',
  bathStart: '按住泡泡，轻轻擦过身上的棕色小泥点。',
  bathProgress: '泡泡把一块小泥点洗掉啦，继续轻轻擦一擦。',
  bathComplete: '这位朋友洗得干干净净！谢谢你轻轻地帮它洗澡。',
  full: '这位朋友已经吃饱啦。我们可以陪它洗澡，或者看看动物园。',
  nameMissing: '名字还没有写好，请和家长一起写一个名字。',
  nameSaved: '新名字已经记住啦。',
  claim: (title: string, region: string) => `${title}来到${region}啦！点“布置动物园”，就能安排位置。`,
  feedChoice: (species: AnimalSpecies) => `给这位朋友选一份食物。${species.foodHint}`,
  feedWrong: (species: AnimalSpecies, food: Food) => `谢谢你照顾这位朋友。这份${food.name}不适合它。${species.foodHint}再选一份试试。`,
  feedCorrect: (species: AnimalSpecies, food: Food) => `这位朋友吃了一口${food.name}。${food.word}。${species.foodHint}`,
  buildingPlacement: (name: string) => `给${name}找个位置吧。拖动建筑，或点园区里的新位置。`,
};

/** Exact finite catalog shared by the component and the audio release plan. */
export function zooNarrationTexts(): string[] {
  const texts = Object.values(zooNarration).filter((value): value is string => typeof value === 'string');
  for (const region of ZOO_REGIONS) texts.push(zooNarration.enterRegion(region.name));
  for (const reward of REWARDS) texts.push(zooNarration.claim(reward.title, rewardRegion(reward).name));
  for (const building of BUILDINGS) texts.push(zooNarration.buildingPlacement(building.name));
  for (const species of ANIMALS) {
    texts.push(zooNarration.feedChoice(species));
    for (const food of FOODS) texts.push(species.foods.includes(food.id) ? zooNarration.feedCorrect(species, food) : zooNarration.feedWrong(species, food));
  }
  return [...new Set(texts)];
}
