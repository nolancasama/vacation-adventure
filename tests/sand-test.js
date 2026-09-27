/* Egypt sand pyramid drag-build contract (js/sand-game.js).

   - Real pointer drags (Playwright mouse → pointer events) through the
     stage fit-scale AND the cinematic camera zoom, at two viewport sizes.
   - SCOOP: snap inside the radius, slide home outside it, mound grows.
   - PACK: three separate presses; one long press counts once.
   - REVEAL: a short lift settles back; a clear lift reveals the pyramid.
   - SMOOTH: each rub clears only its own patch.
   - FLAG: far drop returns, near drop snaps, completes and resolves.
   - Touch pointerType, assists, cleanup on leave, rescue seam, no camera.
   - The real Egypt event: Wow! → cheer → A great pyramid! → Yay! → photo.

   Run via: npm run test:sand      Screenshots: .shots/sand/ */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'sand');
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
const sand = page => page.evaluate(() => VA.SandGame.state());
const waitPhase = (page, phase, label) => precondition(page, p => VA.SandGame.state().phase === p, phase, label || 'phase ' + phase);

function installTestEnvironment() {
  window.__gumCalls = 0;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => { window.__gumCalls++; return Promise.reject(new DOMException('blocked in test', 'NotAllowedError')); };
  }
}

async function resetState(page) {
  await page.evaluate(async () => {
    if (VA.SandGame.state().active || VA.Screens.current === 'cine') await VA.Screens.show('explore');
    VA.Dialogue.hide();
    VA.State.reset();
    VA.State.data.name = 'Mio';
    VA.State.data.playerLook = 'girl';
    Object.assign(VA.State.data.settings, { music: false, voice: false, mic: false });
    VA.State.data.coins = VA.Data.ALLOWANCE;
    VA.State.startTrip('egypt');
    VA.applyPlayerLook('girl');
  });
}

/* Mount the sand event's stage with its real camera framing (1.08 zoom)
   and start only the sand step. */
async function startSynthetic(page) {
  await resetState(page);
  await page.evaluate(async () => {
    const dest = VA.Data.destById('egypt');
    const event = dest.events.find(item => item.id === 'sand');
    await VA.Cine.setup(event, dest);
    await VA.Screens.show('cine');
    await VA.Cine.cam({ ...event.steps.find(step => step.cam).cam, dur: 0 });
    window.__sandDone = false;
    VA.SandGame.play(event.steps.find(step => step.sandGame).sandGame, VA.Cine).then(() => { window.__sandDone = true; });
  });
  await precondition(page, () => VA.SandGame.state().active && VA.SandGame.state().phase === 'scoop', undefined, 'sand game became active');
}

const toClient = (page, p) => page.evaluate(([x, y]) => VA.SandGame.worldToClient(x, y), [p.x, p.y]);

/* A real mouse drag between two stage points (slow and even, touchpad-like). */
async function drag(page, from, to, opts = {}) {
  const a = await toClient(page, from);
  const b = await toClient(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: opts.steps || 14 });
  if (opts.back) await page.mouse.move(a.x, a.y, { steps: opts.steps || 14 });
  if (opts.again) await page.mouse.move(b.x, b.y, { steps: opts.steps || 14 });
  await page.mouse.up();
}

async function layout(page) {
  return page.evaluate(() => {
    const G = VA.SandGame;
    return { piles: G.PILES, build: G.BUILD, rest: G.BUCKET_REST_Y, cover: G.BUCKET_COVER_Y, flagStart: G.FLAG_START, lift: G.LIFT_PX, snap: G.PILE_SNAP, flagSnap: G.FLAG_SNAP };
  });
}

async function scoopAll(page, L) {
  for (const pile of L.piles) { await drag(page, pile, L.build); await page.waitForTimeout(80); }
  await waitPhase(page, 'pack');
}
async function packOnce(page, L, n) {
  await drag(page, { x: L.build.x, y: L.rest - 60 }, { x: L.build.x, y: L.rest - 60 + 150 });
  await precondition(page, k => VA.SandGame.state().packs >= k, n, 'pack ' + n);
  await page.waitForTimeout(720);
}
async function rubPatch(page, p) {
  await drag(page, { x: p.x, y: p.y - 18 }, { x: p.x, y: p.y + 18 }, { back: true, again: true, steps: 10 });
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
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
  await precondition(page, () => window.VA && VA.SandGame && VA.Cine && VA.Cine.world, undefined, 'game booted', 15000);
  await page.evaluate(() => { window.VA_TIMELINE_SCALE = 0.05; });

  try {
    /* ---------------- initial ---------------- */
    console.log('initial state');
    await startSynthetic(page);
    const L = await layout(page);
    let st = await sand(page);
    check(st.phase === 'scoop' && st.piles.length === 3 && st.collected === 0, 'phase scoop with 3 loose piles');
    check(await page.locator('.sand-pile').count() === 3, '3 pile elements on stage');
    check((await page.textContent('.sand-prompt')).includes('SCOOP THE SAND!') && (await page.textContent('.sand-prompt')).includes('すなをあつめてね！'), 'SCOOP prompt in English + Japanese');
    check(await page.evaluate(() => !!document.querySelector('#cine-world .sand-game')), 'sand layer is inside the scene (cast + backdrop stay visible)');
    check(await page.evaluate(() => ['player', 'eg_kid'].every(id => VA.Cine.ctx.actors[id].style.visibility !== 'hidden')), 'player and eg_kid visible');
    const aligned = await page.evaluate(() => [...document.querySelectorAll('.sand-pile')].every((el, i) => {
      const r = el.getBoundingClientRect();
      const c = VA.SandGame.worldToClient(VA.SandGame.PILES[i].x, VA.SandGame.PILES[i].y);
      return Math.hypot(r.left + r.width / 2 - c.x, r.top + r.height / 2 - c.y) < 2;
    }));
    check(aligned, 'piles drawn exactly where their hit points are (1366×768)');
    await page.screenshot({ path: SHOT('01-scoop') });

    /* ---------------- assist ---------------- */
    await page.waitForTimeout(4900);
    check((await sand(page)).assists >= 1, 'idle ~4.5 s gives one assist');
    check(await page.evaluate(() => document.querySelector('.sand-pile.assist') && document.querySelector('.sand-build-spot.assist') ? true : false), 'assist wiggles a pile and pulses the build spot');

    /* ---------------- T1 scoop ---------------- */
    console.log('SCOOP');
    const p0 = L.piles[0];
    // Outside the radius: straight toward the spot but stopping 30 px short.
    const d0 = Math.hypot(L.build.x - p0.x, L.build.y - p0.y);
    const outside = { x: L.build.x - (L.build.x - p0.x) * (L.snap + 30) / d0, y: L.build.y - (L.build.y - p0.y) * (L.snap + 30) / d0 };
    await drag(page, p0, outside);
    await page.waitForTimeout(420);
    st = await sand(page);
    check(st.collected === 0 && !st.piles[0].placed, 'drop outside radius does not count');
    check(Math.hypot(st.piles[0].x - p0.x, st.piles[0].y - p0.y) < 1, 'missed pile slides back home');
    check(!(await page.evaluate(() => /WRONG|✗|❌/.test(document.body.innerText))), 'no WRONG / X feedback');

    const inside = { x: L.build.x - (L.build.x - p0.x) * (L.snap - 15) / d0, y: L.build.y - (L.build.y - p0.y) * (L.snap - 15) / d0 };
    const moundBefore = await page.evaluate(() => document.querySelector('.sand-mound').style.width);
    await drag(page, p0, inside);
    await page.waitForTimeout(420);
    st = await sand(page);
    check(st.collected === 1 && st.piles[0].placed, 'drop inside radius counts (forgiving)');
    check(st.piles[0].x === L.build.x && st.piles[0].y === L.build.y, 'placed pile snaps to the build spot');
    const moundAfter = await page.evaluate(() => parseFloat(document.querySelector('.sand-mound').style.width));
    check(!parseFloat(moundBefore) && moundAfter > 0, 'central mound grows after the first pile');
    await page.screenshot({ path: SHOT('02-scoop-one-pile') });

    // Second pile with a synthetic TOUCH pointer (pointerType-agnostic path).
    await page.evaluate(([from, to]) => {
      const layer = document.querySelector('.sand-game');
      const a = VA.SandGame.worldToClient(from.x, from.y);
      const b = VA.SandGame.worldToClient(to.x, to.y);
      const ev = (type, p) => layer.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
      ev('pointerdown', a);
      for (let i = 1; i <= 10; i++) ev('pointermove', { x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 });
      ev('pointerup', b);
    }, [L.piles[1], L.build]);
    await page.waitForTimeout(420);
    st = await sand(page);
    check(st.collected === 2, 'touch pointer drag scoops a pile');
    const mound2 = await page.evaluate(() => parseFloat(document.querySelector('.sand-mound').style.width));
    check(mound2 > moundAfter, 'mound grows again (2/3)');
    await drag(page, L.piles[2], L.build);
    await waitPhase(page, 'pack', 'phase → pack after 3 piles');
    check(true, 'phase → pack after 3 piles');
    check((await page.textContent('.sand-prompt')).includes('PACK IT!'), 'PACK prompt');
    await page.screenshot({ path: SHOT('03-pack') });

    /* ---------------- T2 pack ---------------- */
    console.log('PACK');
    // One continuous drag that presses, lifts and presses again counts once.
    const top = { x: L.build.x, y: L.rest - 60 };
    const low = { x: L.build.x, y: L.rest - 60 + 150 };
    await drag(page, top, low, { back: true, again: true });
    await page.waitForTimeout(760);
    check((await sand(page)).packs === 1, 'one continuous drag = one pack');
    await drag(page, top, { x: top.x, y: top.y + 40 });
    await page.waitForTimeout(450);
    check((await sand(page)).packs === 1, 'a small press above the mound does not pack');
    await packOnce(page, L, 2);
    check(await page.evaluate(() => document.querySelector('.sand-mound').classList.contains('pack-2')), 'mound looks more compact per pack');
    await packOnce(page, L, 3);
    await waitPhase(page, 'reveal', 'phase → reveal after 3 packs');
    check(true, 'phase → reveal after 3 packs');
    check((await page.textContent('.sand-prompt')).includes('LIFT THE BUCKET!'), 'LIFT prompt');
    await page.screenshot({ path: SHOT('04-lift') });

    /* ---------------- T3 reveal ---------------- */
    console.log('REVEAL');
    const cover = { x: L.build.x, y: L.cover - 60 };
    await drag(page, cover, { x: cover.x, y: cover.y - 60 });
    await page.waitForTimeout(450);
    st = await sand(page);
    check(st.phase === 'reveal' && !st.lifted, 'lift below threshold does not reveal');
    check(await page.evaluate(c => Math.abs(parseFloat(document.querySelector('.sand-bucket').style.top) - c) < 1, L.cover), 'short lift settles back over the sand');
    await drag(page, cover, { x: cover.x, y: cover.y - (L.lift + 30) });
    check((await sand(page)).lifted, 'clear upward drag starts the reveal');
    check(await page.evaluate(() => document.querySelector('.sand-bucket') && !document.querySelector('.sand-rough.gone')), 'bucket still lifting (no instant pop)');
    await page.waitForTimeout(260);
    await page.screenshot({ path: SHOT('05-revealing') });
    await waitPhase(page, 'smooth', 'phase → smooth after reveal');
    st = await sand(page);
    check(await page.evaluate(() => VA.Cine.ctx.props.pyr.style.visibility === 'visible'), 'pyramid visible');
    check(!(await page.$('.sand-bucket')), 'bucket gone after lift');
    check(st.patches.length === 3 && st.patches.every(p => !p.done), '3 rough patches active');
    check(await page.locator('.sand-rough').count() === 3, '3 rough patch elements');
    check((await page.textContent('.sand-prompt')).includes('SMOOTH THE SIDES!'), 'SMOOTH prompt');
    await page.screenshot({ path: SHOT('06-smooth') });

    /* ---------------- T4 smooth ---------------- */
    console.log('SMOOTH');
    // Hovering (no button) never counts.
    const pl = st.patches[0];
    const hA = await toClient(page, { x: pl.x, y: pl.y - 18 });
    const hB = await toClient(page, { x: pl.x, y: pl.y + 18 });
    for (let i = 0; i < 3; i++) { await page.mouse.move(hA.x, hA.y, { steps: 8 }); await page.mouse.move(hB.x, hB.y, { steps: 8 }); }
    check((await sand(page)).patches[0].rub === 0, 'hover without pressing does not smooth');
    await rubPatch(page, st.patches[0]);
    await page.waitForTimeout(150);
    st = await sand(page);
    check(st.patches[0].done && !st.patches[1].done && !st.patches[2].done, 'rubbing one patch clears only that patch');
    check(st.patches[1].rub === 0 && st.patches[2].rub === 0, 'neighbouring patches untouched');
    await rubPatch(page, st.patches[1]);
    await page.waitForTimeout(120);
    await page.screenshot({ path: SHOT('07-smooth-two-left') });
    await rubPatch(page, st.patches[2]);
    await waitPhase(page, 'flag', 'phase → flag after 3 patches');
    check(true, 'phase → flag after 3 patches');
    check((await page.textContent('.sand-prompt')).includes('PUT ON THE FLAG!'), 'FLAG prompt');
    await page.screenshot({ path: SHOT('08-flag') });

    /* ---------------- T5 flag ---------------- */
    console.log('FLAG');
    st = await sand(page);
    const grab = { x: L.flagStart.x, y: L.flagStart.y - 30 };
    await drag(page, grab, { x: 200, y: 300 });
    await page.waitForTimeout(450);
    const flagPos = () => page.evaluate(() => ({ x: parseFloat(VA.Cine.ctx.props.flag.style.left), y: parseFloat(VA.Cine.ctx.props.flag.style.top) }));
    let f = await flagPos();
    check(Math.hypot(f.x - L.flagStart.x, f.y - L.flagStart.y) < 1 && !(await sand(page)).flagPlaced, 'far flag drop returns to its start');
    const target = st.flagTarget;
    const near = { x: target.x + 45, y: target.y - 40 }; // ~60 px off, inside the snap radius
    await drag(page, grab, { x: grab.x + (near.x - L.flagStart.x), y: grab.y + (near.y - L.flagStart.y) });
    await page.waitForTimeout(250);
    f = await flagPos();
    st = await sand(page);
    check(st.flagPlaced && Math.abs(f.x - target.x) < 0.5 && Math.abs(f.y - target.y) < 0.5, 'near flag drop snaps to the pyramid top');
    check(st.phase === 'complete', 'phase complete');
    await page.screenshot({ path: SHOT('09-complete') });
    check(await page.evaluate(() => document.querySelector('#caption-big').textContent.includes('COMPLETE')), 'COMPLETE! caption');
    await precondition(page, () => window.__sandDone === true, undefined, 'sand game resolved', 5000);
    check(true, 'minigame resolves');

    /* ---------------- T7 cleanup ---------------- */
    console.log('cleanup');
    st = await sand(page);
    check(!st.active && st.done, 'session closed');
    check(await page.evaluate(() => !document.querySelector('.sand-game, .sand-prompt, .sand-grain, .sand-dust, .sand-rough, .sand-bucket, .sand-pile')), 'no temporary UI left');
    check(await page.evaluate(() => { const pyr = VA.Cine.ctx.props.pyr; const img = pyr.querySelector('img'); return !img || parseFloat(img.style.height) > 140; }), 'final pyramid art at full size');
    check(await page.evaluate(() => VA.Cine.ctx.props.flag.style.visibility === 'visible' && !VA.Cine.ctx.props.flag.classList.contains('sand-dragging')), 'flag stays planted, no drag state');

    // Leaving mid-game removes everything and never resolves into the story.
    await startSynthetic(page);
    await drag(page, L.piles[0], { x: 300, y: 380 }, { steps: 3 });
    await page.evaluate(() => VA.Screens.show('explore'));
    await precondition(page, () => !VA.SandGame.state().active, undefined, 'leaving the scene ends the sand game', 3000);
    check(await page.evaluate(() => !document.querySelector('.sand-game, .sand-prompt')), 'leaving mid-game removes the layer and prompt');
    check(await page.evaluate(() => window.__sandDone === false), 'leaving mid-game does not continue the story');

    // Rescue seam: an internal failure finishes safely with the final art.
    await startSynthetic(page);
    await page.evaluate(() => { VA.SandGame._dropPile = () => { throw new Error('boom (test)'); }; });
    await drag(page, L.piles[0], L.build);
    await precondition(page, () => window.__sandDone === true, undefined, 'rescue resolved', 3000);
    st = await sand(page);
    check(st.rescued && st.flagPlaced, 'an internal error resolves safely instead of trapping the player');
    check(await page.evaluate(() => VA.Cine.ctx.props.flag.style.visibility === 'visible' && VA.Cine.ctx.props.pyr.style.visibility === 'visible'), 'rescue shows the final pyramid and flag');
    check(await page.evaluate(() => !document.querySelector('.sand-game, .sand-prompt')), 'rescue leaves no UI');
    await page.reload();
    await precondition(page, () => window.VA && VA.SandGame && VA.Cine && VA.Cine.world, undefined, 'game rebooted', 15000);

    /* ---------------- T6 other scale ---------------- */
    console.log('pointer alignment at a small (Chromebook-ish) viewport');
    await page.setViewportSize({ width: 700, height: 470 });
    await page.waitForTimeout(200);
    await startSynthetic(page);
    const scale = await page.evaluate(() => VA.Cine.world.getBoundingClientRect().width / VA.Cine.world.offsetWidth);
    check(Math.abs(scale - 1) > 0.1, `stage+camera scale is not 1 (${scale.toFixed(3)})`);
    const round = await page.evaluate(() => { const c = VA.SandGame.worldToClient(123, 456); const w = VA.SandGame.clientToWorld(c.x, c.y); return Math.hypot(w.x - 123, w.y - 456); });
    check(round < 0.01, 'client ↔ stage conversion round-trips');
    const pileRect = await page.evaluate(() => { const r = document.querySelector('.sand-pile').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const pileClient = await toClient(page, L.piles[0]);
    check(Math.hypot(pileRect.x - pileClient.x, pileRect.y - pileClient.y) < 2, `pile drawn exactly where its hit point is (${JSON.stringify(pileRect)} vs ${JSON.stringify(pileClient)})`);
    await drag(page, L.piles[0], outside);
    await page.waitForTimeout(420);
    check((await sand(page)).collected === 0, 'scaled: just outside radius still misses');
    await drag(page, L.piles[0], inside);
    await page.waitForTimeout(420);
    check((await sand(page)).collected === 1, 'scaled: just inside radius still snaps');
    await scoopAll(page, { ...L, piles: L.piles.slice(1) });
    for (let n = 1; n <= 3; n++) await packOnce(page, L, n);
    await waitPhase(page, 'reveal');
    await drag(page, cover, { x: cover.x, y: cover.y - (L.lift + 30) });
    await waitPhase(page, 'smooth');
    for (const p of (await sand(page)).patches) await rubPatch(page, p);
    await waitPhase(page, 'flag');
    const t2 = (await sand(page)).flagTarget;
    await drag(page, grab, { x: grab.x + (t2.x - L.flagStart.x), y: grab.y + (t2.y - L.flagStart.y) });
    await precondition(page, () => window.__sandDone === true, undefined, 'scaled run resolved', 5000);
    check(true, 'full build completes at the smaller scale');
    await page.setViewportSize({ width: 1366, height: 768 });

    /* ---------------- T8 real Egypt event ---------------- */
    console.log('real Egypt sand event');
    await resetState(page);
    await page.evaluate(async () => {
      VA.State.checkpoint('explore');
      VA.UI.explore(VA.Data.destById('egypt'));
      document.querySelector('#hotspot-layer').style.visibility = 'visible';
      VA.Flows._eventBusy = false;
      window.__story = [];
      const push = t => { if (t && window.__story[window.__story.length - 1] !== t) window.__story.push(t); };
      new MutationObserver(() => {
        const cap = document.querySelector('#caption-big');
        if (cap && cap.style.display !== 'none') push('caption:' + cap.textContent);
        const dlg = document.querySelector('#dialogue');
        if (dlg && dlg.style.display !== 'none') push('say:' + VA.Dialogue._lastLine);
        const kid = VA.Cine.ctx && VA.Cine.ctx.actors.eg_kid;
        if (kid && kid.querySelector('.cheer')) push('anim:cheer');
        const pt = document.querySelector('#photo-toast');
        if (pt && pt.style.display === 'flex') push('photo');
        if (document.querySelector('.sand-game')) push('sandGame');
      }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      await VA.Screens.show('explore');
    });
    await page.$eval('#hs-sand', el => el.click());
    await precondition(page, () => document.querySelector('#scr-cine').classList.contains('active'), undefined, 'sand cinematic opened');
    let played = false;
    for (let i = 0; i < 500; i++) {
      const back = await page.evaluate(() => document.querySelector('#scr-explore').classList.contains('active') && document.querySelector('#dialogue').style.display === 'none').catch(() => false);
      if (back) break;
      const offer = page.locator('#choices .choice-btn:not([disabled])', { hasText: "Yes! Let's play!" });
      if (await offer.count() && await offer.first().isVisible().catch(() => false)) { await offer.first().click(); await page.waitForTimeout(200); continue; }
      if (!played && await page.evaluate(() => VA.SandGame.state().active && VA.SandGame.state().phase === 'scoop')) {
        played = true;
        await scoopAll(page, L);
        for (let n = 1; n <= 3; n++) await packOnce(page, L, n);
        await waitPhase(page, 'reveal');
        await drag(page, cover, { x: cover.x, y: cover.y - (L.lift + 30) });
        await waitPhase(page, 'smooth');
        for (const p of (await sand(page)).patches) await rubPatch(page, p);
        await waitPhase(page, 'flag');
        const t3 = (await sand(page)).flagTarget;
        await drag(page, grab, { x: grab.x + (t3.x - L.flagStart.x), y: grab.y + (t3.y - L.flagStart.y) });
        continue;
      }
      if (await page.evaluate(() => { const d = document.querySelector('#dialogue'); return d && d.offsetParent; })) await page.$eval('#dialogue', el => el.click()).catch(() => {});
      await page.waitForTimeout(100);
    }
    check(played, 'real event reached the drag-build game (no TAP button)');
    const story = await page.evaluate(() => window.__story);
    const idx = t => story.findIndex(s => s.includes(t));
    // cheer is wait:false, so it lands with "A great pyramid!"; it only has
    // to follow Wow! and precede Yay!.
    const [game, wow, cheer, great, yay, snap] = ['sandGame', 'caption:Wow!', 'anim:cheer', 'A great pyramid!', 'Yay!', 'photo'].map(idx);
    const inOrder = [game, wow, cheer, great, yay, snap].every(n => n >= 0) && game < wow && wow < great && great < yay && yay < snap && wow < cheer && cheer < yay;
    check(inOrder, 'story continues: game → Wow! → cheer / A great pyramid! → Yay! → photo');
    if (!inOrder) console.log('    story:', JSON.stringify(story.slice(0, 40)));
    const photo = await page.evaluate(() => VA.State.data.book.egypt && VA.State.data.book.egypt.photos.sand);
    const props = photo ? photo.props.map(p => p.file) : [];
    check(!!photo && props.includes('sand_pyramid.webp') && props.includes('flag_small.webp'), 'photo saved with the existing pyramid + flag assets');
    const pyrP = photo && photo.props.find(p => p.file === 'sand_pyramid.webp');
    const flagP = photo && photo.props.find(p => p.file === 'flag_small.webp');
    check(pyrP && Math.abs(pyrP.height - 143) < 1 && flagP && Math.abs(flagP.x - 492) < 0.5 && Math.abs(flagP.y - 431) < 0.5, 'photo composition matches the old finished pyramid (143 px, flag at 492,431)');
    check(await page.evaluate(() => VA.State.data.trip.done.includes('sand')), 'activity marked done');

    check(await page.evaluate(() => window.__gumCalls) === 0, 'camera / microphone never requested');
  } catch (err) {
    failures.push(String(err && err.message || err));
    console.log('  ✗ ' + (err && err.stack || err));
    await page.screenshot({ path: SHOT('zz-failure') }).catch(() => {});
  }

  const realErrors = errors.filter(e => !/boom \(test\)/.test(e));
  check(realErrors.length === 0, 'no page errors' + (realErrors.length ? ': ' + realErrors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
