/* Bedroom in-world hotspot and first-trip guide browser contract.

   Runs with SpeechRecognition removed and deterministic completed-trip saves.
   The guide stage is derived from persisted seen/done flags; it is never
   written to the save itself.

   Run from a folder where `playwright` is installed:
     NODE_PATH=C:/Users/nolan/ui-verify/node_modules node tests/bedroom-guide-test.js

   Screenshots go to $VA_SHOTS or ../.shots. */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PAGE_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = process.env.VA_SHOTS || path.join(__dirname, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const ATTENTION_OUT = path.join(OUT, 'bedroom', 'attention');
fs.mkdirSync(ATTENTION_OUT, { recursive: true });
const ATTENTION_SHOT = name => path.join(ATTENTION_OUT, name + '.png');
const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (ok) console.log('  \u2713 ' + msg);
  else { console.log('  \u2717 ' + msg); failures.push(msg); }
};

const photo = (dest, event, trip, verb, caption, icon, painter, file) => ({
  dest, event, trip, verb, caption, jp: '', icon, painter,
  backdrop: `event_${dest}_${event}.webp`, file, actors: [], props: [],
});

const emptySave = {
  v: 1,
  name: 'Mio',
  playerLook: 'girl',
  coins: 12,
  tripCount: 0,
  trip: null,
  book: {},
  homeGifts: {},
  stamps: [],
  socialPosts: [],
  reviews: {},
  socialBonus: {},
  bedroomGuide: { phoneSeen: false, phoneDone: false, pcSeen: false, pcDone: false },
  checkpoint: 'bedroom',
  finaleDone: false,
  settings: { music: false, sfx: true, voice: false, jp: true, labels: false, mic: true },
};

const completedSave = {
  ...emptySave,
  coins: 7,
  tripCount: 2,
  stamps: ['australia', 'france'],
  book: {
    australia: {
      done: true, trip: 1, souvenir: null,
      photos: {
        icecream: photo('australia', 'icecream', 1, 'ate', 'I ate ice cream.', '\ud83c\udf66', 'ev_au_icecream', 'photo_australia_icecream.webp'),
        kangaroo: photo('australia', 'kangaroo', 1, 'saw', 'I saw a kangaroo.', '\ud83e\udd98', 'ev_au_kangaroo', 'photo_australia_kangaroo.webp'),
        volleyball: photo('australia', 'volleyball', 1, 'played', 'I played volleyball.', '\ud83c\udfd0', 'ev_au_volleyball', 'photo_australia_volleyball.webp'),
      },
    },
    france: {
      done: true, trip: 2, souvenir: null,
      photos: {
        crepe: photo('france', 'crepe', 2, 'ate', 'I ate a crepe.', '\ud83e\udd5e', 'ev_fr_crepe', 'photo_france_crepe.webp'),
        eiffel: photo('france', 'eiffel', 2, 'saw', 'I saw the Eiffel Tower.', '', 'ev_fr_eiffel', 'photo_france_eiffel.webp'),
      },
    },
  },
};

const accumulatedSave = {
  ...completedSave,
  tripCount: 3,
  stamps: ['australia', 'france', 'egypt'],
  bedroomGuide: { phoneSeen: true, phoneDone: true, pcSeen: true, pcDone: true },
  socialPosts: [{
    id: 'post-existing', tripNo: 2, destId: 'france', eventId: 'eiffel',
    photo: completedSave.book.france.photos.eiffel, title: 'Paris', text: 'It was beautiful.',
    quality: 'clear', reactions: { '\u2764\ufe0f': 12 }, comments: [], followUp: null, rewardClaimed: true,
  }],
  reviews: {
    'france:eiffel': { destId: 'france', eventId: 'eiffel', tripNo: 2, stars: 5, text: 'It was beautiful.', updatedAt: 1 },
  },
  book: {
    ...completedSave.book,
    egypt: {
      done: true, trip: 3, souvenir: null,
      photos: {
        kebab: photo('egypt', 'kebab', 3, 'ate', 'I ate kebab.', '\ud83c\udf62', 'ev_eg_kebab', 'photo_egypt_kebab.webp'),
        pyramids: photo('egypt', 'pyramids', 3, 'saw', 'I saw the pyramids.', '\ud83d\udd3a', 'ev_eg_pyramids', 'photo_egypt_pyramids.webp'),
        sand: photo('egypt', 'sand', 3, 'played', 'I played in the sand.', '\ud83c\udfd6\ufe0f', 'ev_eg_sand', 'photo_egypt_sand.webp'),
      },
    },
  },
};

const click = (page, sel) => page.locator(sel).first().click();
const vis = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return !!(el && el.offsetParent);
}, sel).catch(() => false);
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('vacation-adventure-v1')));
const stage = page => page.evaluate(() => VA.Bedroom.guideStage(VA.State.data));
const coach = page => page.locator('.writing-coach:visible, .coach-bubble:visible').first();

async function active(page, id) {
  await page.waitForFunction(screen => {
    const el = document.querySelector('#scr-' + screen);
    return !!el && el.classList.contains('active');
  }, id);
}

async function resume(page) {
  await page.waitForSelector('#btn-continue:not([style*="display:none"]), #btn-continue:not([style*="display: none"])');
  await click(page, '#btn-continue');
  await active(page, 'bedroom');
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('is-transitioning'));
  await page.waitForTimeout(400);
}

async function setSaveAndReload(page, save) {
  await page.evaluate(data => localStorage.setItem('vacation-adventure-v1', JSON.stringify(data)), save);
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
}

async function dismissHint(page) {
  const box = await page.locator('.bedroom-hint').boundingBox();
  await page.mouse.click(box && box.x > 80 ? 24 : 940, 24);
  await page.waitForFunction(() => {
    const hint = document.querySelector('.bedroom-hint');
    return !hint || !hint.offsetParent;
  });
}

async function expectHint(page, action, english, japanese) {
  await click(page, `.bedroom-hotspot[data-action="${action}"]`);
  await page.waitForSelector('.bedroom-hint');
  const hint = page.locator('.bedroom-hint');
  check((await hint.textContent()).includes(english), `${action} explains its empty-state function in English`);
  check(!await vis(page, '.phone-overlay') && !await vis(page, '.reviews-overlay') &&
    !await page.locator('#scr-scrapbook.active').count(), `${action} empty hint opens no blocking destination`);
  if (japanese) {
    const toggle = hint.locator('button').filter({ hasText: '? \u65e5\u672c\u8a9e' }).first();
    check(await toggle.isVisible().catch(() => false), `${action} hint offers Japanese only on request`);
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      check((await hint.textContent()).includes(japanese), `${action} hint reveals its Japanese translation`);
    }
  }
  await dismissHint(page);
  check(!await vis(page, '.bedroom-hint'), `${action} hint is dismissed by an outside tap`);
}

async function attention(page, action) {
  return page.evaluate(which => {
    const host = document.querySelector(`[data-guide-for="${which}"]`) ||
      document.querySelector(`.bedroom-attention[data-action="${which}"]`) ||
      document.querySelector(`.bedroom-${which}-attention`) ||
      document.querySelector(`.bedroom-hotspot[data-action="${which}"]`);
    if (!host) return { screen: false, dot: false, one: false, pulse: false, star: false };
    const screen = host.querySelector('.bedroom-guide-screen, .bedroom-attention-screen, .guide-screen');
    const dot = host.querySelector('.bedroom-guide-dot, .bedroom-notification-dot, .notification-dot');
    const nodes = [host, screen].filter(Boolean);
    const pulse = nodes.some(el => {
      const style = getComputedStyle(el);
      return style.animationName !== 'none';
    });
    return {
      screen: !!(screen && screen.offsetParent),
      dot: !!(dot && dot.offsetParent),
      one: !!(dot && /1/.test(dot.textContent)),
      pulse,
      star: !!(screen && screen.textContent.includes('\u2605')),
    };
  }, action);
}

async function openPhone(page) {
  await click(page, '.bedroom-hotspot[data-action="phone"]');
  await page.waitForSelector('.phone-overlay');
}

async function closePhone(page) {
  await click(page, '.phone-close');
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.phone-overlay');
    return !overlay || !overlay.offsetParent;
  });
}

async function openPc(page) {
  await click(page, '.bedroom-hotspot[data-action="pc"]');
  await page.waitForSelector('.reviews-overlay');
}

async function closePc(page) {
  await click(page, '.reviews-close');
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.reviews-overlay');
    return !overlay || !overlay.offsetParent;
  });
}

async function expectCoach(page, text, msg) {
  const bubble = coach(page);
  await bubble.waitFor();
  check(await page.locator('.writing-coach:visible, .coach-bubble:visible').count() === 1,
    msg + ' as the only coach bubble');
  check((await bubble.textContent()).includes(text), msg);
  check(await bubble.evaluate(el => getComputedStyle(el).pointerEvents === 'none' ||
    getComputedStyle(el.parentElement).pointerEvents === 'none'), msg + ' without blocking controls');
  const covered = await coachCovers(page);
  check(!covered.length, msg + ' without covering any control' + (covered.length ? ': ' + covered.join(', ') : ''));
}

/* Geometry, not pointer-events: a visible coach may not overlap any visible
   button, field or star control outside itself (e.g. NEXT, POST, PUBLISH). */
function coachCovers(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return el.offsetParent && r.width > 0 && r.height > 0; };
    const hit = [];
    document.querySelectorAll('.writing-coach').forEach(coach => {
      if (!visible(coach)) return;
      const c = coach.getBoundingClientRect();
      // controls behind the modal overlay (bedroom hotspots) are not reachable anyway
      const scope = coach.closest('.phone-overlay, .reviews-overlay') || document;
      scope.querySelectorAll('button, input, textarea, [role="button"]').forEach(control => {
        if (coach.contains(control) || !visible(control)) return;
        const r = control.getBoundingClientRect();
        if (r.left < c.right - 1 && r.right > c.left + 1 && r.top < c.bottom - 1 && r.bottom > c.top + 1) {
          hit.push((control.className || control.tagName) + ' "' + control.textContent.trim().slice(0, 16) + '"');
        }
      });
    });
    return hit;
  });
}

async function dialogueChoice(page, text) {
  for (let i = 0; i < 80; i++) {
    const choice = page.locator('#choices .choice-btn').filter({ hasText: text }).first();
    if (await choice.isVisible().catch(() => false)) { await choice.click(); return true; }
    if (await vis(page, '#dialogue')) await click(page, '#dialogue');
    await page.waitForTimeout(250);
  }
  throw new Error('dialogue choice did not appear: ' + text);
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(seed => {
    window.VA_TIMELINE_SCALE = 0.2;
    window.__bedroomSfx = [];
    window.addEventListener('DOMContentLoaded', () => {
      const original = VA.Audio.sfx.bind(VA.Audio);
      VA.Audio.sfx = name => { window.__bedroomSfx.push(name); return original(name); };
    });
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    if (!localStorage.getItem('vacation-adventure-v1')) {
      localStorage.setItem('vacation-adventure-v1', JSON.stringify(seed));
    }
  }, emptySave);
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('ERR_FILE_NOT_FOUND') || text.includes('blocked by CORS policy') || text.includes('net::ERR_FAILED')) return;
    errors.push('CONSOLE: ' + text);
  });

  await page.goto(PAGE_URL);
  await page.waitForTimeout(900);
  await resume(page);
  await page.screenshot({ path: SHOT('guide-before-trip') });

  check(await stage(page) === 'none', 'before a trip the derived guide stage is none');
  const noPhone = await attention(page, 'phone');
  const noPc = await attention(page, 'pc');
  check(!noPhone.screen && !noPhone.dot && !noPhone.pulse && !noPc.screen && !noPc.dot && !noPc.pulse,
    'before a trip neither phone nor PC has attention effects');
  await expectHint(page, 'phone', 'After your trip, share your favorite photos here!',
    '\u65c5\u884c\u306e\u3042\u3068\u3001\u3053\u3053\u3067\u304a\u6c17\u306b\u5165\u308a\u306e\u5199\u771f\u3092\u30b7\u30a7\u30a2\u3057\u3088\u3046\uff01');
  await expectHint(page, 'pc', 'After your trip, write reviews of the places you visited!');
  await expectHint(page, 'scrapbook', 'Your vacation memories will appear here!');
  await expectHint(page, 'shelf', 'Flags from your trips will stand here!');
  await click(page, '.bedroom-hotspot[data-action="corkboard"]');
  await page.waitForSelector('.bedroom-hint');
  check((await page.locator('.bedroom-hint').textContent()).includes('Your trip photos will go here!'),
    'the empty corkboard explains where trip photos will go');
  await page.screenshot({ path: SHOT('guide-empty-hint') });
  await dismissHint(page);
  await page.evaluate(() => {
    VA.State.data.settings.jp = false;
    VA.State.save();
    VA.Bedroom.render();
  });
  await click(page, '.bedroom-hotspot[data-action="phone"]');
  await page.waitForSelector('.bedroom-hint');
  check(await page.locator('.bedroom-hint button').filter({ hasText: '\u65e5\u672c\u8a9e' }).count() === 0,
    'Japanese-off settings remove the hint reveal pill entirely');
  await dismissHint(page);

  const geometry = await page.locator('.bedroom-hotspot').evaluateAll(nodes => nodes.map(el => {
    const r = el.getBoundingClientRect();
    const atCenter = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      action: el.dataset.action, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height, ownsCenter: atCenter === el || el.contains(atCenter),
      aria: el.getAttribute('aria-label'),
    };
  }));
  check(geometry.map(item => item.action).sort().join() === 'corkboard,pc,phone,scrapbook,shelf,trip',
    'the room exposes exactly the six specified in-world hotspots and no passport hotspot');
  const labels = page.locator('.bedroom-hotspot-label');
  check(await labels.count() === 6 && await labels.evaluateAll(nodes => nodes.every(el => {
    const style = getComputedStyle(el);
    return style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
  })),
    'hotspot labels are hidden when no object is hovered or focused');
  await page.locator('.bedroom-hotspot[data-action="phone"]').hover();
  await page.waitForTimeout(250); // the label fades in over .12s
  check(await page.locator('.bedroom-hotspot[data-action="phone"] .bedroom-hotspot-label').evaluate(el => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  }),
    'hover reveals only the phone label chip');
  geometry.forEach(item => {
    check(item.width >= 48 && item.height >= 48, `${item.action} hotspot is at least 48x48 CSS px`);
    check(item.ownsCenter, `${item.action} hotspot is topmost at its centre`);
    check(!!item.aria, `${item.action} hotspot has an accessible label`);
  });
  for (let i = 0; i < geometry.length; i++) {
    for (let j = i + 1; j < geometry.length; j++) {
      const a = geometry[i]; const b = geometry[j];
      check(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `${a.action} and ${b.action} hotspots do not overlap`);
    }
  }

  // A first trip with memories but no writing starts on the phone only.
  await setSaveAndReload(page, completedSave);
  await page.waitForFunction(() => document.querySelector('.guide-phone-new')?.dataset.attentionState === 'strong');
  check(await stage(page) === 'phone-new', 'a completed first trip starts the phone-new stage');
  let phoneAttention = await attention(page, 'phone');
  let pcAttention = await attention(page, 'pc');
  check(phoneAttention.screen && phoneAttention.dot && phoneAttention.one && phoneAttention.pulse,
    'phone-new lights and pulses the phone with a 1 dot');
  const strongDetails = await page.evaluate(() => {
    const layer = document.querySelector('.guide-phone-new');
    const badge = layer.querySelector('.bedroom-guide-dot').getBoundingClientRect();
    const glow = layer.querySelector('.bedroom-guide-screen');
    const ring = layer.querySelector('.bedroom-phone-ring');
    const hint = document.querySelector('.bedroom-phone-hint');
    return {
      sound: window.__bedroomSfx.filter(name => name === 'chime').length,
      badgeWidth: badge.width,
      glow: !!(glow && glow.offsetParent),
      ring: !!ring && getComputedStyle(ring).animationName !== 'none',
      hint: hint?.textContent || '',
    };
  });
  check(strongDetails.sound === 1 && strongDetails.glow && strongDetails.badgeWidth >= 32 && strongDetails.ring &&
    strongDetails.hint.includes('New! Share your trip! 📱'),
  'phone-new plays one chime and shows the large badge, glow, finite pulse ring, and sharing hint');
  check(!pcAttention.screen && !pcAttention.dot && !pcAttention.pulse, 'PC stays completely dark during the phone stage');
  const probeDetected = await page.evaluate(() => {
    const original = VA.Bedroom.guideStage;
    try {
      VA.Bedroom.guideStage = () => 'done';
      VA.Bedroom.renderGuide();
      return !document.querySelector('.bedroom-guide-layer[data-guide-for="phone"]');
    } finally {
      VA.Bedroom.guideStage = original;
      VA.Bedroom.renderGuide();
    }
  });
  check(probeDetected, 'the attention assertion detects a temporary forced-done guide mutation');
  await page.evaluate(() => VA.Bedroom.startPhoneNotification());
  await page.waitForFunction(() => document.querySelector('.guide-phone-new')?.dataset.attentionState === 'strong');
  await page.screenshot({ path: SHOT('guide-phone-attention') });
  await page.screenshot({ path: ATTENTION_SHOT('first-trip-notification') });
  await page.screenshot({ path: ATTENTION_SHOT('hint') });

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    const aligned = await page.evaluate(() => {
      const stageBox = document.querySelector('#stage').getBoundingClientRect();
      const hotspot = VA.Bedroom.hotspots.find(item => item.id === 'phone');
      const scale = stageBox.width / 960;
      const screen = document.querySelector('.guide-phone-new .bedroom-guide-screen').getBoundingClientRect();
      const hint = document.querySelector('.bedroom-phone-hint').getBoundingClientRect();
      const others = Array.from(document.querySelectorAll('.bedroom-hotspot:not([data-action="phone"])')).map(el => el.getBoundingClientRect());
      const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        screen: Math.abs(screen.left - (stageBox.left + hotspot.screen.x * scale)) < 1.5 &&
          Math.abs(screen.top - (stageBox.top + hotspot.screen.y * scale)) < 1.5 &&
          Math.abs(screen.width - hotspot.screen.w * scale) < 1.5,
        hintNear: Math.abs((hint.left + hint.right) / 2 - (stageBox.left + (hotspot.rect.x + hotspot.rect.w / 2) * scale)) < 2,
        clear: !others.some(box => overlap(hint, box)) && !Array.from(document.querySelectorAll('.writing-coach')).some(el => el.offsetParent),
      };
    });
    check(aligned.screen && aligned.hintNear && aligned.clear,
      `phone glow and hint stay hotspot-aligned and collision-free at ${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });

  await openPhone(page);
  check(await stage(page) === 'phone-pending', 'opening the phone persists phoneSeen immediately');
  await expectCoach(page, 'Tap + NEW POST to share a photo!', 'the phone feed coaches the first post');
  await page.screenshot({ path: SHOT('guide-phone-tutorial') });
  const coachJp = page.locator('.writing-coach[data-coach="phone-feed"] .writing-coach-jp-toggle');
  check(await coachJp.isVisible(), 'the phone coach offers Japanese only behind a reveal pill');
  await coachJp.click();
  check((await page.locator('.writing-coach[data-coach="phone-feed"]').textContent()).includes('\uff0bNEW POST\u3067\u5199\u771f\u3092\u30b7\u30a7\u30a2\u3057\u3088\u3046\uff01'),
    'the phone coach reveals the requested Japanese translation');
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-memory-option');
  await expectCoach(page, 'Choose a photo from your trip.', 'the phone picker coaches photo choice');
  await closePhone(page);
  phoneAttention = await attention(page, 'phone');
  pcAttention = await attention(page, 'pc');
  check(await stage(page) === 'phone-pending' && !phoneAttention.screen && phoneAttention.dot && !phoneAttention.pulse,
    'closing without a post leaves only the quiet phone badge without glow or pulse');
  check(!pcAttention.screen && !pcAttention.dot, 'PC remains dark while the phone is pending');

  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  phoneAttention = await attention(page, 'phone');
  check(await stage(page) === 'phone-pending' && !phoneAttention.screen && phoneAttention.dot && !phoneAttention.pulse,
    'reload restores phone-pending from persisted state');
  check(!await vis(page, '.bedroom-phone-hint') &&
    await page.evaluate(() => !window.__bedroomSfx.includes('chime')),
  'opening the phone prevents the strong sequence and hint from replaying after reload');

  await openPhone(page);
  await click(page, '.phone-new-post');
  await click(page, '.phone-memory-option[data-key="france:eiffel"]');
  await click(page, '.phone-next');
  await page.waitForSelector('.phone-title-input');
  await expectCoach(page, 'Give your post a title.', 'the title step has its coach bubble');
  await page.fill('.phone-title-input', 'Paris Day');
  await click(page, '.phone-next');
  await page.waitForSelector('.phone-caption-input');
  await expectCoach(page, 'Write about your trip, then tap POST!', 'the caption and POST step has its coach bubble');
  await page.fill('.phone-caption-input', 'I saw the Eiffel Tower.');
  const postCountBefore = (await state(page)).socialPosts.length;
  await click(page, '.phone-post');
  await page.waitForFunction(count => {
    const save = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
    return (save.socialPosts || []).length === count + 1;
  }, postCountBefore);
  check((await state(page)).bedroomGuide.phoneDone === true, 'the first published post immediately persists phoneDone');
  check((await page.locator('.writing-guide-outcome').textContent()).includes('Your friends reacted! \ud83c\udf89'),
    'the first post shows its tutorial outcome line');
  check((await state(page)).socialPosts.length === postCountBefore + 1, 'the guided phone post still publishes exactly once');
  await closePhone(page);
  check(await stage(page) === 'pc-new', 'closing the completed phone hands the guide to the PC');
  phoneAttention = await attention(page, 'phone');
  pcAttention = await attention(page, 'pc');
  check(!phoneAttention.screen && !phoneAttention.dot && pcAttention.screen && pcAttention.dot && pcAttention.one && pcAttention.pulse && pcAttention.star,
    'pc-new shows a pulsing gold star screen and dot while the phone shows nothing');
  await page.screenshot({ path: SHOT('guide-pc-attention') });

  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  check(await stage(page) === 'pc-new', 'reload keeps the derived pc-new stage');

  await openPc(page);
  check(await stage(page) === 'pc-pending', 'opening the PC persists pcSeen immediately');
  await expectCoach(page, 'Choose a place you visited.', 'the PC picker coaches place choice');
  await click(page, '.review-place-option[data-key="france:eiffel"]');
  await click(page, '.review-next');
  await page.waitForSelector('.review-star');
  await expectCoach(page, "How many stars? It's your opinion!", 'the PC coaches the star choice');
  await click(page, '.review-star[data-stars="5"]');
  await click(page, '.review-next');
  await page.waitForSelector('.review-text-input');
  await expectCoach(page, 'Write what you thought.', 'the PC writing step has its coach bubble');
  const suggestion = await page.locator('.review-content').textContent();
  check(/It was delicious\..*It was beautiful\..*It was fun\./s.test(suggestion), 'review examples appear as plain suggestions');
  check(await page.locator('button').filter({ hasText: 'It was delicious.' }).count() === 0,
    'review tutorial examples are not buttons');
  await page.fill('.review-text-input', 'It was beautiful.');
  await page.screenshot({ path: SHOT('guide-pc-tutorial') });
  const reviewsBefore = Object.keys((await state(page)).reviews).length;
  await click(page, '.review-publish');
  await page.waitForFunction(count => {
    const save = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
    return Object.keys(save.reviews || {}).length === count + 1;
  }, reviewsBefore);
  const afterReview = await state(page);
  check(afterReview.bedroomGuide.pcDone === true, 'the first published review immediately persists pcDone');
  check(afterReview.reviews['france:eiffel'].stars === 5 && afterReview.reviews['france:eiffel'].text === 'It was beautiful.',
    'the guided PC review still publishes its exact stars and text');
  check((await page.locator('.writing-guide-outcome').textContent()).includes('Your review is online! \u2605'),
    'the first review shows its tutorial outcome line');
  await closePc(page);
  check(await stage(page) === 'done', 'publishing both pieces completes the derived guide');
  phoneAttention = await attention(page, 'phone');
  pcAttention = await attention(page, 'pc');
  check(!phoneAttention.screen && !phoneAttention.dot && !pcAttention.screen && !pcAttention.dot,
    'done has no phone or PC attention effects');
  await page.screenshot({ path: SHOT('guide-done') });

  // A later trip does not restart either tutorial.
  await setSaveAndReload(page, accumulatedSave);
  await page.waitForFunction(() => document.querySelector('.guide-phone-later')?.dataset.attentionState === 'quiet');
  check(await stage(page) === 'done', 'a second or later completed trip does not restart a completed guide');
  const laterNotice = await page.evaluate(() => ({
    sound: window.__bedroomSfx.filter(name => name === 'postUp').length,
    badge: document.querySelector('.guide-phone-later .bedroom-guide-dot')?.textContent,
    pulse: getComputedStyle(document.querySelector('.guide-phone-later .bedroom-phone-ring')).animationName,
    hint: !!document.querySelector('.bedroom-phone-hint'),
    notified: VA.State.data.bedroomGuide.phoneNotifiedTrip,
  }));
  check(laterNotice.sound === 1 && laterNotice.badge === '7' && laterNotice.pulse !== 'none' && !laterNotice.hint && laterNotice.notified === 3,
    'a later trip gets one quiet notification, a counted badge and one pulse without the first-trip hint');
  await page.screenshot({ path: ATTENTION_SHOT('later-trip-notification') });
  await page.evaluate(() => VA.Bedroom.show());
  await page.waitForFunction(() => document.querySelector('.guide-phone-later')?.dataset.attentionState === 'static');
  check(await page.evaluate(() => window.__bedroomSfx.filter(name => name === 'postUp').length) === 1,
    're-entering the bedroom does not replay a later-trip notification already saved for that trip');
  await openPhone(page);
  check(!await vis(page, '.writing-coach') && !await vis(page, '.coach-bubble'), 'completed phone guide shows no coach bubbles');
  await closePhone(page);
  await openPc(page);
  check(!await vis(page, '.writing-coach') && !await vis(page, '.coach-bubble'), 'completed PC guide shows no coach bubbles');
  await closePc(page);
  await click(page, '.bedroom-hotspot[data-action="shelf"]');
  await page.waitForSelector('.bedroom-hint');
  const shelfText = await page.locator('.bedroom-hint').textContent();
  check(shelfText.includes('Australia') && shelfText.includes('France') && shelfText.includes('Egypt'),
    'the populated travel shelf hint lists all visited places');
  await dismissHint(page);
  await click(page, '.bedroom-hotspot[data-action="corkboard"]');
  await page.waitForSelector('#modal[style*="flex"]');
  check((await page.locator('#modal-card').textContent()).includes('Photo Album'), 'the populated corkboard opens the existing photo album');
  await click(page, '#modal .modal-close');
  await page.screenshot({ path: SHOT('guide-accumulated') });

  // Pure stage precedence: completing PC out of order never skips the phone.
  const pureStages = await page.evaluate(() => {
    const book = { australia: { done: true, photos: { icecream: {} } } };
    return {
      none: VA.Bedroom.guideStage({ bedroomGuide: {}, book: {} }),
      phoneNew: VA.Bedroom.guideStage({ book, bedroomGuide: { phoneSeen: false, phoneDone: false, pcSeen: false, pcDone: true } }),
      phonePending: VA.Bedroom.guideStage({ book, bedroomGuide: { phoneSeen: true, phoneDone: false, pcSeen: true, pcDone: true } }),
      pcNew: VA.Bedroom.guideStage({ book, bedroomGuide: { phoneSeen: true, phoneDone: true, pcSeen: false, pcDone: false } }),
      pcPending: VA.Bedroom.guideStage({ book, bedroomGuide: { phoneSeen: true, phoneDone: true, pcSeen: true, pcDone: false } }),
      done: VA.Bedroom.guideStage({ book, bedroomGuide: { phoneSeen: true, phoneDone: true, pcSeen: true, pcDone: true } }),
    };
  });
  check(pureStages.none === 'none' && pureStages.phoneNew === 'phone-new' && pureStages.phonePending === 'phone-pending' &&
    pureStages.pcNew === 'pc-new' && pureStages.pcPending === 'pc-pending' && pureStages.done === 'done',
  'guideStage derives every flag stage and keeps an out-of-order PC completion on the phone');

  // Old saves migrate completion from actual writing; matching Seen follows Done.
  const legacyPost = { ...completedSave, bedroomGuide: undefined, socialPosts: accumulatedSave.socialPosts, reviews: {} };
  delete legacyPost.bedroomGuide;
  await setSaveAndReload(page, legacyPost);
  let migrated = (await state(page)).bedroomGuide;
  check(migrated.phoneDone && migrated.phoneSeen && !migrated.pcDone, 'an old save with posts migrates phone done/seen only');
  const legacyReview = { ...completedSave, bedroomGuide: undefined, socialPosts: [], reviews: accumulatedSave.reviews };
  delete legacyReview.bedroomGuide;
  await setSaveAndReload(page, legacyReview);
  migrated = (await state(page)).bedroomGuide;
  check(!migrated.phoneDone && migrated.pcDone && migrated.pcSeen && await stage(page) === 'phone-new',
    'an old save with only reviews migrates PC done/seen but continues at the phone');
  const legacyBoth = { ...completedSave, bedroomGuide: undefined, socialPosts: accumulatedSave.socialPosts, reviews: accumulatedSave.reviews };
  delete legacyBoth.bedroomGuide;
  await setSaveAndReload(page, legacyBoth);
  migrated = (await state(page)).bedroomGuide;
  check(migrated.phoneDone && migrated.phoneSeen && migrated.pcDone && migrated.pcSeen && await stage(page) === 'done',
    'an old save with posts and reviews migrates directly to done');

  // Trip stays usable in both branches.
  await setSaveAndReload(page, emptySave);
  await click(page, '.bedroom-hotspot[data-action="trip"]');
  await active(page, 'map');
  check(await vis(page, '#scr-map'), 'Trip! reaches the map before the first trip');
  await setSaveAndReload(page, accumulatedSave);
  await click(page, '.bedroom-hotspot[data-action="trip"]');
  const reachedGrandma = await dialogueChoice(page, 'No, thank you.');
  check(reachedGrandma, "Trip! reaches Grandma's question after a completed trip");

  await browser.close();
  check(!errors.length, 'no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  if (failures.length) {
    console.error('\n' + failures.length + ' BEDROOM GUIDE TEST(S) FAILED');
    process.exit(1);
  }
  console.log('\nBEDROOM GUIDE TESTS OK');
})().catch(error => {
  console.error('BEDROOM GUIDE TESTS CRASHED:', error.message || error);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
});
