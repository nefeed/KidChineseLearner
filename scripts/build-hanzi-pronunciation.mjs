/** A context-reading cross-check, not an editorial or phonetics certificate.
 * node scripts/build-hanzi-pronunciation.mjs
 * Only authored records are asserted. Drafts remain explicitly unreviewed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pinyin} from 'pinyin-pro';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const course=JSON.parse(fs.readFileSync(path.join(root,'src/data/hanzi.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/data/strokes/manifest.json'),'utf8'));
const dictionaryExceptions=[
  {char:'率',selected:'shuài',toolReading:'lǜ',contexts:['率先'],source:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=35584&la=0&powerMode=0',reason:'率先意为首先或领先，用 shuài；拼音工具将该词错读成 lǜ。'},
  {char:'勒',selected:'lēi',toolReading:'lè',contexts:['勒紧','勒脚','背包带勒得太紧，我请妈妈帮我松一松。'],source:'https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/201010/W020220124393643101738.pdf',sourceLocation:'GF 0015—2010 vocabulary entry 1883: 勒 lēi',lexicalSource:'scripts/build-hanzi-source.json dictionary entry 勒, branch 勒lēi',reason:'用带子等套住并收紧用 lēi；拼音工具在这两个语境中错读 lè。'},
  {char:'背',selected:'bēi',toolReading:'bèi',contexts:['背着','我背着小书包走进幼儿园。'],source:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=488&la=0&powerMode=0',termSource:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=489&la=0&powerMode=0',reason:'把书包负在背上用 bēi；拼音工具在这个动词语境中错读 bèi。'},
  {char:'教',selected:'jiāo',toolReading:'jiào',contexts:['教书','教给','妈妈教我认识小花。'],source:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=22351&la=0&powerMode=0',termSource:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=22352&la=0&powerMode=0',reason:'传授具体本领用 jiāo；拼音工具在这两个语境中错读 jiào。'},
  {char:'切',selected:'qiē',toolReading:'qiè',contexts:['切开','妈妈把西瓜切成小块。'],source:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=24798&la=0&powerMode=0',reason:'用刀把物体分开用 qiē；拼音工具在这两个语境中错读 qiè。'},
  {char:'斗',selected:'dǒu',toolReading:'dòu',contexts:['北斗','斗柄','我和爸爸在星图上寻找北斗七星。'],source:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=538&la=0&powerMode=0',termSource:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=539&la=0&powerMode=0',reason:'北斗及北斗七星用 dǒu；拼音工具在这两个语境中错读 dòu。'}
];
const toneFree=value=>value.normalize('NFD').replace(/[\u0300-\u0304\u030c]/g,'').normalize('NFC');
const checked=[],acceptedVariants=[],verifiedToolDifferences=[],errors=[];
for(const row of course){
  if(manifest.editorial.entries[row.id].status!=='authored-pending-review')continue;
  for(const [field,text] of [...row.words.map((word,index)=>[`word${index+1}`,word]),['sentence',row.sentence]]){
    const chars=[...text],reading=pinyin(text,{type:'array'});
    if(chars.length!==reading.length){errors.push({id:row.id,field,text,reason:'Tool output cannot be aligned by character'});continue;}
    chars.forEach((char,index)=>{
      if(char!==row.char)return;
      const actual=reading[index];
      const item={id:row.id,char,field,text,characterIndex:index,selected:row.pinyin,toolReading:actual};
      checked.push(item);
      if(actual===row.pinyin)return;
      if(char==='一'&&row.pinyin==='yī'&&['yí','yì'].includes(actual)){acceptedVariants.push({...item,reason:'一的单字本调 yī 与语境变调 yí/yì'});return;}
      if(char==='不'&&row.pinyin==='bù'&&actual==='bú'&&/[àèìòùǜ]/u.test(reading[index+1]||'')){acceptedVariants.push({...item,reason:'不在第四声前变调 bú，字卡保留本调 bù'});return;}
      if('爸妈爷奶姐哥弟妹伯'.includes(char)&&chars[index-1]===char&&actual===toneFree(row.pinyin)){acceptedVariants.push({...item,reason:'亲属叠词第二个音节轻声，字卡保留本调'});return;}
      const exception=dictionaryExceptions.find(x=>x.char===char&&x.selected===row.pinyin&&x.toolReading===actual&&x.contexts.includes(text));
      if(exception){verifiedToolDifferences.push({...item,source:exception.source,termSource:exception.termSource,reason:exception.reason});return;}
      errors.push(item);
    });
  }
}
const report={tool:'pinyin-pro',toolVersion:'3.29.4',scope:'Every target-character occurrence in all example words and full sentence of authored records',authoredRecords:course.filter(x=>manifest.editorial.entries[x.id].status==='authored-pending-review').length,uncheckedDraftRecords:course.filter(x=>manifest.editorial.entries[x.id].status==='dictionary-draft').length,targetOccurrencesChecked:checked.length,agreedWithTool:checked.length-acceptedVariants.length-verifiedToolDifferences.length-errors.length,acceptedContextVariants:acceptedVariants,dictionaryVerifiedToolDifferences:verifiedToolDifferences,errors,passed:errors.length===0,note:'Automated agreement is a cross-check. Documented dictionary checks overrule known tool mistakes, and base-tone/neutral-tone variations are recorded explicitly. Human proofreading and educational review remain required.'};
fs.writeFileSync(path.join(root,'scripts/build-hanzi-pronunciation-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({authoredRecords:report.authoredRecords,uncheckedDraftRecords:report.uncheckedDraftRecords,targetOccurrencesChecked:report.targetOccurrencesChecked,acceptedContextVariants:acceptedVariants.length,dictionaryVerifiedToolDifferences:verifiedToolDifferences.length,errors,passed:report.passed},null,2));
if(!report.passed)process.exitCode=1;
