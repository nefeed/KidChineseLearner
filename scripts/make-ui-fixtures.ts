import {readFileSync,writeFileSync} from 'node:fs';
import {createProfile,finishLesson,updateLesson} from '../src/store';
import type {SaveData} from '../src/types';
const file=process.argv[2];
if(!file)throw new Error('Pass an exported development save as the first argument.');
const current=JSON.parse(readFileSync(file,'utf8')) as SaveData;
writeFileSync('tests/fixtures/before-ui-stress.json',JSON.stringify(current));
const hanzi=JSON.parse(readFileSync('src/data/hanzi.json','utf8'));
const poems=JSON.parse(readFileSync('src/data/poems.json','utf8'));
let profile=createProfile('开发验证全库','🦊');
for(const [kind,items] of [['hanzi',hanzi],['poems',poems]] as const){for(const item of items)profile=finishLesson(updateLesson(profile,kind,item.id,{stage:5}),kind,item.id);}
const data={...current,activeId:profile.id,profiles:[...current.profiles,profile],savedAt:Date.now()};
writeFileSync('tests/fixtures/full-rewards.json',JSON.stringify(data));
writeFileSync('tests/fixtures/invalid-save.json',JSON.stringify({version:1,activeId:'invalid',profiles:[]}));
console.log(JSON.stringify({profiles:current.profiles.map(p=>({name:p.name,hanzi:Object.keys(p.hanzi).length,poems:Object.keys(p.poems).length})),stressStars:profile.stars}));
