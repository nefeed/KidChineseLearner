export type AnimalSpecies = {
  id: string;
  name: string;
  habitat: string;
  foods: string[];
  foodHint: string;
  color: string;
};

export const ANIMALS: AnimalSpecies[] = [
  { id: 'rabbit', name: '小兔', habitat: '草地', foods: ['grass', 'carrot'], foodHint: '小兔主要吃草，也能吃一点胡萝卜。', color: '#f7d9de' },
  { id: 'panda', name: '熊猫', habitat: '竹林', foods: ['bamboo'], foodHint: '熊猫喜欢吃竹子。', color: '#c2dbd0' },
  { id: 'fox', name: '狐狸', habitat: '林间', foods: ['fish', 'fruit'], foodHint: '狐狸可以吃鱼和果实。', color: '#efb381' },
  { id: 'elephant', name: '大象', habitat: '林间', foods: ['grass', 'fruit'], foodHint: '大象喜欢草、叶子和果实。', color: '#bdd7df' },
  { id: 'giraffe', name: '长颈鹿', habitat: '草地', foods: ['grass'], foodHint: '长颈鹿吃树上的叶子，这份绿叶很合适。', color: '#eed598' },
  { id: 'lion', name: '狮子', habitat: '草地', foods: ['meat'], foodHint: '狮子是食肉动物，可以吃肉。', color: '#e1b176' },
  { id: 'tiger', name: '老虎', habitat: '林间', foods: ['meat'], foodHint: '老虎是食肉动物，可以吃肉。', color: '#edb77e' },
  { id: 'koala', name: '考拉', habitat: '树屋', foods: ['eucalyptus'], foodHint: '考拉喜欢桉树叶。', color: '#c3cbd2' },
  { id: 'penguin', name: '企鹅', habitat: '水塘', foods: ['fish'], foodHint: '企鹅喜欢吃鱼。', color: '#b6d9eb' },
  { id: 'dolphin', name: '海豚', habitat: '水塘', foods: ['fish'], foodHint: '海豚喜欢吃鱼。', color: '#99cddc' },
  { id: 'turtle', name: '小龟', habitat: '水塘', foods: ['grass', 'fruit'], foodHint: '这是小岛的陆龟，喜欢绿叶和少量果实。', color: '#b4d29d' },
  { id: 'squirrel', name: '松鼠', habitat: '树屋', foods: ['nuts', 'fruit'], foodHint: '松鼠喜欢坚果和果实。', color: '#ceae8a' },
  { id: 'deer', name: '小鹿', habitat: '林间', foods: ['grass', 'fruit'], foodHint: '小鹿喜欢绿叶和果实。', color: '#d9b78d' },
  { id: 'owl', name: '猫头鹰', habitat: '树屋', foods: ['meat'], foodHint: '猫头鹰是食肉的鸟，可以吃肉。', color: '#c1a987' },
  { id: 'bear', name: '小熊', habitat: '林间', foods: ['fish', 'fruit'], foodHint: '小熊可以吃鱼和果实。', color: '#be967c' },
  { id: 'zebra', name: '斑马', habitat: '草地', foods: ['grass'], foodHint: '斑马喜欢吃草。', color: '#dce1df' },
  { id: 'hippo', name: '河马', habitat: '水塘', foods: ['grass'], foodHint: '河马主要吃草。', color: '#c8b9d9' },
  { id: 'rhino', name: '犀牛', habitat: '草地', foods: ['grass'], foodHint: '犀牛喜欢草和绿叶。', color: '#bec7c4' },
  { id: 'monkey', name: '小猴', habitat: '树屋', foods: ['fruit', 'nuts'], foodHint: '小猴可以吃果实和坚果。', color: '#d4b292' },
  { id: 'hedgehog', name: '刺猬', habitat: '林间', foods: ['meat'], foodHint: '刺猬喜欢昆虫；这里是适合它的昆虫小点心。', color: '#c9aa88' },
  { id: 'parrot', name: '鹦鹉', habitat: '树屋', foods: ['seeds', 'fruit'], foodHint: '鹦鹉喜欢种子和果实。', color: '#acd1aa' },
  { id: 'cat', name: '小猫', habitat: '小屋', foods: ['fish', 'meat'], foodHint: '小猫需要适合它的肉食。', color: '#ebccad' },
  { id: 'dog', name: '小狗', habitat: '小屋', foods: ['meat'], foodHint: '小狗可以吃适合它的肉食。', color: '#d6b48c' },
  { id: 'pig', name: '小猪', habitat: '小屋', foods: ['fruit', 'grass'], foodHint: '小猪可以吃果实和绿叶。', color: '#e9b3c3' },
];

export const BUILDINGS = [
  { id: 'pond', name: '月亮水塘', description: '让水边的朋友有一片清凉。' },
  { id: 'treehouse', name: '森林树屋', description: '给树上的朋友一个小家。' },
  { id: 'flowers', name: '彩虹花圃', description: '一起观察花朵开放。' },
  { id: 'bridge', name: '木头小桥', description: '从这边走到那边。' },
  { id: 'fountain', name: '泡泡喷泉', description: '听一听轻轻的水声。' },
  { id: 'windmill', name: '小风车', description: '看看风从哪里来。' },
  { id: 'library', name: '故事小屋', description: '和朋友一起读故事。' },
  { id: 'playground', name: '滑梯乐园', description: '和朋友轮流玩滑梯。' },
  { id: 'bamboo', name: '青青竹林', description: '熊猫喜欢的安静角落。' },
  { id: 'bench', name: '休息长椅', description: '累了就坐下来歇一歇。' },
  { id: 'gazebo', name: '星星凉亭', description: '在阴凉处听一首诗。' },
  { id: 'gate', name: '欢迎拱门', description: '欢迎来到你的动物园。' },
] as const;

export type ZooReward = {
  id: string;
  kind: 'animal' | 'building';
  source: 'hanzi' | 'poems';
  threshold: number;
  species: string;
  title: string;
};

// Each curriculum milestone owns a unique receipt, even when a species returns.
// This gives all 1,000 characters and all 300 poems a lasting zoo reward.
export const REWARDS: ZooReward[] = [
  ...Array.from({ length: 100 }, (_, index): ZooReward => {
    const animal = ANIMALS[(index + 1) % ANIMALS.length];
    return { id: `hanzi-${(index + 1) * 10}`, kind: 'animal', source: 'hanzi', threshold: (index + 1) * 10, species: animal.id, title: animal.name };
  }),
  ...Array.from({ length: 60 }, (_, index): ZooReward => {
    const isAnimal = index % 3 === 2;
    const item = isAnimal ? ANIMALS[(index + 7) % ANIMALS.length] : BUILDINGS[(index - Math.floor(index / 3)) % BUILDINGS.length];
    return { id: `poems-${(index + 1) * 5}`, kind: isAnimal ? 'animal' : 'building', source: 'poems', threshold: (index + 1) * 5, species: item.id, title: item.name };
  }),
];

export const FOODS = [
  { id: 'grass', name: '青草绿叶', word: '草' },
  { id: 'carrot', name: '胡萝卜', word: '萝卜' },
  { id: 'bamboo', name: '竹子', word: '竹' },
  { id: 'fruit', name: '水果', word: '果' },
  { id: 'fish', name: '小鱼', word: '鱼' },
  { id: 'nuts', name: '坚果', word: '果' },
  { id: 'seeds', name: '种子', word: '种子' },
  { id: 'meat', name: '动物专用餐', word: '食物' },
  { id: 'eucalyptus', name: '桉树叶', word: '叶' },
] as const;
