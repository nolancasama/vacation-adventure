/* Spoken-answer tests, driven by a FAKE SpeechRecognition (no mic needed).

   1. unit: yes/no classifier, memory alias matching
   2. recognizer: interim match accepted early, errors recover, the hint
      ladder and fallback buttons appear, leaving a scene kills listening
   3. France mixed trip in the real game:
        passport (button) → crepe "no thanks" (declined, nothing spent)
        → Eiffel (ticket button) → soccer "maybe later" → soccer "let's play"
        → depart → "not really" → review: went=STT, ate=Nothing button,
        saw=STT (one wrong "pyramids" first), played=STT
   2b. English first: Japanese hidden by default, "? 日本語" reveal, ladder
       reveal on the second miss, blocked/mic-free fallback, hints off
   4. Bedroom suitcase → Egypt next trip, every answer spoken; questions asked English-only

   Run:  NODE_PATH=<folder with playwright>/node_modules node tests/speech-test.js */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const PAGE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const failures = [];
const errors = [];
const check = (ok, msg) => { if (ok) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures.push(msg); } };

/* ---------- the fake recognizer, installed before the game loads ----------
   window.__speechQueue entries, consumed one per start():
     { interim:['i saw the eif', ...], final:'...', finalDelay:ms, error:'no-speech' } */
function installFakeSpeech() {
  // Speech coverage exercises the whole trip, not WebGL. Keep France on the
  // deterministic top-down fallback; soccer3d-test.js owns the 3D path.
  window.VA_SOCCER_2D = true;
  window.__speechQueue = [];
  window.__recLog = { started: 0, aborted: 0, active: 0, maxActive: 0 };
  class FakeRec {
    constructor() { this.onresult = this.onerror = this.onend = null; this._timers = []; this._live = false; }
    start() {
      const L = window.__recLog;
      L.started++; L.active++; L.maxActive = Math.max(L.maxActive, L.active);
      this._live = true;
      const e = window.__speechQueue.shift() || { error: 'no-speech' };
      const at = (ms, fn) => this._timers.push(setTimeout(() => { if (this._live) fn(); }, ms));
      const result = (txt, isFinal) => ({ resultIndex: 0, results: [Object.assign([{ transcript: txt, confidence: 0.8 }], { isFinal })] });
      let t = 120;
      (e.interim || []).forEach(txt => { at(t, () => this.onresult && this.onresult(result(txt, false))); t += 150; });
      if (e.final != null) { t += e.finalDelay || 0; at(t, () => this.onresult && this.onresult(result(e.final, true))); }
      if (e.error) at(t, () => this.onerror && this.onerror({ error: e.error }));
      at(t + 80, () => this._end());
    }
    _end() { if (!this._live) return; this._live = false; window.__recLog.active--; if (this.onend) this.onend(); }
    stop() { this._end(); }
    abort() {
      if (!this._live) return;
      this._live = false;
      window.__recLog.aborted++; window.__recLog.active--;
      this._timers.forEach(clearTimeout);
      // like Chrome: an 'aborted' error and an end event still arrive later
      setTimeout(() => { if (this.onerror) this.onerror({ error: 'aborted' }); if (this.onend) this.onend(); }, 20);
    }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
}

const vis = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return !!(el && el.offsetParent); }, sel).catch(() => false);
const jsClick = (page, sel) => page.$eval(sel, el => el.click()).catch(() => {});
const say = (page, entry) => page.evaluate(e => window.__speechQueue.push(e), entry);
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('vacation-adventure-v1')));

async function finishLook(page, label) {
  let prev = null, lastKey = null;
  for (let i = 0; i < 160; i++) {
    const st = await page.evaluate(() => VA.Look && VA.Look.state()).catch(() => null);
    if (!st || !st.active) return;
    const dx = st.target.x - st.view.x;
    const dy = st.target.y - st.view.y;
    // distance is 0 exactly when the reticle is inside the accepted target.
    if (st.distance === 0) {
      await page.waitForTimeout(80);
      prev = null;
      continue;
    }
    // If the last key did not move the view (it is at a pan limit, e.g. Coco's
    // centre sits below the lowest view), steer along the other axis instead.
    const pinned = prev && prev.view.x === st.view.x && prev.view.y === st.view.y
      ? (/Up|Down/.test(lastKey) ? 'y' : 'x') : null;
    const horizontal = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    const vertical = dy > 0 ? 'ArrowDown' : 'ArrowUp';
    const key = pinned === 'y' ? horizontal : pinned === 'x' ? vertical
      : Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
    prev = st; lastKey = key;
    await page.keyboard.down(key);
    await page.waitForTimeout(140);
    await page.keyboard.up(key);
  }
  const last = await page.evaluate(() => VA.Look && VA.Look.state()).catch(() => null);
  throw new Error('HARNESS_PRECONDITION_FAILED: active look did not finish: ' + label + ' ' + JSON.stringify(last));
}

async function finishSoccer(page, label) {
  // Queue the optional bonus before the automatic listener starts. Movement,
  // recovery, aim and every shot still go through the real game controls.
  await say(page, { final: 'I played soccer!' });
  for (let i = 0; i < 520; i++) {
    const st = await page.evaluate(() => VA.Soccer && VA.Soccer.state()).catch(() => null);
    if (!st || !st.active) return;
    if (st.phase === 'intro' || st.phase === 'shot' || st.phase === 'celebrate') {
      await page.waitForTimeout(100);
      continue;
    }
    if (st.phase === 'aim') {
      // Give the one bonus utterance time to resolve, then read Louis and aim
      // at a genuinely open third of the goal.
      if (st.listening) { await page.waitForTimeout(180); continue; }
      const zones = ['left', 'center', 'right'];
      const open = zones.find(z => z !== st.keeperZone);
      while ((await page.evaluate(() => VA.Soccer.state().aimZone)) !== open) {
        const at = zones.indexOf(await page.evaluate(() => VA.Soccer.state().aimZone));
        await page.keyboard.press(zones.indexOf(open) < at ? 'ArrowLeft' : 'ArrowRight');
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      continue;
    }
    const target = st.hasBall ? { x: 480, y: 210 } : st.ball;
    let dx = target.x - st.player.x;
    const dy = target.y - st.player.y;
    if (st.hasBall) {
      const threat = st.defenders.find(d => !d.stunned && Math.abs(d.y - st.player.y) < 125 && Math.abs(d.x - st.player.x) < 145);
      if (threat) dx = st.player.x < threat.x ? -180 : 180;
    }
    const keys = [];
    if (Math.abs(dx) > 18) keys.push(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    if (Math.abs(dy) > 18) keys.push(dy < 0 ? 'ArrowUp' : 'ArrowDown');
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(115);
    for (const key of keys) await page.keyboard.up(key);
  }
  throw new Error('HARNESS_PRECONDITION_FAILED: active soccer did not finish: ' + label);
}

async function clickUntil(page, sel, cond, label) {
  for (let i = 0; i < 10; i++) {
    await jsClick(page, sel);
    await page.waitForTimeout(750);
    if (await page.evaluate(cond).catch(() => false)) return;
  }
  throw new Error('clickUntil failed: ' + label);
}

/* play through dialogue until stop() is true.  answers maps a question
   substring to the transcript(s) spoken when the mic is offered (an array
   is used up one per mic press).  Every mic/button prompt is logged. */
async function talk(page, label, stop, answers = {}, log = []) {
  for (let i = 0; i < 700; i++) {
    if (await page.evaluate(stop).catch(() => false)) return log;
    if (await vis(page, '#hint-photo')) { log.push({ q: '(hint)', kind: 'hint' }); await jsClick(page, '#hint-photo'); await page.waitForTimeout(400); continue; }
    if (await vis(page, '#tap-btn')) { await jsClick(page, '#tap-btn'); await page.waitForTimeout(350); continue; }
    if (await vis(page, '.eat-tap:not([disabled])')) { await jsClick(page, '.eat-tap'); await page.waitForTimeout(350); continue; }
    if (await page.evaluate(() => !!(VA.Look && VA.Look.state().active)).catch(() => false)) {
      await finishLook(page, label);
      continue;
    }
    if (await page.evaluate(() => !!(VA.Soccer && VA.Soccer.state().active)).catch(() => false)) {
      await finishSoccer(page, label);
      continue;
    }
    const ui = await page.evaluate(() => {
      const wrap = document.querySelector('#choices');
      if (!wrap || wrap.style.display === 'none') return null;
      const mic = wrap.querySelector('.mic-btn:not([disabled])');
      const btns = [...wrap.querySelectorAll('.choice-btn:not(.mic-btn)')].filter(b => !b.disabled).map(b => b.firstChild.textContent);
      if (!mic && !btns.length) return null;
      return { q: document.querySelector('#dlg-text').textContent, jp: document.querySelector('#dlg-jp .jp-reveal') ? '' : document.querySelector('#dlg-jp').textContent, mic: !!mic, listening: !!wrap.querySelector('.mic-btn.listening'), btns };
    });
    if (ui && ui.listening) { await page.waitForTimeout(150); continue; }
    if (ui) {
      const key = Object.keys(answers).find(k => ui.q.includes(k));
      if (ui.mic) {
        let a = key ? answers[key] : null;
        if (Array.isArray(a)) a = a.shift();
        if (a == null) throw new Error(`${label}: no spoken answer scripted for "${ui.q}"`);
        log.push({ q: ui.q, kind: 'mic', said: a, jp: ui.jp });
        await say(page, typeof a === 'string' ? { final: a } : a);
        await jsClick(page, '#choices .mic-btn');
        await page.waitForTimeout(500);
      } else {
        log.push({ q: ui.q, kind: 'buttons', btns: ui.btns });
        await jsClick(page, '#choices .choice-btn');
        await page.waitForTimeout(950);
      }
      continue;
    }
    if (await vis(page, '#dialogue')) { await jsClick(page, '#dialogue'); await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(300);
  }
  throw new Error('talk() timed out: ' + label);
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

  /* ---------- 1. unit ---------- */
  console.log('unit: classifier + aliases');
  const unit = await page.evaluate(() => {
    const S = VA.Speech;
    const yn = ['yes', 'sure', 'okay', 'ok', "let's play", 'yeah', 'Yes, please.', 'yes I did', 'it was fun',
      'no', 'no thanks', 'maybe later', "I don't want to", "I don't like soccer", "no I didn't", 'not really', 'um', '']
      .map(t => [t, S.classifyYesNo(t)]);
    const fr = VA.Data.destById('france');
    const al = id => VA.Flows._speechAliases(fr.events.find(e => e.id === id));
    const eg = VA.Data.destById('egypt');
    const m = (t, a) => S.matchesAny(t, a);
    return {
      yn,
      crepe: ['crepe', 'a crepe', 'I ate crepe', 'ate a crepe', 'I eat a crepe', 'crepes'].map(t => [t, m(t, al('crepe'))]),
      notCrepe: ['kebab', 'grape juice', 'food'].map(t => [t, m(t, al('crepe'))]),
      eiffel: ['i saw the eiffel', 'Eiffel Tower', 'the tower'].map(t => [t, m(t, al('eiffel'))]),
      pyramids: ['a pyramid', 'the pyramids'].map(t => [t, m(t, VA.Flows._speechAliases(eg.events.find(e => e.id === 'pyramids')))]),
      egyptForFrance: m('Egypt', ['France', ...fr.sentences.speech]),
    };
  });
  const expectYN = { 'yes': 'yes', 'sure': 'yes', 'okay': 'yes', 'ok': 'yes', "let's play": 'yes', 'yeah': 'yes', 'Yes, please.': 'yes',
    'yes I did': 'yes', 'it was fun': 'yes', 'no': 'no', 'no thanks': 'no', 'maybe later': 'no', "I don't want to": 'no',
    "I don't like soccer": 'no', "no I didn't": 'no', 'not really': 'no', 'um': 'unknown', '': 'unknown' };
  unit.yn.forEach(([t, c]) => check(c === expectYN[t], `classifyYesNo("${t}") = ${c}`));
  unit.crepe.forEach(([t, ok]) => check(ok, `crepe memory accepts "${t}"`));
  unit.notCrepe.forEach(([t, ok]) => check(!ok, `crepe memory rejects "${t}"`));
  unit.eiffel.forEach(([t, ok]) => check(ok, `Eiffel memory accepts "${t}"`));
  unit.pyramids.forEach(([t, ok]) => check(ok, `pyramids memory accepts "${t}"`));
  check(!unit.egyptForFrance, '"Egypt" is not accepted for a France trip');

  /* ---------- 2. recognizer behaviour ---------- */
  console.log('recognizer: interim, errors, cleanup');
  const interim = await page.evaluate(async () => {
    window.__speechQueue.push({ interim: ['i saw', 'i saw the eiffel'], final: 'i saw the eiffel tower', finalDelay: 3000 });
    const t0 = performance.now();
    const r = await VA.Speech.listen({ match: t => (VA.Speech.matchesAny(t, ['eiffel']) ? 'ok' : null) });
    return { r, ms: performance.now() - t0, log: Object.assign({}, window.__recLog) };
  });
  check(interim.r.status === 'match' && interim.r.transcript === 'i saw the eiffel', 'interim transcript matches without waiting for final');
  check(interim.ms < 1500, `accepted in ${Math.round(interim.ms)}ms (final was 3s away)`);
  check(interim.log.aborted === 1 && interim.log.active === 0, 'recognizer stopped immediately after the match');

  const errs = await page.evaluate(async () => {
    const out = [];
    for (const error of ['no-speech', 'aborted', 'network']) {
      window.__speechQueue.push({ error });
      out.push(await VA.Speech.listen({ match: () => null }));
    }
    window.__speechQueue.push({ final: 'banana' });
    out.push(await VA.Speech.listen({ match: () => null }));
    return out.map(r => [r.status, r.error || '', r.transcript]);
  });
  check(errs[0][0] === 'error' && errs[0][1] === 'no-speech', 'no-speech resolves as a recoverable error');
  check(errs[1][0] === 'error' && errs[1][1] === 'aborted', 'aborted resolves as a recoverable error');
  check(errs[2][0] === 'error' && errs[2][1] === 'network', 'network error resolves (treated as hard)');
  check(errs[3][0] === 'nomatch' && errs[3][2] === 'banana', 'heard-but-unmatched resolves as nomatch with transcript');

  // hint ladder → fallback buttons after repeated failure; a tap still answers
  await page.evaluate(() => {
    document.querySelector('#dialogue').style.display = 'block';
    window.__ans = undefined;
    VA.Dialogue.yesNo({ yes: { text: 'Yes, please!' }, no: { text: 'No, thank you.' } }).then(v => { window.__ans = v; });
  });
  const ladder = [];
  for (let i = 0; i < 3; i++) {
    await say(page, { error: 'no-speech' });
    await jsClick(page, '#choices .mic-btn');
    await page.waitForTimeout(600);
    ladder.push(await page.evaluate(() => ({
      status: (document.querySelector('.speak-status') || {}).textContent || '',
      hint: (document.querySelector('.speak-hint') || {}).textContent || '',
      fallback: [...document.querySelectorAll('.speak-fallback .choice-btn')].map(b => b.textContent),
    })));
  }
  check(ladder[0].status.includes('Try again') && !ladder[0].fallback.length, 'first failure: "Try again.", no buttons yet');
  check(ladder[1].hint.includes('Yes, please!') && ladder[1].hint.includes('No, thank you.'), 'second failure: language hint shown');
  check(ladder[2].fallback.join('|') === 'Yes, please!|No, thank you.', 'third failure: contextual fallback buttons appear');
  await page.evaluate(() => document.querySelectorAll('.speak-fallback .choice-btn')[1].click());
  await page.waitForTimeout(2200);
  check(await page.evaluate(() => window.__ans) === 'no', 'fallback button answers the question ("no")');

  // hard error (mic blocked) → buttons at once
  await page.evaluate(() => { window.__ans = undefined; VA.Dialogue.yesNo({ yes: { text: 'Yes!' }, no: { text: 'No.' } }).then(v => { window.__ans = v; }); });
  await say(page, { error: 'not-allowed' });
  await jsClick(page, '#choices .mic-btn');
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.querySelectorAll('.speak-fallback .choice-btn').length === 2), 'blocked microphone shows the buttons immediately');
  await page.evaluate(() => VA.Dialogue.hide());

  // leaving mid-listen: recognition stopped, UI gone, late result ignored
  await page.evaluate(() => {
    document.querySelector('#dialogue').style.display = 'block';
    window.__ans = undefined;
    window.__recLog.active = 0;
    VA.Dialogue.yesNo({ yes: { text: 'Yes!' }, no: { text: 'No.' } }).then(v => { window.__ans = v; });
  });
  await say(page, { final: 'yes', finalDelay: 1500 });
  await jsClick(page, '#choices .mic-btn');
  await page.waitForTimeout(300);
  const listeningBefore = await page.evaluate(() => !!document.querySelector('.mic-btn.listening'));
  await page.evaluate(() => VA.Dialogue.hide());
  await page.waitForTimeout(2200);
  const after = await page.evaluate(() => ({ ans: window.__ans, active: window.__recLog.active, shown: document.querySelector('#choices').style.display, kids: document.querySelector('#choices').children.length, speechActive: !!VA.Speech._active }));
  check(listeningBefore, 'mic showed a listening state');
  check(after.ans === undefined, 'a late recognition result never answers a closed question');
  check(after.active === 0 && !after.speechActive, 'recognition stopped when the dialogue closed');
  check(after.shown === 'none' && after.kids === 0, 'mic UI removed when the dialogue closed');
  await page.evaluate(() => { document.querySelector('#dialogue').style.display = 'none'; window.__recLog.maxActive = window.__recLog.active; });

  /* ---------- 2b. English first, Japanese when needed ---------- */
  console.log('japanese: hidden by default, on demand, and in the ladder');
  const JP = /[぀-ヿ一-龯]/;
  const jpNow = () => page.evaluate(() => {
    const box = document.querySelector('#dlg-jp');
    const reveal = box.querySelector('.jp-reveal');
    return { text: reveal ? '' : box.textContent, reveal: !!reveal, noJp: document.querySelector('#dialogue').classList.contains('no-jp') };
  });
  await page.evaluate(() => {
    VA.State.data.settings.jp = true;
    window.__adv = 0;
    VA.Dialogue.say('grandma', 'Hello!', { jp: 'こんにちは！' }).then(() => { window.__adv++; });
  });
  await page.waitForTimeout(400);
  let jp = await jpNow();
  check(jp.text === '' && jp.reveal, 'easy line: English only, with a "? 日本語" reveal');
  await jsClick(page, '#dlg-jp .jp-reveal');
  await page.waitForTimeout(200);
  jp = await jpNow();
  check(jp.text === 'こんにちは！' && !jp.reveal, '"? 日本語" reveals the current line\'s translation');
  check(await page.evaluate(() => window.__adv) === 0, 'revealing Japanese does not advance the line');
  await jsClick(page, '#dialogue');
  await page.waitForTimeout(150);
  await jsClick(page, '#dialogue');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__adv) === 1, 'a tap still advances after revealing');
  await page.evaluate(() => { VA.Dialogue.say('grandma', 'What do you want?', { jp: '何がほしい？' }); });
  await page.waitForTimeout(200);
  jp = await jpNow();
  check(jp.text === '' && jp.reveal, 'revealed Japanese resets on the next line');
  await page.evaluate(() => { VA.Dialogue.say('au_ranger', 'It jumps very high!', { jp: 'とても高くジャンプするんだよ！', jpMode: 'visible' }); });
  await page.waitForTimeout(200);
  jp = await jpNow();
  check(jp.text === 'とても高くジャンプするんだよ！' && !jp.reveal, 'jpMode "visible": Japanese shown at once');
  await page.evaluate(() => { VA.Dialogue.auto('player', 'Yay!', { jp: 'やったー！' }); });
  await page.waitForTimeout(200);
  jp = await jpNow();
  check(jp.text === '' && !jp.reveal && jp.noJp, 'auto exclamation: no Japanese, no reveal, English-only layout');
  check(await page.evaluate(() => [...document.querySelectorAll('#choices .ch-jp')].length === 0 &&
    VA.Dialogue._choiceBtn({ text: 'Yes, please!', jp: 'はい！' }, () => {}).querySelector('.ch-jp') === null &&
    !!VA.Dialogue._choiceBtn({ text: 'The beret, please.', jp: 'ベレーぼうをください。', jpMode: 'visible' }, () => {}).querySelector('.ch-jp')),
  'answer buttons: no Japanese unless the item opts in (souvenir selection)');
  await page.evaluate(() => VA.Dialogue.hide());

  // the ladder: frame first, the question's Japanese only from the second miss
  const askEat = () => page.evaluate(() => {
    window.__ans = undefined;
    VA.Dialogue.say('grandma', 'What did you eat?', { jp: '何を食べたの？' });
    VA.Dialogue.respond({
      match: t => (VA.Speech.matchesAny(t, ['crepe']) ? 'ok' : null),
      options: [{ value: 'ok', text: 'I ate a crepe.', jp: 'クレープを食べたよ。' }],
      hints: ['I ate ______.', 'I ate ______.　👉 crepe'],
    }).then(v => { window.__ans = v; });
  });
  const panelNow = () => page.evaluate(() => ({
    hint: (document.querySelector('.speak-hint') || {}).textContent || '',
    status: (document.querySelector('.speak-status') || {}).textContent || '',
    fallback: [...document.querySelectorAll('.speak-fallback .choice-btn')].map(b => b.textContent),
  }));
  await askEat();
  await page.waitForTimeout(300);
  const rungs = [{ jp: await jpNow(), panel: await panelNow() }];
  for (let i = 0; i < 3; i++) {
    await say(page, { error: 'no-speech' });
    await jsClick(page, '#choices .mic-btn');
    await page.waitForTimeout(600);
    rungs.push({ jp: await jpNow(), panel: await panelNow() });
  }
  check(rungs[0].jp.text === '' && !rungs[0].panel.hint, 'question starts English-only, no hint');
  check(rungs[1].jp.text === '' && rungs[1].panel.status.includes('Try again') && rungs[1].panel.hint === 'I ate ______.', 'first miss: "Try again." + sentence frame, still no Japanese');
  check(rungs[2].jp.text === '何を食べたの？' && rungs[2].panel.hint.includes('crepe'), 'second miss: vocabulary cue + the question\'s Japanese');
  check(rungs[3].panel.fallback.join() === 'I ate a crepe.', 'third miss: contextual fallback button (no Japanese on it)');
  await page.evaluate(() => VA.Dialogue.hide());

  // a right answer on the first try: accepted from the interim, no Japanese ever shown
  await askEat();
  await page.waitForTimeout(300);
  await say(page, { interim: ['crepe'], final: 'crepe please', finalDelay: 3000 });
  await jsClick(page, '#choices .mic-btn');
  await page.waitForTimeout(700);
  jp = await jpNow();
  check(jp.text === '' && await page.evaluate(() => document.querySelector('.speak-status').textContent.includes('crepe')), 'interim "crepe" accepted at once, Japanese never shown');
  await page.waitForTimeout(2000);
  check(await page.evaluate(() => window.__ans) === 'ok', 'accepted answer resolves the question');

  // blocked mic: straight to the buttons, no Japanese rung in between
  await askEat();
  await page.waitForTimeout(300);
  await say(page, { error: 'not-allowed' });
  await jsClick(page, '#choices .mic-btn');
  await page.waitForTimeout(600);
  const blocked = await panelNow();
  check(blocked.fallback.join() === 'I ate a crepe.' && blocked.status.includes('microphone'), 'blocked mic: fallback buttons on the first failure');
  await page.evaluate(() => VA.Dialogue.hide());

  // mic-free: buttons at once, question still English-first
  await page.evaluate(() => { VA.State.data.settings.mic = false; });
  await askEat();
  await page.waitForTimeout(300);
  const micFree = await page.evaluate(() => ({ mic: !!document.querySelector('#choices .mic-btn'), btns: [...document.querySelectorAll('#choices .choice-btn')].map(b => b.textContent) }));
  check(!micFree.mic && micFree.btns.join() === 'I ate a crepe.', 'mic-free: the answer button at once, no ladder');
  await page.evaluate(() => { VA.Dialogue.hide(); VA.State.data.settings.mic = true; });

  // Japanese hints off: never visible, never revealable, not even by the ladder
  await page.evaluate(() => { VA.State.data.settings.jp = false; });
  await page.evaluate(() => { VA.Dialogue.say('au_ranger', 'It jumps very high!', { jp: 'とても高くジャンプするんだよ！', jpMode: 'visible' }); });
  await page.waitForTimeout(200);
  const offVisible = await jpNow();
  await askEat();
  await page.waitForTimeout(300);
  const offTexts = [];
  for (let i = 0; i < 3; i++) {
    await say(page, { error: 'no-speech' });
    await jsClick(page, '#choices .mic-btn');
    await page.waitForTimeout(600);
    offTexts.push(await page.evaluate(() => document.querySelector('#dialogue').textContent + document.querySelector('#choices').textContent));
  }
  check(!offVisible.text && !offVisible.reveal, 'hints off: even "visible" lines show no Japanese');
  check(offTexts.every(t => !/何を食べたの|日本語|クレープ/.test(t)), 'hints off: the ladder never exposes a translation');
  check(await page.evaluate(() => document.querySelectorAll('.speak-fallback .choice-btn').length === 1), 'hints off: fallback button still appears');
  await page.evaluate(() => { VA.Dialogue.hide(); VA.State.data.settings.jp = true; document.querySelector('#dialogue').style.display = 'none'; });

  /* ---------- 3. France mixed trip ---------- */
  console.log('game: France mixed trip');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(900);
  await jsClick(page, '#btn-start'); await page.waitForTimeout(400);
  await jsClick(page, '#look-girl'); await jsClick(page, '#look-boy'); await page.waitForTimeout(400);
  await page.fill('#name-input', 'Mio');
  await jsClick(page, '#btn-name-ok');
  const dlgHidden = `document.querySelector('#dialogue').style.display === 'none'`;
  const log = [];
  await talk(page, 'intro', new Function(`return () => document.querySelector('#scr-bedroom').classList.contains('active') && ${dlgHidden}`)(), {}, log);
  check(await page.evaluate(() => document.querySelector('#scr-bedroom').classList.contains('active')), 'first send-off lands in the bedroom');
  await clickUntil(page, '.bedroom-hotspot[data-action="trip"]', () => document.querySelector('#scr-map').classList.contains('active') && !!document.querySelector('.dest-card'), 'first suitcase');
  await clickUntil(page, '.dest-card[data-dest="france"]', () => !document.querySelector('#scr-map').classList.contains('active'), 'board');
  await talk(page, 'passport', new Function(`return () => { const h = document.querySelector('#hs-crepe'); return h && h.offsetParent && document.querySelector('#hotspot-layer').style.visibility !== 'hidden' && ${dlgHidden}; }`)(), {}, log);
  const coins0 = (await state(page)).coins;

  const hubBack = new Function(`return () => document.querySelector('#scr-explore').classList.contains('active') && ${dlgHidden} && !document.querySelector('#fade.on, #fade.show')`)();
  const runHotspot = async (id, answers) => {
    await clickUntil(page, '#hs-' + id, () => document.querySelector('#scr-cine').classList.contains('active'), 'start ' + id);
    await talk(page, id, hubBack, answers, log);
    await page.waitForTimeout(600);
  };

  await runHotspot('crepe', { 'One crepe?': 'no thanks' });
  let s = await state(page);
  check(s.coins === coins0, 'declined crepe: no coins spent');
  check(!s.trip.done.includes('crepe') && !s.book.france.photos.crepe, 'declined crepe: no completion, no photo');
  check(await page.evaluate(() => { const h = document.querySelector('#hs-crepe'); return !!h && !h.classList.contains('done'); }), 'declined crepe: hotspot still available');
  check(!(await vis(page, '#btn-depart')), 'no depart button before any memory');

  await runHotspot('eiffel', {});
  await runHotspot('soccer', { "Let's play soccer!": 'maybe later' });
  s = await state(page);
  check(!s.trip.done.includes('soccer'), 'declined soccer is not completed');
  await runHotspot('soccer', { "Let's play soccer!": { interim: ["let's play"] } });
  s = await state(page);
  check(s.trip.done.includes('soccer') && !!s.book.france.photos.soccer, 'refuse then accept: soccer completes with a photo');
  check(s.trip.done.includes('eiffel'), 'Eiffel completed through the ticket button');
  check(await vis(page, '#btn-depart'), 'depart available with the crepe still undone');

  await clickUntil(page, '#btn-depart', () => document.querySelector('#dialogue').style.display !== 'none' || !document.querySelector('#scr-explore').classList.contains('active'), 'depart');
  await talk(page, 'debrief', () => document.querySelector('#scr-scrapbook').classList.contains('active'), {
    'Did you have fun?': 'not really',
    'Where did you go?': 'france',
    'What did you see?': ['pyramids', 'I see the Eiffel tower'],
    'What did you play?': 'I play soccer',
  }, log);
  s = await state(page);

  const find = q => log.filter(l => l.q.includes(q));
  const passport = find('Passport, please.');
  check(passport.length === 1 && passport[0].kind === 'buttons' && passport[0].btns.join() === 'Here you are.', 'passport stays a "Here you are." button');
  const ticket = find('Ticket, please.');
  check(ticket.length === 1 && ticket[0].kind === 'buttons', 'Eiffel ticket stays a button');
  check(find('One crepe?')[0].kind === 'mic', 'crepe offer is answered by speech');
  const gift = find('A gift for Grandma?');
  check(gift.length === 1 && gift[0].kind === 'buttons' && gift[0].btns.length === 2, 'souvenir choice stays buttons');
  check(find('Did you have fun?')[0].kind === 'mic', '"Did you have fun?" is answered by speech');
  check(find('Where did you go?').every(l => l.kind === 'mic'), '"Where did you go?" is speech');
  const ate = find('What did you eat?');
  check(ate.length === 1 && ate[0].kind === 'buttons' && ate[0].btns.join() === 'Nothing.', 'no food memory: exactly one "Nothing." button, no mic');
  const saw = find('What did you see?');
  check(saw.length === 2 && saw.every(l => l.kind === 'mic'), '"What did you see?" asked again after a wrong memory');
  check(log.some(l => l.kind === 'hint'), 'wrong memory showed the photo hint');
  check(find('What did you play?')[0].kind === 'mic', '"What did you play?" is speech');
  check(!!(s.book.france && s.book.france.done), 'trip completed and scrapbook page saved');
  const firstAsk = q => find(q)[0] || { jp: 'MISSING' };
  ['Where did you go?', 'What did you see?', 'What did you play?', 'Did you have fun?'].forEach(q =>
    check(!JP.test(firstAsk(q).jp), `review "${q}" is asked English-only`));
  check(!JP.test(firstAsk('One crepe?').jp) && !JP.test(firstAsk("Let's play soccer!").jp), 'activity offers are English-only');

  /* ---------- 4. Egypt: next trip, all spoken, all English-first ---------- */
  console.log('game: Egypt trip');
  await clickUntil(page, '#btn-book-close', () => document.querySelector('#scr-bedroom').classList.contains('active') && document.querySelector('#dialogue').style.display === 'none', 'close scrapbook');
  check(await page.evaluate(() => document.querySelector('#scr-bedroom').classList.contains('active')), 'closing the scrapbook returns to the bedroom');
  await clickUntil(page, '.bedroom-hotspot[data-action="trip"]', () => document.querySelector('#dialogue').style.display !== 'none', 'next suitcase');
  await talk(page, 'next trip', new Function(`return () => document.querySelector('#scr-map').classList.contains('active') && ${dlgHidden}`)(),
    { 'Do you want another trip?': 'yes' }, log);
  await clickUntil(page, '.dest-card[data-dest="egypt"]', () => !document.querySelector('#scr-map').classList.contains('active'), 'board egypt');
  await talk(page, 'egypt passport', new Function(`return () => { const h = document.querySelector('#hs-kebab'); return h && h.offsetParent && document.querySelector('#hotspot-layer').style.visibility !== 'hidden' && ${dlgHidden}; }`)(), {}, log);
  await runHotspot('kebab', { 'Try this kebab!': 'yes please' });
  await runHotspot('pyramids', {});
  await runHotspot('sand', { "Let's make a sand pyramid!": 'okay' });
  s = await state(page);
  check(['kebab', 'pyramids', 'sand'].every(id => s.trip.done.includes(id)), 'Egypt: all three activities completed');
  await clickUntil(page, '#btn-depart', () => document.querySelector('#dialogue').style.display !== 'none' || !document.querySelector('#scr-explore').classList.contains('active'), 'depart egypt');
  const egStart = log.length;
  await talk(page, 'egypt debrief', () => document.querySelector('#scr-scrapbook').classList.contains('active'), {
    'Did you have fun?': 'yes',
    'Where did you go?': 'egypt',
    'What did you eat?': 'kebab',
    'What did you see?': 'the pyramids',
    'What did you play?': 'sand',
  }, log);
  s = await state(page);
  check(!!(s.book.egypt && s.book.egypt.done), 'Egypt trip completed and scrapbook page saved');
  const egReview = log.slice(egStart).filter(l => l.kind === 'mic');
  check(egReview.length === 5 && egReview.every(l => !JP.test(l.jp)), 'Egypt review: five spoken answers, every question English-only');

  const maxActive = await page.evaluate(() => window.__recLog.maxActive);
  check(maxActive <= 1, 'never more than one recognizer at a time');

  await browser.close();
  check(!errors.length, 'no page/console errors' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  console.log('\n' + log.map(l => `  ${l.kind.padEnd(7)} ${l.q}${l.said ? ` → ${JSON.stringify(l.said)}` : ''}${l.btns ? ` [${l.btns.join(' | ')}]` : ''}`).join('\n'));
  if (failures.length) { console.error(`\n${failures.length} FAILED`); process.exit(1); }
  console.log('\nSPEECH TESTS OK');
})().catch(e => {
  console.error('SPEECH TESTS CRASHED:', e.message || e);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
});
