/** Validate all 1000 course records and every real stroke file.
 * Optional --stroke-source compares every file byte-for-byte with the pinned npm source.
 * Optional --strict-editorial fails while any dictionary draft remains.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const course=JSON.parse(fs.readFileSync(path.join(root,'src/data/hanzi.json'),'utf8'));
const audit=JSON.parse(fs.readFileSync(path.join(root,'scripts/build-hanzi-audit.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(root,'scripts/build-hanzi-source.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/data/strokes/manifest.json'),'utf8'));
const errors=[];
const assert=(test,message)=>{if(!test) errors.push(message);};
const keys=['id','char','pinyin','meaning','words','sentence','theme','icon','interaction','prompt','level'];
const han=/\p{Script=Han}/u;
const syllables=new Set(`a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lue ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nue o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri rong rou ru ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo`.split(/\s+/));
const ids=new Set(), chars=new Set();
const sourceArg=process.argv.indexOf('--stroke-source');
const upstream=sourceArg>=0?process.argv[sourceArg+1]:null;
let strokes=0,medians=0,bytes=0,upstreamCompared=0;
assert(course.length===1000,`Expected 1000 records, found ${course.length}`);
assert(manifest.source==='hanzi-writer-data'&&manifest.version==='2.0.1'&&manifest.copiedWithoutModification===true,'Pinned unmodified source manifest is required');
assert(source.orderedCharacters.length===1000,'Source order must include 1000 characters');
assert(manifest.editorial&&Object.keys(manifest.editorial.entries).length===1000,'Every character needs an editorial status');
assert(manifest.editorial.authoredCharacters===audit.authoredCharacters&&manifest.editorial.dictionaryDraftCharacters===audit.dictionaryDraftCharacters,'Editorial manifest and audit counts must agree');
for(const [i,entry] of course.entries()){
 const label=`${i+1} ${entry.char}`;
 assert(Object.keys(entry).length===keys.length&&keys.every(k=>k in entry),`${label}: exact record keys`);
 assert(entry.id===`hz-${String(i+1).padStart(3,'0')}`,`${label}: stable id`);
 assert(!ids.has(entry.id),`${label}: duplicate id`);ids.add(entry.id);
 assert([...entry.char].length===1&&han.test(entry.char),`${label}: single Han character`);
 assert(!chars.has(entry.char),`${label}: duplicate character`);chars.add(entry.char);
 assert(source.orderedCharacters[i]===entry.char,`${label}: source selection mismatch`);
 assert(entry.level===Math.floor(i/10)+1,`${label}: lesson level mismatch`);
 const editorial=manifest.editorial.entries[entry.id];
 assert(editorial?.char===entry.char,`${label}: editorial identity mismatch`);
 assert(editorial?.status===(audit.authoredIds.includes(entry.id)?'authored-pending-review':'dictionary-draft'),`${label}: editorial status mismatch`);
 for(const key of ['pinyin','meaning','sentence','theme','icon','prompt']) assert(typeof entry[key]==='string'&&entry[key].trim().length>0,`${label}: empty ${key}`);
 assert(/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/u.test(entry.pinyin),`${label}: pinyin characters`);
 const bare=entry.pinyin.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 assert(syllables.has(bare),`${label}: unknown syllable ${entry.pinyin}`);
 assert((entry.pinyin.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/gu)||[]).length<=1,`${label}: multiple tone marks`);
 assert(han.test(entry.meaning)&&!/[a-zA-Z]/u.test(entry.meaning),`${label}: Chinese meaning required`);
 assert(!/这是一个汉字|这是汉字|常用汉字|待补充|暂无|占位/u.test(entry.meaning),`${label}: placeholder meaning`);
 assert(Array.isArray(entry.words)&&entry.words.length>=2&&entry.words.every(w=>typeof w==='string'&&han.test(w)&&w.includes(entry.char)),`${label}: example terms must contain the character`);
 assert(han.test(entry.sentence)&&entry.sentence.includes(entry.char),`${label}: example must contain target character`);
 assert(['collect','reveal','match','count'].includes(entry.interaction),`${label}: interaction`);
 const strokePath=path.join(root,'public/data/strokes',entry.char+'.json');
 assert(fs.existsSync(strokePath),`${label}: missing real stroke file`);
 if(!fs.existsSync(strokePath))continue;
 const buffer=fs.readFileSync(strokePath);bytes+=buffer.length;
 const digest=crypto.createHash('sha256').update(buffer).digest('hex');
 assert(digest===manifest.sha256[entry.char],`${label}: file differs from source hash`);
 if(upstream){assert(buffer.equals(fs.readFileSync(path.join(upstream,entry.char+'.json'))),`${label}: altered upstream geometry`);upstreamCompared++;}
 const data=JSON.parse(buffer.toString());
 assert(Array.isArray(data.strokes)&&data.strokes.length>0,`${label}: missing stroke paths`);
 assert(Array.isArray(data.medians)&&data.medians.length===data.strokes.length,`${label}: stroke/median count mismatch`);
 for(const [n,stroke] of data.strokes.entries()){
   assert(typeof stroke==='string'&&/^M\s/u.test(stroke)&&/[LQCSHVZ]/u.test(stroke),`${label}: invalid stroke ${n+1}`);
   strokes++;
 }
 for(const [n,median] of data.medians.entries()){
   assert(Array.isArray(median)&&median.length>=2,`${label}: too few median points ${n+1}`);
   for(const point of median)assert(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=-64&&point[0]<=1088&&point[1]>=-188&&point[1]<=1088,`${label}: malformed median point`);
   medians++;
 }
}
const files=fs.readdirSync(path.join(root,'public/data/strokes')).filter(f=>f.endsWith('.json')&&f!=='manifest.json');
assert(files.length===1000,`Expected 1000 local character files, found ${files.length}`);
assert(audit.authoredIds.length+audit.draftIds.length===1000,'Editorial audit range must cover all 1000 records');
assert(new Set([...audit.authoredIds,...audit.draftIds]).size===1000,'Editorial audit ranges overlap');
assert(audit.authoredCharacters===audit.authoredIds.length&&audit.dictionaryDraftCharacters===audit.draftIds.length,'Editorial audit counts are inconsistent');
const structuralPassed=errors.length===0;
if(process.argv.includes('--strict-editorial'))assert(audit.dictionaryDraftCharacters===0,`${audit.dictionaryDraftCharacters} dictionary drafts still require preschool editing and pinyin-context review`);
const report={structuralPassed,validationPassed:errors.length===0,characters:course.length,uniqueCharacters:chars.size,localStrokeFiles:files.length,strokePaths:strokes,medians,bytes,upstreamByteComparisons:upstreamCompared,authoredCharacters:audit.authoredCharacters,dictionaryDraftCharacters:audit.dictionaryDraftCharacters,authorshipComplete:audit.dictionaryDraftCharacters===0,humanReviewComplete:false,humanReviewPendingCharacters:audit.authoredCharacters,editorialComplete:false,errors};
fs.writeFileSync(path.join(root,'scripts/build-hanzi-validation-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
