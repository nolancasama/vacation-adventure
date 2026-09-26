/* Player-controlled LOOK browser contract.

   Exercises the reusable interaction directly, then plays the three real
   sightseeing timelines through their look beats and saved photos.

   Run via: npm run test:look
   Screenshots: .shots/look/ (1366x768). */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PAGE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '..', '.shots', 'look');
const OBSERVE_OUT = path.join(OUT, 'observe');
const EGYPT_OBSERVE_OUT = path.join(OBSERVE_OUT, 'egypt');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OBSERVE_OUT, { recursive: true });
fs.mkdirSync(EGYPT_OBSERVE_OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const OBSERVE_SHOT = name => path.join(OBSERVE_OUT, name + '.png');
const EGYPT_SHOT = name => path.join(EGYPT_OBSERVE_OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  \u2713 ' + msg);
  else { console.log('  \u2717 ' + msg); failures.push(msg); }
};

async function precondition(page, fn, arg, label, timeout = 8000) {
  try {
    await page.waitForFunction(fn, arg, { timeout });
  } catch (error) {
    throw new Error('HARNESS_PRECONDITION_FAILED: ' + label);
  }
}

const lookState = page => page.evaluate(() => VA.Look.state());
const visible = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  return !!(el && el.offsetParent);
}, selector).catch(() => false);
const jsClick = (page, selector) => page.$eval(selector, el => el.click()).catch(() => {});
const actorX = (page, actorId) => page.evaluate(id => {
  const actor = VA.Cine.ctx && VA.Cine.ctx.actors[id];
  return actor ? Number.parseFloat(actor.style.left) : null;
}, actorId);
const backdropFile = page => page.evaluate(() => {
  const layers = document.querySelectorAll('.scene-art .art-layer');
  const layer = layers[layers.length - 1];
  return layer && layer.dataset.assetPath;
});

async function pulse(page, key, ms = 90) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

// `pinned` names an axis the view could not move along last time (it is at a
// pan limit), so steering switches to the other axis instead of pressing the
// same dead key forever — e.g. Coco's centre sits below the lowest view.
function keyToward(state, point, axis = 'xy', pinned = null) {
  const dx = point.x - state.view.x;
  const dy = point.y - state.view.y;
  const horizontal = dx >= 0 ? 'ArrowRight' : 'ArrowLeft';
  const vertical = dy >= 0 ? 'ArrowDown' : 'ArrowUp';
  if (axis === 'x') return horizontal;
  if (axis === 'y') return vertical;
  if (pinned === 'y') return horizontal;
  if (pinned === 'x') return vertical;
  return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
}

const pinnedAxis = (before, after, key) =>
  before && after && before.view.x === after.view.x && before.view.y === after.view.y
    ? (/Up|Down/.test(key) ? 'y' : 'x') : null;

async function moveViewNear(page, point, axis = 'xy', tolerance = 12, label = 'move view') {
  for (let i = 0; i < 180; i++) {
    const st = await lookState(page);
    if (!st.active) return st;
    const dx = axis === 'y' ? 0 : point.x - st.view.x;
    const dy = axis === 'x' ? 0 : point.y - st.view.y;
    if (Math.hypot(dx, dy) <= tolerance) return st;
    await pulse(page, keyToward(st, point, axis), 65);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: ' + label);
}

async function finishCurrentLook(page, axis = 'xy', label = 'finish look') {
  let last = null, lastKey = null;
  for (let i = 0; i < 320; i++) {
    const st = await lookState(page);
    if (!st.active || st.found) return;
    // distance is 0 exactly when the reticle is inside the accepted target.
    if (st.distance === 0) {
      await page.waitForTimeout(70);
      last = null;
      continue;
    }
    lastKey = keyToward(st, st.target, axis, pinnedAxis(last, st, lastKey));
    last = st;
    await pulse(page, lastKey, 75);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: ' + label + ' ' + JSON.stringify(await lookState(page)));
}

async function dragTowardTarget(page, axis = 'xy', label = 'drag toward target') {
  const stage = await page.locator('#scr-cine').boundingBox();
  if (!stage) throw new Error('HARNESS_PRECONDITION_FAILED: cinematic stage has bounds for ' + label);
  const cx = stage.x + stage.width / 2;
  const cy = stage.y + stage.height / 2;
  for (let i = 0; i < 80; i++) {
    const st = await lookState(page);
    if (!st.active || st.found) return;
    if (st.distance === 0) {
      await page.waitForTimeout(80);
      continue;
    }
    const dx = axis === 'y' ? 0 : st.target.x - st.view.x;
    const dy = axis === 'x' ? 0 : st.target.y - st.view.y;
    const sx = Math.abs(dx) < 25 ? 0 : Math.sign(dx) * Math.min(260, Math.max(70, Math.abs(dx) / 2));
    const sy = Math.abs(dy) < 25 ? 0 : Math.sign(dy) * Math.min(190, Math.max(60, Math.abs(dy) / 2));
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + sx, cy + sy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(45);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: ' + label);
}

async function observeContract(page, panorama, label) {
  await precondition(page, () => {
    const root = document.querySelector('.look-observe');
    return root && Number.parseFloat(getComputedStyle(root).opacity) >= .99;
  }, undefined, label + ': observe fade-in completed');
  const st = await lookState(page);
  check(st.active && st.presentation === 'observe', label + ': dedicated observe presentation is active');
  check(st.panorama === panorama && st.loaded && !st.usedFallback,
    label + ': approved panorama loaded without fallback');
  check(!await visible(page, '#dialogue'), label + ': dialogue is hidden during observation');
  check(await visible(page, '.look-observe') && await visible(page, '.look-observe-panorama'),
    label + ': observe overlay and panorama are visible');
}

async function armActorTelemetry(page, actorId) {
  await page.evaluate(id => {
    window.__lookSfx = [];
    window.__lookSawAnim = false;
    if (!window.__lookSfxWrapped) {
      const original = VA.Audio.sfx.bind(VA.Audio);
      VA.Audio.sfx = name => { window.__lookSfx.push(name); return original(name); };
      window.__lookSfxWrapped = true;
    }
    const actor = VA.Cine.ctx && VA.Cine.ctx.actors[id];
    const node = actor && actor.querySelector('.actor-svg-wrap > :not(.player-vfx-rig)');
    if (window.__lookAnimObserver) window.__lookAnimObserver.disconnect();
    if (node) {
      window.__lookAnimObserver = new MutationObserver(() => {
        if (node.classList.contains('hop') || node.classList.contains('wiggle')) window.__lookSawAnim = true;
      });
      window.__lookAnimObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
    }
  }, actorId);
}

async function setupScene(page, destId, eventId) {
  await page.evaluate(async ({ destId, eventId }) => {
    VA.Dialogue.hide();
    VA.State.reset();
    VA.State.data.name = 'Mio';
    VA.State.data.playerLook = 'girl';
    VA.State.data.coins = 20;
    VA.State.data.settings.music = false;
    VA.State.data.settings.voice = false;
    VA.State.startTrip(destId);
    VA.applyPlayerLook('girl');
    VA.HUD.show();
    const dest = VA.Data.destById(destId);
    const event = dest.events.find(item => item.id === eventId);
    await VA.Cine.setup(event, dest);
    await VA.Screens.show('cine');
  }, { destId, eventId });
}

async function startSynthetic(page, cfg) {
  await page.evaluate(config => {
    window.__lookResumeCount = 0;
    VA.Look.run(config, VA.Cine).then(() => { window.__lookResumeCount++; });
  }, cfg);
  await precondition(page, () => VA.Look.state().active, undefined, 'synthetic look became active');
}

async function stopSynthetic(page) {
  if ((await lookState(page)).active) await finishCurrentLook(page, 'xy', 'synthetic cleanup');
  await precondition(page, () => !VA.Look.state().active, undefined, 'synthetic look cleaned up');
}

async function startRealEvent(page, destId, eventId) {
  await setupScene(page, destId, eventId);
  await page.evaluate(({ destId, eventId }) => {
    const dest = VA.Data.destById(destId);
    const event = dest.events.find(item => item.id === eventId);
    window.__eventDone = 0;
    VA.Cine.play(event.steps).then(() => { window.__eventDone++; });
  }, { destId, eventId });
}

async function advanceToLook(page, label, seenDialogue = null, actorTelemetry = null) {
  for (let i = 0; i < 240; i++) {
    if (await page.evaluate(() => VA.Look.state().active).catch(() => false)) {
      if (actorTelemetry) actorTelemetry.observe = await actorX(page, actorTelemetry.id);
      return;
    }
    if (await visible(page, '#choices')) {
      const choice = page.locator('#choices .choice-btn:not([disabled])').first();
      if (await choice.count()) {
        await jsClick(page, '#choices .choice-btn:not([disabled])');
        await page.waitForTimeout(120);
        continue;
      }
    }
    if (await visible(page, '#dialogue')) {
      const text = await page.locator('#dlg-text').textContent().catch(() => '');
      if (seenDialogue && text) seenDialogue.push(text);
      if (actorTelemetry && text.includes(actorTelemetry.line)) actorTelemetry.lineX = await actorX(page, actorTelemetry.id);
      await jsClick(page, '#dialogue');
      await page.waitForTimeout(100);
      continue;
    }
    await page.waitForTimeout(80);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: ' + label + ' look became active');
}

async function finishEventAndCapturePhoto(page, eventId, shotName) {
  let captured = false;
  for (let i = 0; i < 400; i++) {
    if (!captured && await visible(page, '#photo-toast')) {
      await page.screenshot({ path: SHOT(shotName) });
      captured = true;
    }
    if (await page.evaluate(() => window.__eventDone === 1)) break;
    if (await page.evaluate(() => VA.Look.state().active).catch(() => false)) {
      throw new Error('HARNESS_PRECONDITION_FAILED: unexpected unfinished look in ' + eventId);
    }
    if (await visible(page, '#choices')) {
      const choice = page.locator('#choices .choice-btn:not([disabled])').first();
      if (await choice.count()) await jsClick(page, '#choices .choice-btn:not([disabled])');
    } else if (await visible(page, '#dialogue')) {
      await jsClick(page, '#dialogue');
    }
    await page.waitForTimeout(90);
  }
  check(captured, eventId + ': final photo toast was shown and captured');
  check(await page.evaluate(() => window.__eventDone === 1), eventId + ': cinematic resumed exactly once');
  return page.evaluate(id => {
    const trip = VA.State.data.trip;
    return VA.State.data.book[trip.dest].photos[id];
  }, eventId);
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ERR_FILE_NOT_FOUND|CORS|net::ERR_FAILED/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });
  await page.goto(PAGE_URL);
  await precondition(page, () => !!(window.VA && VA.Look && VA.Cine.world), undefined, 'game and VA.Look booted');
  await setupScene(page, 'australia', 'kangaroo');

  console.log('interaction contract');
  await startSynthetic(page, {
    targetRect: { x: 650, y: 295, w: 2, h: 2 }, axis: 'x', s: 1.4,
    start: { x: 270, y: 300 }, radius: 100, hold: 700, prompt: 'Look over there!', found: 'Found it!',
  });
  let st = await lookState(page);
  const arrowStart = st.view.x;
  check(st.active && await page.evaluate(() => window.__lookResumeCount === 0), 'look pauses cinematic progression');
  await pulse(page, 'ArrowRight', 180);
  st = await lookState(page);
  check(st.view.x > arrowStart, 'held Arrow key moves the view');

  // Enter the hit region only briefly, then leave it before the hold completes.
  await moveViewNear(page, { x: 575, y: 300 }, 'x', 8, 'brief dwell entry');
  await page.waitForTimeout(110);
  check((await lookState(page)).active, 'a brief touch of the target does not complete the look');
  for (let i = 0; i < 8 && (await lookState(page)).distance <= 120; i++) await pulse(page, 'ArrowLeft', 80);
  await precondition(page, () => VA.Look.state().dwellMs === 0, undefined, 'dwell reset after leaving target');

  // Finish 70px off centre: inside the generous radius, but not pixel-perfect.
  await moveViewNear(page, { x: 580, y: 300 }, 'x', 7, 'generous hit position');
  await precondition(page, () => !VA.Look.state().active, undefined, 'off-centre dwell completed', 2500);
  check((await lookState(page)).found, 'the generous hit region accepts a slightly off-centre view');
  check(await page.evaluate(() => window.__lookResumeCount === 1), 'success resumes the awaiting cinematic exactly once');
  const settledTransform = await page.locator('#cine-world').evaluate(el => el.style.transform);
  await pulse(page, 'ArrowRight', 180);
  check(!(await lookState(page)).active &&
    await page.locator('#cine-world').evaluate(el => el.style.transform) === settledTransform,
  'listeners and animation loop are inactive after success');

  await startSynthetic(page, {
    targetRect: { x: 580, y: 180, w: 2, h: 2 }, axis: 'xy', s: 1.4,
    start: { x: 300, y: 430 }, radius: 80, hold: 350, prompt: 'Look!',
  });
  st = await lookState(page);
  const dragStart = { ...st.view };
  const stage = await page.locator('#scr-cine').boundingBox();
  if (!stage) throw new Error('HARNESS_PRECONDITION_FAILED: cinematic stage has bounds');
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width / 2 + 120, stage.y + stage.height / 2 - 100, { steps: 8 });
  await page.mouse.up();
  st = await lookState(page);
  check(st.view.x > dragStart.x && st.view.y < dragStart.y, 'pointer drag moves the view in the drag direction');
  await finishCurrentLook(page, 'xy', 'pointer-drag look completion');

  await startSynthetic(page, {
    targetRect: { x: 590, y: 300, w: 2, h: 2 }, axis: 'x', s: 1.4,
    start: { x: 300, y: 300 }, radius: 80, hold: 350, prompt: 'Look over there!',
  });
  const buttonStart = (await lookState(page)).view.x;
  const rightButton = page.locator('button[data-dir="right"], button[data-look-dir="right"], .look-right').first();
  if (!await rightButton.count()) throw new Error('HARNESS_PRECONDITION_FAILED: right on-screen look button exists');
  const buttonBox = await rightButton.boundingBox();
  if (!buttonBox || buttonBox.width < 64 || buttonBox.height < 64) {
    throw new Error('HARNESS_PRECONDITION_FAILED: right look button is visible and at least 64px');
  }
  await rightButton.hover();
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.up();
  check((await lookState(page)).view.x > buttonStart, 'press-and-hold on-screen direction button moves the view');
  await finishCurrentLook(page, 'x', 'button look completion');

  await startSynthetic(page, {
    targetRect: { x: 600, y: 300, w: 2, h: 2 }, axis: 'x', s: 1.4,
    start: { x: 300, y: 300 }, radius: 70, hold: 350, prompt: 'Find it!',
    decoys: [{ targetRect: { x: 450, y: 270, w: 40, h: 60 }, say: "That's a pyramid! \ud83d\ude04" }],
  });
  await moveViewNear(page, { x: 470, y: 300 }, 'x', 8, 'centre synthetic decoy');
  await precondition(page, () => VA.Look.state().decoyShown, undefined, 'friendly decoy feedback appeared');
  check((await lookState(page)).active && (await page.locator('body').textContent()).includes("That's a pyramid!"),
    'a centred decoy shows friendly feedback and does not fail');
  await finishCurrentLook(page, 'x', 'decoy look completion');

  console.log('real sightseeing events');
  await startRealEvent(page, 'australia', 'kangaroo');
  const rangerTelemetry = { id: 'au_ranger', line: 'Look over there!' };
  await advanceToLook(page, 'kangaroo observe', null, rangerTelemetry);
  await observeContract(page, 'look_australia_park.webp', 'Australia');
  check(rangerTelemetry.lineX === rangerTelemetry.observe && rangerTelemetry.observe === 480,
    'Australia: ranger stays at the conversation position when observe starts (never x 170)');
  check(await actorX(page, 'roo') === 1090,
    'Australia: cinematic kangaroo stays offscreen right while observation is active');
  let australia = await lookState(page);
  check(Math.abs(australia.target.x - australia.view.x) > 500,
    'Australia: kangaroo is not initially centred');
  check(await page.locator('.look-observe-sprite[data-sprite-id="observe_roo"]').count() === 1,
    'Australia: one panorama kangaroo sprite is mounted');
  check(!await page.locator('.look-observe button').filter({ hasText: /select/i }).count(),
    'Australia: observation has no select button');
  await page.screenshot({ path: OBSERVE_SHOT('01-australia-initial-view') });

  const wrongStart = australia.view.x;
  await pulse(page, 'ArrowLeft', 260);
  check((await lookState(page)).active, 'Australia: looking in the wrong direction never fails');
  await pulse(page, 'ArrowRight', 420);
  check((await lookState(page)).view.x > wrongStart, 'Australia: horizontal keys search the panorama');
  await page.screenshot({ path: OBSERVE_SHOT('02-australia-searching') });

  const movingX = (await lookState(page)).target.x;
  await precondition(page, x => Math.abs(VA.Look.state().target.x - x) > 12,
    movingX, 'kangaroo target moved with its sprite', 2500);
  check(true, 'Australia: kangaroo target moves across the panorama');
  for (let i = 0; i < 35; i++) {
    const current = await lookState(page);
    const separation = current.target.x - current.view.x;
    if (separation >= 430 && separation <= 690) break;
    await pulse(page, separation > 0 ? 'ArrowRight' : 'ArrowLeft', 90);
  }
  await precondition(page, () => {
    const st = VA.Look.state();
    const d = st.target.x - st.view.x;
    return d >= 400 && d <= 720;
  }, undefined, 'kangaroo became partly visible');
  await page.screenshot({ path: OBSERVE_SHOT('03-australia-kangaroo-partly-in-view') });

  await finishCurrentLook(page, 'x', 'kangaroo key dwell');
  await precondition(page, () => VA.Look.state().active && VA.Look.state().found,
    undefined, 'kangaroo key dwell reached found hold', 3000);
  check((await lookState(page)).dwellMs >= 500, 'Australia: dwell completes without selecting');
  await page.screenshot({ path: OBSERVE_SHOT('04-australia-centred-found') });
  check(await actorX(page, 'roo') === 1090,
    'Australia: cinematic kangaroo has not entered when the panorama kangaroo is found');
  await armActorTelemetry(page, 'roo');
  // Record the first frame the cinematic roo leaves x 1090: the observe screen
  // must already be closed and its hop must not have started yet.
  await page.evaluate(() => {
    window.__rooEntry = null;
    const tick = () => {
      const actor = VA.Cine.ctx && VA.Cine.ctx.actors.roo;
      const x = actor ? Number.parseFloat(actor.style.left) : null;
      if (x != null && x !== 1090) {
        window.__rooEntry = { x, lookActive: VA.Look.state().active, hopped: window.__lookSawAnim };
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await precondition(page, () => !VA.Look.state().active, undefined, 'Australia observe returned to cinematic', 2500);
  rangerTelemetry.returned = await actorX(page, 'au_ranger');
  check(rangerTelemetry.returned === rangerTelemetry.lineX,
    'Australia: ranger is still at that position when observe returns');
  await page.screenshot({ path: OBSERVE_SHOT('05-australia-returned-cinematic') });
  await precondition(page, () => window.__lookSfx.includes('boing') && window.__lookSawAnim,
    undefined, 'Australia following hop and boing ran', 6000);
  check(true, 'Australia: following cinematic hop and boing still run');
  const rooEntry = await page.evaluate(() => window.__rooEntry);
  check(!!rooEntry && !rooEntry.lookActive && !rooEntry.hopped,
    'Australia: cinematic kangaroo enters only after observation closes, before its hop');
  const rooPhoto = await finishEventAndCapturePhoto(page, 'kangaroo', 'observe/06-australia-photo-toast');
  const rooActor = rooPhoto && rooPhoto.actors.find(actor => actor.char === 'kangaroo');
  check(!!rooPhoto && rooPhoto.caption === 'I saw a kangaroo.' && !!rooActor && rooActor.x >= 620 && rooActor.x <= 700,
    'Australia: event continues to the unchanged caption and photo composition');

  await startRealEvent(page, 'australia', 'kangaroo');
  await advanceToLook(page, 'kangaroo drag replay');
  await observeContract(page, 'look_australia_park.webp', 'Australia drag replay');
  await dragTowardTarget(page, 'x', 'kangaroo drag dwell');
  await precondition(page, () => VA.Look.state().active && VA.Look.state().found,
    undefined, 'kangaroo drag reached found hold', 3000);
  check((await lookState(page)).found, 'Australia: pointer drag also finds the moving kangaroo');
  await precondition(page, () => !VA.Look.state().active, undefined, 'kangaroo drag observe returned', 2500);
  await finishEventAndCapturePhoto(page, 'kangaroo', 'observe/07-australia-drag-photo-toast');

  await startRealEvent(page, 'france', 'eiffel');
  await advanceToLook(page, 'Eiffel');
  const france = await lookState(page);
  check(france.presentation === 'scene' && france.panorama === null &&
    await page.locator('#cine-world img[src$="event_france_eiffel.webp"]').count() === 1,
  'France: Eiffel keeps the existing tower presentation and artwork');
  await page.screenshot({ path: OBSERVE_SHOT('08-france-base') });
  const towerStart = france.view.y;
  await pulse(page, 'ArrowUp', 500);
  check((await lookState(page)).active && (await lookState(page)).view.y < towerStart,
    'France: Arrow Up moves from the tower base toward its tip');
  await page.screenshot({ path: OBSERVE_SHOT('09-france-mid-look') });
  await finishCurrentLook(page, 'y', 'tower looked up manually');
  check((await lookState(page)).found, 'France: tower tip is still found with the existing mode');
  await page.screenshot({ path: OBSERVE_SHOT('10-france-tip') });
  const towerPhoto = await finishEventAndCapturePhoto(page, 'eiffel', 'observe/11-eiffel-photo-toast');
  check(!!towerPhoto && towerPhoto.backdrop === 'event_france_eiffel.webp' && towerPhoto.actors.length === 0,
    'France: photo uses the unchanged Eiffel artwork and composition');

  await startRealEvent(page, 'egypt', 'pyramids');
  check(await backdropFile(page) === 'assets/backgrounds/event_egypt_arrival.webp' &&
    await actorX(page, 'coco') === 1120,
  'Egypt: arrival starts without pyramid art or Coco on stage');
  await page.screenshot({ path: EGYPT_SHOT('01-arrival') });
  const amiraTelemetry = { id: 'eg_guide', line: 'Look! The pyramids!' };
  await advanceToLook(page, 'pyramids observe', null, amiraTelemetry);
  await observeContract(page, 'look_egypt_desert.webp', 'Egypt pyramids');
  check(await backdropFile(page) === 'assets/backgrounds/event_egypt_arrival.webp' && await actorX(page, 'coco') === 1120,
    'Egypt: pyramid observation keeps the arrival scene and Coco offscreen');
  check(amiraTelemetry.lineX === amiraTelemetry.observe && amiraTelemetry.observe === 480,
    'Egypt: Amira stays at the conversation position when pyramids observe starts (never x 250)');
  await page.screenshot({ path: EGYPT_SHOT('02-pyramid-observe') });
  await finishCurrentLook(page, 'xy', 'pyramid dwell at reachable left edge');
  await precondition(page, () => VA.Look.state().active && VA.Look.state().found,
    undefined, 'pyramid dwell reached found hold', 3000);
  const pyramidEndView = { ...(await lookState(page)).view };
  await page.screenshot({ path: EGYPT_SHOT('03-pyramids-found') });
  await precondition(page, () => !VA.Look.state().active, undefined, 'pyramid observe returned', 2500);
  await precondition(page, () => document.querySelector('.scene-art .art-layer:last-child')?.dataset.assetPath === 'assets/backgrounds/event_egypt_pyramid.webp',
    undefined, 'pyramid backdrop revealed before Wow');
  check(await actorX(page, 'coco') === 1120,
    'Egypt: Coco remains offscreen after the pyramid reveal');
  await page.screenshot({ path: EGYPT_SHOT('04-pyramid-revealed-no-coco') });
  amiraTelemetry.pyramidsReturned = await actorX(page, 'eg_guide');
  check(amiraTelemetry.pyramidsReturned === amiraTelemetry.lineX,
    'Egypt: Amira stays in place when pyramids observe returns');
  const betweenLooks = [];
  const cocoTelemetry = { id: 'eg_guide', line: 'Now find my camel, Coco!' };
  await advanceToLook(page, 'Coco observe', betweenLooks, cocoTelemetry);
  check(betweenLooks.some(text => text.includes('4,500 years old')),
    'Egypt: pyramid fact dialogue remains between the searches');
  await observeContract(page, 'look_egypt_desert.webp', 'Egypt Coco');
  check(await actorX(page, 'coco') === 1120,
    'Egypt: Coco stays offscreen through the pyramid fact and Coco observation');
  check(cocoTelemetry.observe === amiraTelemetry.lineX && cocoTelemetry.observe === 480,
    'Egypt: Amira also stays in conversation position for the Coco observe search');
  const cocoStart = await lookState(page);
  check(Math.abs(cocoStart.view.x - pyramidEndView.x) < 3 && Math.abs(cocoStart.view.y - pyramidEndView.y) < 3,
    'Egypt: Coco search starts from the previous panorama view');
  await precondition(page, () => VA.Look.state().decoyShown, undefined, 'Coco pyramid decoy appeared', 2500);
  check((await lookState(page)).active && (await page.locator('.look-decoy').textContent()).includes("That's a pyramid!"),
    'Egypt: pyramid decoy is friendly and does not fail the search');
  await page.screenshot({ path: EGYPT_SHOT('05-coco-observe') });
  await finishCurrentLook(page, 'xy', 'Coco dwell');
  await precondition(page, () => VA.Look.state().active && VA.Look.state().found,
    undefined, 'Coco dwell reached found hold', 3000);
  await page.screenshot({ path: EGYPT_SHOT('06-coco-found') });
  await armActorTelemetry(page, 'coco');
  await page.evaluate(() => {
    window.__cocoEntry = null;
    const tick = () => {
      const actor = VA.Cine.ctx && VA.Cine.ctx.actors.coco;
      const x = actor ? Number.parseFloat(actor.style.left) : null;
      if (x != null && x !== 1120) {
        window.__cocoEntry = { x, lookActive: VA.Look.state().active, wiggled: window.__lookSawAnim };
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await precondition(page, () => !VA.Look.state().active, undefined, 'Coco observe returned to cinematic', 2500);
  cocoTelemetry.returned = await actorX(page, 'eg_guide');
  check(cocoTelemetry.returned === amiraTelemetry.lineX,
    'Egypt: Amira remains there after the Coco observe return');
  await precondition(page, () => {
    const actor = VA.Cine.ctx && VA.Cine.ctx.actors.coco;
    return actor && Number.parseFloat(actor.style.left) < 1120;
  }, undefined, 'Coco started walking in');
  await page.screenshot({ path: EGYPT_SHOT('07-coco-entering') });
  await precondition(page, () => window.__lookSfx.includes('camel') && window.__lookSawAnim,
    undefined, 'Egypt following camel sound and wiggle ran', 6000);
  const cocoEntry = await page.evaluate(() => window.__cocoEntry);
  check(!!cocoEntry && !cocoEntry.lookActive && !cocoEntry.wiggled,
    'Egypt: Coco enters only after observation closes, before camel sound and wiggle');
  check(await actorX(page, 'coco') === 700, 'Egypt: Coco settles at x 700 before the camel reveal');
  await page.screenshot({ path: EGYPT_SHOT('08-coco-settled') });
  const cocoPhoto = await finishEventAndCapturePhoto(page, 'pyramids', 'observe/egypt/09-final-photo');
  const cocoActor = cocoPhoto && cocoPhoto.actors.find(actor => actor.char === 'camel');
  check(!!cocoPhoto && cocoPhoto.caption === 'I saw the pyramids.' && cocoPhoto.backdrop === 'event_egypt_pyramid.webp' &&
    !!cocoActor && cocoActor.x >= 650 && cocoActor.x <= 750,
    'Egypt: final photo keeps the revealed pyramids and Coco');

  await page.evaluate(() => VA.Look._setPanoramaForTest(
    'look_egypt_desert.webp', 'assets/backgrounds/__guaranteed_missing_observe__.webp'));
  await startRealEvent(page, 'egypt', 'pyramids');
  await advanceToLook(page, 'Egypt pyramid fallback');
  check((await lookState(page)).usedFallback && await backdropFile(page) === 'assets/backgrounds/event_egypt_pyramid.webp',
    'Egypt fallback reveals pyramids before its in-scene search');
  await finishCurrentLook(page, 'xy', 'Egypt pyramid fallback completion');
  await advanceToLook(page, 'Egypt Coco fallback');
  check((await lookState(page)).usedFallback && await actorX(page, 'coco') === 700,
    'Egypt fallback brings Coco on stage before its in-scene search');
  await finishCurrentLook(page, 'xy', 'Egypt Coco fallback completion');
  const fallbackPhoto = await finishEventAndCapturePhoto(page, 'pyramids', 'observe/egypt/fallback-final-photo');
  check(!!fallbackPhoto, 'Egypt fallback completes with a photo');
  await page.evaluate(() => VA.Look._setPanoramaForTest('look_egypt_desert.webp', null));

  await setupScene(page, 'egypt', 'pyramids');
  check(await backdropFile(page) === 'assets/backgrounds/event_egypt_arrival.webp' && await actorX(page, 'coco') === 1120,
    'Egypt replay starts fresh on the arrival backdrop with Coco offscreen');

  console.log('observe fallback and cleanup');
  await page.evaluate(() => VA.Look._setPanoramaForTest(
    'look_australia_park.webp', 'assets/backgrounds/__guaranteed_missing_observe__.webp'));
  await startRealEvent(page, 'australia', 'kangaroo');
  await advanceToLook(page, 'missing panorama fallback');
  const fallback = await lookState(page);
  check(fallback.presentation === 'observe' && fallback.panorama === 'look_australia_park.webp' &&
    !fallback.loaded && fallback.usedFallback, 'missing panorama silently uses the configured fallback');
  check(!await page.locator('.look-observe').count() && await visible(page, '#cine-world'),
    'fallback is the existing in-scene look, not an observe overlay');
  check(await actorX(page, 'roo') === 760,
    'fallback brings the cinematic kangaroo on stage before the in-scene search');
  await page.screenshot({ path: OBSERVE_SHOT('18-missing-panorama-fallback') });
  await finishCurrentLook(page, 'x', 'missing panorama fallback completion');
  await finishEventAndCapturePhoto(page, 'kangaroo', 'observe/19-fallback-photo-toast');
  await page.evaluate(() => VA.Look._setPanoramaForTest('look_australia_park.webp', null));

  await startRealEvent(page, 'australia', 'kangaroo');
  await advanceToLook(page, 'cleanup observe');
  await observeContract(page, 'look_australia_park.webp', 'cleanup');
  const abandonedView = { ...(await lookState(page)).view };
  await page.evaluate(() => VA.Screens.show('map'));
  await precondition(page, () => !VA.Look.state().active && !document.querySelector('.look-mode'),
    undefined, 'leaving cinematic cleaned observe DOM');
  await pulse(page, 'ArrowRight', 180);
  const afterLeave = await lookState(page);
  check(afterLeave.view.x === abandonedView.x && afterLeave.view.y === abandonedView.y,
    'cleanup leaves no active key listener or animation loop');

  await startRealEvent(page, 'australia', 'kangaroo');
  await advanceToLook(page, 'cleanup replay');
  check(await page.locator('.look-mode').count() === 1 && await page.locator('.look-observe').count() === 1 &&
    await page.locator('.look-observe-sprite[data-sprite-id="observe_roo"]').count() === 1,
  'replaying after cleanup mounts one observe UI and one sprite');
  await finishCurrentLook(page, 'x', 'cleanup replay completion');
  await precondition(page, () => !VA.Look.state().active, undefined, 'cleanup replay returned', 2500);
  await finishEventAndCapturePhoto(page, 'kangaroo', 'observe/20-cleanup-replay-photo-toast');

  console.log('reduced motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await precondition(page, () => !!(VA.Look && VA.reducedMotion), undefined, 'reduced-motion game booted');
  await setupScene(page, 'australia', 'kangaroo');
  await startSynthetic(page, {
    targetRect: { x: 560, y: 300, w: 2, h: 2 }, axis: 'x', s: 1.4,
    start: { x: 350, y: 300 }, radius: 90, hold: 200, prompt: 'Look!', showAfter: 100,
  });
  await precondition(page, () => {
    const button = document.querySelector('.look-show');
    return button && !button.hidden && !!button.offsetParent;
  }, undefined, 'reduced-motion Show me assist appeared');
  await page.locator('.look-show').click();
  check(!(await lookState(page)).active && await page.evaluate(() => window.__lookResumeCount === 1),
    'reduced-motion Show me jumps directly to the target and completes');

  check(errors.length === 0, 'no unexpected page or console errors');
  if (errors.length) errors.forEach(error => console.log('  ' + error));
  await browser.close();

  if (failures.length) {
    console.error('\n' + failures.length + ' look test failure(s).');
    process.exitCode = 1;
  } else {
    console.log('\nLOOK TESTS OK');
  }
})().catch(error => {
  console.error('LOOK TESTS CRASHED:', error.message || error);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
});
