import { useCallback, useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function isAppleTouchDevice(device: { userAgent: string; platform: string; maxTouchPoints: number }): boolean {
  return /iPad|iPhone|iPod/.test(device.userAgent)
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
}

function standaloneWindow(): boolean {
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    || window.matchMedia('(display-mode: standalone)').matches;
}

export function usePwaExperience() {
  const [standalone, setStandalone] = useState(standaloneWindow);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const appleTouch = isAppleTouchDevice(navigator);
  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const updateMode = () => setStandalone(standaloneWindow());
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const installed = () => { setInstallPrompt(null); updateMode(); };
    if (media.addEventListener) media.addEventListener('change', updateMode);
    else media.addListener(updateMode);
    document.addEventListener('fullscreenchange', updateFullscreen);
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('pageshow', updateMode);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', updateMode);
      else media.removeListener(updateMode);
      document.removeEventListener('fullscreenchange', updateFullscreen);
      window.removeEventListener('beforeinstallprompt', captureInstall);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('pageshow', updateMode);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    try {
      await installPrompt.prompt();
      return (await installPrompt.userChoice).outcome === 'accepted';
    } catch {
      return false;
    } finally {
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (canFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      else return false;
      return true;
    } catch {
      return false;
    }
  }, [canFullscreen]);

  return { standalone, fullscreen, appleTouch, canFullscreen, canInstall: Boolean(installPrompt), install, toggleFullscreen };
}
