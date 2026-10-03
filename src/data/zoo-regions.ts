import { ANIMALS, type ZooReward } from './rewards';

export const ZOO_REGIONS = [
  { id: 'meadow', name: '小动物乐园', subtitle: '轻轻靠近，认识身边的小伙伴', animals: ['rabbit', 'cat', 'dog', 'pig', 'hedgehog', 'turtle'], preview: ['rabbit', 'cat', 'hedgehog'], buildings: ['flowers', 'playground', 'gate'] },
  { id: 'savanna', name: '草原大动物区', subtitle: '在金色草原上，遇见大个子朋友', animals: ['elephant', 'giraffe', 'lion', 'zebra', 'hippo', 'rhino'], preview: ['giraffe', 'elephant', 'lion'], buildings: ['fountain', 'windmill'] },
  { id: 'forest', name: '森林探险区', subtitle: '穿过树影，寻找林间的朋友', animals: ['fox', 'tiger', 'koala', 'squirrel', 'deer', 'bear', 'monkey'], preview: ['fox', 'deer', 'monkey'], buildings: ['treehouse', 'gazebo'] },
  { id: 'aviary', name: '鸟儿乐园', subtitle: '看看羽毛，认识树上的鸟儿', animals: ['owl', 'parrot'], preview: ['parrot', 'owl'], buildings: ['library', 'bench'] },
  { id: 'coast', name: '蓝色海湾', subtitle: '沿着海岸，拜访会游泳的朋友', animals: ['penguin', 'dolphin'], preview: ['dolphin', 'penguin'], buildings: ['pond', 'bridge'] },
  { id: 'bamboo', name: '熊猫竹林', subtitle: '走进青青竹林，陪熊猫慢慢吃饭', animals: ['panda'], preview: ['panda'], buildings: ['bamboo'] },
] as const;

export type ZooRegion = typeof ZOO_REGIONS[number];
export type ZooRegionId = ZooRegion['id'];

/** Derived placement keeps existing saves, names, care and coordinates intact. */
export function regionFor(kind: 'animal' | 'building', species: string): ZooRegion {
  return ZOO_REGIONS.find(region => {
    const speciesIds: readonly string[] = kind === 'animal' ? region.animals : region.buildings;
    return speciesIds.includes(species);
  }) ?? ZOO_REGIONS[0];
}

export function rewardRegion(reward: ZooReward): ZooRegion {
  return regionFor(reward.kind, reward.species);
}

export function regionResidents(region: ZooRegion): string {
  return region.preview.map(id => ANIMALS.find(animal => animal.id === id)!.name).join('、');
}
