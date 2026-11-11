import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SCENES } from '../src/narration.js';

const browserName = process.env.TEST_BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
if (!engine) throw new Error('TEST_BROWSER must be chromium, firefox or webkit');
const executablePath = process.env.BROWSER_EXECUTABLE || (browserName === 'chromium'
  ? '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' : engine.executablePath());
const browser = await engine.launch({ executablePath, headless: true });
const out = new URL(`../work/browser/${browserName === 'chromium' ? '' : browserName + '/'}`, import.meta.url);
await mkdir(out, { recursive: true });
const failures = [];
const checks = [];
// A real short WAV makes deterministic media tests independent of voice generation.
const samples = 24000 * 6;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / 24000) * 100), 44 + i * 2);
const recordings = Object.fromEntries(SCENES.flatMap((s) => s.parts).filter((p) => !p.silent).map((p) => [p.id,
  { text: p.text, file: `test-tone.wav?clip=${p.id}`, duration: 6, sentences: [{ text: p.text, start: 0, end: 6 }] }]));

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => failures.push(e.message));
  await page.addInitScript(() => {
    const AudioClass = window.Audio;
    window.__testAudio = [];
    window.Audio = function (...args) { const a = new AudioClass(...args); window.__testAudio.push(a); return a; };
  });
  await page.route('**/src/narration-data.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: `export const NARRATION = ${JSON.stringify(recordings)};` }));
  await page.route('**/test-tone.wav?*', (route) => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { SandTable } = await import('/src/table.js');
    const draw = SandTable.prototype.drawPlayback;
    window.__syncErrors = [];
    SandTable.prototype.drawPlayback = function (...args) {
      const a = window.__testAudio[0];
      if (this.playback.step >= 0 && !a.paused && !a.seeking && a.readyState >= 2 && !this.frozen)
        window.__syncErrors.push(Math.abs(this.playback.progress * 6 - a.currentTime));
      return draw.apply(this, args);
    };
  });
  assert.equal(await page.locator('#chron .evt').count(), 101);
  await page.screenshot({ path: new URL('desktop-idle.png', out).pathname });

  await page.locator('#btnPlay').click();
  await page.waitForFunction(() => document.querySelector('#playStatus').textContent.includes('AI 合成'));
  await page.waitForFunction(() => Number(document.querySelector('#clipSeek').value) > .5);
  await page.locator('#btnPlay').click();
  const frozen = await page.locator('#clipSeek').inputValue();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#clipSeek').inputValue(), frozen);
  checks.push('audio playback and synchronized pause');
  await page.locator('#btnPlay').click();
  await page.locator('#btnSpeed').selectOption('2');
  await page.waitForFunction(() => document.querySelector('#capName').textContent === '铁耕之世');
  checks.push('opening year is narrated');

  await page.locator('#chron .evt[data-battle="changping"]').click();
  await page.waitForFunction(() => document.querySelector('#capName').textContent === '长平之战');
  await page.locator('#capDots button[data-part="2"]').click();
  assert.equal(await page.locator('#capDots button[aria-current="step"]').textContent(), '2');
  await page.waitForFunction(() => Number(document.querySelector('#clipSeek').value) > .4);
  await page.waitForTimeout(600);
  await page.locator('#btnPlay').click();
  await page.screenshot({ path: new URL('desktop-battle.png', out).pathname });
  checks.push('battle step selection and pause');
  const syncErrors = await page.evaluate(() => window.__syncErrors);
  assert.ok(syncErrors.length >= 10);
  assert.ok(Math.max(...syncErrors) <= .1, `media / route mismatch: ${Math.max(...syncErrors)}`);
  checks.push(`media / route clock: ${syncErrors.length} samples, maximum ${(Math.max(...syncErrors) * 1000).toFixed(1)}ms`);
  await page.locator('#capDots button[data-part="1"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#capDots button[data-part="1"]').evaluate((e) => document.activeElement === e), true);
  checks.push('keyboard step selection retains focus');

  await page.locator('#btnReturn').click();
  await page.waitForFunction(() => document.querySelector('#capName').textContent === '铁耕之世');
  await page.locator('#btnPlay').click();
  await page.locator('#btnZoomIn').click();
  assert.equal(await page.locator('#btnReturn').isVisible(), true);
  assert.match(await page.locator('#playStatus').textContent(), /自由探索/);
  await page.locator('#ruler').focus();
  await page.keyboard.press('End');
  await page.locator('#btnNext').click();
  assert.equal(await page.locator('#yearBig').textContent(), '前221');
  assert.equal(await page.locator('#capName').textContent(), '灭齐·不战而下');
  checks.push('navigation during exploration follows the newly selected year');
  await page.locator('#btnReturn').click();
  assert.equal(await page.locator('#capName').textContent(), '铁耕之世');
  checks.push('explore and restore original narration');

  await page.locator('#btnPlay').click();
  const before = await page.locator('#clipSeek').inputValue();
  await page.locator('#btnCinema').click();
  assert.equal(await page.locator('#clipSeek').inputValue(), before);
  await page.screenshot({ path: new URL('desktop-cinema.png', out).pathname });
  await page.keyboard.press('Escape');
  checks.push('cinema keeps paused progress');

  await page.locator('#chron .evt').first().click();
  assert.match(await page.locator('#capYear').textContent(), /前479.*地图前475/);
  await page.locator('#btnPlay').click();
  checks.push('out-of-range historical event does not fabricate map state');

  await page.route('**/test-tone.wav?*', (route) => route.abort());
  await page.locator('#chron .evt[data-battle="eyu"]').click();
  await page.locator('#audioError').waitFor({ state: 'visible' });
  assert.match(await page.locator('#playStatus').textContent(), /不可用/);
  await page.locator('#btnSilent').click();
  await page.waitForFunction(() => document.querySelector('#playStatus').textContent === '无声演示');
  checks.push('failed media remains paused until explicit silent continuation');

  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 844 });
    if (await page.locator('#playText').textContent() === '暂停') await page.locator('#btnPlay').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL(`width-${width}.png`, out).pathname, fullPage: true });
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(sizes.scroll <= sizes.viewport, `horizontal overflow at ${width}`);
    const capBox = await page.locator('#caption').boundingBox();
    const footerBox = await page.locator('.ruler-wrap').boundingBox();
    assert.ok(capBox.y + capBox.height <= footerBox.y, `caption hidden behind transport at ${width}`);
    const zoomBox = await page.locator('#btnZoomIn').boundingBox();
    assert.ok(zoomBox.y + zoomBox.height <= capBox.y || zoomBox.x >= capBox.x + capBox.width,
      `zoom button overlaps narration at ${width}`);
    await page.locator('#btnCinema').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL(`cinema-${width}.png`, out).pathname });
    await page.keyboard.press('Escape');
    checks.push(`responsive ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#chron .evt').last().click();
  await page.locator('#btnFromHere').click();
  await page.waitForFunction(() => document.querySelector('#playStatus').textContent === '本次讲解结束', null, { timeout: 25000 });
  assert.equal(await page.locator('#capName').textContent(), '铸十二金人');
  assert.equal(await page.locator('#yearBig').textContent(), '前221');
  checks.push('all final-year events complete before stopping');
  await page.locator('#btnZoomIn').click();
  await page.locator('#btnFromHere').click();
  assert.equal(await page.locator('#yearBig').textContent(), '前221');
  checks.push('explicit start here after completion keeps the selected year');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#playText').textContent(), '继续');
  checks.push('visibilitychange handler freezes transport (synthetic event)');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#acts [data-act="1"]').click();
  await page.locator('#btnCinema').click();
  await page.locator('#btnPlay').click();
  const reduced = await page.locator('.card-title').evaluate((e) => ({ opacity: getComputedStyle(e).opacity, animation: getComputedStyle(e).animationName }));
  assert.equal(reduced.opacity, '1'); assert.equal(reduced.animation, 'none');
  await page.screenshot({ path: new URL('reduced-motion.png', out).pathname });
  checks.push('reduced motion keeps chapter title visible');
  assert.deepEqual(failures, []);
  await writeFile(new URL('checks.json', out), JSON.stringify({ checks, pageErrors: failures }, null, 2));
  console.log(JSON.stringify({ checks, pageErrors: failures }, null, 2));
} finally { await browser.close(); }
