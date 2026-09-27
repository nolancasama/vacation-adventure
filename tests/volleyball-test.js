/* Australia volleyball AR contract.

   - Pure BUMP / SET / SPIKE geometry and mirrored pose output.
   - Camera constraints, phase progression, retry forgiveness and pose-loss pause.
   - Timing fallback for every camera-unavailable path, with keyboard and clicks.
   - Cleanup before the existing finale, scene-exit cleanup, and the real event.
   - One local-http smoke check for the vendored MediaPipe pose runtime/model.

   Run via: npm run test:volleyball
   Screenshots: .shots/volleyball/ (1366x768) */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'volleyball');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  \u2713 ' + msg);
  else { console.log('  \u2717 ' + msg); failures.push(msg); }
};

async function precondition(page, fn, arg, label, timeout = 8000) {
  try { await page.waitForFunction(fn, arg, { timeout }); }
  catch (_) { throw new Error('HARNESS_PRECONDITION_FAILED: ' + label); }
}
const vis = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return !!(el && el.offsetParent);
}, sel).catch(() => false);
const jsClick = (page, sel) => page.$eval(sel, el => el.click()).catch(() => {});
const volleyState = page => page.evaluate(() => VA.VolleyballAR.state());

function installTestEnvironment() {
  window.__realGumCalls = 0;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => {
      window.__realGumCalls++;
      return Promise.reject(new DOMException('blocked in test', 'NotAllowedError'));
    };
  }
}

/* A canvas MediaStream keeps Chromium's <video> lifecycle real. The fake
   landmarker emits raw MediaPipe coordinates; screen-space x is mirrored by
   CameraPose, never by this provider. */
async function installProvider(page, mode = 'ok') {
  await page.evaluate(providerMode => {
    window.__gum = 0;
    window.__constraints = null;
    window.__tracks = [];
    window.__poseKind = 'none';
    window.__spikeSample = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const g = canvas.getContext('2d');
    clearInterval(window.__posePaint);
    // Paint the last scripted landmarks as a stick figure in RAW camera
    // coordinates. The game shows the video mirrored, so screenshots prove
    // that the (once-mirrored) ball lines up with the drawn hands.
    window.__posePaint = setInterval(() => {
      g.fillStyle = '#8ed8ef';
      g.fillRect(0, 0, canvas.width, canvas.height);
      const raw = window.__lastRawPose;
      if (!raw) return;
      const P = i => [raw[i].x * canvas.width, raw[i].y * canvas.height];
      g.lineCap = 'round';
      g.strokeStyle = '#2d3a4a';
      g.lineWidth = 14;
      [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]].forEach(([a, b]) => {
        if (!raw[a].visibility || !raw[b].visibility) return;
        g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke();
      });
      g.fillStyle = '#2d3a4a';
      if (raw[0].visibility) { g.beginPath(); g.arc(...P(0), 34, 0, Math.PI * 2); g.fill(); }
      // student's LEFT wrist red, RIGHT wrist green
      [[15, '#e53935'], [16, '#43a047']].forEach(([i, c]) => {
        if (!raw[i].visibility) return;
        g.fillStyle = c; g.beginPath(); g.arc(...P(i), 13, 0, Math.PI * 2); g.fill();
      });
    }, 60);

    const screenPose = named => {
      const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0, presence: 0 }));
      const indices = { nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13,
        rightElbow: 14, leftWrist: 15, rightWrist: 16 };
      Object.entries(named).forEach(([key, point]) => {
        pts[indices[key]] = { x: 1 - point.x, y: point.y, z: 0, visibility: 1, presence: 1 };
      });
      // hips (drawing only): below the shoulders
      [[23, 11], [24, 12]].forEach(([hip, sh]) => { pts[hip] = { x: pts[sh].x, y: Math.min(0.98, pts[sh].y + 0.4), z: 0, visibility: 1, presence: 1 }; });
      window.__lastRawPose = pts;
      return pts;
    };
    const base = () => ({
      nose: { x: 0.5, y: 0.2 },
      leftShoulder: { x: 0.4, y: 0.42 }, rightShoulder: { x: 0.6, y: 0.42 },
      leftElbow: { x: 0.42, y: 0.58 }, rightElbow: { x: 0.58, y: 0.58 },
      leftWrist: { x: 0.45, y: 0.7 }, rightWrist: { x: 0.55, y: 0.7 },
    });
    const scripted = () => {
      if (window.__poseKind === 'none') return [];
      const pose = base();
      if (window.__poseKind === 'mirror') pose.leftShoulder = { x: 0.8, y: 0.42 };
      // arms wide apart and low: visible, but never a BUMP/SET/SPIKE
      if (window.__poseKind === 'apart') { pose.leftWrist = { x: 0.2, y: 0.72 }; pose.rightWrist = { x: 0.8, y: 0.72 }; }
      if (window.__poseKind !== 'follow') return [screenPose(pose)];
      const state = VA.VolleyballAR && VA.VolleyballAR.state();
      const ball = state && state.ball;
      if (!state || !ball || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return [screenPose(pose)];
      if (state.phase === 'bump') {
        pose.leftElbow = { x: ball.x - 0.035, y: ball.y - 0.1 };
        pose.rightElbow = { x: ball.x + 0.035, y: ball.y - 0.1 };
        pose.leftWrist = { x: ball.x - 0.012, y: ball.y };
        pose.rightWrist = { x: ball.x + 0.012, y: ball.y };
      } else if (state.phase === 'set') {
        pose.leftWrist = { x: ball.x - 0.01, y: ball.y };
        pose.rightWrist = { x: ball.x + 0.01, y: ball.y };
      } else if (state.phase === 'spike') {
        window.__spikeSample++;
        const atBall = window.__spikeSample % 2 === 0;
        pose.leftWrist = atBall
          ? { x: ball.x, y: ball.y }
          : { x: Math.max(0.05, ball.x - 0.3), y: Math.min(0.38, ball.y + 0.08) };
      }
      return [screenPose(pose)];
    };

    VA.CameraPose._setProviderForTest({
      getUserMedia(constraints) {
        window.__gum++;
        window.__constraints = constraints;
        if (providerMode === 'denied') return Promise.reject(new DOMException('no', 'NotAllowedError'));
        const stream = canvas.captureStream(15);
        stream.getTracks().forEach(track => window.__tracks.push(track));
        return Promise.resolve(stream);
      },
      loadLandmarker() {
        if (providerMode === 'model-fail') return Promise.reject(new Error('fake model failure'));
        const model = { detectForVideo() { return { landmarks: scripted() }; } };
        if (providerMode === 'slow') return new Promise(resolve => { window.__resolvePoseModel = () => resolve(model); });
        return model;
      },
    });
  }, mode);
}

async function resetState(page) {
  await page.evaluate(async () => {
    if (VA.VolleyballAR.state().active) await VA.Screens.show('explore');
    VA.Dialogue.hide();
    VA.State.reset();
    VA.State.data.name = 'Mio';
    VA.State.data.playerLook = 'girl';
    Object.assign(VA.State.data.settings, { music: false, voice: false, mic: false, camera: true });
    VA.State.data.coins = VA.Data.ALLOWANCE;
    VA.State.startTrip('australia');
    VA.applyPlayerLook('girl');
  });
}

async function startSynthetic(page, options = {}) {
  await resetState(page);
  if (options.camera === false) await page.evaluate(() => { VA.State.data.settings.camera = false; });
  await page.evaluate(async () => {
    const dest = VA.Data.destById('australia');
    const event = dest.events.find(item => item.id === 'volleyball');
    await VA.Cine.setup(event, dest);
    await VA.Screens.show('cine');
    window.__volleyDone = false;
    VA.VolleyballAR.start(event.steps.find(step => step.volleyballAR).volleyballAR, VA.Cine)
      .then(() => { window.__volleyDone = true; });
  });
  await precondition(page, () => VA.VolleyballAR.state().active, undefined, 'volleyball became active');
}

function stateHittable(state) {
  return !!(state && (state.hittable || (state.ball && state.ball.hittable)));
}

async function finishFallback(page, input) {
  let finaleShot = false;
  for (let i = 0; i < 300; i++) {
    if (!finaleShot && await vis(page, '#volleyball-finale.is-visible')) {
      finaleShot = true;
      await page.waitForTimeout(400); // past the overlay's opacity fade-in
      await page.screenshot({ path: SHOT('finale') });
    }
    if (await page.evaluate(() => window.__volleyDone)) return;
    const state = await volleyState(page);
    if (state.active && state.mode === 'fallback' && stateHittable(state)) {
      if (input === 'click') await page.locator('.volleyball-ar-hit').click();
      else await page.keyboard.press(input);
      await page.waitForTimeout(180);
      continue;
    }
    await page.waitForTimeout(60);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: fallback did not complete with ' + input);
}

function attemptFor(state) {
  if (typeof state.attempts === 'number') return state.attempts;
  return state.attempts && typeof state.attempts[state.phase] === 'number' ? state.attempts[state.phase] : 0;
}

function forgivenessFor(state) {
  if (typeof state.forgiveness === 'number') return state.forgiveness;
  if (typeof state.forgivenessFactor === 'number') return state.forgivenessFactor;
  return 1 + Math.min(attemptFor(state) * 0.15, 0.45);
}

function startStaticServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png' };
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
  await precondition(page, () => window.VA && VA.VolleyballAR && VA.CameraPose && VA.Cine && VA.Cine.world,
    undefined, 'game booted', 15000);

  // Keep repeated contract cases quick while still exercising the existing
  // finale implementation and its real overlay.
  await page.evaluate(() => {
    Object.keys(VA.Cine.VOLLEY_FINALE_TIMING).forEach(key => { VA.Cine.VOLLEY_FINALE_TIMING[key] = 35; });
    const original = VA.Cine.showVolleyballFinale.bind(VA.Cine);
    VA.Cine.showVolleyballFinale = async function () {
      const camera = VA.CameraPose.state();
      window.__beforeFinale = {
        camera, tracks: (window.__tracks || []).map(track => track.readyState),
      };
      window.__finaleCalls = (window.__finaleCalls || 0) + 1;
      const watcher = setInterval(() => {
        const overlay = document.querySelector('#volleyball-finale');
        if (overlay && !overlay.hidden) window.__finaleVisible = true;
      }, 10);
      try { return await original(); }
      finally { clearInterval(watcher); }
    };
  });

  console.log('geometry helpers (pure)');
  const geom = await page.evaluate(() => {
    const g = VA.VolleyballAR._geom;
    const t = VA.VolleyballAR.TUNING;
    const base = {
      nose: { x: 0.5, y: 0.2 },
      leftShoulder: { x: 0.4, y: 0.5 }, rightShoulder: { x: 0.6, y: 0.5 },
      leftElbow: { x: 0.45, y: 0.58 }, rightElbow: { x: 0.55, y: 0.58 },
      leftWrist: { x: 0.49, y: 0.66 }, rightWrist: { x: 0.51, y: 0.66 },
    };
    const bumpBall = { x: 0.5, y: 0.64, hittable: true };
    const setPose = { ...base, leftWrist: { x: 0.42, y: 0.3 }, rightWrist: { x: 0.58, y: 0.3 } };
    const setBall = { x: 0.42, y: 0.3, hittable: true };
    const prev = { ...base, leftWrist: { x: 0.15, y: 0.32 } };
    const spike = { ...base, leftWrist: { x: 0.48, y: 0.25 } };
    const spikeBall = { x: 0.48, y: 0.25, hittable: true };
    return {
      dist: g.dist({ x: 0, y: 0 }, { x: 3, y: 4 }),
      segment: g.pointSegmentDistance({ x: 0.5, y: 0.2 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
      midpoint: g.midpoint({ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.6 }),
      bumpYes: g.isBump(base, bumpBall, t),
      bumpNoWindow: g.isBump(base, { ...bumpBall, hittable: false }, t),
      bumpNoTogether: g.isBump({ ...base, leftWrist: { x: 0.1, y: 0.66 } }, bumpBall, t),
      setYes: g.isSet(setPose, setBall, t),
      setNoWindow: g.isSet(setPose, { ...setBall, hittable: false }, t),
      setNoRaised: g.isSet(base, setBall, t),
      spikeYes: g.isSpike(spike, prev, spikeBall, t),
      spikeNoWindow: g.isSpike(spike, prev, { ...spikeBall, hittable: false }, t),
      spikeNoMotion: g.isSpike(spike, spike, spikeBall, t),
    };
  });
  check(geom.dist === 5, 'dist returns Euclidean distance');
  check(Math.abs(geom.segment - 0.2) < 1e-9, 'pointSegmentDistance projects onto a segment');
  check(geom.midpoint.x === 0.5 && geom.midpoint.y === 0.5, 'midpoint averages both axes');
  check(geom.bumpYes && !geom.bumpNoWindow && !geom.bumpNoTogether, 'BUMP requires window, close wrists and ball contact');
  check(geom.setYes && !geom.setNoWindow && !geom.setNoRaised, 'SET requires window, raised wrists and ball contact');
  check(geom.spikeYes && !geom.spikeNoWindow && !geom.spikeNoMotion, 'SPIKE requires window, motion toward the ball and contact');

  console.log('classroom copy, waist-up pose, BUMP target (pure)');
  const pure = await page.evaluate(() => {
    const V = VA.VolleyballAR;
    const all = Object.values(V.HINTS).concat(Object.values(V.COPY)).join('\n');
    const waistUp = {
      nose: { x: 0.5, y: 0.2 },
      leftShoulder: { x: 0.4, y: 0.42 }, rightShoulder: { x: 0.6, y: 0.42 },
      leftElbow: { x: 0.42, y: 0.58 }, rightElbow: { x: 0.58, y: 0.58 },
      leftWrist: { x: 0.45, y: 0.7 }, rightWrist: { x: 0.55, y: 0.7 },
    };
    const low = JSON.parse(JSON.stringify(waistUp));
    low.leftShoulder.y = low.rightShoulder.y = 0.62;
    return {
      hints: V.HINTS, copy: V.COPY,
      banned: ['立って', 'Move back', 'Stand', 'step back', 'Step back'].filter(w => all.includes(w)),
      waistUp: V._poseComplete(waistUp),
      bump: V._target({ pose: waistUp }, 'bump'),
      bumpLow: V._target({ pose: low }, 'bump'),
    };
  });
  check(pure.hints.bump === 'うでをそろえてね！' && pure.hints.set === 'りょうてを上にあげてね！' && pure.hints.spike === 'うでを上からふってね！', 'move hints use the short control copy');
  check(pure.copy.frameJP === '上半身とうでが見えるようにしてね！' && pure.copy.lostJP === 'りょううでが見えるようにしてね！', 'framing and lost-pose Japanese copy');
  check(pure.banned.length === 0, 'no volleyball copy asks to stand or move back (' + pure.banned.join(',') + ')');
  check(pure.waistUp, 'nose + shoulders + elbows + wrists alone is a complete pose (no hips/legs)');
  check(Math.abs(pure.bump.y - 0.65) < 0.005 && pure.bump.y < 0.72, 'BUMP target is shoulders + 0.23 (above the old +0.30)');
  check(Math.abs(pure.bumpLow.y - 0.74) < 0.005, 'BUMP target is capped at 0.74 for a low-framed student');

  console.log('camera pose seam, front camera and one mirror conversion');
  await installProvider(page, 'ok');
  const cameraProbe = await page.evaluate(async () => {
    window.__poseKind = 'mirror';
    let seen = null;
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    document.body.appendChild(video);
    await VA.CameraPose.start({ videoEl: video, onPose: pose => { seen = pose; }, onStatus() {} });
    const until = performance.now() + 2000;
    while (!seen && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
    const result = { seen, constraints: window.__constraints, state: VA.CameraPose.state() };
    VA.CameraPose.stop();
    video.remove();
    return result;
  });
  check(cameraProbe.constraints.video.facingMode === 'user' && cameraProbe.constraints.audio === false,
    'camera requests facingMode user with video-only constraints');
  check(cameraProbe.seen && Math.abs(cameraProbe.seen.leftShoulder.x - 0.8) < 0.001,
    'raw x=0.2 is mirrored exactly once to screen x=0.8');
  check(cameraProbe.state.poseSeen && cameraProbe.state.inferenceCount > 0, 'pose state reports a seen inference');

  console.log('camera phase order and finale cleanup');
  await installProvider(page, 'ok');
  await startSynthetic(page);
  await precondition(page, () => VA.VolleyballAR.state().mode === 'camera', undefined, 'camera mode before a pose');
  const frameUi = await page.evaluate(() => ({
    command: document.querySelector('.volleyball-ar-command').textContent,
    hint: document.querySelector('.volleyball-ar-hint').textContent,
  }));
  check(frameUi.command === 'Show your upper body!' && frameUi.hint === '上半身とうでが見えるようにしてね！',
    'camera start asks for the upper body (no standing, no moving back) ' + JSON.stringify(frameUi));
  await page.screenshot({ path: SHOT('ready') });
  check(!(await vis(page, '.volleyball-ar-hit')), 'fallback button is absent while camera mode works');
  await page.evaluate(() => { window.__poseKind = 'base'; });
  await precondition(page, () => VA.VolleyballAR.state().phase === 'bump', undefined, 'BUMP began');
  // First BUMP: instruction + demo while the real ball waits.
  const tut = await page.evaluate(() => {
    const hint = document.querySelector('.volleyball-ar-hint');
    const cmd = document.querySelector('.volleyball-ar-command').getBoundingClientRect();
    const h = hint.getBoundingClientRect();
    const demo = document.querySelector('.volleyball-ar-demo');
    return { st: VA.VolleyballAR.state(), hint: hint.textContent, demo: !!(demo && demo.offsetParent) && demo.classList.contains('demo-bump'),
      ballHidden: document.querySelector('.volleyball-ar-ball').hidden, hintBelowCommand: h.top >= cmd.bottom - 2 && h.top - cmd.bottom < 30,
      stageH: document.querySelector('.volleyball-ar').getBoundingClientRect().height, hintTop: h.top - document.querySelector('.volleyball-ar').getBoundingClientRect().top };
  });
  check(tut.st.tutorial === 'bump' && tut.demo && tut.hint === 'うでをそろえてね！', 'first BUMP shows its Japanese and the gesture demo');
  check(tut.st.ball === null && tut.ballHidden, 'the real ball waits during the BUMP demo');
  check(tut.hintBelowCommand && tut.hintTop < tut.stageH * 0.25, 'Japanese instruction sits directly under the command, not at the bottom');
  await page.waitForTimeout(450);
  await page.screenshot({ path: SHOT('bump-tutorial') });
  check(await page.evaluate(() => VA.VolleyballAR.state().ball === null), 'ball still waiting mid-demo');
  await precondition(page, () => { const st = VA.VolleyballAR.state(); return st.tutorial === null && st.ball; }, undefined, 'BUMP demo ended and ball launched', 3000);
  check(!(await vis(page, '.volleyball-ar-demo')), 'demo hidden once the ball is live');
  await page.waitForTimeout(700);
  await page.screenshot({ path: SHOT('bump-live') });
  const videoTransform = await page.evaluate(() => {
    const video = document.querySelector('.volleyball-ar video');
    return video && getComputedStyle(video).transform;
  });
  check(videoTransform && videoTransform !== 'none', 'camera video is visually mirrored');
  await page.evaluate(() => { window.__poseKind = 'follow'; });
  // Screenshot each phase at its contact moment (ball held at the hands), so
  // the drawn skeleton shows whether the mirrored ball lines up with them.
  const contact = phase => page.waitForFunction(p => {
    const st = VA.VolleyballAR.state();
    return st.phase === p && st.ball && st.ball.stage === 'contact';
  }, phase, { timeout: 10000, polling: 'raf' }).then(() => true).catch(() => false);
  check(await contact('bump'), 'BUMP contact reached');
  await page.screenshot({ path: SHOT('bump') });
  await precondition(page, () => VA.VolleyballAR.state().phase === 'set', undefined, 'SET followed BUMP', 10000);
  const setTut = await page.evaluate(() => ({ st: VA.VolleyballAR.state(), hint: document.querySelector('.volleyball-ar-hint').textContent,
    demo: document.querySelector('.volleyball-ar-demo').classList.contains('demo-set') }));
  check(setTut.st.tutorial === 'set' && setTut.st.ball === null && setTut.demo && setTut.hint === 'りょうてを上にあげてね！', 'first SET: Japanese + demo, ball waits');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT('set-tutorial') });
  check(await contact('set'), 'SET contact reached');
  await page.screenshot({ path: SHOT('set') });
  await precondition(page, () => VA.VolleyballAR.state().phase === 'spike', undefined, 'SPIKE followed SET', 10000);
  const spikeTut = await page.evaluate(() => ({ st: VA.VolleyballAR.state(), hint: document.querySelector('.volleyball-ar-hint').textContent,
    demo: document.querySelector('.volleyball-ar-demo').classList.contains('demo-spike') }));
  check(spikeTut.st.tutorial === 'spike' && spikeTut.st.ball === null && spikeTut.demo && spikeTut.hint === 'うでを上からふってね！', 'first SPIKE: Japanese + demo, ball waits');
  await page.waitForTimeout(650);
  await page.screenshot({ path: SHOT('spike-tutorial') });
  check(await contact('spike'), 'SPIKE contact reached');
  await page.screenshot({ path: SHOT('spike') });
  await precondition(page, () => (window.__finaleCalls || 0) > 0, undefined, 'finale started after SPIKE', 10000);
  const beforeFinale = await page.evaluate(() => window.__beforeFinale);
  check(!beforeFinale.camera.running && beforeFinale.tracks.every(state => state === 'ended'),
    'tracks and inference are stopped before the finale is awaited');
  const frozenInference = beforeFinale.camera.inferenceCount;
  await page.waitForTimeout(350);
  check(await page.evaluate(n => VA.CameraPose.state().inferenceCount === n, frozenInference), 'inference count stays frozen during the finale');
  await precondition(page, () => window.__volleyDone, undefined, 'camera volleyball and finale completed');
  check(await page.evaluate(() => window.__finaleVisible === true), 'the existing #volleyball-finale overlay is shown');

  console.log('miss retry and adaptive forgiveness');
  await installProvider(page, 'ok');
  await startSynthetic(page, { camera: false });
  await precondition(page, () => VA.VolleyballAR.state().phase === 'bump', undefined, 'fallback BUMP began');
  const beforeMiss = await volleyState(page);
  await precondition(page, before => {
    const state = VA.VolleyballAR.state();
    const attempts = typeof state.attempts === 'number' ? state.attempts : ((state.attempts || {})[state.phase] || 0);
    return state.phase === before.phase && attempts > before.attempt;
  }, { phase: beforeMiss.phase, attempt: attemptFor(beforeMiss) }, 'miss retried BUMP', 10000);
  const afterMiss = await volleyState(page);
  check(afterMiss.phase === beforeMiss.phase, 'a miss retries only the current phase');
  check(attemptFor(afterMiss) === attemptFor(beforeMiss) + 1 && forgivenessFor(afterMiss) > forgivenessFor(beforeMiss),
    'a miss increments the phase attempt and increases hidden forgiveness');
  await page.evaluate(() => VA.Screens.show('explore'));
  await precondition(page, () => !VA.VolleyballAR.state().active, undefined, 'miss test cleaned up on scene exit');

  console.log('lost pose pauses without counting a miss');
  await installProvider(page, 'ok');
  await startSynthetic(page);
  await page.evaluate(() => { window.__poseKind = 'base'; });
  await precondition(page, () => VA.VolleyballAR.state().phase === 'bump', undefined, 'pose-loss BUMP began');
  const beforeLoss = await volleyState(page);
  await page.evaluate(() => { window.__poseKind = 'none'; });
  await precondition(page, () => {
    const state = VA.VolleyballAR.state();
    return state.paused || state.poseLost || state.status === 'lost';
  }, undefined, 'pose loss paused play', 3000);
  await page.waitForTimeout(800);
  const duringLoss = await volleyState(page);
  check(attemptFor(duringLoss) === attemptFor(beforeLoss), 'pose loss does not count as a miss');
  const lostUi = await page.evaluate(() => ({ msg: document.querySelector('.volleyball-ar-message').textContent,
    hint: document.querySelector('.volleyball-ar-hint').textContent }));
  check(lostUi.msg === 'Show your arms! 🙂' && lostUi.hint === 'りょううでが見えるようにしてね！', 'lost pose asks to show the arms, not to move back');
  await page.screenshot({ path: SHOT('pose-lost') });
  await page.evaluate(() => { window.__poseKind = 'base'; });
  await precondition(page, () => {
    const state = VA.VolleyballAR.state();
    return !(state.paused || state.poseLost || state.status === 'lost');
  }, undefined, 'pose recovery resumed play', 3000);
  check(await page.evaluate(() => document.querySelector('.volleyball-ar-hint').textContent) === 'うでをそろえてね！',
    'recovery restores the BUMP instruction instead of the lost-pose text');
  await page.evaluate(() => VA.Screens.show('explore'));

  console.log('camera miss retries without replaying the tutorial');
  await installProvider(page, 'ok');
  await startSynthetic(page);
  await page.evaluate(() => { window.__poseKind = 'apart'; });
  await precondition(page, () => VA.VolleyballAR.state().tutorial === 'bump', undefined, 'retry test: BUMP demo shown');
  await precondition(page, () => (VA.VolleyballAR.state().attempts || {}).bump === 1, undefined, 'camera BUMP missed once', 8000);
  const retry = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve({
    st: VA.VolleyballAR.state(), demo: !!document.querySelector('.volleyball-ar-demo').offsetParent,
    hint: document.querySelector('.volleyball-ar-hint').textContent,
  }), 500)));
  check(retry.st.phase === 'bump' && retry.st.tutorial === null && !retry.demo, 'a BUMP retry does not replay the demo');
  check(!!retry.st.ball && retry.hint === '', 'a BUMP retry sends the ball at once without the Japanese tutorial');
  await page.evaluate(() => VA.Screens.show('explore'));

  console.log('leaving during the tutorial never launches a late ball');
  await installProvider(page, 'ok');
  await startSynthetic(page);
  await page.evaluate(() => { window.__poseKind = 'base'; });
  await precondition(page, () => VA.VolleyballAR.state().tutorial === 'bump', undefined, 'exit test: BUMP demo shown');
  await page.evaluate(() => VA.Screens.show('explore'));
  await precondition(page, () => !VA.VolleyballAR.state().active, undefined, 'exit during tutorial cleaned up');
  await page.waitForTimeout(1600);
  const afterExit = await page.evaluate(() => ({ st: VA.VolleyballAR.state(), dom: !!document.querySelector('.volleyball-ar'), cam: VA.CameraPose.state().running }));
  check(!afterExit.st.active && !afterExit.st.ball && !afterExit.dom && !afterExit.cam, 'no tutorial timer launches a ball after leaving');

  console.log('camera failures and camera-off setting use fallback');
  const fallbackCase = async (mode, camera, input, shot) => {
    if (mode === 'unsupported') await page.evaluate(() => VA.CameraPose._setProviderForTest(null));
    else await installProvider(page, mode);
    await startSynthetic(page, { camera });
    await precondition(page, () => VA.VolleyballAR.state().mode === 'fallback', undefined, mode + ' reached fallback', 5000);
    check(await vis(page, '.volleyball-ar-hit'), mode + ': fallback button is visible');
    const fbUi = await page.evaluate(() => ({ hint: document.querySelector('.volleyball-ar-hint').textContent,
      demo: !!document.querySelector('.volleyball-ar-demo').offsetParent }));
    check(fbUi.hint === 'ボールが光ったら「HIT!」をおしてね！' && !fbUi.demo, mode + ': fallback explains tapping, no gesture demo');
    if (shot) await page.screenshot({ path: SHOT(shot) });
    await finishFallback(page, input);
    check(await page.evaluate(() => window.__volleyDone), mode + ': fallback completes with ' + input);
  };
  await fallbackCase('denied', true, 'Space', 'fallback');
  await fallbackCase('model-fail', true, 'click');
  await installProvider(page, 'slow');
  await page.evaluate(() => { VA.VolleyballAR.TUNING.startTimeout = 250; });
  await startSynthetic(page);
  await precondition(page, () => VA.VolleyballAR.state().mode === 'fallback', undefined, 'model timeout reached fallback', 3000);
  await page.evaluate(() => { window.__resolvePoseModel(); VA.VolleyballAR.TUNING.startTimeout = 10000; });
  await finishFallback(page, 'Space');
  check(await page.evaluate(() => window.__volleyDone), 'model timeout fallback completes');
  await installProvider(page, 'ok');
  const gumBeforeSetting = await page.evaluate(() => window.__gum);
  await startSynthetic(page, { camera: false });
  await precondition(page, () => VA.VolleyballAR.state().mode === 'fallback', undefined, 'camera setting reached fallback');
  check(await page.evaluate(n => window.__gum === n, gumBeforeSetting), 'settings.camera false never requests the camera');
  await finishFallback(page, 'Enter');
  await fallbackCase('unsupported', true, 'click');

  console.log('pose lost too long changes to timing fallback');
  await installProvider(page, 'ok');
  await page.evaluate(() => { VA.VolleyballAR.TUNING.lostPoseMs = 500; });
  await startSynthetic(page);
  await precondition(page, () => VA.VolleyballAR.state().mode === 'camera', undefined, 'camera active before extended pose loss');
  await precondition(page, () => VA.VolleyballAR.state().mode === 'fallback', undefined, 'extended pose loss reached fallback', 3000);
  await page.evaluate(() => { VA.VolleyballAR.TUNING.lostPoseMs = 8000; });
  await finishFallback(page, 'click');

  console.log('leaving mid-game is idempotent cleanup');
  await installProvider(page, 'ok');
  await startSynthetic(page);
  await page.evaluate(() => { window.__poseKind = 'base'; });
  await precondition(page, () => VA.CameraPose.state().running, undefined, 'camera running before scene exit');
  await page.evaluate(async () => { await VA.Screens.show('explore'); });
  await precondition(page, () => !VA.VolleyballAR.state().active && window.__volleyDone, undefined, 'scene exit resolved start');
  const left = await page.evaluate(() => ({ camera: VA.CameraPose.state(), tracks: window.__tracks.map(t => t.readyState),
    dom: !!document.querySelector('.volleyball-ar') }));
  check(!left.camera.running && left.tracks.every(state => state === 'ended') && !left.dom,
    'scene exit removes DOM, listeners/inference and camera tracks');
  await page.evaluate(() => VA.CameraPose.stop());

  console.log('real Australia volleyball event end to end');
  await page.evaluate(() => VA.CameraPose._setProviderForTest(null));
  await resetState(page);
  await page.evaluate(async () => {
    VA.State.checkpoint('explore');
    VA.UI.explore(VA.Data.destById('australia'));
    document.querySelector('#hotspot-layer').style.visibility = 'visible';
    VA.Flows._eventBusy = false;
    window.__niceSeen = false;
    const caption = VA.Fx.captionBig.bind(VA.Fx);
    VA.Fx.captionBig = text => { if (text === 'Nice!') window.__niceSeen = true; return caption(text); };
    await VA.Screens.show('explore');
  });
  await jsClick(page, '#hs-volleyball');
  await precondition(page, () => document.querySelector('#scr-cine').classList.contains('active'), undefined, 'real event opened');
  for (let i = 0; i < 500; i++) {
    const done = await page.evaluate(() => {
      const hot = document.querySelector('#hs-volleyball');
      return hot && hot.classList.contains('done') && hot.offsetParent && document.querySelector('#dialogue').style.display === 'none';
    }).catch(() => false);
    if (done) break;
    const yes = page.locator('#choices .choice-btn:not([disabled])', { hasText: "Yes! Let's play!" });
    if (await yes.count() && await yes.first().isVisible().catch(() => false)) { await yes.first().click(); await page.waitForTimeout(200); continue; }
    const state = await volleyState(page).catch(() => null);
    if (state && state.active && state.mode === 'fallback' && stateHittable(state)) {
      await jsClick(page, '.volleyball-ar-hit'); await page.waitForTimeout(180); continue;
    }
    if (await vis(page, '#dialogue')) { await jsClick(page, '#dialogue'); await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(80);
  }
  const real = await page.evaluate(() => ({
    photo: VA.State.data.book.australia && VA.State.data.book.australia.photos.volleyball,
    nice: window.__niceSeen,
    done: document.querySelector('#hs-volleyball').classList.contains('done'),
  }));
  check(real.done && real.nice, 'real event continues through Nice! after the finale');
  check(real.photo && real.photo.caption === 'I played volleyball.', 'real event saves the unchanged volleyball photo caption');

  console.log('vendored pose model loads over http');
  server = await startStaticServer();
  const port = server.address().port;
  const httpPage = await context.newPage();
  httpPage.on('pageerror', error => errors.push('HTTP PAGEERROR: ' + error.message));
  await httpPage.goto(`http://127.0.0.1:${port}/index.html`);
  await precondition(httpPage, () => window.VA && VA.CameraPose, undefined, 'http page booted', 15000);
  check(await httpPage.evaluate(() => VA.CameraPose.isSupported()), 'http origin reports pose camera supported');
  const beforeLoad = await httpPage.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => /mediapipe/.test(n)));
  check(beforeLoad.length === 0, 'pose runtime/model load lazily, not at startup');
  const load = await httpPage.evaluate(async () => {
    const started = performance.now();
    try {
      const landmarker = await VA.CameraPose._loadLandmarker();
      return { ok: typeof landmarker.detectForVideo === 'function', ms: Math.round(performance.now() - started) };
    } catch (error) { return { ok: false, error: String(error && error.message || error) }; }
  });
  check(load.ok, 'vendored MediaPipe runtime + pose model load locally (' + (load.ms || load.error) + ' ms)');
  await httpPage.close();

  check(errors.length === 0, 'no unexpected page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch(error => {
  failures.push(String(error && error.stack || error));
  console.log('FATAL', error);
}).finally(async () => {
  if (server) server.close();
  if (browser) await browser.close();
  if (failures.length) { console.log(`\nVOLLEYBALL TESTS FAILED (${failures.length})`); process.exit(1); }
  console.log('\nVOLLEYBALL TESTS OK');
});
