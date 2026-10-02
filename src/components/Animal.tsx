import { useId } from 'react';

type Props = { species: string; size?: number; mood?: 'idle' | 'eat' | 'bath' | 'happy' };

/** Original round-bodied island animals, drawn from simple vector shapes. */
export default function Animal({ species, size = 120, mood = 'idle' }: Props) {
  const gradient = useId().replace(/:/g, '');
  const colors: Record<string, string> = {
    rabbit: '#ffe6ea', panda: '#fff9ed', fox: '#eda269', elephant: '#abcbd2', giraffe: '#f5d98b',
    lion: '#edc67e', tiger: '#f0b26d', koala: '#bfcbd2', penguin: '#454c68', dolphin: '#8dc8d9',
    turtle: '#9cc487', squirrel: '#cfa77f', deer: '#d4ae83', owl: '#bdaa8c', bear: '#b98d70',
    zebra: '#fff9ee', hippo: '#c2b1ce', rhino: '#b5c3c1', monkey: '#bc9170', hedgehog: '#b28e70',
    parrot: '#92c79a', cat: '#e7ba8f', dog: '#bd9472', pig: '#efb9c9',
  };
  const color = colors[species] ?? colors.rabbit;
  const longNeck = species === 'giraffe';
  const isBird = ['penguin', 'owl', 'parrot'].includes(species);
  const cy = longNeck ? 47 : 69;
  const eyeY = cy - 2;
  const cheeks = <><ellipse cx="48" cy={cy + 9} rx="7" ry="4" fill="#ee9aa1" opacity=".5" /><ellipse cx="91" cy={cy + 9} rx="7" ry="4" fill="#ee9aa1" opacity=".5" /></>;

  return <svg width={size} height={size} viewBox="0 0 140 140" className={`zoo-animal zoo-animal--${mood} zoo-animal--${species}`} aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".25"/><stop offset="1" stopColor="#634f46" stopOpacity=".1"/></linearGradient></defs>
    <ellipse cx="70" cy="129" rx="40" ry="7" fill="#4d7256" opacity=".12" />
    {species === 'squirrel' && <path d="M96 117C142 113 139 49 111 51C89 53 97 74 111 74C117 74 111 97 95 96" fill="#b38260" stroke="#8a694c" strokeWidth="3"/>}
    {species === 'fox' && <path d="M100 113Q139 102 120 71Q120 106 91 107Z" fill="#e99860" stroke="#a77650" strokeWidth="2"/>}
    {species === 'fox' && <path d="M120 71Q127 83 124 92L113 94Z" fill="#fff1dc"/>}
    {species === 'monkey' && <path d="M101 111Q132 119 128 91Q124 76 116 89" fill="none" stroke="#a17b5e" strokeWidth="9" strokeLinecap="round"/>}
    {species === 'cat' && <path d="M100 114Q128 113 122 89" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"/>}
    {species === 'hedgehog' && <path d="M31 110L21 99L31 95L23 82L35 81L30 66L43 70L44 54L55 65L64 49L73 65L84 51L88 68L103 62L101 78L117 77L109 92L121 101L105 113Z" fill="#937252"/>}
    {species === 'dolphin' ? <>
      <path d="M35 83Q39 37 81 45Q108 48 110 77L125 87L109 92Q103 116 77 122L60 113Q37 116 35 83Z" fill={color}/>
      <path d="M60 48L73 29L82 48M38 95L20 105L40 107M94 111L106 129L82 124" fill="#76b5c8"/>
      <path d="M46 88Q57 111 87 111Q68 126 47 106Z" fill="#d9f3f2"/>
    </> : <>
      <ellipse cx="70" cy="105" rx={species === 'turtle' ? 43 : 34} ry="23" fill={color}/>
      {longNeck && <rect x="57" y="49" width="25" height="58" rx="13" fill={color}/>}
      <ellipse cx="49" cy="121" rx="13" ry="8" fill={color}/><ellipse cx="92" cy="121" rx="13" ry="8" fill={color}/>
      {isBird && <><path d="M36 87Q18 99 34 116L47 98M104 87Q123 98 107 116L94 98" fill={species === 'parrot' ? '#75b09a' : color}/><ellipse cx="70" cy="108" rx="23" ry="17" fill="#fff4dd"/></>}
      {species === 'turtle' ? <>
        <ellipse cx="70" cy="104" rx="38" ry="23" fill="#789961" stroke="#4e7d59" strokeWidth="3"/>
        <path d="M70 82L83 93L80 109L61 111L54 96ZM34 100L54 96M80 109L98 117M83 93L105 99M61 111L48 123M70 82L69 121" fill="none" stroke="#b5d694" strokeWidth="3"/>
      </> : <ellipse cx="70" cy="105" rx="22" ry="17" fill={species === 'panda' ? '#414653' : '#fff6e8'} opacity={species === 'panda' ? 1 : .52}/>}
      {species === 'lion' && <path d="M70 26L80 34L96 32L102 43L117 49L115 62L124 76L115 88L114 103L98 104L88 118L75 110L58 116L47 106L31 104L28 89L19 77L27 63L26 49L41 43L47 31L61 34Z" fill="#b78951"/>}
      {species === 'rabbit' && <><ellipse cx="49" cy="31" rx="12" ry="29" transform="rotate(-13 49 31)" fill={color}/><ellipse cx="88" cy="30" rx="12" ry="29" transform="rotate(12 88 30)" fill={color}/><ellipse cx="49" cy="30" rx="5" ry="19" transform="rotate(-13 49 30)" fill="#efb8c3"/><ellipse cx="88" cy="29" rx="5" ry="19" transform="rotate(12 88 29)" fill="#efb8c3"/></>}
      {['fox', 'cat', 'tiger'].includes(species) && <><path d="M34 52L30 24L55 40M85 40L110 24L106 55" fill={color} stroke="#9b795c" strokeWidth="2"/><path d="M37 42L36 32L48 42M92 42L104 32L102 44" fill="#ecc3b0"/></>}
      {species === 'dog' && <><ellipse cx="33" cy="64" rx="14" ry="29" fill="#967451" transform="rotate(13 33 64)"/><ellipse cx="107" cy="64" rx="14" ry="29" fill="#967451" transform="rotate(-13 107 64)"/></>}
      {species === 'elephant' && <><ellipse cx="30" cy="70" rx="24" ry="29" fill={color}/><ellipse cx="110" cy="70" rx="24" ry="29" fill={color}/><ellipse cx="27" cy="71" rx="14" ry="20" fill="#c9dce0"/><ellipse cx="113" cy="71" rx="14" ry="20" fill="#c9dce0"/></>}
      {species === 'koala' && <><circle cx="31" cy="44" r="22" fill={color}/><circle cx="109" cy="44" r="22" fill={color}/><circle cx="31" cy="44" r="13" fill="#e4dfde"/><circle cx="109" cy="44" r="13" fill="#e4dfde"/></>}
      {['panda', 'bear', 'monkey', 'pig', 'hippo', 'rhino', 'squirrel', 'deer', 'giraffe', 'zebra'].includes(species) && <><ellipse cx="39" cy={cy - 28} rx="12" ry="13" fill={species === 'panda' ? '#414653' : color}/><ellipse cx="101" cy={cy - 28} rx="12" ry="13" fill={species === 'panda' ? '#414653' : color}/></>}
      {species === 'deer' && <path d="M44 46L36 19M37 27L24 24M39 36L49 25M96 46L104 19M103 27L116 24M101 36L91 25" fill="none" stroke="#937151" strokeWidth="5" strokeLinecap="round"/>}
      {species === 'giraffe' && <><path d="M54 23L52 11M86 23L88 11" stroke="#977347" strokeWidth="6" strokeLinecap="round"/><circle cx="51" cy="9" r="5" fill="#977347"/><circle cx="89" cy="9" r="5" fill="#977347"/></>}
      <ellipse cx="70" cy={cy} rx={species === 'hippo' ? 43 : 39} ry={species === 'owl' ? 35 : 33} fill={color}/>
      <ellipse cx="70" cy={cy} rx="39" ry="33" fill={`url(#${gradient})`}/>
      {species === 'penguin' && <path d="M40 73Q43 41 70 55Q96 41 100 74Q99 99 70 102Q41 99 40 73Z" fill="#fff9ef"/>}
      {species === 'fox' && <path d="M34 76L70 90L106 76Q93 103 70 102Q46 102 34 76Z" fill="#fff1dc"/>}
      {species === 'monkey' && <path d="M42 61Q48 40 70 53Q91 41 99 61Q100 87 70 98Q40 89 42 61Z" fill="#ead2b4"/>}
      {species === 'panda' && <><ellipse cx="50" cy="67" rx="13" ry="16" fill="#414653" transform="rotate(22 50 67)"/><ellipse cx="90" cy="67" rx="13" ry="16" fill="#414653" transform="rotate(-22 90 67)"/></>}
      {species === 'owl' && <><circle cx="50" cy="67" r="18" fill="#ede0c6"/><circle cx="90" cy="67" r="18" fill="#ede0c6"/><path d="M41 40L32 24L58 36M82 36L108 24L99 40" fill={color}/></>}
      {species === 'tiger' && <path d="M59 37L65 50L71 37M43 44L51 53M97 44L89 53M34 67L45 71M106 67L95 71M37 85L47 82M103 85L93 82" fill="none" stroke="#916749" strokeWidth="5" strokeLinecap="round"/>}
      {species === 'zebra' && <path d="M54 38L60 51M70 36L70 48M86 38L80 51M34 61L45 67M106 61L95 67M36 81L45 77M104 81L95 77M48 104L57 99M90 105L82 100" stroke="#525963" strokeWidth="5" strokeLinecap="round"/>}
      {species === 'giraffe' && <><circle cx="45" cy="47" r="6" fill="#c49c57"/><circle cx="91" cy="38" r="7" fill="#c49c57"/><circle cx="62" cy="84" r="5" fill="#c49c57"/><circle cx="75" cy="102" r="6" fill="#c49c57"/><circle cx="46" cy="105" r="5" fill="#c49c57"/></>}
      {species === 'deer' && <><circle cx="49" cy="102" r="3" fill="#fff1d7"/><circle cx="92" cy="103" r="3" fill="#fff1d7"/><circle cx="43" cy="111" r="3" fill="#fff1d7"/></>}
      {species === 'rhino' && <path d="M68 73L76 52L81 77Z" fill="#f7ead1" stroke="#b3ad9e" strokeWidth="2"/>}
      {species === 'hippo' && <ellipse cx="70" cy="83" rx="31" ry="17" fill="#d6c5dc"/>}
      {species === 'pig' && <><ellipse cx="70" cy="80" rx="20" ry="12" fill="#d791a7"/><circle cx="63" cy="80" r="3" fill="#9e657b"/><circle cx="77" cy="80" r="3" fill="#9e657b"/></>}
    </>}
    <g className="zoo-animal-eyes">
      {mood === 'happy' || mood === 'bath' ? <><path d={`M48 ${eyeY + 1}q6-8 12 0M80 ${eyeY + 1}q6-8 12 0`} fill="none" stroke="#524941" strokeWidth="3.5" strokeLinecap="round"/></> : <><ellipse cx="54" cy={eyeY} rx="3.5" ry="5" fill="#524941"/><ellipse cx="86" cy={eyeY} rx="3.5" ry="5" fill="#524941"/><circle cx="55" cy={eyeY - 2} r="1" fill="#fff"/><circle cx="87" cy={eyeY - 2} r="1" fill="#fff"/></>}
    </g>
    {cheeks}
    {species === 'elephant' ? <path d="M68 76Q74 90 70 106Q67 117 82 112" fill="none" stroke="#95b8c1" strokeWidth="13" strokeLinecap="round"/> : species === 'koala' ? <ellipse cx="70" cy="80" rx="9" ry="11" fill="#686875"/> : isBird ? <path d={`M62 ${cy + 7}L70 ${cy + 17}L78 ${cy + 7}Z`} fill="#e7b662"/> : species === 'pig' || species === 'rhino' ? null : <><path d={`M66 ${cy + 8}Q70 ${cy + 5}74 ${cy + 8}L70 ${cy + 12}Z`} fill="#856653"/><path d={`M70 ${cy + 13}q-5 7-10 1M70 ${cy + 13}q5 7 10 1`} fill="none" stroke="#856653" strokeWidth="2" strokeLinecap="round"/></>}
    {species === 'cat' && <path d="M35 79L19 76M36 84L20 87M105 79L121 76M104 84L120 87" stroke="#947963" strokeWidth="2" strokeLinecap="round"/>}
    {mood === 'eat' && <ellipse className="zoo-chew" cx="70" cy={cy + 20} rx="6" ry="4" fill="#9b6f60"/>}
    {mood === 'happy' && <path className="zoo-heart" d="M110 25C100 15 113 7 119 17C126 7 139 15 128 25L119 33Z" fill="#ed94aa"/>}
    {mood === 'bath' && <g fill="#fff" stroke="#addfe9" strokeWidth="1.5" opacity=".85"><circle cx="30" cy="27" r="8"/><circle cx="108" cy="23" r="6"/><circle cx="119" cy="42" r="10"/></g>}
  </svg>;
}
