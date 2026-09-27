/* France soccer, spoken: PASS → PASS → SHOOT.

   Driven by a FAKE SpeechRecognition. Unlike speech-test.js's fake, an empty
   queue does not end at once with 'no-speech': the recognizer waits (like a
   real mic in a quiet room) for the test to queue what the student says, and
   only reports 'no-speech' after 6 s. Soft misses therefore happen only when
   the test scripts them.

   - synthetic stage: phases, ball path, interim acceptance, wrong words, hint
     ladder, fallback (mic off, hard error, repeated misses), stale
     recognizer callbacks, cleanup on completion and on leaving the scene
   - real France event: refusal, acceptance, GOAL, photo, memory caption

   Run via: npm run test:soccer-voice      Screenshots: .shots/soccer-voice/ */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, '.shots', 'soccer-voice');
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
const say = (page, entry) => page.evaluate(e => window.__speechQueue.push(e), entry);
const sv = page => page.evaluate(() => VA.Cine.soccerVoiceState());

/* window.__speechQueue entries, consumed one per start():
     { interim:['pa'], final:'pass', finalDelay:ms, error:'not-allowed' } */
function installFakeSpeech() {
  window.__speechQueue = [];
  window.__recs = [];
  window.__recLog = { started: 0, aborted: 0, active: 0, maxActive: 0 };
  class FakeRec {
    constructor() { this.onresult = this.onerror = this.onend = null; this._timers = []; this._live = false; window.__recs.push(this); }
    start() {
      const L = window.__recLog;
      L.started++; L.active++; L.maxActive = Math.max(L.maxActive, L.active);
      this._live = true;
      const at = (ms, fn) => this._timers.push(setTimeout(() => { if (this._live) fn(); }, ms));
      const result = (txt, isFinal) => ({ resultIndex: 0, results: [Object.assign([{ transcript: txt, confidence: 0.8 }], { isFinal })] });
      const play = e => {
        let t = 120;
        (e.interim || []).forEach(txt => { at(t, () => this.onresult && this.onresult(result(txt, false))); t += 150; });
        if (e.final != null) { t += e.finalDelay || 0; at(t, () => this.onresult && this.onresult(result(e.final, true))); }
        if (e.error) at(t, () => this.onerror && this.onerror({ error: e.error }));
        at(t + 80, () => this._end());
      };
      const started = Date.now();
      const poll = () => {
        if (!this._live) return;
        const e = window.__speechQueue.shift();
        if (e) { play(e); return; }
        if (Date.now() - started > 6000) { play({ error: 'no-speech' }); return; }
        this._timers.push(setTimeout(poll, 50));
      };
      poll();
    }
    _end() { if (!this._live) return; this._live = false; window.__recLog.active--; if (this.onend) this.onend(); }
    stop() { this._end(); }
    abort() {
      if (!this._live) return;
      this._live = false;
      window.__recLog.aborted++; window.__recLog.active--;
      this._timers.forEach(clearTimeout);
      setTimeout(() => { if (this.onerror) this.onerror({ error: 'aborted' }); if (this.onend) this.onend(); }, 20);
    }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
}

async function resetState(page, mic = true) {
  await page.evaluate(async m => {
    if (VA.Cine.soccerVoiceState().active || VA.Screens.current === 'cine') await VA.Screens.show('explore');
    VA.Dialogue.hide();
    VA.State.reset();
    VA.State.data.name = 'Mio';
    VA.State.data.playerLook = 'girl';
    Object.assign(VA.State.data.settings, { music: false, voice: false, mic: m });
    VA.State.data.coins = VA.Data.ALLOWANCE;
    VA.State.startTrip('france');
    VA.applyPlayerLook('girl');
    window.__speechQueue.length = 0;
  }, mic);
}

/* Mount the soccer event's stage and run only its soccerVoice step. */
async function startSynthetic(page, mic = true) {
  await resetState(page, mic);
  await page.evaluate(async () => {
    const dest = VA.Data.destById('france');
    const event = dest.events.find(item => item.id === 'soccer');
    await VA.Cine.setup(event, dest);
    await VA.Screens.show('cine');
    window.__soccerDone = false;
    VA.Cine._soccerVoice(event.steps.find(step => step.soccerVoice).soccerVoice).then(() => { window.__soccerDone = true; });
  });
  await precondition(page, () => VA.Cine.soccerVoiceState().phase === 'pass1', undefined, 'soccer voice reached pass1');
}

const ballAt = page => page.evaluate(() => {
  const b = VA.Cine._target('ball');
  return { x: parseFloat(b.style.left), y: parseFloat(b.style.top) };
});
const handAt = (page, id) => page.evaluate(i => VA.Cine._volleyHandPoint(i, i === 'player' ? 'right' : 'left'), id);
const near = (a, b, tol = 2) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
const phaseIs = (page, p, label) => precondition(page, want => VA.Cine.soccerVoiceState().phase === want, p, label);

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(installFakeSpeech);
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('ERR_FILE_NOT_FOUND') || t.includes('blocked by CORS policy') || t.includes('net::ERR_FAILED')) return;
    errors.push('CONSOLE: ' + t);
  });
  await page.goto(PAGE_URL);
  await page.waitForTimeout(900);

  try {
    console.log('unit: command matching');
    const unit = await page.evaluate(() => {
      const C = VA.Cine.SOCCER_COMMANDS;
      const m = (t, w) => VA.Speech.matchesAny(t, C[w]);
      return {
        pass: ['pass', 'Pass!', 'past', 'pass it'].every(t => m(t, 'pass')),
        shoot: ['shoot', 'Shoot!', 'shot'].every(t => m(t, 'shoot')),
        vague: ['go', 'kick', 'play', 'yes', 'passport', 'shooting star'].every(t => !m(t, 'pass') && !m(t, 'shoot')),
        cross: !m('shoot', 'pass') && !m('pass', 'shoot'),
      };
    });
    check(unit.pass, 'pass / past are accepted for PASS');
    check(unit.shoot, 'shoot / shot are accepted for SHOOT');
    check(unit.vague, 'vague words (go, kick, play, yes, passport) are not commands');
    check(unit.cross, 'PASS and SHOOT do not satisfy each other');

    console.log('synthetic: PASS → PASS → SHOOT by speech');
    await startSynthetic(page);
    let st = await sv(page);
    check(st.active && st.expected === 'pass' && !st.fallback, 'accepting starts phase pass1 expecting PASS');
    check(await page.evaluate(() => document.querySelector('#soccer-game .soccer-voice-word').textContent) === 'PASS!', 'prompt shows PASS!');
    const hintNow = () => page.evaluate(() => { const h = document.querySelector('.soccer-voice-hint'); return h && h.offsetParent ? h.textContent : ''; });
    check(await hintNow() === '「PASS!」と言ってね！' && st.misses === 0, 'first PASS shows the Japanese instruction before any miss');
    check(!(await vis(page, '#tap-btn')) && !(await page.evaluate(() => document.body.innerText.includes('TAP to kick'))), 'no TAP to kick / tap button');
    check(!(await vis(page, '.soccer-voice-fallback')), 'working STT shows no fallback button');
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT('01-pass1') });

    await say(page, { final: 'kick' });
    await precondition(page, () => VA.Cine.soccerVoiceState().misses === 1, undefined, 'wrong word counted as a miss');
    check((await sv(page)).phase === 'pass1', 'wrong word does not advance');
    check(near(await ballAt(page), await handAt(page, 'player')), 'ball stays with the player after a wrong word');
    check((await page.evaluate(() => document.querySelector('.soccer-voice-hint').textContent)) === 'Try again!', 'first miss shows Try again!');

    const started0 = await page.evaluate(() => window.__recLog.started);
    const t0 = Date.now();
    await say(page, { interim: ['pass'], final: 'pass pass pass', finalDelay: 600 });
    await phaseIs(page, 'pass2', 'interim pass advanced to pass2');
    check(Date.now() - t0 < 2200, 'interim "pass" is accepted without waiting for the final result');
    check(near(await ballAt(page), await handAt(page, 'fr_kid')), 'PASS #1 moves the ball player → fr_kid');
    st = await sv(page);
    check(st.misses === 0 && !st.fallback, 'new command starts with a clean retry ladder');
    check(await hintNow() === '', 'second PASS starts without the Japanese instruction');
    check(await page.evaluate(() => window.__recLog.maxActive) === 1, 'only one recognizer is ever live');

    // A stale recognizer from PASS #1 must never answer PASS #2.
    await page.evaluate(() => {
      const r = window.__recs[window.__recs.length - 2];
      const ev = { resultIndex: 0, results: [Object.assign([{ transcript: 'pass', confidence: 1 }], { isFinal: true })] };
      if (r && r.onresult) r.onresult(ev);
    });
    await page.waitForTimeout(900);
    check((await sv(page)).phase === 'pass2', 'late PASS #1 callbacks do not advance PASS #2');
    check(near(await ballAt(page), await handAt(page, 'fr_kid')), 'ball waits with fr_kid until PASS #2 is said');
    check(await page.evaluate(n => window.__recLog.started > n, started0), 'a fresh recognizer listens for PASS #2');
    await page.screenshot({ path: SHOT('02-pass2') });

    await say(page, { final: 'Pass!' });
    await phaseIs(page, 'shoot', 'final pass advanced to shoot');
    check(near(await ballAt(page), await handAt(page, 'player')), 'PASS #2 moves the ball fr_kid → player');
    check(await page.evaluate(() => document.querySelector('#soccer-game .soccer-voice-word').textContent) === 'SHOOT!', 'prompt shows SHOOT!');
    check(await hintNow() === '「SHOOT!」と言ってね！', 'SHOOT shows the Japanese instruction at once');
    await say(page, { final: 'pass' });
    await precondition(page, () => VA.Cine.soccerVoiceState().misses === 1, undefined, 'pass during SHOOT is a miss');
    check((await sv(page)).phase === 'shoot', 'PASS does not satisfy SHOOT');
    await page.screenshot({ path: SHOT('03-shoot') });

    await say(page, { interim: ['shot'] });
    await precondition(page, () => window.__soccerDone, undefined, 'soccer voice finished after shoot');
    check(near(await ballAt(page), { x: 790, y: 370 }), 'SHOOT carries the ball to the goal (790, 370)');
    st = await sv(page);
    check(st.phase === 'done' && !st.active, 'state ends done and inactive');
    check(await page.evaluate(() => document.querySelector('#soccer-game').hidden && !document.querySelector('#soccer-game').children.length), '#soccer-game hidden and cleared');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.__recLog.active) === 0, 'no active recognizer after completion');

    console.log('synthetic: hint ladder and repeated-miss fallback');
    await startSynthetic(page);
    for (const w of ['go', 'play']) await say(page, { final: w });
    await precondition(page, () => VA.Cine.soccerVoiceState().misses === 2, undefined, 'two misses registered');
    check((await page.evaluate(() => document.querySelector('.soccer-voice-hint').textContent)) === '「PASS!」と言ってね！', 'second miss shows the Japanese hint');
    check(!(await vis(page, '.soccer-voice-fallback')), 'no fallback button after two misses');
    await say(page, { final: 'yes' });
    await precondition(page, () => VA.Cine.soccerVoiceState().fallback, undefined, 'third miss exposes fallback');
    check(await vis(page, '.soccer-voice-fallback') && await page.evaluate(() => document.querySelector('.soccer-voice-fallback').textContent) === 'PASS!', 'fallback button repeats the command word (PASS!), not SKIP');
    await page.waitForTimeout(450); // the game pauses 250 ms between listens
    check(await page.evaluate(() => window.__recLog.active) === 1, 'soft misses keep listening behind the fallback');
    await page.screenshot({ path: SHOT('04-repeated-miss-fallback') });
    await jsClick(page, '.soccer-voice-fallback');
    await phaseIs(page, 'pass2', 'fallback advanced one phase');
    st = await sv(page);
    check(st.phase === 'pass2' && !st.fallback && !(await vis(page, '.soccer-voice-fallback')), 'fallback advances only the current phase');
    await say(page, { final: 'pass' });
    await phaseIs(page, 'shoot', 'speech still works after a fallback');
    await page.evaluate(() => VA.Screens.show('explore'));
    await precondition(page, () => !VA.Cine.soccerVoiceState().active, undefined, 'leaving the scene ends soccer voice');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.__recLog.active) === 0 && await page.evaluate(() => document.querySelector('#soccer-game').hidden), 'leaving mid-game stops the recognizer and hides the prompt');
    check(await page.evaluate(() => window.__soccerDone), 'the step resolves when the scene is left');

    console.log('synthetic: hard error fallback');
    await startSynthetic(page);
    await say(page, { error: 'not-allowed' });
    await precondition(page, () => VA.Cine.soccerVoiceState().fallback, undefined, 'hard error exposes fallback');
    await page.waitForTimeout(500);
    const hard = await page.evaluate(() => ({ active: window.__recLog.active, misses: VA.Cine.soccerVoiceState().misses }));
    check(hard.active === 0 && hard.misses === 0, 'hard error stops listening without counting a miss');
    await jsClick(page, '.soccer-voice-fallback');
    await phaseIs(page, 'pass2', 'hard-error fallback advanced to pass2');
    check(!(await sv(page)).fallback, 'the next command tries the mic again');

    console.log('synthetic: mic disabled');
    await startSynthetic(page, false);
    const off = await page.evaluate(() => ({ started: window.__recLog.started, st: VA.Cine.soccerVoiceState() }));
    await page.waitForTimeout(400);
    check(off.st.fallback && await vis(page, '.soccer-voice-fallback'), 'mic off shows the command button at once');
    check(await page.evaluate(n => window.__recLog.started === n, off.started), 'mic off never starts a recognizer');
    await page.screenshot({ path: SHOT('05-mic-off') });
    for (const p of ['pass2', 'shoot']) { await jsClick(page, '.soccer-voice-fallback'); await phaseIs(page, p, 'mic-off button → ' + p); }
    check(await page.evaluate(() => document.querySelector('.soccer-voice-fallback').textContent) === 'SHOOT!', 'mic-off SHOOT button reads SHOOT!');
    await jsClick(page, '.soccer-voice-fallback');
    await precondition(page, () => window.__soccerDone, undefined, 'mic-off play finishes');
    check(near(await ballAt(page), { x: 790, y: 370 }), 'button-only play still scores');

    console.log('real France soccer event');
    const realEvent = async (offerAnswer, shots) => {
      await resetState(page, true);
      await page.evaluate(async () => {
        VA.State.checkpoint('explore');
        VA.UI.explore(VA.Data.destById('france'));
        document.querySelector('#hotspot-layer').style.visibility = 'visible';
        VA.Flows._eventBusy = false;
        window.__goalSeen = false;
        new MutationObserver(() => { if (document.body.innerText.includes('GOAL!')) window.__goalSeen = true; })
          .observe(document.body, { subtree: true, childList: true, characterData: true });
        await VA.Screens.show('explore');
      });
      await jsClick(page, '#hs-soccer');
      await precondition(page, () => document.querySelector('#scr-cine').classList.contains('active'), undefined, 'soccer cinematic opened');
      let answered = false;
      let spokenPhase = null;
      for (let i = 0; i < 600; i++) {
        const done = await page.evaluate(() => document.querySelector('#scr-explore').classList.contains('active') &&
          document.querySelector('#dialogue').style.display === 'none').catch(() => false);
        if (done) break;
        const s = await sv(page);
        if (s.active) {
          if (s.phase !== spokenPhase && ['pass1', 'pass2', 'shoot'].includes(s.phase)) {
            spokenPhase = s.phase;
            if (shots) { await page.waitForTimeout(250); await page.screenshot({ path: SHOT('10-event-' + s.phase) }); }
            await say(page, { final: s.expected });
          }
          await page.waitForTimeout(100);
          continue;
        }
        if (shots && spokenPhase === 'shoot' && !(await page.evaluate(() => window.__goalShot))) {
          await page.evaluate(() => { window.__goalShot = true; });
          await page.waitForTimeout(250);
          await page.screenshot({ path: SHOT('11-event-goal') });
        }
        if (!answered && await vis(page, '#choices .mic-btn:not([disabled])')) {
          answered = true;
          await say(page, { final: offerAnswer });
          await jsClick(page, '#choices .mic-btn');
          await page.waitForTimeout(500);
          continue;
        }
        if (await vis(page, '#dialogue')) await jsClick(page, '#dialogue');
        await page.waitForTimeout(120);
      }
      await page.evaluate(() => { window.__goalShot = false; });
      return page.evaluate(() => ({
        done: VA.State.data.trip.done.includes('soccer'),
        photo: (VA.State.data.book.france && VA.State.data.book.france.photos.soccer) || null,
        caption: VA.Data.destById('france').events.find(e => e.id === 'soccer').caption,
        goal: window.__goalSeen,
        tapGame: document.querySelector('#tap-game').style.display !== 'none',
        recActive: window.__recLog.active,
        voice: VA.Cine.soccerVoiceState(),
      }));
    };
    const declined = await realEvent('maybe later', false);
    check(!declined.done && !declined.photo, 'refusal exits the event with nothing completed');
    check(declined.voice.phase === null || !declined.voice.active, 'refusal never starts the soccer game');
    const played = await realEvent("Yes! Let's play!", true);
    check(played.done && !!played.photo, 'accepting: soccer completes with a photo');
    check(played.goal, 'existing GOAL! celebration still plays');
    check(played.caption === 'I played soccer.', 'memory remains "I played soccer."');
    check(!played.tapGame, 'legacy tap game never shown');
    check(played.recActive === 0 && !played.voice.active, 'no active recognizer after the event');
  } catch (e) {
    failures.push(String(e && e.message || e));
    console.log('  ✗ ' + (e && e.stack || e));
  }

  await browser.close();
  errors.forEach(e => console.log('  ! ' + e));
  const total = failures.length + errors.length;
  console.log(total ? `\nFAILED: ${failures.length} check(s), ${errors.length} page error(s)` : '\nALL SOCCER VOICE CHECKS PASSED');
  process.exit(total ? 1 : 0);
})();
