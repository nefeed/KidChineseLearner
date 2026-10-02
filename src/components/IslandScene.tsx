export default function IslandScene({ night = false, compact = false }: { night?: boolean; compact?: boolean }) {
  return <svg className={`island-scene ${compact ? 'compact' : ''}`} viewBox="0 0 700 390" role="img" aria-label="绿树、小河与动物朋友的汉字小岛">
    <defs>
      <linearGradient id="sky" x2="0" y2="1"><stop stopColor={night ? '#e0e6fb' : '#dcefe0'} /><stop offset="1" stopColor="#f3f5d9"/></linearGradient>
      <linearGradient id="hill" x2="0.3" y2="1"><stop stopColor="#afd3a0"/><stop offset="1" stopColor="#7fb593"/></linearGradient>
      <linearGradient id="river" x2="0.5" y2="1"><stop stopColor="#a3d7d7"/><stop offset="1" stopColor="#79bbc9"/></linearGradient>
    </defs>
    <rect width="700" height="390" rx="32" fill="url(#sky)"/>
    <g className="cloud cloud-one" fill="#fff" opacity=".8"><ellipse cx="118" cy="64" rx="44" ry="17"/><circle cx="100" cy="54" r="21"/><circle cx="128" cy="47" r="27"/></g>
    <g className="cloud cloud-two" fill="#fff" opacity=".7"><ellipse cx="561" cy="86" rx="47" ry="15"/><circle cx="547" cy="74" r="24"/><circle cx="575" cy="76" r="18"/></g>
    <circle cx="493" cy="69" r="34" fill={night ? '#fffae4' : '#f8cb76'}/>
    <path d="M0 243Q100 123 215 181T437 172Q573 95 700 216V390H0Z" fill="#c6dfb6"/>
    <path d="M0 302Q75 163 246 224T512 216Q612 171 700 284V390H0Z" fill="url(#hill)"/>
    <ellipse cx="367" cy="334" rx="319" ry="81" fill="#78ad89" opacity=".2"/>
    <path d="M422 248Q370 267 424 287T400 326Q342 352 451 390H620Q476 348 503 317T499 273Q477 256 478 242Z" fill="url(#river)"/>
    <g fill="none" stroke="#d9efe9" strokeWidth="3" strokeLinecap="round" className="water-shimmer"><path d="M443 280h30m-15 40h27m-46 23h31m43 16h34"/></g>
    {[{x:120,y:200,s:1},{x:571,y:203,s:.9},{x:627,y:259,s:.7},{x:68,y:291,s:.75}].map((t,i)=><g key={i} transform={`translate(${t.x},${t.y}) scale(${t.s})`}><path d="M0 0V70" stroke="#966d55" strokeWidth="12" strokeLinecap="round"/><path d="M0-73Q-71-56-43-9Q-56 26 0 29Q61 26 45-12Q59-52 0-73Z" fill={i%2 ? '#5c9e7c' : '#70ac7e'}/><path d="M-19-39Q-28-16-10-7" stroke="#9ac59a" fill="none" strokeWidth="7" strokeLinecap="round"/></g>)}
    <g transform="translate(275 250)" className="bunny-bob"><ellipse cx="0" cy="66" rx="48" ry="12" fill="#537d61" opacity=".17"/><ellipse cx="-14" cy="-17" rx="12" ry="37" fill="#fffaf0" transform="rotate(-13)"/><ellipse cx="16" cy="-20" rx="12" ry="38" fill="#fffaf0" transform="rotate(10)"/><ellipse cx="-14" cy="-18" rx="5" ry="26" fill="#edb9ae" transform="rotate(-13)"/><ellipse cx="16" cy="-20" rx="5" ry="26" fill="#edb9ae" transform="rotate(10)"/><ellipse cy="40" rx="33" ry="31" fill="#fffaf0"/><circle cy="8" r="39" fill="#fffaf0"/><ellipse cx="-14" cy="7" rx="3.5" ry="5" fill="#3e4c44"/><ellipse cx="14" cy="7" rx="3.5" ry="5" fill="#3e4c44"/><circle cx="-24" cy="19" r="7" fill="#f1c3b5"/><circle cx="24" cy="19" r="7" fill="#f1c3b5"/><path d="M-4 18Q0 23 4 18M0 22V27" fill="none" stroke="#976f65" strokeWidth="2.5" strokeLinecap="round"/><path d="M24 44l36-12-21 32Z" fill="#e9935f"/><path d="M54 34l8-16m-9 16 0-18m2 15 14-10" stroke="#5a9b68" strokeWidth="5" strokeLinecap="round"/></g>
    <g transform="translate(394 217) rotate(9)" className="letter-float"><rect width="78" height="91" rx="18" fill="#e8b58b"/><rect x="-3" y="-7" width="78" height="91" rx="18" fill="#fff9e7"/><text x="36" y="55" textAnchor="middle" fontSize="48" fill="#537d63" fontFamily="serif">字</text></g>
    <g transform="translate(214 119) rotate(-12)" className="butterfly"><path d="M0 0Q-28-31-36-8Q-41 16 0 6Q35 24 33-1Q32-27 0 0Z" fill="#e8a18c"/><path d="M0-4V13" stroke="#826c56" strokeWidth="4" strokeLinecap="round"/></g>
    {[90,160,340,583,654].map((x,i)=><g key={x} transform={`translate(${x},${345-i%2*31})`}><path d="M0 0V14m0-6-7-6m7 3 7-7" stroke="#648e65" strokeWidth="2"/><circle r="5" fill={i%2 ? '#faf3bb' : '#eead98'}/><circle cx="5" r="5" fill={i%2 ? '#faf3bb' : '#eead98'}/><circle cx="2" cy="-5" r="5" fill={i%2 ? '#faf3bb' : '#eead98'}/><circle cx="2" cy="-1" r="3" fill="#ddb668"/></g>)}
  </svg>;
}
