import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Share, SquarePlus, X } from 'lucide-react';
import { usePwaExperience } from '../pwa';
import '../pwa.css';

/** Place once among the topbar controls; installed app windows hide installation guidance. */
export default function PwaControls() {
  const { standalone, fullscreen, appleTouch, canFullscreen, canInstall, install, toggleFullscreen } = usePwaExperience();
  const [guide, setGuide] = useState(false);
  const [notice, setNotice] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!guide) return;
    // Safari does not focus buttons on a pointer click; retain the actual opener.
    const previous = trigger.current ?? document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const capture = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setGuide(false);
      } else if (event.key === 'Tab') {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', capture, true);
    return () => { window.removeEventListener('keydown', capture, true); previous?.focus(); };
  }, [guide]);

  async function showInstall() {
    if (await install()) setGuide(false);
  }

  async function changeFullscreen() {
    if (await toggleFullscreen()) setGuide(false);
    else {
      setNotice('这个浏览器暂时无法进入全屏。可以把小岛添加到主屏幕，再从图标打开。');
      setGuide(true);
    }
  }

  return <>
    {(!standalone || fullscreen) && <button ref={trigger} className="icon-button pwa-control" aria-label={fullscreen ? '退出全屏' : '添加到主屏幕'} title={fullscreen ? '退出全屏' : '安装与全屏'} onClick={() => {
      if (fullscreen) void changeFullscreen();
      else { setNotice(''); setGuide(true); }
    }}>{fullscreen ? <Minimize2 size={20}/> : <SquarePlus size={20}/>}</button>}
    {guide && <div className="pwa-guide-backdrop" onClick={() => setGuide(false)}>
      <div className="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title" aria-describedby="pwa-guide-description" ref={panel} onClick={event => event.stopPropagation()}>
        <button className="icon-button pwa-guide-close" aria-label="关闭主屏幕指南" onClick={() => setGuide(false)}><X size={20}/></button>
        <span className="pwa-guide-mark" aria-hidden="true">字</span>
        <h2 id="pwa-guide-title">把小岛放到主屏幕</h2>
        <p id="pwa-guide-description">下次点一下小岛图标，就能打开自己的学习小天地。</p>
        {notice && <p className="pwa-guide-notice" role="status">{notice}</p>}
        {appleTouch ? <ol>
          <li>在 Safari 中打开字游小岛。</li>
          <li>点 <Share size={16} aria-hidden="true"/>「分享」，找到「添加到主屏幕」。有些版本需要先点「更多」。</li>
          <li>若有「作为 Web App 打开」选项，请保持开启，再点「添加」。</li>
          <li>回到主屏幕，从「字游小岛」图标打开。</li>
        </ol> : <ol>
          <li>打开浏览器菜单，找到「安装应用」或「添加到主屏幕」。</li>
          <li>若浏览器没有安装选项，可以先使用全屏按钮；在 iPad 上也可以用 Safari 添加到主屏幕。</li>
        </ol>}
        <p className="pwa-guide-connection">使用时请让 iPad 和电脑连接同一 Wi-Fi，并保持电脑上的小岛服务运行。</p>
        <p className="pwa-guide-progress">若已在浏览器学习过，可以先在家长小屋导出进度，再到主屏幕小岛里导入。</p>
        <div className="pwa-guide-actions">
          {canInstall && <button className="secondary-button" onClick={() => void showInstall()}><SquarePlus size={18} aria-hidden="true"/>安装小岛</button>}
          {canFullscreen && <button className="secondary-button" onClick={() => void changeFullscreen()}>{fullscreen ? <Minimize2 size={18} aria-hidden="true"/> : <Maximize2 size={18} aria-hidden="true"/>}{fullscreen ? '退出全屏' : '全屏小岛'}</button>}
        </div>
        <button className="primary-button" onClick={() => setGuide(false)}>知道啦</button>
      </div>
    </div>}
  </>;
}
