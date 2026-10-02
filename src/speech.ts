import { useCallback, useEffect, useRef, useState } from 'react';
import { isMandarinVoice, NarrationPlayer, type NarrationMethod, type NarrationOptions, type NarrationSnapshot } from './narration-player';

export function useSpeech(enabled: boolean,rate: number) {
  const [voices,setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking,setSpeaking] = useState(false);
  const [method,setMethod] = useState<NarrationMethod>(null);
  const [notice,setNotice] = useState('');
  const [catalog,setCatalog] = useState<Record<string,string>>({});
  const [defaultPlaybackRate,setDefaultPlaybackRate] = useState<number | undefined>();
  const snapshot = useRef<NarrationSnapshot>({enabled,rate,catalog,voices,defaultPlaybackRate});
  snapshot.current = {enabled,rate,catalog,voices,defaultPlaybackRate};
  const player = useRef<NarrationPlayer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/audio/manifest.json',{signal:controller.signal}).then(response => response.ok?response.json():null).then(manifest => {
      if (manifest?.files && typeof manifest.files==='object') setCatalog(manifest.files);
      if (Number.isFinite(manifest?.defaultPlaybackRate) && manifest.defaultPlaybackRate>0) setDefaultPlaybackRate(manifest.defaultPlaybackRate);
    }).catch(() => {});
    return () => controller.abort();
  },[]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices().filter(isMandarinVoice));
    refresh();window.speechSynthesis.addEventListener('voiceschanged',refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged',refresh);
  },[]);
  useEffect(() => {
    const playback = new NarrationPlayer({snapshot:() => ({...snapshot.current,hidden:document.hidden}),onState:state => {
      setSpeaking(state.speaking);setMethod(state.method);setNotice(state.notice);
    }});
    player.current = playback;
    const hidden = () => {if(document.hidden)playback.stop();};
    const pageHide = () => playback.stop();
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('pagehide',pageHide);
    return () => {
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('pagehide',pageHide);
      playback.dispose();if(player.current===playback)player.current=null;
    };
  },[]);
  const stop = useCallback(() => player.current?.stop(),[]);
  const speak = useCallback((text: string,audioPath?: string,fallbackText = text,options: NarrationOptions = {}): Promise<boolean> =>
    player.current?.speak(text,audioPath,fallbackText,options) ?? Promise.resolve(false),[]);
  const preload = useCallback((texts: readonly string[]) => player.current?.preload(texts),[]);
  const clearNotice = useCallback(() => player.current?.clearNotice(),[]);
  useEffect(() => {if(!enabled)stop();},[enabled,stop]);
  return {speak,stop,preload,speaking,method,notice,clearNotice,voiceAvailable:voices.length>0 || Object.keys(catalog).length>0,systemVoiceAvailable:voices.length>0};
}
