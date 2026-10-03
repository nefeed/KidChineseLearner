import type { ZooRegionId } from '../data/zoo-regions';

/** Decorative landscape shared by the entrance cards and each actual region. */
export default function ZooScenery({ region }: { region: ZooRegionId }) {
  const woodland = region === 'forest' || region === 'aviary';
  const sky = region === 'coast' ? '#d4eff6' : region === 'savanna' ? '#fff0cf' : '#e6f2e5';
  const ground = region === 'coast' ? '#94d3df' : region === 'savanna' ? '#e8ce8b' : region === 'bamboo' ? '#c6dbae' : '#d0e3b7';
  return <svg className={`zoo-region-scenery zoo-region-scenery--${region}`} viewBox="0 0 640 360" preserveAspectRatio="none" aria-hidden="true">
    <rect width="640" height="360" fill={sky}/>
    <circle cx="559" cy="45" r="24" fill="#f6d990"/>
    <path d="M0 135Q140 72 298 128T640 114V360H0Z" fill={ground}/>
    <path d="M0 204Q126 145 290 194T640 172V360H0Z" fill={ground} opacity=".75"/>
    {region === 'meadow' && <>
      <path d="M224 360Q245 263 320 184L350 192Q304 277 308 360" fill="#f1dfbc"/>
      <path d="M34 178V112H109V178" fill="#eed6ae"/><path d="M24 116L72 76L119 116Z" fill="#d89b81"/><rect x="60" y="137" width="23" height="41" rx="10" fill="#a8bd97"/>
      {[45,140,430,575].map((x,i)=><g key={x} transform={`translate(${x} ${286+i%2*22})`}><path d="M0 0V23M0 14L-10 7" stroke="#83a46c" strokeWidth="4"/><circle r="9" fill={i%2?'#e9b6af':'#f5df94'}/><circle r="3" fill="#fffae3"/></g>)}
    </>}
    {region === 'savanna' && <>
      <path d="M80 186V81M80 112L48 90M80 108L119 89" stroke="#9c8463" strokeWidth="11" strokeLinecap="round"/><path d="M14 83Q29 42 82 61Q127 34 150 82Q84 102 14 83" fill="#a7b77f"/>
      <path d="M505 147V79M505 98L532 72" stroke="#aa8d64" strokeWidth="8"/><ellipse cx="512" cy="70" rx="58" ry="21" fill="#b7bf86"/>
      <ellipse cx="533" cy="292" rx="74" ry="33" fill="#c9bd87"/><ellipse cx="533" cy="288" rx="61" ry="25" fill="#a0c9c5"/>
      <path d="M38 310l-5-16m5 16l6-21m309 17l-4-19m4 19l9-15" stroke="#b4a568" strokeWidth="4" fill="none"/>
    </>}
    {woodland && <>
      {[38,141,492,607].map((x,i)=><g key={x}><path d={`M${x} 199V65`} stroke="#a88d6d" strokeWidth={i%2?13:18}/><ellipse cx={x} cy={i%2?64:84} rx={i%2?45:62} ry={i%2?69:78} fill={i%2?'#a7c69a':'#91b68c'}/><path d={`M${x} 196V116`} stroke="#a88d6d" strokeWidth="11"/></g>)}
      <path d="M217 360Q211 261 304 198L331 205Q267 283 290 360" fill="#e2d5ad"/>
      {region === 'aviary' && <><path d="M81 247V174M561 255V170M62 174H125M527 170H582" stroke="#b09572" strokeWidth="9" strokeLinecap="round"/><path d="M277 87q12-14 24 0q12-14 24 0M379 53q8-10 16 0q8-10 16 0" fill="none" stroke="#a6b5a1" strokeWidth="4" strokeLinecap="round"/><path d="M418 170V124H452V170" fill="#e7cca2"/><path d="M410 127l25-23 25 23Z" fill="#cc9780"/><circle cx="435" cy="141" r="8" fill="#8b9275"/></>}
    </>}
    {region === 'coast' && <>
      <path d="M0 140Q126 164 167 251Q187 310 101 360H0Z" fill="#f3e3bb"/><path d="M444 137l68-35 58 8 70 54v50l-84-22-76 14Z" fill="#f4faf5"/><path d="M486 155l54-21 45 10-34 26Z" fill="#d8eaf0"/>
      {[193,301,458,564].map((x,i)=><path key={x} d={`M${x} ${235+i%2*71}q25 11 52 0`} stroke="#d9f0ed" strokeWidth="5" strokeLinecap="round" fill="none"/>)}
      <path d="M43 269l14-21 25 10 6 26Z" fill="#c0c9b7"/>
    </>}
    {region === 'bamboo' && <>
      {[24,53,98,502,548,592,627].map((x,i)=><g key={x}><path d={`M${x} 260V${i%2?0:24}`} stroke={i%2?'#88ad78':'#9cbb83'} strokeWidth="12"/>{[72,124,176,224].map(y=><path key={y} d={`M${x-6} ${y}h12`} stroke="#c8d9a7" strokeWidth="3"/>)}<path d={`M${x} 93q-40-53-45-15q16 17 45 15m0 55q45-63 47-18q-20 12-47 18`} fill="#8eae79"/></g>)}
      <path d="M273 360Q350 287 283 213L316 203Q403 285 341 360" fill="#e7ddbc"/>
      <ellipse cx="155" cy="306" rx="40" ry="17" fill="#b5c6a2"/>
    </>}
  </svg>;
}
