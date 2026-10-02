import { Music2, Pause, Play, Volume1 } from 'lucide-react';
import { normalizeMusicVolume, type MusicStatus } from '../music-engine';
import '../music.css';

export interface MusicControlsProps {
  enabled: boolean; volume: number; sound: boolean; status: MusicStatus;
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onStart?: () => void;
}
export default function MusicControls({enabled,volume,sound,status,onEnabledChange,onVolumeChange,onStart}: MusicControlsProps) {
  const percentage = Math.round(normalizeMusicVolume(volume)*100);
  const hint = !sound?'所有声音已关闭，打开声音后再听音乐。':!enabled?'想听的时候，再打开小岛音乐。':status==='unavailable'?'这台设备暂时不能播放小岛音乐。':status==='paused'?'小岛音乐正在休息。':status==='waiting'?'点一下，让轻柔的旋律陪你。':'朗读时，音乐会轻轻变小。';
  return <div className="music-controls">
    <div className="music-controls-heading"><span className="music-controls-icon"><Music2 size={25}/></span><div><h3>轻柔的小岛音乐</h3><p>音乐盒与轻轻流动的和弦</p></div><button type="button" className={`music-controls-toggle ${enabled?'is-on':''}`} aria-label={enabled?'关闭小岛音乐':'打开小岛音乐'} aria-pressed={enabled} disabled={!sound} onClick={() => {onStart?.();onEnabledChange(!enabled);}}>{enabled?<Pause size={18}/>:<Play size={18}/>}<span>{enabled?'音乐已开':'打开音乐'}</span></button></div>
    <label className="music-controls-volume"><span><Volume1 size={18}/>音乐音量</span><input type="range" min="0" max="100" step="1" value={percentage} aria-label="小岛音乐音量" aria-valuetext={`${percentage}%`} disabled={!sound || !enabled} onPointerDown={onStart} onChange={event => onVolumeChange(Number(event.target.value)/100)}/><output>{percentage}%</output></label>
    <p className="music-controls-hint" role="status">{hint}</p>
  </div>;
}
