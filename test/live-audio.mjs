import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { NARRATION } from '../src/narration-data.js';

const browserName = process.env.TEST_BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
if (!engine) throw new Error('Unknown TEST_BROWSER');
const browser = await engine.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE
  || (browserName === 'chromium' ? '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' : engine.executablePath()) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('.mp3')) requests.push(r.url()); });
  await page.addInitScript(() => {
    const OriginalAudio = Audio;
    window.__media = [];
    window.Audio = function (...args) { const a = new OriginalAudio(...args); window.__media.push(a); return a; };
  });
  const target = process.env.TEST_URL || 'http://127.0.0.1:8765/';
  const offline = target.startsWith('file:');
  // Linux WebKit's offline emulation rejects file:// navigation itself. For
  // that engine block all HTTP(S) routes instead and record the exact method.
  const offlineMethod = !offline ? null : browserName === 'webkit' ? 'block-http-routes' : 'browser-offline';
  if (offlineMethod === 'block-http-routes') await page.route(/^https?:\/\//, (route) => route.abort());
  else if (offline) await page.context().setOffline(true);
  await page.goto(target, { waitUntil: 'networkidle' });
  assert.equal(requests.length, 0, 'no audio download before a user action');
  await page.locator('#btnPlay').click();
  try {
    await page.waitForFunction(() => window.__media[0].currentTime > .8, null, { timeout: 15000, polling: 100 });
  } catch (error) {
    const failure = await page.evaluate(() => ({
      status: document.querySelector('#playStatus').textContent,
      message: document.querySelector('#audioErrorText').textContent,
      media: window.__media.map((a) => ({ src: a.currentSrc, time: a.currentTime, ready: a.readyState,
        paused: a.paused, error: a.error?.message })),
    })).catch(() => ({ pageClosed: true }));
    console.log(JSON.stringify({ failure, errors }));
    throw error;
  }
  const measurement = await page.evaluate(() => ({ duration: window.__media[0].duration,
    time: window.__media[0].currentTime, slider: Number(document.querySelector('#clipSeek').value),
    status: document.querySelector('#playStatus').textContent, source: window.__media[0].currentSrc }));
  assert.ok(Math.abs(measurement.time - measurement.slider) <= .1);
  assert.ok(measurement.source.endsWith('/' + NARRATION['act-I'].file), 'browser must use the current audio asset, not a stale bundle');
  assert.ok(Math.abs(measurement.duration - NARRATION['act-I'].duration) < .12);
  assert.match(measurement.status, /AI 合成/);
  assert.ok(requests.length <= 2, 'only current clip and one next clip loaded');
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.__media[0].currentTime);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__media[0].currentTime);
  assert.equal(after, before);
  assert.deepEqual(errors, []);
  await mkdir(new URL('../work/browser/', import.meta.url), { recursive: true });
  const name = (target.startsWith('file:') ? 'offline' : 'live') + (browserName === 'chromium' ? '' : `-${browserName}`);
  await page.screenshot({ path: new URL(`../work/browser/${name}-audio.png`, import.meta.url).pathname });
  const report = { target, browserName, offline, offlineMethod, measurement, audioRequests: requests.length, errors };
  await writeFile(new URL(`../work/browser/${name}-audio.json`, import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
