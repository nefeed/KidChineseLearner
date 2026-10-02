import {readFileSync,writeFileSync} from 'node:fs';
import {checkTrace,type Point} from '../src/trace';
const words=JSON.parse(readFileSync('src/data/hanzi.json','utf8'));
const impossible:string[]=[],reversed:string[]=[],taps:string[]=[];
let strokes=0;
for(const w of words){
  const data=JSON.parse(readFileSync(`public/data/strokes/${w.char}.json`,'utf8'));
  data.medians.forEach((median:Point[],i:number)=>{
    strokes++;
    if(!checkTrace(median,median).correct)impossible.push(`${w.char}:${i+1}`);
    if(checkTrace([...median].reverse(),median).correct)reversed.push(`${w.char}:${i+1}`);
    if(checkTrace([median[0]],median).correct)taps.push(`${w.char}:${i+1}`);
  });
}
const report={characters:words.length,strokes,impossible,reversed,taps};
writeFileSync('scripts/verification/tracing-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(impossible.length||reversed.length||taps.length)process.exitCode=1;
