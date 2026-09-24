/* Spoken-answer tests, driven by a FAKE SpeechRecognition (no mic needed).

   1. unit: yes/no classifier, memory alias matching
   2. recognizer: interim match accepted early, errors recover, the hint
      ladder and fallback buttons appear, leaving a scene kills listening
   3. France mixed trip in the real game:
        passport (button) → crepe "no thanks" (declined, nothing spent)
        → Eiffel (ticket button) → soccer "maybe later" → soccer "let's play"
        → depart → "not really" → review: went=STT, ate=Nothing button,
        saw=STT (one wrong "pyramids" first), played=STT

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
    const ui = await page.evaluate(() => {
      const wrap = document.querySelector('#choices');
      if (!wrap || wrap.style.display === 'none') return null;
      const mic = wrap.querySelector('.mic-btn:not([disabled])');
      const btns = [...wrap.querySelectorAll('.choice-btn:not(.mic-btn)')].filter(b => !b.disabled).map(b => b.firstChild.textContent);
      if (!mic && !btns.length) return null;
      return { q: document.querySelector('#dlg-text').textContent, mic: !!mic, listening: !!wrap.querySelector('.mic-btn.listening'), btns };
    });
    if (ui && ui.listening) { await page.waitForTimeout(150); continue; }
    if (ui) {
      const key = Object.keys(answers).find(k => ui.q.includes(k));
      if (ui.mic) {
        let a = key ? answers[key] : null;
        if (Array.isArray(a)) a = a.shift();
        if (a == null) throw new Error(`${label}: no spoken answer scripted for "${ui.q}"`);
        log.push({ q: ui.q, kind: 'mic', said: a });
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
  await talk(page, 'intro', new Function(`return () => document.querySelector('#scr-map').classList.contains('active') && document.querySelector('.dest-card') && ${dlgHidden}`)(), {}, log);
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
