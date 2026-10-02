import { pinyin } from 'pinyin-pro';
import type { Hanzi } from './types';
const DIACRITICS:Record<string,[string,number]>={ā:['a',1],á:['a',2],ǎ:['a',3],à:['a',4],ē:['e',1],é:['e',2],ě:['e',3],è:['e',4],ī:['i',1],í:['i',2],ǐ:['i',3],ì:['i',4],ō:['o',1],ó:['o',2],ǒ:['o',3],ò:['o',4],ū:['u',1],ú:['u',2],ǔ:['u',3],ù:['u',4],ǖ:['ü',1],ǘ:['ü',2],ǚ:['ü',3],ǜ:['ü',4]};
export function pronunciationParts(syllable:string){
  let tone=0;
  const plain=[...syllable.toLowerCase()].map(c=>{const mark=DIACRITICS[c];if(mark){tone=mark[1];return mark[0];}return c;}).join('');
  const initial=plain.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/u)?.[0]??'';
  let final=plain.slice(initial.length);
  if(['j','q','x'].includes(initial)&&final.startsWith('u'))final='ü'+final.slice(1);
  if(initial==='y')final=({i:'i',a:'ia',e:'ie',ao:'iao',ou:'iou',an:'ian',in:'in',ang:'iang',ing:'ing',ong:'iong',u:'ü',ue:'üe',uan:'üan',un:'ün'} as Record<string,string>)[final]??final;
  if(initial==='w')final=({u:'u',a:'ua',o:'uo',ai:'uai',ei:'uei',an:'uan',en:'uen',ang:'uang',eng:'ueng'} as Record<string,string>)[final]??final;
  return {initial,final,tone:String(tone),plain,apical:['z','c','s','zh','ch','sh','r'].includes(initial)&&final==='i'};
}
// System TTS is given a disambiguating word when a standalone polyphonic glyph has another reading.
export function pronunciationText(word:Hanzi):string {
  if(pinyin(word.char)===word.pinyin)return word.char;
  const match=word.words.find(text=>{const chars=[...text],sounds=pinyin(text,{type:'array'});return chars.some((c,i)=>c===word.char&&sounds[i]===word.pinyin);});
  return match??word.words[0]??word.char;
}
export function narrationText(word:Hanzi,text:string):string {
  const spoken=pronunciationText(word);
  if(text===word.char)return spoken;
  if(text.startsWith(`${word.char}。`))return spoken+text.slice(word.char.length);
  if(text===`找对啦！${word.char}，读作${word.char}。`)return `找对啦！${spoken}。`;
  return text;
}
