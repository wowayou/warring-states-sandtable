import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NARRATION } from '../src/narration-data.js';

const engineName = process.env.TEST_BROWSER || 'chromium';
const engine = { chromium, webkit }[engineName];
if (!engine) throw new Error('Unknown storyboard test browser');
const browser = await engine.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE
  || (engineName === 'chromium' ? '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' : engine.executablePath()) });
const out = new URL(`../work/revision-2/visual-check/${engineName === 'webkit' ? 'webkit/' : ''}`, import.meta.url);
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], samples = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 5000, polling: 100 });
  await page.evaluate(() => {
    // Settle is a decorative initial blur; this test isolates map rendering.
    // Finish that CSS effect without disabling narrative camera/route motion.
    for (const animation of document.querySelector('#table').getAnimations()) {
      if (animation.animationName === 'settle') animation.finish();
    }
  });
  await page.evaluate(async () => {
    const { SandTable } = await import('/src/table.js');
    const draw = SandTable.prototype.draw;
    SandTable.prototype.draw = function (...args) {
      const result = draw.apply(this, args);
      window.__storyView = { view: { ...this.view }, boardView: { ...this.boardView }, year: this.year,
        targets: this.narrationCue?.targets.map((p) => p.label), cue: this.narrationCue?.index,
        elapsed: this.narrationCue?.elapsed, frozen: this.frozen,
        routeStep: this.playback?.step, routeProgress: this.playback?.progress };
      return result;
    };
  });
  await page.locator('#btnPlay').click();
  await page.waitForFunction(() => Number(document.querySelector('#clipSeek').value) > .5);
  await page.locator('#btnPlay').click();

  async function seek(time, name) {
    await page.locator('#clipSeek').evaluate((el, time) => { el.value = String(time); el.dispatchEvent(new Event('input', { bubbles: true })); }, time);
    await page.waitForTimeout(120);
    const data = await page.evaluate(() => window.__storyView);
    // Compare the canvas bitmap itself. WebKit's element screenshot includes
    // a composited 1px edge from the overlapping footer shadow, which is not
    // part of the map and can differ while the entire map bitmap is identical.
    const raster = await page.locator('#table').evaluate((canvas) => canvas.toDataURL('image/png'));
    const bitmap = Buffer.from(raster.split(',')[1], 'base64');
    data.pixels = createHash('sha256').update(bitmap).digest('hex');
    await writeFile(new URL(`${name}-canvas.png`, out), bitmap);
    data.time = time; data.name = name;
    await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
    samples.push(data);
    await writeFile(new URL('samples-in-progress.json', out), JSON.stringify({ samples, errors }, null, 2));
    return data;
  }
  const opening = NARRATION['act-I'];
  const earlyTime = Math.min(1, opening.sentences[0].end * .4);
  const middleCue = opening.sentences[Math.floor(opening.sentences.length / 2)];
  const lateCue = opening.sentences.at(-1);
  const middleTime = middleCue.start + (middleCue.end - middleCue.start) * .6;
  const lateTime = lateCue.start + (lateCue.end - lateCue.start) * .65;
  const early = await seek(earlyTime, 'opening-early');
  const middle = await seek(middleTime, 'opening-middle');
  const late = await seek(lateTime, 'opening-late');
  assert.notEqual(early.pixels, middle.pixels, 'opening map actually changes pixels');
  assert.notEqual(middle.pixels, late.pixels);
  assert.notDeepEqual(early.targets, late.targets, 'visual attention follows different narrated places');
  assert.ok(late.targets.includes('吴') || late.targets.includes('越'));
  const restored = await seek(earlyTime, 'opening-restored');
  assert.deepEqual(restored.view, early.view, 'backward seek restores camera');
  assert.equal(restored.pixels, early.pixels, 'backward seek restores map pixels');
  await page.waitForTimeout(400);
  const frozen = await page.evaluate(() => window.__storyView);
  assert.deepEqual(frozen.view, restored.view);

  await page.locator('#btnCinema').click();
  await seek(Math.max(5, middleTime), 'opening-cinema');
  assert.equal(await page.locator('#actCard').isVisible(), false, 'opening title must not cover whole narration');
  assert.equal(await page.locator('#caption').isVisible(), true);
  await page.keyboard.press('Escape');

  await page.locator('#chron .evt').filter({ hasText: '越徙都琅琊' }).click();
  await page.waitForFunction(() => document.querySelector('#playText').textContent === '暂停');
  await page.locator('#btnPlay').click();
  const eventEarly = await seek(.4, 'lore-early');
  const locationCue = NARRATION['lore-005'].sentences.find((cue) => cue.text.includes('琅琊'));
  const eventLater = await seek(locationCue.start + (locationCue.end - locationCue.start) * .8, 'lore-later');
  assert.ok(eventLater.targets.includes('琅琊'));
  assert.notDeepEqual(eventEarly.view, eventLater.view);
  assert.notEqual(eventEarly.pixels, eventLater.pixels);
  assert.equal(eventEarly.year, eventLater.year, 'camera never fabricates a new historical year');

  await page.locator('#chron .evt[data-battle="changping"]').click();
  await page.waitForFunction(() => document.querySelector('#playText').textContent === '暂停');
  await page.locator('#btnPlay').click();
  await page.locator('#capDots button[data-part="1"]').click();
  const routeStart = await seek(.3, 'battle-start');
  const routeLater = await seek(NARRATION['battle-changping-step-1'].duration * .75, 'battle-later');
  assert.equal(routeStart.targets, undefined, 'storyboard releases control during battles');
  assert.ok(routeLater.routeProgress > routeStart.routeProgress);
  assert.notEqual(routeStart.pixels, routeLater.pixels, 'army route visibly advances');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#acts [data-act="0"]').click();
  await page.locator('#btnPlay').click();
  await seek(lateTime, 'mobile-opening');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', out), JSON.stringify({ samples, errors }, null, 2));
  console.log(JSON.stringify({ samples: samples.length, checks: 'Opening, ordinary event and battle pixels move; pause and backward seek restore the exact view.', errors }));
} finally { await browser.close(); }
