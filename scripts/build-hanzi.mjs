/** Rebuild the 1000 character course. This is a content build, not an editorial approval.
 * node scripts/build-hanzi.mjs [--stroke-source /path/to/hanzi-writer-data-2.0.1/package]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'scripts/build-hanzi-source.json'), 'utf8'));
const curatedLines = fs.readFileSync(path.join(root, 'scripts/build-hanzi-curated.tsv'), 'utf8').trim().split('\n');
const curated = new Map(curatedLines.map(line => {
  const [char, pinyin, meaning, wordText, sentence, theme, icon, interaction, prompt] = line.split('\t');
  if (!prompt) throw new Error(`Incomplete authored entry: ${char}`);
  return [char, {char,pinyin,meaning,words:wordText.split(','),sentence,theme,icon,interaction,prompt}];
}));
if(curated.size!==curatedLines.length)throw new Error('Duplicate authored character');
for(const char of curated.keys())if(!source.orderedCharacters.includes(char))throw new Error(`Authored entry is outside the selected course: ${char}`);
const dictionary = new Map(source.dictionary.map(entry => [entry.word,entry]));
const normalizePinyin = p => p.replaceAll('ɡ', 'g').replaceAll('·', '').trim().normalize('NFC');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const punctuation = /[，,；;。！？!?：:]/u;
const bannedExample = /性交|毒品|死刑|处女|妓|杀|死|淫|屠|尸|血|鬼|罪|贱|奴|敌|枪|奸|暴力|性器|睾|阴道|男尊|共产党/u;
const clean = s => s.replace(/\[[^\]]*\]|〈[^〉]*〉|\([^)]*\)|（[^）]*）/gu,'').replace(/[⒈-⒛①-⑳]/gu,'').replace(/^[\s\d.]+/u,'').replace(/[”"◇╠≮♂]/gu,'').replaceAll('～', '').trim();
function modernBranch(entry,pinyin) {
  const header = new RegExp('^'+escape(entry.word)+'(?:[（(][^）)]+[）)])?\\s*([·a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡ]+)\\s*(.*)$','u');
  const lines = entry.explanation.split('\n').map(s=>s.trim()).filter(Boolean);
  const starts = lines.map((line,i)=>({i,m:line.match(header)})).filter(x=>x.m);
  const start = starts.find(x=>normalizePinyin(x.m[1])===pinyin);
  if (!start) return '';
  const end = starts.find(x=>x.i>start.i)?.i ?? lines.length;
  return [start.m[2],...lines.slice(start.i+1,end)].filter(Boolean).join('\n');
}
function dictionaryDraft(entry) {
  const pinyin=normalizePinyin(entry.pinyin);
  const branch=modernBranch(entry,pinyin);
  const lines=(branch||entry.explanation).split('\n').map(s=>s.trim()).filter(Boolean);
  // Preserve real Chinese dictionary material. These entries require a preschool editor;
  // no placeholder such as "this is a character" is substituted for missing lexical data.
  let meaningLine=lines.find(s=>!/^([一-龥]\s*$|\(|（|又如|另见|见|同本义|【)/u.test(s) && !s.includes('--') && !/[a-zA-Z]/u.test(s) && /\p{Script=Han}/u.test(s));
  if (!meaningLine) meaningLine=entry.explanation.match(/本义([^）)\n]+)/u)?.[1];
  if (!meaningLine) throw new Error(`No Chinese definition: ${entry.word}`);
  let meaning=clean(meaningLine.split('～')[0]);
  if (/本义/u.test(meaning)) meaning=meaning.split('本义').at(-1).replace(/[)）]/gu,'');
  meaning=meaning.replace(/^同本义[。，]?/u,'').trim();
  const clauses=meaning.split(punctuation).map(x=>x.trim()).filter(Boolean);
  const first=clauses.find(x=>x.length>=2 && !/^[一-龥]$/u.test(x));
  if(first) meaning=first;
  if(meaning.length>80) meaning=meaning.slice(0,80);
  if(meaning.length<1) throw new Error(`Too little lexical definition: ${entry.word}: ${meaning}`);
  const examples=[];
  for(const line of lines) {
    if(!line.includes('～')) continue;
    const parts=line.replace(/[⒈-⒛①-⑳]/gu,'').split(/[。；;，,]/u);
    for(const part of parts) {
      const replaced=part.replaceAll('～',entry.word);
      if(part.includes('～') && replaced.length>=4 && replaced.length<=32 && !bannedExample.test(replaced)) examples.push(clean(replaced));
    }
  }
  const words=[];
  const addWord=word=>{
    if(/^[\p{Script=Han}]{2,4}$/u.test(word) && word.includes(entry.word) && !bannedExample.test(word) && !words.includes(word)) words.push(word);
  };
  // "又如" terms in the source have word boundaries, unlike bare ～ definition strings.
  for(const match of entry.explanation.matchAll(/又如([^\n]+)/gu)) {
    for(const chunk of match[1].split(/[;；,，]/u)) addWord(chunk.trim().match(/^[\p{Script=Han}]{2,4}(?=\(|（|$)/u)?.[0] || '');
  }
  for(const match of branch.matchAll(/[\p{Script=Han}～]{2,12}/gu)) {
    if(!match[0].includes('～')) continue;
    const token=match[0].replaceAll('～',entry.word);
    addWord(token);
    // Preserve a whole short source term next to ～ where a definition runs into examples.
    const before=match[0].split('～')[0];
    const after=match[0].split('～')[1]||'';
    if(before) addWord(before.slice(-1)+entry.word);
    if(after) addWord(entry.word+after.slice(0,1));
  }
  for(const match of entry.explanation.matchAll(/【([^】]+)】/gu)) addWord(match[1]);
  // A headword repeated in a source quote can yield common real words.
  for(const line of entry.explanation.split('\n')) {
    if(bannedExample.test(line)) continue;
    const chars=[...line];
    chars.forEach((ch,i)=>{if(ch===entry.word){addWord(chars.slice(Math.max(0,i-1),i+1).join(''));addWord(chars.slice(i,i+2).join(''));}});
  }
  const attested=source.commonTerms?.[entry.word]?.map(x=>x.word)||[];
  if(attested.length>=2){words.splice(0,words.length,...attested.slice(0,3));}
  if(words.length<2) throw new Error(`Insufficient source terms: ${entry.word}`);
  let sentence=entry.explanation.split('\n').map(s=>s.trim()).find(line=>line.includes('--') && line.split('--')[0].length>=6 && line.split('--')[0].length<=36 && line.includes(entry.word) && clean(line.split('--')[0]).includes(entry.word) && !bannedExample.test(line));
  if(sentence) sentence=clean(sentence.split('--')[0]);
  else sentence=examples.find(s=>s.length>=6) || examples[0];
  if(!sentence) {
    // Dictionary example phrases are honest draft material, not claimed to be edited sentences.
    sentence=words.slice(0,2).join('，');
  }
  if(!/[。！？]$/u.test(sentence)) sentence+='。';
  return {char:entry.word,pinyin,meaning,words:words.slice(0,3),sentence,
    theme:'词句进阶',icon:'📖',interaction:'match',prompt:`读一读“${words[0]}”，找到意思是“${meaning}”的字。`};
}
const draftErrors=[];
const entries=source.orderedCharacters.map((char,index)=>{
  try {
  const authored=curated.get(char);
  const content=authored||dictionaryDraft(dictionary.get(char));
  return {id:`hz-${String(index+1).padStart(3,'0')}`,...content,level:Math.floor(index/10)+1};
  } catch(error) { draftErrors.push(error.message); return null; }
});
if(draftErrors.length) throw new Error(draftErrors.join('\n'));
if(entries.length!==1000 || new Set(entries.map(x=>x.char)).size!==1000) throw new Error('Course must have exactly 1000 unique characters');
fs.mkdirSync(path.join(root,'src/data'),{recursive:true});
fs.writeFileSync(path.join(root,'src/data/hanzi.json'),JSON.stringify(entries,null,2)+'\n');
const strokeDir=path.join(root,'public/data/strokes');
fs.mkdirSync(strokeDir,{recursive:true});
const sourceArgument=process.argv.indexOf('--stroke-source');
const strokeSource=sourceArgument>=0 ? process.argv[sourceArgument+1] : null;
const strokeHashes={};
for(const entry of entries){
  const file=path.join(strokeDir,entry.char+'.json');
  if(strokeSource){
    const original=path.join(strokeSource,entry.char+'.json');
    if(!fs.existsSync(original))throw new Error(`No upstream stroke file: ${entry.char}`);
    fs.copyFileSync(original,file); // No path geometry, ordering or median changes.
  }
  if(!fs.existsSync(file)) throw new Error(`Run with --stroke-source to copy ${entry.char}`);
  strokeHashes[entry.char]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
const editorial={authorshipComplete:curated.size===1000,humanReviewComplete:false,humanReviewPendingCharacters:curated.size,authoredCharacters:entries.filter(x=>curated.has(x.char)).length,dictionaryDraftCharacters:entries.filter(x=>!curated.has(x.char)).length,entries:Object.fromEntries(entries.map(x=>[x.id,{char:x.char,status:curated.has(x.char)?'authored-pending-review':'dictionary-draft'}]))};
const manifest={editorial,source:'hanzi-writer-data',version:'2.0.1',url:'https://www.npmjs.com/package/hanzi-writer-data/v/2.0.1',upstream:'https://github.com/skishore/makemeahanzi',license:'Arphic Public License',copiedWithoutModification:true,characterCount:entries.length,sha256:strokeHashes};
fs.writeFileSync(path.join(strokeDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const report={characters:entries.length,authorshipComplete:curated.size===1000,humanReviewComplete:false,humanReviewPendingCharacters:curated.size,authoredCharacters:entries.filter(x=>curated.has(x.char)).length,dictionaryDraftCharacters:entries.filter(x=>!curated.has(x.char)).length,authoredIds:entries.filter(x=>curated.has(x.char)).map(x=>x.id),draftIds:entries.filter(x=>!curated.has(x.char)).map(x=>x.id),note:'The structural build does not prove editorial suitability, current pinyin-context agreement, or normative stroke-by-stroke manual review.'};
fs.writeFileSync(path.join(root,'scripts/build-hanzi-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({characters:entries.length,authored:report.authoredCharacters,dictionaryDraft:report.dictionaryDraftCharacters,strokes:Object.keys(strokeHashes).length},null,2));
