/* End-to-end smoke test: plays one FULL vacation loop —
   name entry → Grandma's allowance → map → flight → passport stamp →
   all 3 Australia activities (incl. the tap mini-game) → souvenir →
   flight home → Grandma debrief (with one deliberate wrong answer to
   exercise the photo-hint path) → scrapbook page → next-trip map.

   Run from a folder where `playwright` is installed:
       node vacation-adventure/test-e2e.js
   Screenshots go to $VA_SHOTS or ./.shots next to this file. */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.env.VA_SHOTS || path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const PAGE_URL = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');

let wantWrong = true; // answer "What did you eat?" wrong once, on purpose
const errors = [];

async function vis(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    return !!(el && el.offsetParent);
  }, sel).catch(() => false);
}

const jsClick = (page, sel) => page.$eval(sel, el => el.click()).catch(() => {});

/* click sel until condFnBody becomes true (fade transitions can swallow a click) */
async function clickUntil(page, sel, condFnBody, label) {
  for (let i = 0; i < 10; i++) {
    await jsClick(page, sel);
    await page.waitForTimeout(750);
    const ok = await page.evaluate(new Function('return (' + condFnBody + ')')()).catch(() => false);
    if (ok) return;
  }
  throw new Error('clickUntil failed: ' + label);
}

async function dumpState(page, label) {
  const st = await page.evaluate(() => ({
    screen: (document.querySelector('.screen.active') || {}).id,
    dlgShown: document.querySelector('#dialogue').style.display,
    dlgText: (document.querySelector('#dlg-text') || {}).textContent,
    choices: document.querySelectorAll('#choices .choice-btn').length,
    choicesShown: document.querySelector('#choices').style.display,
    tap: !!document.querySelector('#tap-game') && document.querySelector('#tap-game').style.display,
    toast: document.querySelector('#photo-toast').style.display,
    fade: document.querySelector('#fade').className,
  })).catch(e => ({ err: String(e) }));
  console.log('  [state ' + label + ']', JSON.stringify(st));
}

/* click through dialogue/choices/mini-games until stopFn is true in-page */
async function talk(page, label, stopFnBody, opts = {}) {
  const watch = (opts.watch || []).map(w => ({ ...w, done: false }));
  for (let i = 0; i < 600; i++) {
    if (i > 0 && i % 60 === 0) await dumpState(page, label + ' i=' + i);
    const stopped = await page.evaluate(new Function('return (' + stopFnBody + ')')()).catch(() => false);
    if (stopped) return;

    for (const w of watch) {
      if (!w.done && await vis(page, w.sel)) {
        w.done = true;
        await page.screenshot({ path: SHOT(w.name) });
      }
    }

    if (await vis(page, '#hint-photo')) { await jsClick(page, '#hint-photo'); await page.waitForTimeout(400); continue; }
    if (await vis(page, '#tap-btn'))    { await jsClick(page, '#tap-btn'); await page.waitForTimeout(350); continue; }

    const hasChoice = await vis(page, '#choices');
    if (hasChoice) {
      const pickedWrong = await page.evaluate(doWrong => {
        const q = (document.querySelector('#dlg-text') || {}).textContent || '';
        const btns = [...document.querySelectorAll('#choices .choice-btn')].filter(b => !b.disabled);
        if (!btns.length) return null;
        const find = t => btns.find(b => b.textContent.includes(t));
        let pick = btns[0], wrong = false;
        if (q.includes('Where did you go')) pick = find('Australia') || pick;
        else if (q.includes('What did you eat')) {
          if (doWrong) { pick = btns.find(b => !b.textContent.includes('ice cream')) || pick; wrong = true; }
          else pick = find('ice cream') || pick;
        }
        else if (q.includes('What did you see')) pick = find('kangaroo') || pick;
        else if (q.includes('What did you play')) pick = find('volleyball') || pick;
        pick.click();
        return wrong;
      }, wantWrong);
      if (pickedWrong === true) { wantWrong = false; console.log('  (answered wrong on purpose — expecting photo hint)'); }
      await page.waitForTimeout(950);
      continue;
    }

    if (await vis(page, '#dialogue')) { await jsClick(page, '#dialogue'); await page.waitForTimeout(300); continue; }
    await page.waitForTimeout(320);
  }
  await dumpState(page, label + ' TIMEOUT');
  await page.screenshot({ path: SHOT('debug-timeout') });
  throw new Error('talk() timed out at step: ' + label);
}

const dialogueHidden = `document.querySelector('#dialogue').style.display === 'none'`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    // missing-asset probes (the drop-in upgrade path) are expected; anything else is a bug
    if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errors.push('CONSOLE: ' + m.text());
  });

  console.log('open', PAGE_URL);
  await page.goto(PAGE_URL);
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOT('01-title') });

  // start → name entry
  await jsClick(page, '#btn-start');
  await page.waitForTimeout(400);
  await page.fill('#name-input', 'Mio');
  await page.screenshot({ path: SHOT('02-name') });
  await jsClick(page, '#btn-name-ok');

  // Grandma's intro → map
  console.log('home intro…');
  await talk(page, 'home intro → map',
    `() => { const c = document.querySelector('#scr-map'); return c && c.classList.contains('active') && document.querySelector('.dest-card') && ${dialogueHidden}; }`);
  await page.screenshot({ path: SHOT('03-map') });

  // fly to Australia, pass passport control (stop only once the stamp is SAVED)
  console.log('flying to Australia…');
  await clickUntil(page, '.dest-card[data-dest="australia"]',
    `() => !document.querySelector('#scr-map').classList.contains('active')`, 'board flight');
  await talk(page, 'arrival + passport',
    `() => { const h = document.querySelector('#hs-icecream');
             const save = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
             return h && h.offsetParent && (save.stamps || []).includes('australia') && ${dialogueHidden}; }`,
    { watch: [{ sel: '.stamp-slam', name: '04-passport-stamp' }] });
  await page.screenshot({ path: SHOT('05-explore-australia') });

  // the three activities
  for (const [hs, name] of [['icecream', '06-event-icecream'], ['kangaroo', '07-event-kangaroo'], ['volleyball', '08-event-volleyball']]) {
    console.log('activity:', hs);
    await clickUntil(page, '#hs-' + hs,
      `() => document.querySelector('#scr-cine').classList.contains('active')`, 'start ' + hs);
    await talk(page, 'event ' + hs,
      `() => { const h = document.querySelector('#hs-${hs}'); return h && h.classList.contains('done') && h.offsetParent && ${dialogueHidden}; }`,
      { watch: [{ sel: '#photo-toast', name: name }] });
  }
  await page.screenshot({ path: SHOT('09-all-done') });

  // souvenir + flight home + full debrief → scrapbook
  console.log('going home (souvenir + debrief)…');
  await clickUntil(page, '#btn-depart',
    `() => document.querySelector('#dialogue').style.display !== 'none' || !document.querySelector('#scr-explore').classList.contains('active')`, 'depart');
  await talk(page, 'debrief → scrapbook',
    `() => { const s = document.querySelector('#scr-scrapbook'); return s && s.classList.contains('active') && document.querySelector('.page-ribbon'); }`,
    { watch: [{ sel: '#debrief-page.show', name: '10-debrief' }, { sel: '#hint-photo', name: '11-photo-hint' }] });
  await page.waitForTimeout(700);
  await page.screenshot({ path: SHOT('12-scrapbook') });

  // save-state assertions
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('vacation-adventure-v1')));
  const au = save.book && save.book.australia;
  const photoCount = au ? Object.keys(au.photos).length : 0;
  console.log('save:', JSON.stringify({
    name: save.name, coins: save.coins, tripCount: save.tripCount,
    stamps: save.stamps, done: au && au.done, photos: photoCount, souvenir: au && au.souvenir && au.souvenir.id,
  }));
  if (!au || !au.done) { errors.push('ASSERT: australia page not completed'); }
  if (photoCount !== 3) { errors.push('ASSERT: expected 3 photos, got ' + photoCount); }
  if (!save.stamps.includes('australia')) { errors.push('ASSERT: missing passport stamp'); }
  if (!au || !au.souvenir) { errors.push('ASSERT: no souvenir saved'); }
  if (save.coins !== 3) { errors.push('ASSERT: expected 3 coins left (12 - food 3 - ticket 3 - souvenir 3), got ' + save.coins); }

  // close the scrapbook → Grandma offers the next trip → map again
  console.log('next trip…');
  await clickUntil(page, '#btn-book-close',
    `() => !document.querySelector('#scr-scrapbook').classList.contains('active')`, 'close scrapbook');
  await talk(page, 'next trip → map',
    `() => { const c = document.querySelector('#scr-map'); return c && c.classList.contains('active') && document.querySelector('.dest-card [class="dc-done"], .dest-card .dc-done') && ${dialogueHidden}; }`);
  await page.screenshot({ path: SHOT('13-map-visited') });

  // album + passport modals
  await jsClick(page, '#btn-album');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT('14-album') });
  await jsClick(page, '.modal-close');
  await jsClick(page, '#btn-passport');
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('15-passport') });
  await jsClick(page, '.modal-close');

  await browser.close();

  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(2);
  }
  console.log('E2E OK — one full vacation completed, scrapbook page done, 3 photos, stamp + souvenir saved.');
})().catch(async e => {
  console.error('E2E FAILED:', e.message || e);
  if (errors.length) console.error('page errors so far:\n' + errors.join('\n'));
  process.exit(1);
});
