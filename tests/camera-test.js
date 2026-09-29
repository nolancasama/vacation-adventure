/* Camera preflight and pose sampling contract.

   START / CONTINUE ask for the camera before the game moves on (so the
   browser prompt never lands in passport control), the pose model loads once
   per session, and the sampling loop adapts to inference time.

   Run via: npm run test:camera
   Screenshots: .shots/camera/ (1366x768) */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'camera');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures.push(msg); }
};
const waitFor = async (page, fn, label, timeout = 5000) => {
  try { await page.waitForFunction(fn, undefined, { timeout, polling: 40 }); }
  catch (_) { throw new Error('HARNESS_PRECONDITION_FAILED: ' + label); }
};
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};

// A fresh page load: no save unless one is given, then the booted title.
async function fresh(page, { query = '', save = null } = {}) {
  await page.goto(PAGE_URL + query);
  await page.evaluate(saved => {
    localStorage.clear();
    if (saved) localStorage.setItem('vacation-adventure-v1', JSON.stringify(saved));
  }, save);
  await page.reload();
  await waitFor(page, () => window.VA && VA.Main && VA.CameraPose && VA.Flows &&
    !document.querySelector('#stage.is-booting'), 'game booted', 15000);
}

/* Fake camera: a painted canvas stream. mode 'ok' grants at once, 'slow'
   waits for __cam.grant() (the student reading the browser prompt),
   'denied' rejects. detectForVideo busy-waits __cam.inferMs to stand in for
   a slow Chromebook and logs [start, end] of every inference. */
async function installProvider(page, mode) {
  await page.evaluate(providerMode => {
    const cam = window.__cam = { mode: providerMode, gum: 0, loads: 0, constraints: [], tracks: [],
      calls: [], inferMs: 0, grant: null, coverShown: false };
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let hue = 0;
    clearInterval(window.__camPaint);
    window.__camPaint = setInterval(() => {
      hue = (hue + 7) % 360;
      ctx.fillStyle = `hsl(${hue},60%,60%)`;
      ctx.fillRect(0, 0, 640, 480);
    }, 30);
    const give = () => {
      const stream = canvas.captureStream(30);
      stream.getTracks().forEach(track => cam.tracks.push(track));
      return stream;
    };
    VA.CameraPose._setProviderForTest({
      getUserMedia(constraints) {
        cam.gum++;
        cam.constraints.push(JSON.parse(JSON.stringify(constraints)));
        if (cam.mode === 'denied') return Promise.reject(new DOMException('no', 'NotAllowedError'));
        if (cam.mode === 'slow') return new Promise(resolve => { cam.grant = () => resolve(give()); });
        return Promise.resolve(give());
      },
      loadLandmarker() {
        cam.loads++;
        return {
          detectForVideo() {
            const started = performance.now();
            while (performance.now() - started < cam.inferMs) { /* a slow Chromebook */ }
            cam.calls.push([started, performance.now()]);
            return { landmarks: [] };
          },
        };
      },
    });
    // Did the setup cover ever become visible? (It must not flash for a
    // stored permission.)
    new MutationObserver(() => {
      const cover = document.querySelector('.camera-setup');
      if (cover && !cover.hidden) cam.coverShown = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  }, mode);
}

const camInfo = page => page.evaluate(() => ({
  gum: __cam.gum, loads: __cam.loads, constraints: __cam.constraints, coverShown: __cam.coverShown,
  tracks: __cam.tracks.length, live: __cam.tracks.filter(track => track.readyState !== 'ended').length,
  cover: document.querySelector('.camera-setup') ? (document.querySelector('.camera-setup').hidden ? 'hidden' : 'shown') : 'none',
  look: getComputedStyle(document.querySelector('#look-modal')).display !== 'none',
  state: VA.CameraPose.state(),
}));

// Start a pose run on a hidden video element, as an activity would. A start
// that never settles reports 'timeout' (a page left awaiting forever crashes
// the headless renderer after about a minute).
const startRun = page => page.evaluate(async () => {
  let video = document.querySelector('#cam-test-video');
  if (!video) {
    video = document.createElement('video');
    video.id = 'cam-test-video';
    video.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:48px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
  }
  const started = VA.CameraPose.start({ videoEl: video }).then(() => 'started', reason => String(reason));
  return Promise.race([started, new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))]);
});

let browser;
(async () => {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('crash', () => errors.push('PAGE CRASHED'));
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ERR_FILE_NOT_FOUND|CORS|net::ERR_FAILED/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });

  console.log('START waits for the permission decision behind a setup cover');
  await fresh(page);
  await installProvider(page, 'slow');
  await page.click('#btn-start');
  let info = await camInfo(page);
  check(info.cover === 'hidden', 'the setup cover is not shown in the first 250 ms (got ' + info.cover + ')');
  await waitFor(page, () => { const c = document.querySelector('.camera-setup'); return c && c.offsetParent; }, 'setup cover shown');
  await page.screenshot({ path: SHOT('camera-setup') });
  info = await camInfo(page);
  check(!info.look, 'the look picker waits while the camera prompt is open');
  check(info.state.permission === 'pending', 'permission is pending while the prompt is open (got ' + info.state.permission + ')');
  check(info.state.model === 'ready' && info.loads === 1, 'the pose model warms during the prompt (model ' + info.state.model + ', loads ' + info.loads + ')');
  const cover = await page.evaluate(() => {
    const el = document.querySelector('.camera-setup');
    return { en: el.querySelector('.camera-setup-en').textContent, jp: el.querySelector('.camera-setup-jp').textContent,
      inTitle: !!el.closest('#scr-title'), role: el.getAttribute('role') };
  });
  check(cover.en === 'SETTING UP CAMERA…' && cover.jp === 'カメラをじゅんびしています…' && cover.inTitle && cover.role === 'status',
    'setup cover copy, placement and role: ' + JSON.stringify(cover));
  await page.evaluate(() => document.querySelector('#btn-start').click()); // an impatient second click
  await page.waitForTimeout(100);
  info = await camInfo(page);
  check(info.gum === 1 && !info.look, 'a second START click during setup does nothing (getUserMedia ' + info.gum + ')');
  await page.evaluate(() => { __cam.grant(); __cam.mode = 'ok'; }); // later requests: a stored grant
  await waitFor(page, () => getComputedStyle(document.querySelector('#look-modal')).display !== 'none', 'look picker after grant', 8000);
  info = await camInfo(page);
  check(info.cover === 'none', 'the setup cover is removed after the decision');
  check(info.state.permission === 'granted', 'permission is granted (got ' + info.state.permission + ')');
  check(info.tracks > 0 && info.live === 0, 'preflight stops every track at once (' + info.live + '/' + info.tracks + ' live)');
  check(!info.state.running && info.state.tracks === 0, 'no pose run after preflight');
  const wanted = { video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, audio: false };
  check(JSON.stringify(info.constraints[0]) === JSON.stringify(wanted),
    'the camera request is 480x360, front-facing, no audio: ' + JSON.stringify(info.constraints[0]));

  console.log('a later activity reuses the warmed model');
  check(await startRun(page) === 'started', 'start() succeeds after preflight');
  await waitFor(page, () => VA.CameraPose.state().inferenceCount >= 3, 'pose checks running');
  info = await camInfo(page);
  check(info.loads === 1, 'one landmarker load for the whole session (loads ' + info.loads + ')');
  check(info.gum === 2 && info.state.running && info.state.tracks > 0, 'start() opens the camera itself (getUserMedia ' + info.gum + ')');
  check(JSON.stringify(info.constraints[1]) === JSON.stringify(wanted), 'the activity request is 480x360 too');
  check(!(await page.$('.camera-pose-debug')), 'no debug badge without ?debug');
  await page.evaluate(() => VA.CameraPose.stop());
  info = await camInfo(page);
  check(info.live === 0 && !info.state.running && info.state.tracks === 0, 'stop() ends every track');

  console.log('a stored permission answers at once: no flash of the cover');
  await fresh(page);
  await installProvider(page, 'ok');
  await page.click('#btn-start');
  await waitFor(page, () => getComputedStyle(document.querySelector('#look-modal')).display !== 'none', 'look picker (stored grant)', 8000);
  info = await camInfo(page);
  check(!info.coverShown && info.cover === 'none', 'the setup cover never appears for an instant grant');
  check(info.state.permission === 'granted' && info.live === 0, 'granted and no live tracks');

  console.log('CONTINUE waits for the decision before resuming');
  await fresh(page, { save: { name: 'Mio', checkpoint: 'map' } });
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#btn-continue')).display !== 'none'), 'CONTINUE is offered for a save');
  await installProvider(page, 'slow');
  await page.evaluate(() => { window.__resumed = 0; VA.Flows.resume = async () => { window.__resumed++; }; });
  await page.click('#btn-continue');
  await waitFor(page, () => { const c = document.querySelector('.camera-setup'); return c && c.offsetParent; }, 'setup cover shown (continue)');
  check(await page.evaluate(() => window.__resumed) === 0, 'the game does not resume while the prompt is open');
  await page.evaluate(() => { __cam.grant(); __cam.mode = 'ok'; }); // later requests: a stored grant
  await waitFor(page, () => window.__resumed > 0, 'resume after grant');
  await page.waitForTimeout(100);
  info = await camInfo(page);
  check(await page.evaluate(() => window.__resumed) === 1, 'resume runs exactly once');
  check(info.cover === 'none' && info.live === 0 && info.state.permission === 'granted', 'cover removed, tracks ended, granted');

  console.log('Camera activities off: no prompt at all');
  await fresh(page);
  await installProvider(page, 'ok');
  const skipped = await page.evaluate(() => {
    VA.State.data.settings.camera = false;
    return VA.CameraPose.preflight();
  });
  check(skipped === 'skipped', 'preflight() reports skipped (got ' + skipped + ')');
  await page.click('#btn-start');
  await waitFor(page, () => getComputedStyle(document.querySelector('#look-modal')).display !== 'none', 'look picker (camera off)', 8000);
  info = await camInfo(page);
  check(info.gum === 0 && info.loads === 0 && info.state.model === 'idle' && !info.coverShown,
    'no getUserMedia, no model load, no cover (gum ' + info.gum + ', loads ' + info.loads + ', model ' + info.state.model + ')');

  console.log('denied at START: the game continues and activities do not re-prompt');
  await fresh(page);
  await installProvider(page, 'denied');
  await page.click('#btn-start');
  await waitFor(page, () => getComputedStyle(document.querySelector('#look-modal')).display !== 'none', 'look picker (denied)', 8000);
  info = await camInfo(page);
  check(info.state.permission === 'denied' && info.gum === 1, 'permission denied after one request (got ' + info.state.permission + ', gum ' + info.gum + ')');
  const deniedStart = await startRun(page);
  info = await camInfo(page);
  check(deniedStart === 'denied' && info.gum === 1, 'a later start() throws denied without asking again (' + deniedStart + ', gum ' + info.gum + ')');
  check(!info.state.running, 'no pose run after a denial');
  await page.evaluate(() => {
    __cam.mode = 'ok';
    Object.defineProperty(navigator.permissions, 'query', { configurable: true, value: async () => ({ state: 'granted' }) });
  });
  const allowedStart = await startRun(page);
  info = await camInfo(page);
  check(allowedStart === 'started' && info.gum === 2 && info.state.permission === 'granted',
    'once the site setting allows the camera, start() opens it (' + allowedStart + ', gum ' + info.gum + ')');
  await page.evaluate(() => VA.CameraPose.stop());

  console.log('adaptive sampling: slow inference samples again at once');
  await fresh(page);
  await installProvider(page, 'ok');
  await page.evaluate(() => { __cam.inferMs = 80; });
  check(await startRun(page) === 'started', 'start() with 80 ms inference');
  await page.waitForTimeout(1800);
  let sample = await page.evaluate(() => { const calls = __cam.calls.slice(); const state = VA.CameraPose.state(); VA.CameraPose.stop(); return { calls, state }; });
  const idle = sample.calls.slice(1).map((call, i) => call[0] - sample.calls[i][1]);
  check(sample.calls.length >= 10, 'enough slow checks to measure (' + sample.calls.length + ')');
  check(median(idle) < 25, 'median idle gap after an 80 ms inference is under 25 ms (' + median(idle).toFixed(1) + ' ms)');
  check(sample.state.inferenceMs >= 70 && sample.state.inferenceMs < 120, 'state.inferenceMs tracks inference cost (' + sample.state.inferenceMs + ')');
  check(sample.state.frameIntervalMs >= 80 && sample.state.frameIntervalMs < 120 && sample.state.poseHz > 8 && sample.state.poseHz <= 12.5,
    'state interval and pose Hz follow (' + sample.state.frameIntervalMs + ' ms, ' + sample.state.poseHz + '/s)');
  check(sample.state.videoWidth === 640 && sample.state.videoHeight === 480,
    'state reports the delivered video size (' + sample.state.videoWidth + 'x' + sample.state.videoHeight + ')');

  console.log('adaptive sampling: fast inference keeps the 50 ms floor');
  await page.evaluate(() => { __cam.calls = []; __cam.inferMs = 5; });
  check(await startRun(page) === 'started', 'start() with 5 ms inference');
  await page.waitForTimeout(1500);
  sample = await page.evaluate(() => { const calls = __cam.calls.slice(); const state = VA.CameraPose.state(); VA.CameraPose.stop(); return { calls, state }; });
  const spacing = sample.calls.slice(1).map((call, i) => call[0] - sample.calls[i][0]);
  check(median(spacing) >= 45 && median(spacing) <= 90, 'median check spacing is 45–90 ms (' + median(spacing).toFixed(1) + ' ms)');
  check(sample.state.poseHz >= 11 && sample.state.poseHz <= 22 && sample.state.inferenceMs >= 4 && sample.state.inferenceMs < 20,
    'fast state: ' + sample.state.poseHz + '/s, ' + sample.state.inferenceMs + ' ms');

  console.log('?debug shows the pose stats badge during a run');
  await fresh(page, { query: '?debug' });
  await installProvider(page, 'ok');
  check(await startRun(page) === 'started', 'start() with ?debug');
  await waitFor(page, () => document.querySelector('.camera-pose-debug'), 'debug badge');
  await page.waitForTimeout(800);
  const badge = await page.evaluate(() => document.querySelector('.camera-pose-debug').textContent);
  check(/^POSE \d+\.\d\/s\n\d+ms\n640×480$/.test(badge), 'badge shows pose Hz, inference ms and video size: ' + JSON.stringify(badge));
  await page.screenshot({ path: SHOT('debug-badge'), clip: { x: 0, y: 668, width: 300, height: 100 } });
  await page.evaluate(() => VA.CameraPose.stop());
  check(!(await page.$('.camera-pose-debug')), 'the badge is removed on stop');

  check(errors.length === 0, 'no unexpected page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch(error => {
  console.error(error && error.stack || error);
  failures.push(error && error.message || String(error));
}).finally(async () => {
  if (browser) await browser.close();
  if (failures.length) {
    console.error('\nCamera test failed (' + failures.length + '):\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nCamera test passed.');
  }
});
