import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicEngine, type MusicOptions, type MusicStatus } from './music-engine';

export interface UseMusicOptions extends MusicOptions { profileId?: string }

export function useMusic(options: UseMusicOptions) {
  const [status,setStatus] = useState<MusicStatus>(options.enabled?'waiting':'off');
  const engine = useRef<MusicEngine | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const player = new MusicEngine({onStatus:setStatus});
    engine.current = player;
    const sync = () => player.configure({...latest.current,paused:latest.current.paused || document.hidden});
    const gesture = (event: Event) => {
      if (!event.isTrusted) return;
      if (!player.isUnlocked || player.status==='waiting') player.unlock();
    };
    sync();
    window.addEventListener('pointerdown',gesture,{capture:true,passive:true});
    window.addEventListener('keydown',gesture,{capture:true});
    document.addEventListener('visibilitychange',sync);
    const pageHide = () => player.configure({...latest.current,paused:true});
    window.addEventListener('pagehide',pageHide);
    window.addEventListener('pageshow',sync);
    return () => {
      window.removeEventListener('pointerdown',gesture,{capture:true});
      window.removeEventListener('keydown',gesture,{capture:true});
      document.removeEventListener('visibilitychange',sync);
      window.removeEventListener('pagehide',pageHide);
      window.removeEventListener('pageshow',sync);
      player.dispose();
      if (engine.current===player) engine.current=null;
    };
  },[]);
  useEffect(() => {
    engine.current?.configure({...options,paused:options.paused || document.hidden});
  },[options.enabled,options.volume,options.speaking,options.paused,options.profileId]);

  const start = useCallback(() => engine.current?.unlock(),[]);
  return {status,start};
}
