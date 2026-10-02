/** Cross-check membership against the 2013 first-level common-character list.
 * This does not validate the Gist's corpus or any top-1000 frequency claim.
 * node scripts/build-hanzi-common.mjs [--unihan-source /path/to/Unihan-17.0.0.zip]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'scripts/build-hanzi-common-source.json'),'utf8'));
const firstLevel=[...source.firstLevelCharacters];
if(source.property!=='kTGH'||source.propertyValueYear!==2013||source.totalMappingEntries!==8105||firstLevel.length!==3500||new Set(firstLevel).size!==3500)throw new Error('Invalid first-level normative-list source snapshot');
const indices=new Map(firstLevel.map((char,index)=>[char,index+1]));
const sourceArgument=process.argv.indexOf('--unihan-source');
let upstreamMappingCompared=false;
if(sourceArgument>=0){
  const archive=process.argv[sourceArgument+1];
  const buffer=fs.readFileSync(archive);
  if(crypto.createHash('sha256').update(buffer).digest('hex')!==source.sourceSha256)throw new Error('Unihan archive does not match the pinned source SHA256');
  const mapping=execFileSync('unzip',['-p',archive,'Unihan_OtherMappings.txt'],{maxBuffer:8*1024*1024}).toString('utf8');
  const rows=mapping.split('\n').filter(line=>line.includes('\tkTGH\t')).map(line=>{const [code,,value]=line.split('\t');const [year,index]=value.split(':');if(year!=='2013')throw new Error('Unexpected kTGH list year');return {index:Number(index),char:String.fromCodePoint(parseInt(code.slice(2),16))};}).sort((a,b)=>a.index-b.index);
  if(rows.length!==8105||rows.some((row,index)=>row.index!==index+1))throw new Error('Original kTGH indices are not exactly 1..8105');
  if(rows.slice(0,3500).map(x=>x.char).join('')!==source.firstLevelCharacters)throw new Error('First-level snapshot differs from the original Unihan mapping');
  upstreamMappingCompared=true;
}
const course=JSON.parse(fs.readFileSync(path.join(root,'src/data/hanzi.json'),'utf8'));
const outside=course.filter(x=>!indices.has(x.char)).map(x=>({id:x.id,char:x.char}));
const report={source:'通用规范汉字表 (2013), first-level common set, encoded by Unicode Unihan 17.0.0 kTGH',sourceUrl:source.sourceUrl,sourceSha256:source.sourceSha256,propertyDocumentation:source.propertyDocumentation,officialListExplanation:source.officialListExplanation,sourcePropertyStatus:source.propertyStatus,upstreamMappingCompared,firstLevelSize:firstLevel.length,selectedCharacters:course.length,selectedInFirstLevel:course.length-outside.length,outsideFirstLevel:outside,membershipPassed:course.length===1000&&outside.length===0,frequencyRankValidated:false,indicesAreFrequencyRanks:false,selectedEntries:course.map(x=>({id:x.id,char:x.char,firstLevelListIndex:indices.get(x.char)??null})),note:'Confirms membership in the authoritative common-character set through the Unicode transcription. Does not establish a corpus top 1000 ranking, prove the Gist methodology, or define preschool teaching suitability.'};
fs.writeFileSync(path.join(root,'scripts/build-hanzi-common-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({upstreamMappingCompared:report.upstreamMappingCompared,firstLevelSize:report.firstLevelSize,selectedCharacters:report.selectedCharacters,selectedInFirstLevel:report.selectedInFirstLevel,outsideFirstLevel:outside,membershipPassed:report.membershipPassed,frequencyRankValidated:false},null,2));
if(!report.membershipPassed)process.exitCode=1;
