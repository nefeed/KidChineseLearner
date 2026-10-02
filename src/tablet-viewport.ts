import { useEffect, useState } from 'react';

/** CSS pixels, including Safari's currently available toolbar-free viewport. */
export function useTabletViewport() {
  const read = () => {
    if (typeof window === 'undefined') return { tablet: false, compact: false };
    const width = window.innerWidth;
    return { tablet: width >= 701 && width <= 1366, compact: window.innerHeight < 900 };
  };
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const resize = () => setViewport(read());
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, []);
  return viewport;
}
