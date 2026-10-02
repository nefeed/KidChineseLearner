import { Sparkles } from 'lucide-react';
import type { Poem } from '../types';
const images:[RegExp,string][]=[[/月/,'🌙'],[/日|阳|光/,'☀️'],[/鹅/,'🪿'],[/鸟|莺|燕|雀|鹤|雁/,'🐦'],[/花|梅|桃|杏|梨|海棠/,'🌸'],[/荷|莲/,'🪷'],[/竹/,'🎋'],[/山|岭|峰/,'⛰️'],[/河|江|湖|水|溪|海/,'💧'],[/树|松|林|柳|木/,'🌳'],[/雪|霜/,'❄️'],[/雨/,'🌧️'],[/云/,'☁️'],[/鱼/,'🐟'],[/舟|船|艇/,'⛵'],[/家|乡|屋/,'🏡'],[/饭|禾|麦|田|稻|粮/,'🌾'],[/风/,'🍃'],[/马/,'🐴'],[/酒|杯/,'🏺'],[/人|友|客|儿|童/,'👫'],[/书|读/,'📖'],[/路|行/,'👣'],[/灯/,'🏮'],[/琴|曲|歌/,'🎵'],[/头|身|手/,'🧒']];
export function imageForKeyword(keyword:string){return images.find(([pattern])=>pattern.test(keyword))?.[1]??'✨';}
export default function PoetryScene({poem,found,onFind}:{poem:Poem;found:string[];onFind:(keyword:string)=>void}){
  // Editorial keywords select the visible imagery; poems without literal moon/water
  // imagery receive a book scene rather than a made-up moonlit landscape.
  const text=poem.keywords.join(''),moon=/月/.test(text),water=/江|河|湖|水|海|溪|波/.test(text),mountain=/山|岭|峰/.test(text),trees=/林|树|松|木|柳|竹/.test(text),snow=/雪|霜/.test(text),flowers=/花|梅|桃|杏|荷|梨/.test(text),birds=/鸟|鹅|莺|雀|鹤|雁|燕/.test(text),rain=/雨/.test(text),cloud=rain||/云/.test(text),sun=/日|阳|光/.test(text)&&!rain,tower=/楼/.test(text),grain=/禾|麦|稻|田/.test(text),autumnFlowers=poem.lines.some(line=>/黄花|菊/.test(line));
  return <div className={`poem-scene curated-poem-scene ${moon?'poem-scene-night':''}`}>
    <svg viewBox="0 0 480 400" aria-hidden="true" className="poetry-scene-art">
      <rect width="480" height="400" fill={moon?'#596e87':rain?'#cbdcdf':snow?'#dce9ea':'#dbece3'}/>
      {moon?<><circle cx="368" cy="74" r="38" fill="#ffe6aa"/><circle cx="383" cy="60" r="34" fill="#596e87"/>{[[65,46],[154,87],[242,35],[420,128]].map(([x,y])=><path key={x} d={`M${x} ${y-4}v8m-4-4h8`} stroke="#fff0c5" strokeWidth="2"/>)}</>:sun?<circle cx="378" cy="73" r="34" fill="#f8db9a"/>:null}
      {cloud&&<g fill={moon?'#8595a6':'#eef2ed'} opacity=".9"><ellipse cx="129" cy="65" rx="74" ry="23"/><circle cx="109" cy="46" r="29"/><circle cx="149" cy="48" r="25"/><ellipse cx="377" cy="105" rx="59" ry="17"/></g>}
      <path d="M0 233Q120 174 228 230T480 210V400H0Z" fill={moon?'#82998c':snow?'#f5f8f4':'#b4d0a1'}/>
      {mountain&&<path d="M-10 245L115 99L243 249L325 150L480 273Z" fill={moon?'#758b91':'#96b7ad'}/>}
      {water&&<><path d="M0 314Q130 277 260 319T480 298V400H0Z" fill="#9acbd1"/><path className="poetry-water-line" d="M34 343h84m128 22h104m-183 15h73" stroke="#ecf4e9" strokeWidth="3" strokeLinecap="round"/></>}
      {trees&&[63,143,433].map((x,i)=><g key={x}><path d={`M${x} 288V${160+i*12}`} stroke="#a58a6e" strokeWidth="12" strokeLinecap="round"/><ellipse cx={x} cy={162+i*12} rx="42" ry="54" fill={moon?'#88a38b':'#91b887'}/></g>)}
      {flowers&&[74,187,407].map((x,i)=><g key={x}><path d={`M${x} 331V${285+i*12}`} stroke="#7da282" strokeWidth="4"/>{[0,60,120].map(a=><ellipse key={a} cx={x} cy={281+i*12} rx="18" ry="8" fill={autumnFlowers?'#e7c883':'#ebb5b7'} transform={`rotate(${a} ${x} ${281+i*12})`}/>)}<circle cx={x} cy={281+i*12} r="6" fill="#f9df9a"/></g>)}
      {tower&&<g transform="translate(358 181)"><path d="M-45 37h95L25 14H-20Z" fill="#ae8468"/><path d="M-33 39h70v63h-70Z" fill="#e6cfab"/><path d="M-49 104h100L27 80H-22Z" fill="#ad8569"/><path d="M-33 105h70v39h-70Z" fill="#e6cfab"/><path d="M-14 55v21m33-21v21m-36 35v29m36-29v29" stroke="#9c8169" strokeWidth="10"/></g>}
      {grain&&[65,113,162,215,267,320,376,421].map((x,i)=><g key={x} transform={`translate(${x} ${335+i%2*14})`} stroke="#b5ad67" strokeWidth="4" fill="#dbc889"><path d="M0 0v-69"/>{[0,1,2].map(j=><g key={j}><ellipse cx="-7" cy={-59+j*15} rx="5" ry="11" transform={`rotate(-36 -7 ${-59+j*15})`}/><ellipse cx="7" cy={-52+j*15} rx="5" ry="11" transform={`rotate(36 7 ${-52+j*15})`}/></g>)}</g>)}
      {birds&&<g className="poetry-scene-bird" fill="none" stroke={moon?'#f5ddac':'#63867b'} strokeWidth="4" strokeLinecap="round"><path d="M197 118q12-12 24 0q12-12 24 0M280 144q9-9 18 0q9-9 18 0"/></g>}
      {snow&&[42,112,215,317,417].map((x,i)=><circle className="poetry-snow" key={x} cx={x} cy={100+i*25} r="4" fill="#fffdf3" style={{animationDelay:`${i*.4}s`}}/>)}
      {rain&&[37,88,157,227,299,362,430].map((x,i)=><path className="poetry-rain" key={x} d={`M${x} ${143+i%3*43}l-8 24`} stroke="#91b5c3" strokeWidth="3" strokeLinecap="round" style={{animationDelay:`${i*.2}s`}}/>)}
      {!water&&!mountain&&!trees&&!flowers&&!birds&&!tower&&!grain&&<g transform="translate(140 140)"><path d="M100 12Q57-9 0 10v102q56-17 100 7q44-24 100-7V10q-57-19-100 2Z" fill="#fff8e6" stroke="#c8b38a" strokeWidth="4"/><path d="M100 12v107" stroke="#d7c39e" strokeWidth="3"/><path d="M20 34h57m-57 19h57m48-19h55m-55 19h55" stroke="#a2b7a0" strokeWidth="5" strokeLinecap="round"/></g>}
    </svg>
    <p className="poetry-scene-caption">点一点，找诗里的发现</p>
    <div className="poetry-object-tray">{poem.keywords.slice(0,4).map((keyword,i)=><button key={`${keyword}-${i}`} className={`poetry-object ${found.includes(keyword)?'found':''}`} onClick={()=>onFind(keyword)} aria-label={`诗中的${keyword}`}><span>{imageForKeyword(keyword)}</span><b>{keyword}</b>{found.includes(keyword)&&<Sparkles size={16}/>}</button>)}</div>
  </div>;
}
