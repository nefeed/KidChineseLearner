/** Optional source preparation: node scripts/build-hanzi-terms.mjs /path/to/jieba/dict.txt
 * Requires the project's pinned pinyin-pro package. Writes dictionary-attested terms,
 * filtered by the current character's context pronunciation, to the local source snapshot.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pinyin} from 'pinyin-pro';
const sourceFile='scripts/build-hanzi-source.json';
const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const dictPath=process.argv[2];
if(!dictPath)throw new Error('Pass the complete jieba dict.txt path');
const dictionary=fs.readFileSync(dictPath);
const terms=dictionary.toString('utf8').trim().split('\n').map(line=>{
 const [word,freq,pos]=line.split(' ');return {word,freq:Number(freq),pos};
}).filter(x=>/^[\p{Script=Han}]{2,4}$/u.test(x.word)&&!/^n[rst]/u.test(x.pos)&&! /性交|毒品|处女|妓|淫|屠|尸|奴|奸|阴道|睾丸|暴力|共产党/u.test(x.word));
terms.sort((a,b)=>b.freq-a.freq||a.word.localeCompare(b.word,'zh-CN'));
const reading=new Map(source.dictionary.map(x=>[x.word,x.pinyin.replaceAll('ɡ','g')]));
const choices=Object.fromEntries(source.orderedCharacters.map(char=>[char,[]]));
for(const term of terms){
 const targets=[...new Set([...term.word].filter(char=>choices[char]&&choices[char].length<8))];
 if(!targets.length)continue;
 const py=pinyin(term.word,{type:'array'});
 for(const char of targets){
  const indices=[...term.word].flatMap((value,i)=>value===char?[i]:[]);
  if(indices.every(i=>py[i]===reading.get(char)))choices[char].push({word:term.word,frequency:term.freq});
 }
}
source.termSource={url:'https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt',sha256:crypto.createHash('sha256').update(dictionary).digest('hex'),license:'MIT',pinyinFilter:'pinyin-pro 3.29.4; all target occurrences must match the selected dictionary pronunciation'};
source.commonTerms=choices;
fs.writeFileSync(sourceFile,JSON.stringify(source,null,2)+'\n');
console.log(JSON.stringify({characters:Object.keys(choices).length,insufficient:source.orderedCharacters.filter(ch=>choices[ch].length<2)},null,2));
