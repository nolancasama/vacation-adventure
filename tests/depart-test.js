/* Destination-hub departure safe-zone browser contract.

   Runs with SpeechRecognition removed and resumes seeded partial/all-complete
   trips directly at each destination hub.

   Run from a folder where `playwright` is installed:
     NODE_PATH=C:/Users/nolan/ui-verify/node_modules node tests/depart-test.js

   Screenshots go to $VA_SHOTS or ../.shots. */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PAGE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = process.env.VA_SHOTS || path.join(__dirname, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures.push(msg); }
};

const destinations = {
  australia: ['icecream', 'kangaroo', 'volleyball'],
  france: ['crepe', 'eiffel', 'soccer'],
  egypt: ['kebab', 'pyramids', 'sand'],
};

function saveFor(dest, done) {
  return {
    v: 1,
    name: 'Mio',
    playerLook: 'girl',
    coins: 12,
    tripCount: 0,
    trip: { dest, done, souvenir: null, no: 1 },
    book: { [dest]: { photos: {}, souvenir: null, done: false, trip: 1 } },
    homeGifts: {},
    socialPosts: [],
    reviews: {},
    bedroomGuide: { phoneSeen: false, phoneDone: false, pcSeen: false, pcDone: false },
    socialBonus: {},
    stamps: [],
    checkpoint: 'explore',
    finaleDone: false,
    settings: { music: false, sfx: true, voice: false, jp: true, labels: false, mic: true },
  };
}

async function openHub(page, dest, done) {
  await page.evaluate(save => {
    localStorage.setItem('vacation-adventure-v1', JSON.stringify(save));
  }, saveFor(dest, done));
  await page.reload();
  await page.waitForTimeout(900);
  await page.waitForSelector('#btn-continue:not([style*="display:none"]), #btn-continue:not([style*="display: none"])');
  await page.locator('#btn-continue').click();
  await page.waitForSelector('#scr-explore.active');
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('is-transitioning'));
  await page.waitForSelector('#btn-depart', { state: 'visible' });
  await page.waitForTimeout(100);
}

async function geometry(page) {
  return page.evaluate(() => {
    const button = document.querySelector('#btn-depart');
    const stage = document.querySelector('#stage');
    const buttonRect = button.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const hotspots = [...document.querySelectorAll('#hotspot-layer .hotspot')]
      .filter(el => !!el.offsetParent)
      .map(el => ({ id: el.id, rect: el.getBoundingClientRect() }));
    return {
      visible: !!button.offsetParent,
      centreDelta: Math.abs((buttonRect.left + buttonRect.right) / 2 -
        (stageRect.left + stageRect.right) / 2),
      overlaps: hotspots.filter(item => VA.Layout.rectsOverlapWithMargin(item.rect, buttonRect, 24))
        .map(item => item.id),
    };
  });
}

async function assertGeometry(page, label) {
  const result = await geometry(page);
  check(result.visible, label + ': departure button visible');
  check(result.centreDelta <= 4, label + ': departure button centred within 4px');
  check(result.overlaps.length === 0,
    label + ': no hotspot overlaps the 24px departure margin' +
      (result.overlaps.length ? ' (' + result.overlaps.join(', ') + ')' : ''));
}

async function assertAnimatedCentering(page, label) {
  await page.hover('#btn-depart');
  await page.waitForTimeout(80);
  let result = await geometry(page);
  check(result.centreDelta <= 4, label + ': centred while hovered');

  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  result = await geometry(page);
  check(result.centreDelta <= 4, label + ': centred at first animation sample');
  await page.waitForTimeout(700);
  result = await geometry(page);
  check(result.centreDelta <= 4, label + ': centred at second animation sample');
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.waitForTimeout(900);

  for (const [dest, eventIds] of Object.entries(destinations)) {
    await openHub(page, dest, [eventIds[0]]);
    await assertGeometry(page, dest + ' partial');
    await assertAnimatedCentering(page, dest + ' partial');

    await openHub(page, dest, eventIds);
    check(await page.locator('.hotspot.done').count() === eventIds.length,
      dest + ': all activities render completed cards');
    await assertGeometry(page, dest + ' complete');
    await assertAnimatedCentering(page, dest + ' complete');

    await page.screenshot({ path: SHOT('depart-' + dest) });
  }

  check(errors.length === 0, 'no unexpected page or console errors');
  if (errors.length) errors.forEach(error => console.log('  ' + error));
  await browser.close();

  if (failures.length) {
    console.error('\n' + failures.length + ' departure test failure(s).');
    process.exitCode = 1;
  } else {
    console.log('\nDeparture safe-zone test passed.');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
