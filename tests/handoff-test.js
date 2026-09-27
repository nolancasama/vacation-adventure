/* Reusable AR handoff contract.

   Run via: npm run test:handoff
   Screenshots: .shots/handoff/ (1366x768) */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'handoff');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  \u2713 ' + msg);
  else { console.log('  \u2717 ' + msg); failures.push(msg); }
};
const waitFor = async (page, fn, label, timeout = 5000) => {
  try { await page.waitForFunction(fn, undefined, { timeout, polling: 40 }); }
  catch (_) { throw new Error('HARNESS_PRECONDITION_FAILED: ' + label); }
};
const vis = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  return !!(el && el.offsetParent);
}, selector).catch(() => false);

async function installProvider(page, mode = 'ok') {
  await page.evaluate(providerMode => {
    window.__handoffPose = null;
    window.__handoffTracks = [];
    window.__handoffGum = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const toRaw = named => {
      if (!named) { window.__handoffRaw = null; return []; }
      const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
      const at = { nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13,
        rightElbow: 14, leftWrist: 15, rightWrist: 16 };
      Object.entries(named).forEach(([key, value]) => {
        if (!value) return; // a landmark out of frame
        points[at[key]] = { x: 1 - value.x, y: value.y, visibility: 1, presence: 1 };
      });
      window.__handoffRaw = points;
      return [points];
    };
    clearInterval(window.__handoffPaint);
    window.__handoffPaint = setInterval(() => {
      ctx.fillStyle = '#8ed8ef';
      ctx.fillRect(0, 0, 640, 480);
      const raw = window.__handoffRaw;
      if (!raw) return;
      const p = index => [raw[index].x * 640, raw[index].y * 480];
      ctx.strokeStyle = '#243748'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      [[11,12],[11,13],[13,15],[12,14],[14,16]].forEach(([a,b]) => {
        if (!raw[a].visibility || !raw[b].visibility) return;
        ctx.beginPath(); ctx.moveTo(...p(a)); ctx.lineTo(...p(b)); ctx.stroke();
      });
      ctx.fillStyle = '#243748'; ctx.beginPath(); ctx.arc(...p(0), 32, 0, Math.PI * 2); ctx.fill();
      [[15, '#e53935'], [16, '#43a047']].forEach(([index, color]) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(...p(index), 14, 0, Math.PI * 2); ctx.fill();
      });
    }, 50);
    VA.CameraPose._setProviderForTest({
      getUserMedia() {
        window.__handoffGum++;
        if (providerMode === 'denied') return Promise.reject(new DOMException('no', 'NotAllowedError'));
        const stream = canvas.captureStream(15);
        stream.getTracks().forEach(track => window.__handoffTracks.push(track));
        return Promise.resolve(stream);
      },
      loadLandmarker() {
        if (providerMode === 'model-fail') return Promise.reject(new Error('fake model failure'));
        return { detectForVideo() { return { landmarks: toRaw(window.__handoffPose) }; } };
      },
    });
  }, mode);
}

async function reset(page, camera = true) {
  await page.evaluate(async enabled => {
    if (VA.ARHandoff.state().active) await VA.Screens.show('home');
    VA.State.reset();
    VA.State.data.name = 'Mio';
    Object.assign(VA.State.data.settings, { music: false, sfx: false, voice: false, mic: false, camera: enabled });
    VA.State.startTrip('australia');
    VA.UI.explore(VA.Data.destById('australia'));
    await VA.Screens.show('explore');
    window.__handoffDone = 0;
    window.__handoffResolvedState = null;
  }, camera);
}

async function start(page, mode, options = {}) {
  await reset(page, options.camera !== false);
  await page.evaluate(({ kind, illustration }) => {
    const cfg = kind === 'present'
      ? { kind: 'passport', label: 'Passport', instruction: 'Show your passport!', instructionJP: 'パスポートを見せてね！' }
      : { illustration: illustration || 'souvenir_koala.webp', label: 'Koala', instruction: 'Take it!', instructionJP: '手をのばして、うけとってね！' };
    VA.ARHandoff[kind](cfg).then(() => {
      window.__handoffDone++;
      window.__handoffResolvedState = {
        camera: VA.CameraPose.state(), overlay: !!document.querySelector('.ar-handoff'),
      };
    });
  }, { kind: mode, illustration: options.illustration });
  await waitFor(page, () => VA.ARHandoff.state().active, mode + ' active');
}

const pose = (left, right, shoulders = { left: { x: .4, y: .4 }, right: { x: .6, y: .4 } }) => ({
  nose: { x: .5, y: .2 }, leftShoulder: shoulders.left, rightShoulder: shoulders.right,
  leftElbow: { x: .4, y: .55 }, rightElbow: { x: .6, y: .55 },
  leftWrist: left, rightWrist: right,
});
const setPose = (page, value) => page.evaluate(next => { window.__handoffPose = next; }, value);
const finishAt = async (page, side, target, wait = 550) => {
  const far = side === 'left' ? { x: .9, y: .8 } : { x: .1, y: .8 };
  const left = side === 'left' ? { x: target.x - .025, y: target.y + .025 } : far;
  const right = side === 'right' ? { x: target.x - .025, y: target.y + .025 } : far;
  await setPose(page, pose(left, right));
  await page.waitForTimeout(wait);
};

let browser;
(async () => {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ERR_FILE_NOT_FOUND|CORS|net::ERR_FAILED/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });
  await page.goto(PAGE_URL);
  await waitFor(page, () => window.VA && VA.ARHandoff && VA.CameraPose && VA.Flows, 'game booted', 15000);
  await page.evaluate(() => { VA.ARHandoff.TUNING.dwellMs = 300; });

  console.log('pure geometry');
  const geom = await page.evaluate(() => {
    const g = VA.ARHandoff._geom;
    const p = { leftShoulder: { x: .3, y: .4 }, rightShoulder: { x: .7, y: .5 },
      leftWrist: { x: .2, y: .7 }, rightWrist: { x: .8, y: .7 },
      leftHip: { x: 0, y: 0 }, rightHip: { x: 1, y: 1 } };
    return { distance: g.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), chest: g.chestPoint(p),
      left: g.nearestWrist(p, { x: .21, y: .7 }), right: g.nearestWrist(p, { x: .79, y: .7 }) };
  });
  check(geom.distance === 5, 'dist is Euclidean');
  check(Math.abs(geom.chest.x - .5) < .001 && Math.abs(geom.chest.y - .61) < .001, 'chest uses shoulder midpoint + 0.16 without hips');
  check(geom.left.side === 'left' && geom.right.side === 'right', 'nearestWrist accepts either hand');

  console.log('present with left wrist, continuous pickup and target dwell');
  await installProvider(page);
  await start(page, 'present');
  await setPose(page, pose({ x: .2, y: .75 }, { x: .8, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().inputMode === 'camera' && VA.ARHandoff.state().poseSeen, 'present camera ready');
  await page.screenshot({ path: SHOT('passport-camera-ready') });
  await setPose(page, pose({ x: .5, y: .68 }, { x: .85, y: .75 }));
  await page.waitForTimeout(150);
  check((await page.evaluate(() => VA.ARHandoff.state())).stage === 'pickup', 'one pickup frame / partial dwell does not attach');
  await page.screenshot({ path: SHOT('passport-pickup') });
  await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', 'left pickup dwell');
  let st = await page.evaluate(() => VA.ARHandoff.state());
  check(st.hand === 'left' && st.object.attached, 'left wrist attaches the passport');
  await page.screenshot({ path: SHOT('passport-carry') });
  await finishAt(page, 'left', { x: .77, y: .38 }, 130);
  await setPose(page, pose({ x: .25, y: .72 }, { x: .85, y: .75 }));
  await page.waitForTimeout(340);
  check(!(await page.evaluate(() => VA.ARHandoff.state().done)), 'one-frame target touch does not complete');
  await finishAt(page, 'left', { x: .77, y: .38 }, 130);
  await page.screenshot({ path: SHOT('passport-target-hover') });
  await waitFor(page, () => VA.ARHandoff.state().done, 'passport target dwell');
  await page.screenshot({ path: SHOT('passport-success') });
  await waitFor(page, () => window.__handoffDone === 1, 'present promise resolved');
  let resolved = await page.evaluate(() => window.__handoffResolvedState);
  check(!resolved.camera.running && !resolved.overlay, 'camera and overlay are off before present resolves');

  console.log('present with right wrist');
  await installProvider(page);
  await start(page, 'present');
  await setPose(page, pose({ x: .15, y: .75 }, { x: .5, y: .68 }));
  await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', 'right pickup dwell');
  check((await page.evaluate(() => VA.ARHandoff.state())).hand === 'right', 'right wrist can carry');
  await finishAt(page, 'right', { x: .77, y: .38 });
  await waitFor(page, () => window.__handoffDone === 1, 'right present complete');

  console.log('lost pose pauses and resumes before pickup, attached and near target');
  await installProvider(page);
  await start(page, 'present');
  await setPose(page, pose({ x: .2, y: .75 }, { x: .8, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().poseSeen, 'pose seen before loss');
  await setPose(page, null);
  await waitFor(page, () => VA.ARHandoff.state().paused, 'paused before pickup');
  check((await page.evaluate(() => VA.ARHandoff.state())).stage === 'pickup', 'loss before pickup keeps pickup stage');
  const lostCopy = await page.evaluate(() => ({ message: document.querySelector('.ar-handoff-message').textContent,
    jp: document.querySelector('.ar-handoff-jp').textContent }));
  check(lostCopy.message === 'Show your arms! 🙂' && lostCopy.jp === 'りょううでが見えるようにしてね！',
    'lost pose uses the waist-up arms copy in the message and Japanese instruction');
  await setPose(page, pose({ x: .5, y: .68 }, { x: .85, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', 'pickup after resume');
  const attached = await page.evaluate(() => VA.ARHandoff.state().object);
  await setPose(page, null);
  await waitFor(page, () => VA.ARHandoff.state().paused, 'paused while attached');
  st = await page.evaluate(() => VA.ARHandoff.state());
  check(st.stage === 'carry' && st.object.attached && st.object.x === attached.x && st.object.y === attached.y,
    'loss while attached keeps hand, object and carry stage');
  await finishAt(page, 'left', { x: .77, y: .38 }, 140);
  await setPose(page, null);
  await waitFor(page, () => VA.ARHandoff.state().paused, 'paused near target');
  await page.waitForTimeout(400);
  check(!(await page.evaluate(() => VA.ARHandoff.state().done)), 'lost pose resets dwell and cannot complete');
  await finishAt(page, 'left', { x: .77, y: .38 });
  await waitFor(page, () => window.__handoffDone === 1, 'same carry stage resumes to completion');

  console.log('receive real art, wrist carry and chest dwell');
  await installProvider(page);
  await start(page, 'receive', { illustration: 'souvenir_koala.webp' });
  await setPose(page, pose({ x: .2, y: .75 }, { x: .85, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().poseSeen, 'receive camera ready');
  await page.screenshot({ path: SHOT('souvenir-camera-ready') });
  const src = await page.$eval('.ar-handoff-object img', img => img.getAttribute('src'));
  check(src === 'assets/objects/souvenir_koala.webp', 'receive uses the real souvenir illustration src');
  await setPose(page, pose({ x: .55, y: .5 }, { x: .9, y: .75 })); // reaching, just outside the zone
  await page.waitForTimeout(250);
  check((await page.evaluate(() => VA.ARHandoff.state())).stage === 'pickup', 'a hand just outside the souvenir zone does not pick it up');
  await page.screenshot({ path: SHOT('souvenir-reach') });
  await setPose(page, pose({ x: .72, y: .42 }, { x: .9, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', 'receive pickup');
  check(await page.evaluate(() => document.querySelector('.ar-handoff-command').textContent === 'Bring it back!' &&
    document.querySelector('.ar-handoff-jp').textContent === '手をもどしてね！'), 'carry instruction is "Bring it back!" / 手をもどしてね！');
  await finishAt(page, 'left', { x: .76, y: .72 }, 90);
  st = await page.evaluate(() => VA.ARHandoff.state());
  check(Math.abs(st.object.x - .76) < .04 && Math.abs(st.object.y - .72) < .04, 'attached souvenir follows its wrist directly');
  await page.screenshot({ path: SHOT('souvenir-attached') });
  await finishAt(page, 'left', { x: .5, y: .56 }, 80);
  await waitFor(page, () => VA.ARHandoff.state().dwelling, 'souvenir chest hover');
  await page.screenshot({ path: SHOT('souvenir-chest-target') });
  await waitFor(page, () => VA.ARHandoff.state().done, 'receive chest dwell');
  await page.screenshot({ path: SHOT('souvenir-success') });
  await waitFor(page, () => window.__handoffDone === 1, 'receive resolved');
  resolved = await page.evaluate(() => window.__handoffResolvedState);
  check(!resolved.camera.running && !resolved.overlay, 'camera and overlay are off before receive resolves');

  console.log('receive: one visible wrist, instant pickup, unused hand may leave');
  // A long dwell proves receive pickup does not wait for one.
  await page.evaluate(() => { VA.ARHandoff.TUNING.dwellMs = 5000; });
  for (const side of ['right', 'left']) {
    await installProvider(page);
    await start(page, 'receive', { illustration: 'souvenir_koala.webp' });
    const reach = { x: .72, y: .57 }; // 0.15 away: inside 0.17, outside the passport's 0.13
    const away = side === 'right' ? pose(null, { x: .9, y: .8 }) : pose({ x: .1, y: .8 }, null);
    await setPose(page, away);
    await waitFor(page, () => VA.ARHandoff.state().poseSeen, side + '-only wrist is a ready pose');
    let one = await page.evaluate(() => VA.ARHandoff.state());
    check(!one.paused && one.inputMode === 'camera', side + '-only: no pose-lost pause with the other wrist missing');
    await setPose(page, side === 'right' ? pose(null, reach) : pose(reach, null));
    await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', side + '-only instant pickup', 1500);
    one = await page.evaluate(() => VA.ARHandoff.state());
    check(one.hand === side && one.object.attached && one.inputMode === 'camera' && !one.assist,
      side + ' wrist alone picks up the souvenir at once (no dwell, no fallback)');
    if (side === 'right') {
      // After pickup only the carrying hand matters: drop the left, move the right.
      await setPose(page, pose(null, { x: .7, y: .7 }));
      await page.waitForTimeout(350);
      one = await page.evaluate(() => VA.ARHandoff.state());
      check(!one.paused && one.stage === 'carry' && Math.abs(one.object.x - .725) < .03 && Math.abs(one.object.y - .675) < .03,
        'unused left wrist leaving the frame keeps the carry going and the souvenir on the right wrist');
    }
    await page.evaluate(() => VA.Screens.show('home'));
    await waitFor(page, () => window.__handoffDone === 1, side + '-only cleanup');
  }
  await page.evaluate(() => { VA.ARHandoff.TUNING.dwellMs = 300; });

  console.log('present keeps both-wrist pickup and its dwell');
  await installProvider(page);
  await start(page, 'present');
  await setPose(page, pose({ x: .2, y: .75 }, { x: .8, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().poseSeen, 'present ready for strictness check');
  await setPose(page, pose(null, { x: .5, y: .68 }));
  await waitFor(page, () => VA.ARHandoff.state().paused, 'present with one wrist before pickup pauses');
  check((await page.evaluate(() => VA.ARHandoff.state())).stage === 'pickup', 'passport does not pick up with a single visible wrist');
  await setPose(page, pose({ x: .5, y: .68 }, { x: .85, y: .75 }));
  await page.waitForTimeout(120);
  check((await page.evaluate(() => VA.ARHandoff.state())).stage === 'pickup', 'passport pickup still needs its dwell');
  await waitFor(page, () => VA.ARHandoff.state().stage === 'carry', 'passport dwell pickup');
  await finishAt(page, 'left', { x: .77, y: .38 });
  await waitFor(page, () => window.__handoffDone === 1, 'present strictness case complete');

  console.log('camera-off, unsupported, denied, model failure and pose timeout fallbacks');
  const fallbackCase = async ({ name, provider, camera = true, key = null, shot = null }) => {
    if (provider === 'unsupported') await page.evaluate(() => VA.CameraPose._setProviderForTest(null));
    else await installProvider(page, provider || 'ok');
    await start(page, name.includes('souvenir') ? 'receive' : 'present', { camera });
    await waitFor(page, () => VA.ARHandoff.state().inputMode === 'fallback', name + ' fallback', 4000);
    check(await vis(page, '.ar-handoff-fallback'), name + ': fallback button visible');
    if (shot) await page.screenshot({ path: SHOT(shot) });
    if (key) await page.keyboard.press(key);
    else await page.locator('.ar-handoff-fallback').click();
    await waitFor(page, () => window.__handoffDone === 1, name + ' resolve');
    await page.waitForTimeout(120);
    check((await page.evaluate(() => window.__handoffDone)) === 1, name + ': resolves exactly once');
  };
  await fallbackCase({ name: 'camera setting off', provider: 'ok', camera: false, shot: 'passport-fallback' });
  await fallbackCase({ name: 'unsupported', provider: 'unsupported', key: 'Space' });
  await fallbackCase({ name: 'denied', provider: 'denied', key: 'Enter' });
  await fallbackCase({ name: 'model-fail', provider: 'model-fail' });
  await page.evaluate(() => { VA.ARHandoff.TUNING.startTimeout = 250; });
  await fallbackCase({ name: 'pose-acquisition-timeout', provider: 'ok', key: 'Space' });
  await page.evaluate(() => { VA.ARHandoff.TUNING.startTimeout = 10000; });
  await fallbackCase({ name: 'souvenir fallback', provider: 'unsupported', shot: 'souvenir-fallback' });

  console.log('quiet assist appears late while camera continues');
  await installProvider(page);
  await page.evaluate(() => { VA.ARHandoff.TUNING.assistMs = 260; });
  await start(page, 'present');
  await setPose(page, pose({ x: .2, y: .75 }, { x: .8, y: .75 }));
  await waitFor(page, () => VA.ARHandoff.state().inputMode === 'camera', 'assist camera working');
  await page.waitForTimeout(120);
  check(!(await vis(page, '.ar-handoff-fallback')) && !(await page.evaluate(() => VA.ARHandoff.state().assist)), 'assist is never visible before assistMs');
  await waitFor(page, () => VA.ARHandoff.state().assist, 'assist appeared', 1500);
  check(await vis(page, '.ar-handoff-fallback'), 'assist button appears while camera mode stays active');
  check((await page.evaluate(() => VA.ARHandoff.state())).inputMode === 'camera', 'assist does not switch out of camera mode');
  await page.locator('.ar-handoff-fallback').click();
  await waitFor(page, () => window.__handoffDone === 1, 'assist completion');
  await page.evaluate(() => { VA.ARHandoff.TUNING.assistMs = 30000; });

  console.log('leaving the screen cleans up and resolves once');
  await installProvider(page);
  await start(page, 'present');
  await setPose(page, pose({ x: .2, y: .75 }, { x: .8, y: .75 }));
  await waitFor(page, () => VA.CameraPose.state().running, 'camera running before scene exit');
  await page.evaluate(() => VA.Screens.show('home'));
  await waitFor(page, () => window.__handoffDone === 1, 'scene exit resolve');
  resolved = await page.evaluate(() => ({ done: window.__handoffDone, camera: VA.CameraPose.state(),
    overlay: !!document.querySelector('.ar-handoff'), tracks: window.__handoffTracks.map(track => track.readyState) }));
  check(resolved.done === 1 && !resolved.camera.running && !resolved.overlay && resolved.tracks.every(state => state === 'ended'),
    'screen exit stops tracks, removes DOM and resolves once');

  console.log('real arrival flow and departure once-only integration');
  await page.evaluate(async () => {
    VA.CameraPose._setProviderForTest(null);
    VA.State.reset();
    VA.State.data.name = 'Mio';
    Object.assign(VA.State.data.settings, { camera: false, music: false, sfx: false, voice: false });
    window.__flowLog = [];
    VA.Flows._flight = async text => { window.__flowLog.push('flight:' + text); };
    VA.Dialogue.say = async (who, text) => { window.__flowLog.push('say:' + who + ':' + text); };
    VA.Dialogue.auto = async (who, text) => { window.__flowLog.push('auto:' + who + ':' + text); };
    VA.Dialogue.hide = () => {};
    VA.Flows._socialReply = async kind => { window.__flowLog.push('reply:' + kind); };
    const present = VA.ARHandoff.present.bind(VA.ARHandoff);
    VA.ARHandoff.present = cfg => { window.__flowLog.push('handoff:present'); return present(cfg); };
    VA.Fx.stampSlam = async id => { window.__flowLog.push('stamp:' + id); };
    VA.Fx.toast = () => {};
    VA.Art.waitForScreenAssets = async () => true;
    window.__arrivalDone = false;
    VA.Flows.travelTo('australia').then(() => { window.__arrivalDone = true; });
  });
  await waitFor(page, () => VA.ARHandoff.state().active && VA.ARHandoff.state().mode === 'present', 'arrival handoff');
  await page.locator('.ar-handoff-fallback').click();
  await waitFor(page, () => window.__arrivalDone, 'arrival flow done');
  const arrival = await page.evaluate(() => ({ log: window.__flowLog.slice(), stamps: VA.State.data.stamps.slice(),
    hotspot: document.querySelector('#hotspot-layer').style.visibility }));
  check(arrival.stamps.filter(id => id === 'australia').length === 1 && arrival.log.includes('auto:player:Here you are.') &&
    arrival.log.includes('say:officer:Welcome to Australia!') && arrival.hotspot === 'visible',
  'arrival saves stamp, models player line, welcomes and reveals hotspots');
  const order = (log, keys) => keys.map(k => log.indexOf(k)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
  check(order(arrival.log, ['say:officer:Hello!', 'reply:hello', 'say:officer:Passport, please.', 'handoff:present',
    'auto:player:Here you are.', 'stamp:australia', 'say:officer:Welcome to Australia!']) &&
    arrival.log.filter(x => x.startsWith('reply:')).join() === 'reply:hello',
  'arrival order: Hello → spoken hello → Passport, please → handoff → Here you are → stamp → welcome (no goodbye)');

  await page.evaluate(async () => {
    const originalCoins = VA.State.addCoins.bind(VA.State);
    const originalSouvenir = VA.State.setSouvenir.bind(VA.State);
    window.__departureCounts = { coins: 0, souvenir: 0, reward: 0 };
    VA.State.addCoins = amount => { window.__departureCounts.coins++; return originalCoins(amount); };
    VA.State.setSouvenir = item => { window.__departureCounts.souvenir++; return originalSouvenir(item); };
    VA.Dialogue.choice = async items => items[0].value;
    VA.Art.preloadAndWait = async () => true;
    VA.Cine.showItemReward = async () => { window.__departureCounts.reward++; };
    VA.Flows._flight = async text => { window.__flowLog.push('homeflight:' + text); };
    VA.Flows.debrief = async () => { window.__flowLog.push('debrief'); };
    VA.State.data.trip.souvenir = null;
    VA.State.data.coins = 12;
    window.__departureDone = false;
    VA.Flows._departureInner().then(() => { window.__departureDone = true; });
  });
  await waitFor(page, () => VA.ARHandoff.state().active && VA.ARHandoff.state().mode === 'receive', 'departure receive handoff');
  await page.locator('.ar-handoff-fallback').click();
  await waitFor(page, () => window.__departureDone, 'departure flow done');
  const departure = await page.evaluate(() => ({ counts: window.__departureCounts, coins: VA.State.data.coins,
    souvenir: VA.State.data.trip.souvenir, log: window.__flowLog.slice() }));
  check(departure.counts.coins === 1 && departure.coins === 9, 'departure removes three coins exactly once');
  check(departure.counts.souvenir === 1 && !!departure.souvenir, 'departure sets the chosen souvenir exactly once');
  check(departure.counts.reward === 1 && departure.log.includes('say:au_vendor:Goodbye!') && departure.log.some(x => x.startsWith('homeflight:Going home!')),
    'reward runs exactly once before Goodbye and the homeward flight');
  check(order(departure.log, ['say:au_vendor:Goodbye!', 'reply:goodbye', 'homeflight:Going home! 🏠']),
    'departure order: vendor Goodbye → spoken goodbye → flight home');

  check(errors.length === 0, 'no unexpected page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch(error => {
  console.error(error && error.stack || error);
  failures.push(error && error.message || String(error));
}).finally(async () => {
  if (browser) await browser.close();
  if (failures.length) {
    console.error('\nAR handoff test failed (' + failures.length + '):\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nAR handoff test passed.');
  }
});
