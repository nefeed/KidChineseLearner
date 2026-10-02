import { test, expect, type Page } from '@playwright/test';
import { createProfile, STORAGE_KEY } from '../src/store';

const url = process.env.PWA_TEST_URL ?? 'http://127.0.0.1:5173';
const engine = process.env.PWA_TEST_ENGINE === 'webkit' ? 'webkit' : 'chromium';
test.use({ browserName: engine, channel: engine === 'chromium' ? (process.env.PLAYWRIGHT_CHANNEL ?? 'chrome') : undefined,
  viewport: { width: 820, height: 1180 }, hasTouch: true });

async function openIsland(page: Page) {
  const profile = createProfile('安装体验测试');
  profile.settings.sound = false;
  profile.settings.music = false;
  const data = { version: 1, activeId: profile.id, profiles: [profile], savedAt: Date.now() };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: data });
  await page.goto(url);
  await expect(page.getByRole('button', { name: '我的小岛', exact: true })).toBeVisible();
}

  test.describe(`installation and fullscreen (${engine})`, () => {

    test('manifest, Apple metadata and every PNG load as usable installation assets', async ({ page }) => {
      await openIsland(page);
      await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
      expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
      const response = await page.request.get(new URL('/manifest.webmanifest', url).href);
      expect(response.ok()).toBe(true);
      const manifest = await response.json();
      expect(manifest).toMatchObject({ display: 'standalone', orientation: 'any', start_url: '/', scope: '/' });
      const images = [...manifest.icons.map((icon: { src: string; sizes: string }) => ({ src: icon.src, size: Number(icon.sizes.split('x')[0]) })),
        { src: '/icons/apple-touch-icon.png', size: 180 }, { src: '/icons/apple-touch-icon-167.png', size: 167 }];
      for (const icon of images) {
        const decoded = await page.evaluate(async ({ src }) => {
          const image = new Image(); image.src = src; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
          return { width: image.naturalWidth, height: image.naturalHeight, alpha: context.getImageData(0, 0, 1, 1).data[3] };
        }, icon);
        expect(decoded).toEqual({ width: icon.size, height: icon.size, alpha: 255 });
      }
      expect(await page.evaluate(() => 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(items => items.length) : 0)).toBe(0);
    });

    test('desktop user agent on a touch iPad gets Safari instructions and a compact control', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' });
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      });
      await openIsland(page);
      await expect(page.locator('.topbar .pwa-control')).toHaveCount(1);
      const size = (await page.locator('.pwa-control').boundingBox())!;
      expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44);
      await page.getByRole('button', { name: '添加到主屏幕', exact: true }).tap();
      const dialog = page.getByRole('dialog', { name: '把小岛放到主屏幕' });
      await expect(dialog).toContainText('在 Safari 中打开');
      await expect(dialog).toContainText('作为 Web App 打开');
      await expect(dialog.getByRole('button', { name: '全屏小岛', exact: true })).toHaveCount(0);
      for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }, { width: 375, height: 667 }]) {
        await page.setViewportSize(viewport);
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    });

    test('standalone windows hide the installation control and pageshow rechecks mode', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
      await openIsland(page);
      await expect(page.locator('.pwa-control')).toHaveCount(0);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
        window.dispatchEvent(new Event('pageshow'));
      });
      await expect(page.getByRole('button', { name: '添加到主屏幕', exact: true })).toBeVisible();
    });

    test('display-mode standalone also hides the control without Apple navigator fields', async ({ page }) => {
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = query => {
          const result = original(query);
          if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true });
          return result;
        };
      });
      await openIsland(page);
      await expect(page.locator('.pwa-control')).toHaveCount(0);
    });

    test('installation guide traps keyboard focus, closes with Escape and restores focus', async ({ page }) => {
      await openIsland(page);
      const entry = page.getByRole('button', { name: '添加到主屏幕', exact: true });
      await entry.click();
      const close = page.getByRole('button', { name: '关闭主屏幕指南', exact: true });
      const done = page.getByRole('button', { name: '知道啦', exact: true });
      await expect(close).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(done).toBeFocused();
      await page.keyboard.press('Tab'); await expect(close).toBeFocused();
      await page.keyboard.press('Escape'); await expect(page.locator('.pwa-guide')).toHaveCount(0); await expect(entry).toBeFocused();
    });

    test('a deferred native install prompt is invoked only by the install action', async ({ page }) => {
      await openIsland(page);
      const prevented = await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, { prompt: async () => document.documentElement.setAttribute('data-install-prompt', 'called'), userChoice: Promise.resolve({ outcome: 'accepted' }) });
        window.dispatchEvent(event); return event.defaultPrevented;
      });
      expect(prevented).toBe(true);
      await expect(page.locator('html')).not.toHaveAttribute('data-install-prompt', 'called');
      await page.getByRole('button', { name: '添加到主屏幕', exact: true }).click();
      await page.getByRole('button', { name: '安装小岛', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-install-prompt', 'called');
      await expect(page.locator('.pwa-guide')).toHaveCount(0);
    });

    test('fullscreen rejection keeps a useful installation fallback', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
        Element.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
      });
      await openIsland(page);
      await page.getByRole('button', { name: '添加到主屏幕', exact: true }).click();
      await page.getByRole('button', { name: '全屏小岛', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('这个浏览器暂时无法进入全屏');
      await expect(page.getByRole('button', { name: '知道啦', exact: true })).toBeVisible();
    });
  });

test.describe('actual Chromium fullscreen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('entering fullscreen retains one visible exit control and exits cleanly', async ({ page }) => {
    test.skip(engine !== 'chromium', 'Actual Fullscreen API test runs in Chromium; WebKit fallback is covered separately.');
    await openIsland(page);
    await page.getByRole('button', { name: '添加到主屏幕', exact: true }).click();
    await page.getByRole('button', { name: '全屏小岛', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(page.locator('.pwa-guide')).toHaveCount(0);
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await expect(page.getByRole('button', { name: '添加到主屏幕', exact: true })).toBeVisible();
  });
});
