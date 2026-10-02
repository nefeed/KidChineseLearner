import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_KEY,STORAGE_KEY,completedCount,createProfile,createSave,finishLesson,initialProgress,loadSave,newlyCompletedToday,persistSave,startReview,updateLesson,validateSave} from '../src/store';
import {canContinueTrace,checkTrace,type Point} from '../src/trace';
import {narrationText,pronunciationParts} from '../src/pronunciation';
class MemoryStorage {
  values=new Map<string,string>();
  getItem(k:string){return this.values.get(k)??null;}
  setItem(k:string,v:string){this.values.set(k,v);}
}
test('per-character stage and stroke checkpoints survive serialization and reload',()=>{
  const storage=new MemoryStorage(),data=createSave();
  data.profiles[0]=updateLesson(data.profiles[0],'hanzi','hz-001',{stage:3,strokeIndex:2});
  persistSave(storage,data);const restored=loadSave(storage);
  assert.equal(restored.error,undefined);assert.equal(restored.data.profiles[0].hanzi['hz-001'].stage,3);assert.equal(restored.data.profiles[0].hanzi['hz-001'].strokeIndex,2);
});
test('profiles and poetry progress are independent',()=>{
  const a=createProfile('小兔'),b=createProfile('小熊');
  const learned=finishLesson(updateLesson(a,'poems','poem-001',{stage:5}),'poems','poem-001',1000);
  assert.equal(learned.stars,8);assert.equal(completedCount(learned.poems),1);assert.equal(completedCount(b.poems),0);assert.equal(b.stars,0);
});
test('unfinished lessons cannot award mastery; duplicate completion and reviews cannot farm stars',()=>{
  const p=createProfile();assert.equal(finishLesson(p,'hanzi','hz-001'),p);
  const ready=updateLesson(p,'hanzi','hz-001',{stage:5});
  const done=finishLesson(ready,'hanzi','hz-001',1000);assert.equal(done.stars,3);assert.equal(done.hanzi['hz-001'].completed,true);
  assert.equal(finishLesson(done,'hanzi','hz-001'),done);
  const review=startReview(done,'hanzi','hz-001',2000);assert.equal(review.hanzi['hz-001'].stage,2);
  const reviewed=finishLesson(updateLesson(review,'hanzi','hz-001',{stage:5}),'hanzi','hz-001',3000);
  assert.equal(reviewed.stars,3);assert.equal(reviewed.hanzi['hz-001'].reviewCount,1);assert.equal(reviewed.hanzi['hz-001'].reviewAt,3000+3*86400000);
});
test('corrupted primary recovers backup without overwriting raw data',()=>{
  const storage=new MemoryStorage(),data=createSave();persistSave(storage,data);persistSave(storage,data);
  storage.setItem(STORAGE_KEY,'{bad json');const recovered=loadSave(storage);
  assert.equal(recovered.recovered,true);assert.equal(recovered.data.activeId,data.activeId);assert.equal(storage.getItem(STORAGE_KEY),'{bad json');assert.equal(recovered.corrupted,'{bad json');assert.ok(storage.getItem(BACKUP_KEY));
});
test('storage failures propagate so callers can show unsaved state',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>persistSave(storage,createSave()),/quota/);
});
test('imports reject invalid nested progress, zoo, settings and duplicated profiles',()=>{
  const save=createSave();assert.equal(validateSave(save),true);
  const bad=structuredClone(save);bad.profiles[0].zoo.animals['welcome-rabbit'].fullness=Infinity;assert.equal(validateSave(bad),false);
  const bad2=structuredClone(save);bad2.profiles[0].hanzi['hz-001']={...initialProgress(),stage:99};assert.equal(validateSave(bad2),false);
  const bad3=structuredClone(save);bad3.profiles.push(bad3.profiles[0]);assert.equal(validateSave(bad3),false);
  const unknown=structuredClone(save);unknown.profiles[0].hanzi['hz-1001']=initialProgress();assert.equal(validateSave(unknown),false);
  const fractional=structuredClone(save);fractional.profiles[0].hanzi['hz-001']={...initialProgress(),reviewCount:.5};assert.equal(validateSave(fractional),false);
  const duplicate=structuredClone(save);duplicate.profiles[0].poems['poem-001']={...initialProgress(),listenedLines:[0,0]};assert.equal(validateSave(duplicate),false);
  const alien=structuredClone(save);alien.profiles[0].zoo.animals['welcome-rabbit'].id='unknown';assert.equal(validateSave(alien),false);
});
test('old backups accept missing music settings; new audio preferences persist and validate',()=>{
  const save=createSave(),p=save.profiles[0];
  delete p.settings.music;delete p.settings.musicVolume;
  assert.equal(validateSave(save),true);
  p.settings.music=false;p.settings.musicVolume=.31;
  const storage=new MemoryStorage();persistSave(storage,save);
  assert.equal(loadSave(storage).data.profiles[0].settings.music,false);
  assert.equal(loadSave(storage).data.profiles[0].settings.musicVolume,.31);
  p.settings.musicVolume=1.01;assert.equal(validateSave(save),false);
  p.settings.musicVolume=NaN;assert.equal(validateSave(save),false);
});
test('stroke tracing checks start, direction, coverage and length, not a single click',()=>{
  const median:Point[]=[[200,600],[400,600],[600,600],[800,600]];
  assert.equal(checkTrace([[200,600]],median).correct,false);
  assert.equal(checkTrace([[800,600],[200,600]],median).correct,false);
  assert.equal(checkTrace([[200,600],[210,600]],median).correct,false);
  assert.equal(checkTrace([[200,600],[300,620],[500,590],[700,610],[800,600]],median).correct,true);
  const curve:Point[]=[[200,700],[500,700],[500,400],[300,300]];
  assert.equal(checkTrace([[200,700],[300,300]],curve).correct,false);
  assert.equal(checkTrace(curve,curve).correct,true);
  assert.equal(canContinueTrace([[200,700],[500,700]],curve),true);
  assert.equal(canContinueTrace([[200,700],[850,950]],curve),false);
  const dot:Point[]=[[450,500],[500,440]];
  assert.equal(checkTrace([...dot].reverse(),dot).correct,false);
  assert.equal(checkTrace(dot,dot).correct,true);
});
test('pinyin guidance uses selected syllable, including ü after j/q/x and y',()=>{
  assert.deepEqual(pronunciationParts('yuè'),{initial:'y',final:'üe',tone:'4',plain:'yue',apical:false});
  assert.equal(pronunciationParts('shuǐ').tone,'3');assert.equal(pronunciationParts('zhǎng').initial,'zh');assert.equal(pronunciationParts('qù').final,'ü');assert.equal(pronunciationParts('rì').apical,true);
});
test('polyphonic narration keeps the selected context in feedback and system fallback',()=>{
  const word={id:'hz-001',char:'行',pinyin:'háng',words:['银行'],meaning:'一排人或东西。',sentence:'这里有一行树。',theme:'生活',icon:'🌳',interaction:'match',prompt:'听一听',level:1} as const;
  const sample={...word,words:[...word.words]};
  assert.equal(narrationText(sample,'行'),'银行');
  assert.equal(narrationText(sample,'找对啦！行，读作行。'),'找对啦！银行。');
  assert.equal(narrationText(sample,'行。二声往上扬。'),'银行。二声往上扬。');
  assert.equal(narrationText(sample,'这里有一行树。'),'这里有一行树。');
});
test('reviewing yesterday’s character never counts as a new character today',()=>{
  const yesterday=new Date(2026,9,1,12).getTime(),today=new Date(2026,9,2,12).getTime();
  const first=finishLesson(updateLesson(createProfile(),'hanzi','hz-001',{stage:5}),'hanzi','hz-001',yesterday);
  const reviewed=finishLesson(updateLesson(startReview(first,'hanzi','hz-001',today),'hanzi','hz-001',{stage:5}),'hanzi','hz-001',today);
  assert.equal(newlyCompletedToday(first.hanzi,yesterday),1);
  assert.equal(newlyCompletedToday(reviewed.hanzi,today),0);
  assert.equal(reviewed.hanzi['hz-001'].firstCompletedAt,yesterday);
});
test('long-poem recitation, listening and final-quiz checkpoints survive backup restoration',()=>{
  const storage=new MemoryStorage(),data=createSave();
  data.profiles[0]=updateLesson(data.profiles[0],'poems','poem-200',{stage:4,listenedLines:[0,1,2,3],recitation:{phase:0,chunk:3,selected:[0,1],clozeRound:0}});
  persistSave(storage,data);
  const restored=loadSave(storage).data.profiles[0].poems['poem-200'];
  assert.deepEqual(restored.recitation,{phase:0,chunk:3,selected:[0,1],clozeRound:0});
  assert.deepEqual(restored.listenedLines,[0,1,2,3]);
  const bad=structuredClone(data);bad.profiles[0].poems['poem-200'].recitation!.selected=[2];assert.equal(validateSave(bad),false);
});
