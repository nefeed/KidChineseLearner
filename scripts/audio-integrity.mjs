// Structural validation shared by synthesis and the independent coverage audit.
function atoms(buffer,start=0,end=buffer.length){
  const result=[];
  while(start<end){
    if(start+8>end)throw Error('truncated atom header');
    let size=buffer.readUInt32BE(start),header=8;
    const type=buffer.toString('ascii',start+4,start+8);
    if(size===1){if(start+16>end)throw Error('truncated large atom');size=Number(buffer.readBigUInt64BE(start+8));header=16;}
    if(size===0)size=end-start;
    if(size<header||start+size>end)throw Error('invalid atom length');
    result.push({type,start,data:start+header,end:start+size});start+=size;
  }
  return result;
}
export function inspectAAC(bytes){
  const top=atoms(bytes);
  if(!top.some(a=>a.type==='ftyp')||!top.some(a=>a.type==='mdat'&&a.end-a.data>10))throw Error('missing audio payload');
  const moov=top.find(a=>a.type==='moov');if(!moov)throw Error('missing finalized movie header');
  const mvhd=atoms(bytes,moov.data,moov.end).find(a=>a.type==='mvhd');if(!mvhd)throw Error('missing duration');
  const version=bytes[mvhd.data];
  if(version!==0&&version!==1)throw Error('unsupported duration header');
  const scale=bytes.readUInt32BE(mvhd.data+(version===1?20:12));
  const ticks=version===1?Number(bytes.readBigUInt64BE(mvhd.data+24)):bytes.readUInt32BE(mvhd.data+16);
  if(!scale||!ticks||!bytes.includes(Buffer.from('mp4a')))throw Error('invalid AAC track');
  return ticks/scale;
}
