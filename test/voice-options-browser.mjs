import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { verifyVoiceOptions } from '../tools/verify-voice-options.mjs';
import { readPronunciationNotes } from '../tools/build-sharing-pages.mjs';
import { NARRATION } from '../src/narration-data.js';

const browserName = process.env.TEST_BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
if (!engine) throw new Error('Unknown TEST_BROWSER');
const browser = await engine.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE
  || (browserName === 'chromium' ? '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' : engine.executablePath()) });
const target = process.env.TEST_URL || 'http://127.0.0.1:8765/';
const offline = target.startsWith('file:');
const localReview = process.argv.includes('--local-review');
const out = new URL('../work/multi-voice/browser/', import.meta.url);
const name = `${browserName}-${offline ? 'offline' : 'http'}${localReview ? '-draft' : ''}`;
const errors = [], checks = [];
try {
  const manifest = await verifyVoiceOptions({ localReview });
  const notes = await readPronunciationNotes();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(12000);
  await context.addInitScript(() => {
    const RealAudio = window.Audio;
    window.__auditionMainMedia = [];
    window.Audio = function (...args) { const audio = new RealAudio(...args); window.__auditionMainMedia.push(audio); return audio; };
  });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  if (offline && browserName === 'webkit') await context.route(/^https?:\/\//, (route) => route.abort());
  else if (offline) await context.setOffline(true);
  const page = await context.newPage();
  const requestedAudio = [];
  page.on('request', (request) => { if (request.url().includes('.mp3')) requestedAudio.push(request.url()); });
  await page.goto(new URL('voices/index.html', target).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('audio').count(), manifest.clips.length + 1);
  assert.equal(requestedAudio.length, 0, 'audition page must not download audio until requested');
  assert.match(await page.locator('main').textContent(), /短样.*尚未应用/);
  checks.push('clearly labelled alternatives, default voice retained, no initial MP3 download');
  if (localReview) {
    assert.match(await page.locator('.review-warning').textContent(), /本地试听草稿/);
    assert.equal(await page.locator('.voice-card details').count(), manifest.clips.filter((clip) => clip.check.needsContentReview).length);
    checks.push('pending local voices explicitly disclose their reading disagreements');
  } else assert.equal(await page.locator('.review-warning').count(), 0);

  if (!offline) {
    const delayed = await context.newPage();
    await delayed.route(`**/${manifest.clips[0].file}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (!delayed.isClosed()) await route.continue().catch(() => {});
    });
    await delayed.goto(new URL('voices/index.html', target).href, { waitUntil: 'networkidle' });
    await delayed.locator('.voice-card .audition').first().click();
    assert.ok(await delayed.locator('.voice-card audio').first().evaluate((audio) => audio.readyState < 2), 'test cancels a still-loading clip');
    await delayed.locator('.voice-card .audition').first().click();
    await delayed.waitForTimeout(900);
    assert.equal(await delayed.locator('.voice-card audio').first().evaluate((audio) => audio.paused), true);
    assert.equal(await delayed.locator('.voice-card .error').first().isVisible(), false, 'user cancellation is not a load error');
    await delayed.close();
    await page.bringToFront();
    checks.push('cancelling a loading sample does not start late or report a false error');
  }

  for (let i = 0; i < manifest.clips.length; i++) {
    const audio = page.locator('.voice-card audio').nth(i);
    await page.locator('.voice-card .audition').nth(i).click();
    await page.waitForFunction((index) => document.querySelectorAll('.voice-card audio')[index].currentTime > .12, i);
    const state = await audio.evaluate((track) => ({ duration: track.duration, source: track.currentSrc }));
    assert.ok(Math.abs(state.duration - manifest.clips[i].duration) < .12);
    assert.ok(state.source.endsWith('/' + manifest.clips[i].file));
    assert.equal(await page.locator('audio').evaluateAll((tracks) => tracks.filter((track) => !track.paused).length), 1);
  }
  checks.push(`all ${manifest.clips.length} actual alternative MP3 files play; switching pauses other tracks`);
  await page.locator('audio').evaluateAll((tracks) => tracks.forEach((track) => track.pause()));
  const stopped = await page.locator('.voice-card audio').last().evaluate((track) => track.currentTime);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.voice-card audio').last().evaluate((track) => track.currentTime), stopped);
  checks.push('sample pause freezes its actual media time');

  await mkdir(out, { recursive: true });
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const size = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(size.scroll <= size.viewport, `audition overflow at ${width}px`);
    await page.screenshot({ path: new URL(`${name}-voices-${width}.png`, out).pathname, fullPage: true });
  }
  checks.push('audition layout has no horizontal overflow at 1440, 820 and 390px');

  const failed = page.locator('.voice-card audio').first();
  await failed.evaluate((track) => { track.pause(); track.removeAttribute('src'); track.dataset.src = '../assets/voice-options/missing-audio.mp3'; track.load(); });
  await page.locator('.voice-card .audition').first().click();
  await page.locator('.voice-card .error').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('.voice-card .error').first().isVisible(), true);
  assert.equal(await page.locator('audio').evaluateAll((tracks) => tracks.every((track) => track.paused)), true);
  checks.push('missing sample shows an explicit error and never falls back to another voice');

  await page.goto(new URL('review/index.html', target).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('audio').count(), 8);
  assert.match(await page.locator('main').textContent(), /不表示已人工验收/);
  await page.locator('section .audition').first().click();
  await page.waitForFunction(() => document.querySelector('audio').currentTime > .12);
  const reviewSource = await page.locator('audio').first().evaluate((track) => track.currentSrc);
  assert.ok(reviewSource.endsWith('/' + NARRATION[notes[0].id].file));
  await page.locator('audio').first().evaluate((track) => track.pause());
  await page.screenshot({ path: new URL(`${name}-review-390.png`, out).pathname, fullPage: true });
  checks.push('all eight pronunciation notices preserved; actual current audio linked and playable');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.bringToFront();
  try {
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => Number(document.querySelector('#clipSeek').value) > .4);
  } catch (error) {
    console.log(JSON.stringify({ mainPlaybackOriginalFailure: { name: error.name, message: error.message }, target, browserName }));
    const diagnostic = await page.evaluate(() => ({ hidden: document.hidden,
      status: document.querySelector('#playStatus').textContent, error: document.querySelector('#audioErrorText').textContent,
      media: window.__auditionMainMedia.map((audio) => ({ source: audio.currentSrc, ready: audio.readyState,
        paused: audio.paused, time: audio.currentTime, error: audio.error?.message })) }))
      .catch((diagnosticError) => ({ unavailable: true, error: diagnosticError.message }));
    console.log(JSON.stringify({ mainPlaybackFailure: diagnostic, target, browserName }));
    throw error;
  }
  await page.locator('#btnVoiceOptions').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#playText').textContent(), '暂停', 'Space on a link must not toggle the global transport');
  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.ok(popup.url().endsWith('/voices/index.html'));
  assert.equal(await page.locator('#playText').textContent(), '继续');
  const position = Number(await page.locator('#clipSeek').inputValue());
  const title = await page.locator('#capName').textContent();
  await page.waitForTimeout(250);
  assert.equal(Number(await page.locator('#clipSeek').inputValue()), position);
  await popup.close();
  await page.bringToFront();
  await page.locator('#btnPlay').click();
  await page.waitForFunction((before) => Number(document.querySelector('#clipSeek').value) > before + .15, position);
  assert.equal(await page.locator('#capName').textContent(), title);
  await page.locator('#btnPlay').click();
  checks.push('keyboard audition link pauses main audio and preserves scene/position for resuming');
  await page.screenshot({ path: new URL(`${name}-main.png`, out).pathname });
  assert.deepEqual(errors, []);
  const report = { target, browserName, offline, localReview, sampleCount: manifest.clips.length,
    webkitSkiaCpuRendering: process.env.WEBKIT_SKIA_ENABLE_CPU_RENDERING || null, checks, pageErrors: errors };
  await writeFile(new URL(`${name}.json`, out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
