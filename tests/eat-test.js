/* Pretend-eating contract (ice cream, crepe, kebab).

   - Pure bite detector: hysteresis, no repeats while open, debounce, face loss.
   - Tap path: available while camera eating is starting, unavailable or stalled.
   - Camera path through VA.CameraMouth._setProviderForTest(): a real canvas
     MediaStream (so <video> plays) and a fake landmarker whose mouth openness
     the test scripts over time. The camera is never requested unasked.
   - Real food events end to end (coins, reward, feast, photo) and decline.
   - One real-module smoke check over http: the vendored MediaPipe runtime and
     face model load from assets/vendor (no camera needed).

   Run via: npm run test:eat      Screenshots: .shots/eat/ (1366x768) */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'eat');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures.push(msg); }
};

async function precondition(page, fn, arg, label, timeout = 8000) {
  try { await page.waitForFunction(fn, arg, { timeout }); }
  catch (error) { throw new Error('HARNESS_PRECONDITION_FAILED: ' + label); }
}
const vis = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return !!(el && el.offsetParent); }, sel).catch(() => false);
const jsClick = (page, sel) => page.$eval(sel, el => el.click()).catch(() => {});
const eatState = page => page.evaluate(() => VA.EatGame.state());

/* Installed before the game loads: counts every real getUserMedia call so a
   test can prove the browser camera was never touched unasked. */
function installTestEnvironment() {
  window.__realGumCalls = 0;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => { window.__realGumCalls++; return Promise.reject(new DOMException('blocked in test', 'NotAllowedError')); };
  }
}

/* Test provider: ok/denied/unavailable/model-fail/slow; mouth openness comes from
   window.__mouth (number, or null = no face). */
async function installProvider(page, mode) {
  await page.evaluate(m => {
    window.__gum = 0;
    window.__constraints = null;
    window.__tracks = [];
    window.__mouth = null;
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const g = canvas.getContext('2d');
    clearInterval(window.__paint);
    window.__paint = setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); g.fillRect(0, 0, 320, 240); }, 60);
    const landmarks = openness => {
      const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      const gap = openness * 64 / 240; // mouth width 0.2*320 = 64 px
      pts[61] = { x: 0.4, y: 0.5, z: 0 };
      pts[291] = { x: 0.6, y: 0.5, z: 0 };
      pts[13] = { x: 0.5, y: 0.5 - gap / 2, z: 0 };
      pts[14] = { x: 0.5, y: 0.5 + gap / 2, z: 0 };
      return pts;
    };
    VA.CameraMouth._setProviderForTest({
      getUserMedia(constraints) {
        window.__gum++;
        window.__constraints = constraints;
        if (m === 'denied') return Promise.reject(new DOMException('no', 'NotAllowedError'));
        if (m === 'unavailable') return Promise.reject(new DOMException('none', 'NotFoundError'));
        const stream = canvas.captureStream(15);
        stream.getTracks().forEach(track => window.__tracks.push(track));
        return Promise.resolve(stream);
      },
      loadLandmarker() {
        if (m === 'model-fail') return Promise.reject(new Error('fake model failure'));
        const model = { detectForVideo() { return { faceLandmarks: window.__mouth == null ? [] : [landmarks(window.__mouth)] }; } };
        if (m === 'slow') return new Promise(resolve => { window.__resolveModel = () => resolve(model); });
        return model;
      },
    });
  }, mode);
}

async function resetState(page, destId) {
  await page.evaluate(async id => {
    if (VA.EatGame.state().active) await VA.Screens.show('explore');
    VA.Dialogue.hide();
    VA.State.reset();
    VA.State.data.name = 'Mio';
    VA.State.data.playerLook = 'girl';
    Object.assign(VA.State.data.settings, { music: false, voice: false, mic: false });
    VA.State.data.coins = VA.Data.ALLOWANCE; // Grandma's money, as at a real trip start
    VA.State.startTrip(id);
    VA.applyPlayerLook('girl');
  }, destId);
}

/* Mount one food event's cinematic stage and start only its eat step. */
async function startSynthetic(page, destId, eventId) {
  await resetState(page, destId);
  await page.evaluate(async ([d, e]) => {
    const dest = VA.Data.destById(d);
    const event = dest.events.find(item => item.id === e);
    await VA.Cine.setup(event, dest);
    await VA.Screens.show('cine');
    window.__eatDone = false;
    VA.EatGame.play(event.steps.find(step => step.eatGame).eatGame, VA.Cine).then(() => { window.__eatDone = true; });
  }, [destId, eventId]);
  await precondition(page, () => VA.EatGame.state().active, undefined, 'eat game became active');
}

async function tapBites(page, n, shotPrefix) {
  for (let i = 1; i <= n; i++) {
    await page.locator('.eat-tap').click();
    await page.waitForTimeout(420);
    if (shotPrefix) await page.screenshot({ path: SHOT(`${shotPrefix}-bite-${i}`) });
  }
}

async function mouthCycle(page) {
  await page.evaluate(() => { window.__mouth = 0.05; });
  await page.waitForTimeout(420);
  await page.evaluate(() => { window.__mouth = 0.55; });
  await page.waitForTimeout(420);
  await page.evaluate(() => { window.__mouth = 0.05; });
  await page.waitForTimeout(450);
}

function startStaticServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let browser;
let server;
(async () => {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await page.addInitScript(installTestEnvironment);
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ERR_FILE_NOT_FOUND|CORS|net::ERR_FAILED/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });
  await page.goto(PAGE_URL);
  await precondition(page, () => window.VA && VA.EatGame && VA.CameraMouth && VA.Cine && VA.Cine.world, undefined, 'game booted', 15000);

  console.log('bite detector (pure)');
  const pure = await page.evaluate(() => {
    const run = samples => {
      const d = VA.CameraMouth.createBiteDetector({ open: 0.32, close: 0.16, minBiteMs: 350 });
      let bites = 0;
      samples.forEach(([o, t]) => { if (d.feed(o, t)) bites++; });
      return bites;
    };
    const cycle = t0 => [[0.05, t0], [0.5, t0 + 150], [0.05, t0 + 300]];
    return {
      openOnly: run([[0.05, 0], [0.5, 100], [0.55, 200], [0.6, 300], [0.5, 400], [0.52, 900]]),
      one: run(cycle(0)),
      three: run([...cycle(0), ...cycle(600), ...cycle(1200)]),
      jitter: run([[0.05, 0], [0.30, 100], [0.34, 200], [0.30, 250], [0.34, 300], [0.20, 350], [0.33, 400], [0.17, 450], [0.05, 500]]),
      fastRepeat: run([...cycle(0), [0.5, 320], [0.05, 340]]),
      faceLoss: run([[0.05, 0], [0.5, 100], [null, 200], [0.05, 300]]),
      appearsOpen: run([[null, 0], [0.5, 100], [0.05, 200]]),
    };
  });
  check(pure.openOnly === 0, 'mouth held open never counts a bite (open-only: ' + pure.openOnly + ')');
  check(pure.one === 1, 'open -> close registers exactly one bite');
  check(pure.three === 3, 'three clear cycles register three bites');
  check(pure.jitter === 1, 'jitter around a threshold does not add bites (got ' + pure.jitter + ')');
  check(pure.fastRepeat === 1, 'a second bite inside the debounce window is ignored');
  check(pure.faceLoss === 0, 'face disappearing mid-bite creates no bite');
  check(pure.appearsOpen === 0, 'a face that appears already open cannot finish a bite');

  console.log('file fallback and main instruction');
  check(await page.evaluate(() => VA.CameraMouth.isSupported()) === false, 'file:// build reports camera unsupported without a provider');
  await startSynthetic(page, 'australia', 'icecream');
  const tapOnlyText = await page.locator('.eat-game').innerText();
  check(tapOnlyText.includes('EAT!') && !tapOnlyText.includes('Take a bite!'), 'main instruction is EAT! and old copy is gone');
  check(await vis(page, '.eat-tap:not([disabled])'), 'TAP TO EAT is available on the first frame');
  await tapBites(page, 3);
  await precondition(page, () => window.__eatDone, undefined, 'file fallback completed by tapping');
  check(await page.evaluate(() => window.__realGumCalls) === 0, 'file fallback never requests the real camera');

  console.log('camera starts by default and tutorial is inline');
  await installProvider(page, 'slow');
  await startSynthetic(page, 'france', 'crepe');
  await precondition(page, () => VA.EatGame.state().camera === 'starting', undefined, 'camera entered starting state');
  check(await page.evaluate(() => window.__gum) === 1, 'camera is requested automatically');
  const constraints = await page.evaluate(() => window.__constraints);
  check(constraints.video.facingMode === 'user' && constraints.video.width.ideal <= 640, 'front camera uses modest video constraints');
  check(await vis(page, '.eat-camera-area') && await vis(page, '.eat-tutorial') && await vis(page, '.eat-mouth-demo'), 'starting camera shows first-time Japanese tutorial and mouth demo');
  await page.screenshot({ path: SHOT('01-camera-starting') });
  await page.screenshot({ path: SHOT('02-first-time-tutorial-demo') });
  check((await eatState(page)).tapFallback && await vis(page, '.eat-tap:not([disabled])'), 'starting camera keeps the tap fallback visible');
  await page.locator('.eat-tap').click(); await page.waitForTimeout(320);
  check((await eatState(page)).taps === 1, 'tap counts before the model is ready while tutorial remains visible');
  await page.evaluate(() => { window.__mouth = 0.05; window.__resolveModel(); });
  await precondition(page, () => VA.EatGame.state().camera === 'on' && VA.EatGame.state().faceSeen, undefined, 'slow camera became active');
  const beforeBlockedKeys = await eatState(page);
  check(!beforeBlockedKeys.tapFallback && !(await vis(page, '.eat-tap')), 'active camera hides the tap fallback');
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.waitForTimeout(320);
  check((await eatState(page)).bites === beforeBlockedKeys.bites, 'Space and Enter do not add bites while camera eating is active');
  const layout = await page.evaluate(() => {
    const preview = document.querySelector('.eat-cam').getBoundingClientRect();
    const food = document.querySelector('.eat-food-stage').getBoundingClientRect();
    const tap = document.querySelector('.eat-tap').getBoundingClientRect();
    const stage = document.querySelector('#stage').getBoundingClientRect();
    return { preview, food, tap, stage, transform: getComputedStyle(document.querySelector('.eat-cam video')).transform };
  });
  const stageScale = layout.stage.width / 960;
  const previewStageWidth = layout.preview.width / stageScale;
  check(previewStageWidth >= 130 && previewStageWidth <= 150 && layout.preview.width < layout.food.width, 'preview is 130-150 stage px and smaller than food');
  check(layout.preview.right > layout.food.right && layout.preview.bottom <= layout.stage.bottom, 'preview is bottom-right and does not cover food');
  check(layout.tap.width === 0 && layout.tap.height === 0, 'TAP TO EAT has no layout while camera eating is active');
  check(layout.transform !== 'none', 'live preview is mirrored');
  await page.screenshot({ path: SHOT('03-active-preview-and-tap-bar') });
  await page.evaluate(() => { window.__mouth = 0.22; });
  await precondition(page, () => VA.EatGame.state().mouth === 'opening', undefined, 'opening indicator state reached');
  await page.evaluate(() => { window.__mouth = 0.55; });
  await precondition(page, () => VA.EatGame.state().mouth === 'open', undefined, 'open indicator state reached');
  check(await page.locator('.eat-cam-face').textContent() === '●', 'mouth-open indicator uses a filled circle');
  await page.screenshot({ path: SHOT('04-mouth-open-indicator') });
  await page.evaluate(() => { window.__mouth = 0.05; });
  await precondition(page, () => VA.EatGame.state().cameraBites === 1, undefined, 'camera bite counted while tutorial visible');
  check(!(await eatState(page)).tapFallback && !(await vis(page, '.eat-tap')), 'camera bite keeps fallback hidden and restarts its stall window');
  check(await page.evaluate(() => VA.State.data.guides.eating), 'first camera bite persists guides.eating');
  check((await page.locator('.eat-pop').textContent()) === 'CHOMP!', 'camera bite feedback is CHOMP!');
  await page.screenshot({ path: SHOT('05-chomp') });
  await page.screenshot({ path: SHOT('06-second-bite') });
  await mouthCycle(page);
  await precondition(page, () => VA.EatGame.state().cameraBites === 2, undefined, 'second camera bite finished the meal');
  await precondition(page, () => document.querySelector('.eat-title').textContent.includes('All gone!'), undefined, 'finished-food state visible');
  check(!(await eatState(page)).tapFallback && !(await vis(page, '.eat-tap')) && await page.locator('.eat-tap').isDisabled(), 'finished meal hides and disables tap fallback');
  const finishedBites = (await eatState(page)).bites;
  await page.keyboard.press('Space'); await page.keyboard.press('Enter');
  check((await eatState(page)).bites === finishedBites, 'Space and Enter add no bite after the meal is done');
  await page.screenshot({ path: SHOT('07-finished-food') });
  await precondition(page, () => window.__eatDone, undefined, 'mixed tap and camera food finished');
  const stoppedAfterFinish = await page.evaluate(() => ({ tracks: window.__tracks.map(t => t.readyState), running: VA.CameraMouth.state().running, n: VA.CameraMouth.state().inferenceCount }));
  check(stoppedAfterFinish.tracks.every(s => s === 'ended') && !stoppedAfterFinish.running, 'all tracks and camera state stop at food finish');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => VA.CameraMouth.state().inferenceCount) === stoppedAfterFinish.n, 'inference stops at food finish');

  console.log('later food reminder and camera-stall fallback');
  await installProvider(page, 'ok');
  await resetState(page, 'egypt');
  await page.evaluate(async () => {
    VA.State.data.guides.eating = true; VA.EatGame.REMINDER_MS = 350; VA.EatGame.STALL_MS = 500;
    const d = VA.Data.destById('egypt'); const e = d.events.find(x => x.id === 'kebab');
    await VA.Cine.setup(e, d); await VA.Screens.show('cine'); window.__eatDone = false;
    VA.EatGame.play(e.steps.find(x => x.eatGame).eatGame, VA.Cine).then(() => { window.__eatDone = true; });
  });
  await precondition(page, () => VA.EatGame.state().camera === 'on', undefined, 'later food camera on');
  check(!(await eatState(page)).tapFallback && !(await vis(page, '.eat-tap')), 'later food hides tap while camera is actively eating');
  check(!(await vis(page, '.eat-tutorial')), 'later food does not show the full tutorial immediately');
  await page.screenshot({ path: SHOT('08-later-food-without-tutorial') });
  await precondition(page, () => VA.EatGame.state().reminder, undefined, 'stuck reminder appeared', 2000);
  await page.screenshot({ path: SHOT('09-stuck-reminder') });
  await precondition(page, () => VA.EatGame.state().tapFallback, undefined, 'camera stall restored tap fallback', 2000);
  check(await vis(page, '.eat-tap:not([disabled])'), 'camera stall shows the usable tap fallback while camera keeps running');
  await page.locator('.eat-tap').click();
  check(!(await eatState(page)).reminder, 'tap hides the reminder');
  await mouthCycle(page);
  await precondition(page, () => VA.EatGame.state().cameraBites === 1 && !VA.EatGame.state().tapFallback,
    undefined, 'camera bite hides the restored fallback again');
  await precondition(page, () => VA.EatGame.state().tapFallback, undefined, 'second camera stall restores fallback', 2000);
  await tapBites(page, 1);
  await precondition(page, () => window.__eatDone, undefined, 'later food finished');
  await page.evaluate(() => { VA.EatGame.REMINDER_MS = 6000; VA.EatGame.STALL_MS = 10000; });

  console.log('no face and quiet camera failures');
  await installProvider(page, 'ok');
  await page.evaluate(() => { VA.EatGame.STALL_MS = 300; });
  await startSynthetic(page, 'australia', 'icecream');
  await precondition(page, () => VA.EatGame.state().camera === 'on', undefined, 'no-face camera is running');
  check((await page.locator('.eat-status').textContent()).includes('Show your face'), 'no-face state gives gentle local guidance');
  await precondition(page, () => VA.EatGame.state().tapFallback, undefined, 'no-face camera stall restores tap fallback', 2000);
  check(await vis(page, '.eat-tap:not([disabled])'), 'tap becomes usable when the no-face camera stalls');
  await tapBites(page, 3);
  await precondition(page, () => window.__eatDone, undefined, 'no-face food finished by tapping');
  await page.evaluate(() => { VA.EatGame.STALL_MS = 10000; });

  for (const mode of ['denied', 'unavailable', 'model-fail']) {
    await installProvider(page, mode);
    await startSynthetic(page, 'australia', 'icecream');
    await precondition(page, () => VA.EatGame.state().camera === 'failed', undefined, mode + ' failed quietly', 3000);
    check(!(await vis(page, '.eat-camera-area')) && await vis(page, '.eat-tap:not([disabled])'), mode + ': preview disappears and tap remains');
    check((await page.locator('.eat-title').textContent()).includes('EAT!'), mode + ': EAT prompt remains');
    if (mode === 'denied') await page.screenshot({ path: SHOT('10-camera-unavailable-fallback') });
    await tapBites(page, 3); await precondition(page, () => window.__eatDone, undefined, mode + ' tapping completes');
  }

  await installProvider(page, 'slow');
  await page.evaluate(() => { VA.EatGame.START_TIMEOUT_MS = 300; });
  await startSynthetic(page, 'australia', 'icecream');
  await precondition(page, () => VA.EatGame.state().camera === 'failed', undefined, 'slow camera timed out quietly', 2000);
  check(!(await vis(page, '.eat-camera-area')) && await vis(page, '.eat-tap:not([disabled])'), 'slow start removes preview without blocking tap');
  await page.evaluate(() => { window.__resolveModel(); VA.EatGame.START_TIMEOUT_MS = 8000; });
  await tapBites(page, 3); await precondition(page, () => window.__eatDone, undefined, 'slow-start fallback completes');

  console.log('camera-off setting and persistence');
  await installProvider(page, 'ok');
  await resetState(page, 'australia');
  await page.evaluate(async () => {
    VA.State.data.settings.camera = false;
    const d = VA.Data.destById('australia'); const e = d.events.find(x => x.id === 'icecream');
    await VA.Cine.setup(e, d); await VA.Screens.show('cine'); window.__eatDone = false;
    VA.EatGame.play(e.steps.find(x => x.eatGame).eatGame, VA.Cine).then(() => { window.__eatDone = true; });
  });
  check(await page.evaluate(() => window.__gum) === 0, 'settings.camera false never requests camera');
  check(!(await vis(page, '.eat-camera-area')) && !(await vis(page, '.eat-tutorial')), 'camera-off mode has no preview or camera tutorial');
  check((await eatState(page)).tapFallback && await vis(page, '.eat-tap:not([disabled])'), 'camera-off mode keeps the tap fallback visible');
  await page.keyboard.press('Space'); await page.waitForTimeout(320); await page.keyboard.press('Enter'); await page.waitForTimeout(320);
  check((await eatState(page)).taps === 2, 'camera-off mode accepts both Space and Enter');
  await page.screenshot({ path: SHOT('11-camera-disabled-settings') });
  await page.evaluate(() => { VA.State.data.guides.eating = true; VA.State.save(); VA.State.load(); });
  check(await page.evaluate(() => VA.State.data.guides.eating), 'guides.eating survives save and reload');
  await page.evaluate(() => { const old = VA.State.fresh(); delete old.guides; localStorage.setItem(VA.SAVE_KEY, JSON.stringify(old)); VA.State.load(); });
  check(await page.evaluate(() => VA.State.data.guides.eating === false), 'old saves merge the eating guide default');
  await page.evaluate(() => VA.Screens.show('explore'));
  await precondition(page, () => !VA.EatGame.state().active, undefined, 'leaving scene cleans up eat game');
  await page.evaluate(() => VA.CameraMouth._setProviderForTest(null));

  console.log('real food events end to end');
  const realEvent = async (destId, eventId, caption, accept) => {
    await resetState(page, destId);
    await page.evaluate(async d => {
      VA.State.checkpoint('explore');
      VA.UI.explore(VA.Data.destById(d));
      document.querySelector('#hotspot-layer').style.visibility = 'visible';
      VA.Flows._eventBusy = false;
      window.__seen = { reward: false, feast: false, eat: false };
      const mark = () => {
        const r = document.querySelector('#item-reward'); if (r && !r.hidden) window.__seen.reward = true;
        const f = document.querySelector('#food-feast-reaction'); if (f && !f.hidden) window.__seen.feast = true;
        if (document.querySelector('.eat-game')) window.__seen.eat = true;
      };
      new MutationObserver(mark).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
      await VA.Screens.show('explore');
    }, destId);
    const coins0 = await page.evaluate(() => VA.State.data.coins);
    await jsClick(page, '#hs-' + eventId);
    await precondition(page, () => document.querySelector('#scr-cine').classList.contains('active'), undefined, eventId + ' cinematic opened');
    for (let i = 0; i < 400; i++) {
      const done = await page.evaluate(() => document.querySelector('#scr-explore').classList.contains('active') &&
        document.querySelector('#dialogue').style.display === 'none').catch(() => false);
      if (done) break;
      const answer = accept ? 'Yes, please!' : 'No, thank you.';
      const offer = page.locator('#choices .choice-btn:not([disabled])', { hasText: answer });
      if (await offer.count() && await offer.first().isVisible().catch(() => false)) { await offer.first().click(); await page.waitForTimeout(200); continue; }
      if (await vis(page, '.eat-tap:not([disabled])')) {
        if (!(await page.evaluate(() => window.__shotEat))) { await page.evaluate(() => { window.__shotEat = true; }); await page.screenshot({ path: SHOT('05-' + eventId + '-in-event') }); }
        await jsClick(page, '.eat-tap'); await page.waitForTimeout(350); continue;
      }
      if (await vis(page, '#dialogue')) await jsClick(page, '#dialogue');
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => { window.__shotEat = false; });
    return page.evaluate(([d, e, c0]) => ({
      photo: (VA.State.data.book[d] && VA.State.data.book[d].photos[e]) || null,
      coins: VA.State.data.coins, spent: c0 - VA.State.data.coins,
      seen: window.__seen, hubDone: !!document.querySelector('#hs-' + e + '.done'),
    }), [destId, eventId, coins0]);
  };
  for (const [dest, id, caption] of [['australia', 'icecream', 'I ate ice cream.'], ['france', 'crepe', 'I ate a crepe.'], ['egypt', 'kebab', 'I ate a kebab.']]) {
    const r = await realEvent(dest, id, caption, true);
    check(r.photo && r.photo.caption === caption && r.photo.verb === 'ate', id + ': photo saved with "' + caption + '"');
    check(r.spent === 3, id + ': 3 coins spent');
    check(r.seen.reward && r.seen.eat && r.seen.feast, id + ': reward overlay, eating and feast reaction all shown');
  }
  const declined = await realEvent('france', 'crepe', 'I ate a crepe.', false);
  check(!declined.photo && declined.spent === 0 && !declined.seen.eat, 'declining the crepe spends nothing, saves nothing and skips eating');
  check(!declined.hubDone, 'declined crepe hotspot stays available');

  console.log('vendored face model loads over http');
  server = await startStaticServer();
  const port = server.address().port;
  const httpPage = await context.newPage();
  httpPage.on('pageerror', error => errors.push('HTTP PAGEERROR: ' + error.message));
  await httpPage.goto(`http://127.0.0.1:${port}/index.html`);
  await precondition(httpPage, () => window.VA && VA.CameraMouth, undefined, 'http page booted', 15000);
  check(await httpPage.evaluate(() => VA.CameraMouth.isSupported()), 'http origin reports camera eating supported');
  const beforeLoad = await httpPage.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => /mediapipe/.test(n)));
  check(beforeLoad.length === 0, 'no face-model file is fetched at startup (' + beforeLoad.length + ')');
  const load = await httpPage.evaluate(async () => {
    const t0 = performance.now();
    try {
      const lm = await VA.CameraMouth._loadLandmarker();
      return { ok: typeof lm.detectForVideo === 'function', ms: Math.round(performance.now() - t0) };
    } catch (error) { return { ok: false, error: String(error && error.message || error) }; }
  });
  check(load.ok, 'vendored MediaPipe runtime + face model load locally (' + (load.ms || load.error) + ' ms)');
  await httpPage.close();

  check(errors.length === 0, 'no unexpected page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch(error => {
  failures.push(String(error && error.stack || error));
  console.log('FATAL', error);
}).finally(async () => {
  if (server) server.close();
  if (browser) await browser.close();
  if (failures.length) { console.log(`\nEAT TESTS FAILED (${failures.length})`); process.exit(1); }
  console.log('\nEAT TESTS OK');
});
