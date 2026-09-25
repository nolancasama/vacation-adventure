/* Bedroom, phone, and PC browser contract.

   Runs with SpeechRecognition removed so every interaction has a click path.
   The save is seeded with two completed trips and real snapPhoto-shaped photo
   objects. No declined event is present in the scrapbook.

   Run from a folder where `playwright` is installed:
     NODE_PATH=C:/Users/nolan/ui-verify/node_modules node tests/bedroom-test.js

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

const photo = (dest, event, trip, verb, caption, jp, icon, painter, backdrop, file) => ({
  dest, event, trip, verb, caption, jp, icon, painter, backdrop, file,
  actors: [], props: [],
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
  checkpoint: 'bedroom',
  finaleDone: false,
  settings: { music: false, sfx: true, voice: false, jp: true, labels: false, mic: true },
};

const populatedSave = {
  ...emptySave,
  coins: 7,
  tripCount: 2,
  stamps: ['australia', 'france'],
  book: {
    australia: {
      done: true, trip: 1, souvenir: null,
      photos: {
        icecream: photo('australia', 'icecream', 1, 'ate', 'I ate ice cream.', 'アイスクリームを食べたよ。', '🍦', 'ev_au_icecream', 'event_australia_icecream.webp', 'photo_australia_icecream.webp'),
        kangaroo: photo('australia', 'kangaroo', 1, 'saw', 'I saw a kangaroo.', 'カンガルーを見たよ。', '🦘', 'ev_au_kangaroo', 'event_australia_kangaroo.webp', 'photo_australia_kangaroo.webp'),
        volleyball: photo('australia', 'volleyball', 1, 'played', 'I played volleyball.', 'バレーボールをしたよ。', '🏐', 'ev_au_volleyball', 'event_australia_volleyball.webp', 'photo_australia_volleyball.webp'),
      },
    },
    france: {
      done: true, trip: 2, souvenir: null,
      photos: {
        crepe: photo('france', 'crepe', 2, 'ate', 'I ate a crepe.', 'クレープを食べたよ。', '🥞', 'ev_fr_crepe', 'event_france_crepe.webp', 'photo_france_crepe.webp'),
        eiffel: photo('france', 'eiffel', 2, 'saw', 'I saw the Eiffel Tower.', 'エッフェル塔を見たよ。', '', 'ev_fr_eiffel', 'event_france_eiffel.webp', 'photo_france_eiffel.webp'),
        // Soccer was declined, so it deliberately has no photo.
      },
    },
  },
};

const vis = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return !!(el && el.offsetParent);
}, sel).catch(() => false);
const click = (page, sel) => page.locator(sel).first().click();
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('vacation-adventure-v1')));

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
  // .active lands mid-wipe; screenshots must wait for the transition to end
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('is-transitioning'));
  await page.waitForTimeout(400);
}

async function setSaveAndReload(page, save) {
  await page.evaluate(data => localStorage.setItem('vacation-adventure-v1', JSON.stringify(data)), save);
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
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

async function startPhonePost(page, key, title, text) {
  if (!await vis(page, '.phone-new-post')) {
    const back = page.locator('.phone-overlay button').filter({ hasText: 'BACK TO FEED' }).first();
    if (await back.isVisible().catch(() => false)) await back.click();
  }
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-memory-option');
  await click(page, `.phone-memory-option[data-key="${key}"]`);
  await click(page, '.phone-next');
  await page.waitForSelector('.phone-title-input');
  await page.fill('.phone-title-input', title || '');
  await click(page, '.phone-next');
  await page.waitForSelector('.phone-caption-input');
  await page.fill('.phone-caption-input', text);
}

async function publishPhonePost(page, key, text, title = '') {
  await startPhonePost(page, key, title, text);
  const before = (await state(page)).socialPosts.length;
  await click(page, '.phone-post');
  await page.waitForFunction(count => {
    const saved = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
    const outcome = document.querySelector('.phone-outcome');
    return (saved.socialPosts || []).length > count || !!(outcome && outcome.offsetParent);
  }, before);
}

const phoneComplete = page => page.waitForSelector('.phone-published .phone-post-card[data-complete="1"]', { timeout: 30000 });

/* Records every visible phone state change so ordering can be asserted even
   when a step lasts only a frame. */
async function recordPhone(page) {
  await page.evaluate(() => {
    const log = window.__phoneLog = [];
    const snap = () => {
      const q = s => document.querySelector(s);
      const card = q('.phone-published .phone-post-card');
      const likes = card ? Number((card.querySelector('.phone-likes') || {}).dataset?.count || 0) : null;
      const s = {
        posting: !!q('.phone-posting'),
        online: !!(card && /Posted/.test(card.querySelector('.phone-post-status').textContent)),
        likes,
        chips: card ? card.querySelectorAll('.phone-reaction').length : 0,
        typing: card ? card.querySelectorAll('.phone-typing').length : 0,
        comments: card ? card.querySelectorAll('.phone-comment').length : 0,
        avatars: card ? Array.from(card.querySelectorAll('.phone-comment .social-avatar')).filter(a => a.textContent.trim() || a.querySelector('img')).length : 0,
      };
      const last = log[log.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(s)) log.push(s);
    };
    window.__phoneObserver = new MutationObserver(snap);
    window.__phoneObserver.observe(document.querySelector('#phone-screen'), { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
const phoneLog = page => page.evaluate(() => { window.__phoneObserver.disconnect(); return window.__phoneLog; });

async function recordPc(page) {
  await page.evaluate(() => {
    const log = window.__pcLog = [];
    const snap = () => {
      const card = document.querySelector('.review-card.review-live');
      const s = card ? {
        posting: !!card.querySelector('.review-posting'),
        online: !!card.querySelector('.review-online'),
        helpful: Number(card.querySelector('.review-helpful-count').dataset.count),
        typing: !!card.querySelector('.review-owner-typing'),
        reply: !!card.querySelector('.review-owner-reply'),
      } : null;
      const last = log[log.length - 1];
      if (s && (!last || JSON.stringify(last) !== JSON.stringify(s))) log.push(s);
    };
    window.__pcObserver = new MutationObserver(snap);
    window.__pcObserver.observe(document.querySelector('#reviews-screen'), { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
const pcLog = page => page.evaluate(() => { window.__pcObserver.disconnect(); return window.__pcLog; });
const pcComplete = page => page.waitForSelector('.review-card.review-live[data-complete="1"]', { timeout: 30000 });

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

async function startReview(page, key, stars) {
  if (await vis(page, '.review-tab-write')) await click(page, '.review-tab-write');
  await page.waitForSelector('.review-place-option');
  await click(page, `.review-place-option[data-key="${key}"]`);
  await click(page, '.review-next');
  await page.waitForSelector('.review-star');
  await click(page, `.review-star[data-stars="${stars}"]`);
  await click(page, '.review-next');
  await page.waitForSelector('.review-text-input');
}

async function dialogueChoice(page, text) {
  for (let i = 0; i < 80; i++) {
    const choice = page.locator('#choices .choice-btn').filter({ hasText: text }).first();
    if (await choice.isVisible().catch(() => false)) {
      await choice.click();
      return;
    }
    if (await vis(page, '#dialogue')) await click(page, '#dialogue');
    await page.waitForTimeout(250);
  }
  throw new Error('dialogue choice did not appear: ' + text);
}

async function advanceDialogueTo(page, stop) {
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(stop).catch(() => false)) return;
    if (await vis(page, '#dialogue')) await click(page, '#dialogue');
    await page.waitForTimeout(250);
  }
  throw new Error('dialogue did not reach its expected destination');
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(seed => {
    window.VA_TIMELINE_SCALE = 0.05;
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
  check(await vis(page, '#scr-bedroom'), 'checkpoint "bedroom" resumes in the bedroom');
  // the HUD is shown after the screen transition settles, not with .active
  await page.waitForFunction(() => document.querySelector('#hud').style.display !== 'none', null, { timeout: 5000 }).catch(() => {});
  check(await vis(page, '#hud'), 'HUD remains visible in the bedroom');
  check(await page.locator('.bedroom-pennant').count() === 0, 'an empty bedroom has no travel pennants');
  check(await page.locator('.bedroom-hotspot[data-action="trip"].first-trip').count() === 1, 'the first-visit suitcase has its pulse state');
  await page.screenshot({ path: SHOT('bedroom-empty') });
  await click(page, '.bedroom-hotspot[data-action="phone"]');
  await page.waitForSelector('.bedroom-hint');
  check((await page.locator('.bedroom-hint').textContent()).includes('After your trip, share your favorite photos here!') &&
    !await vis(page, '.phone-overlay'), 'phone before a trip shows its function hint');
  await click(page, '#scr-bedroom .scene-art');
  await click(page, '.bedroom-hotspot[data-action="pc"]');
  await page.waitForSelector('.bedroom-hint');
  check((await page.locator('.bedroom-hint').textContent()).includes('After your trip, write reviews of the places you visited!') &&
    !await vis(page, '.reviews-overlay'), 'PC before a trip shows its function hint');
  await click(page, '#scr-bedroom .scene-art');

  await setSaveAndReload(page, populatedSave);
  check(await page.locator('.bedroom-pennant').count() === 2, 'one pennant is shown per completed destination');
  check(await page.locator('.bedroom-polaroid').count() === 5, 'corkboard shows all five earned photos (up to six)');
  await page.screenshot({ path: SHOT('bedroom-populated') });

  /* ---------- phone: real memories, outcomes, bonus, persistence ---------- */
  await openPhone(page);
  await page.screenshot({ path: SHOT('phone-feed') });
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-memory-option');
  const phoneKeys = await page.locator('.phone-memory-option').evaluateAll(options => options.map(o => o.dataset.key));
  check(phoneKeys.length === 5, 'phone picker lists exactly the five earned photos');
  check(!phoneKeys.some(key => key.endsWith(':soccer')), 'declined soccer is absent from the phone picker');
  await page.screenshot({ path: SHOT('phone-picker') });
  await click(page, '.phone-memory-option[data-key="france:eiffel"]');
  await click(page, '.phone-next');
  await page.fill('.phone-title-input', 'Paris Day');
  await click(page, '.phone-next');
  await page.fill('.phone-caption-input', 'I saw the Eiffel Tower.');
  await click(page, '.phone-help');
  check(await vis(page, '.phone-help-rung1'), 'phone help opens sentence starters without writing the answer');
  await page.screenshot({ path: SHOT('phone-composer') });
  const coinsBeforePosts = (await state(page)).coins;
  const postsBeforeClear = (await state(page)).socialPosts.length;
  // The first post plays at real speed so its sequence can be observed.
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await recordPhone(page);
  await click(page, '.phone-post');
  await page.waitForFunction(count => {
    const saved = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
    return (saved.socialPosts || []).length > count;
  }, postsBeforeClear);
  await page.waitForSelector('.phone-posting');
  await page.screenshot({ path: SHOT('phone-uploading') });
  let saved = await state(page);
  let latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.quality === 'clear' && latest.rewardClaimed, 'a clear post publishes and claims its travel bonus');
  check(saved.coins === coinsBeforePosts + 1, 'a clear post adds exactly one coin');
  check(latest.reactions['❤️'] > 0 && latest.comments.length >= 3, 'the final outcome is saved at once, before the reveal');
  await page.waitForFunction(() => Number(document.querySelector('.phone-published .phone-likes').dataset.count) > 0);
  await page.screenshot({ path: SHOT('phone-online-few-likes') });
  await page.waitForSelector('.phone-published .phone-typing');
  await page.screenshot({ path: SHOT('phone-typing') });
  await page.waitForSelector('.phone-published .phone-comment');
  await page.screenshot({ path: SHOT('phone-comment-avatar') });
  await page.waitForFunction(() => Number(document.querySelector('.phone-published .phone-likes').dataset.count) > 8);
  await page.screenshot({ path: SHOT('phone-likes-rising') });
  await phoneComplete(page);
  const log = await phoneLog(page);
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  const firstPosting = log.findIndex(s => s.posting);
  const firstOnline = log.findIndex(s => s.online);
  check(firstPosting >= 0 && firstOnline > firstPosting && !log[firstPosting].online, 'posting is shown before the post goes online');
  const likeValues = log.map(s => s.likes).filter(v => v != null);
  check(likeValues[0] === 0 && likeValues[likeValues.length - 1] === latest.reactions['❤️'] &&
    likeValues.every((v, i) => i === 0 || v >= likeValues[i - 1]) && new Set(likeValues).size >= 4,
    'likes start at 0 and rise in several steps to the saved total');
  const chipCounts = [...new Set(log.map(s => s.chips))];
  check(chipCounts.length >= 3 && chipCounts.every((v, i) => i === 0 || v > chipCounts[i - 1]), 'emoji reactions arrive one at a time');
  const commentJumps = log.map((s, i) => i && s.comments > log[i - 1].comments ? i : -1).filter(i => i > 0);
  check(commentJumps.length >= 4 && commentJumps.every(i => log[i - 1].typing > 0), 'a typing indicator precedes every friend comment');
  check(log.every(s => s.avatars === s.comments), 'every comment row has an avatar');
  const positiveReactions = await page.locator('.phone-published .phone-reaction').allTextContents();
  check(positiveReactions.length > 0 && positiveReactions.every(t => /[😮👏🔥😊👍]/u.test(t) && Number((t.match(/\d+/) || [0])[0]) > 0),
    'a clear post receives only positive reactions, with non-zero counts');
  check(await vis(page, '.phone-follow-up'), 'the first successful post of the trip gets a follow-up question');
  await page.screenshot({ path: SHOT('phone-followup-question') });
  await page.screenshot({ path: SHOT('phone-post-positive') });

  /* REQUIRED REGRESSION: a reply always renders below the question it answers. */
  const question = page.locator('.phone-published .phone-comment[data-kind="question"]');
  check(await question.count() === 1 && (await question.textContent()).includes('Was it big?'), 'the friend question renders in the thread');
  check(await question.evaluate(el => el.classList.contains('pending')), 'the unanswered question is highlighted as pending');
  await page.fill('.phone-follow-input', 'Yes! It was very big!');
  await click(page, '.phone-follow-send');
  const reply = page.locator('.phone-published .phone-comment[data-kind="player"]');
  await reply.waitFor();
  const order = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.phone-published .phone-comment'));
    const q = rows.findIndex(r => r.dataset.kind === 'question');
    const p = rows.findIndex(r => r.dataset.kind === 'player');
    return { q, p, qy: rows[q].getBoundingClientRect().top, py: rows[p].getBoundingClientRect().top };
  });
  check(order.q >= 0 && order.p > order.q && order.py > order.qy, 'the player reply renders BELOW the question (DOM order and position)');
  check(!await vis(page, '.phone-follow-input') && !await vis(page, '.phone-follow-up'), 'the reply box disappears after answering');
  check(await question.isVisible() && !await question.evaluate(el => el.classList.contains('pending')),
    'the question stays as history without its pending highlight');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  const kinds = latest.comments.map(c => c.kind);
  check(latest.followUp.status === 'answered' && kinds.indexOf('question') < kinds.indexOf('player') &&
    kinds[kinds.length - 1] === 'friend', 'the saved thread is chronological: question, reply, friend response');
  await page.screenshot({ path: SHOT('phone-reply-ordered') });
  await page.waitForFunction(() => document.querySelectorAll('.phone-published .phone-comment').length >= 6 &&
    !document.querySelector('.phone-published .phone-typing'));
  await page.evaluate(() => { document.querySelector('#phone-screen').scrollTop = 1e6; });
  await page.screenshot({ path: SHOT('phone-thread-complete') });
  check(await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.phone-published .phone-comment'));
    return rows[rows.length - 1].dataset.kind === 'friend' && rows[rows.length - 2].dataset.kind === 'player';
  }), 'the friend response appends below the reply');

  // Older saves stored the question outside the thread; migration restores order.
  const migrated = await page.evaluate(() => VA.Phone.migratePosts([{
    id: 'post-legacy', comments: [
      { who: '🐰 Mia', text: 'Wow!' }, { who: 'Mio', text: 'Chocolate!' }, { who: '🦊 Leo', text: 'Cool! 😄' },
    ], followUp: { q: 'What flavor?', reply: 'Chocolate!' },
  }])[0]);
  check(migrated.comments.map(c => c.kind).join() === 'friend,question,player,friend' &&
    migrated.comments[1].text === 'What flavor?' && migrated.followUp.status === 'answered',
    'a legacy answered follow-up is migrated with the question above the reply');

  await publishPhonePost(page, 'france:eiffel', 'I see Eiffel Tower.');
  await page.waitForSelector('.phone-post-card');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.quality === 'minor', 'a relevant tense/article error publishes as minor');
  check(latest.comments.some(c => /You saw the Eiffel Tower!/i.test(c.text)), 'the minor post has a conversational model comment');
  check(saved.coins === coinsBeforePosts + 1, 'posting the same photo again gives no second coin');
  check((await page.locator('.phone-bonus').textContent()).includes('Likes are just for fun!'), 'a no-bonus post uses the quiet likes message');

  const postsBeforeContradiction = saved.socialPosts.length;
  await publishPhonePost(page, 'france:eiffel', 'I saw the pyramids.');
  await page.waitForSelector('.phone-outcome');
  check(await vis(page, '.phone-edit') && await vis(page, '.phone-anyway'), 'a contradiction offers EDIT POST and POST ANYWAY');
  check((await page.locator('.phone-outcome').textContent()).includes('🤔'), 'the contradiction preview includes a confused reaction');
  check(/Pyramids\?.*France/i.test(await page.locator('.phone-outcome').textContent()), 'the confused friend comment names the wrong thing');
  check((await state(page)).socialPosts.length === postsBeforeContradiction, 'a contradiction is not published before confirmation');
  await page.screenshot({ path: SHOT('phone-post-confused') });
  await click(page, '.phone-edit');
  check(await page.inputValue('.phone-caption-input') === 'I saw the pyramids.', 'EDIT POST keeps the caption text');
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-outcome');
  await click(page, '.phone-anyway');
  await page.waitForFunction(count => {
    const saved = JSON.parse(localStorage.getItem('vacation-adventure-v1') || '{}');
    return (saved.socialPosts || []).length > count;
  }, postsBeforeContradiction);
  await page.waitForSelector('.phone-post-card');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.quality === 'contradiction' && !latest.rewardClaimed, 'POST ANYWAY stores the contradiction with no bonus');

  const postsBeforeUnclear = saved.socialPosts.length;
  await publishPhonePost(page, 'france:eiffel', 'asdfgh');
  await page.waitForSelector('.phone-outcome');
  check(await vis(page, '.phone-edit') && await vis(page, '.phone-cancel'), 'an unclear post offers EDIT POST and CANCEL');
  check(!await vis(page, '.phone-anyway'), 'an unclear post never offers POST ANYWAY');
  check((await page.locator('.phone-outcome').textContent()).includes("friends aren't sure what you mean"), 'unclear recovery explains the problem gently');
  // EDIT POST returns to the composer with the sentence starters already open
  await click(page, '.phone-edit');
  await page.waitForSelector('.phone-caption-step');
  check(await vis(page, '.phone-help-rung1.show'), 'unclear recovery opens rung 1 of help automatically on EDIT');
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-outcome');
  await click(page, '.phone-cancel');
  check((await state(page)).socialPosts.length === postsBeforeUnclear, 'CANCEL exits without publishing an unclear post');

  // Identical normalised text cannot earn again, even on another eligible photo.
  await publishPhonePost(page, 'france:crepe', 'It was delicious!');
  await page.waitForSelector('.phone-post-card');
  const afterCrepe = await state(page);
  check(afterCrepe.coins === coinsBeforePosts + 2, 'a new photo in the same trip can earn its one coin');
  await publishPhonePost(page, 'australia:icecream', 'It was delicious!');
  await page.waitForSelector('.phone-post-card');
  check((await state(page)).coins === afterCrepe.coins, 'an identical normalised caption earns no second coin');
  // Skipping a follow-up keeps the question as history.
  await phoneComplete(page);
  await click(page, '.phone-follow-skip');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.followUp.status === 'skipped' && latest.comments.some(c => c.kind === 'question') &&
    !await vis(page, '.phone-follow-up') && await vis(page, '.phone-published .phone-comment[data-kind="question"]'),
    'Skip removes the reply box but keeps the question');

  // Three different Australian photos can earn at most the trip cap of three.
  await publishPhonePost(page, 'australia:icecream', 'I ate ice cream.');
  await page.waitForSelector('.phone-post-card');
  // Closing mid-reveal cancels every timer; the saved outcome shows complete.
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await publishPhonePost(page, 'australia:kangaroo', 'I saw a kangaroo.');
  await page.waitForSelector('.phone-posting');
  await closePhone(page);
  check(await page.evaluate(() => VA.Timeline.active().length === 0), 'closing the phone mid-animation cancels its timeline');
  await openPhone(page);
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  const reopened = page.locator(`.phone-post-card[data-post-id="${latest.id}"]`);
  check(await reopened.getAttribute('data-complete') === '1' &&
    Number(await reopened.locator('.phone-likes').getAttribute('data-count')) === latest.reactions['❤️'] &&
    await reopened.locator('.phone-comment').count() === latest.comments.length,
    'a post interrupted mid-reveal reopens in its saved final state');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  await publishPhonePost(page, 'australia:volleyball', 'I played volleyball.');
  await page.waitForSelector('.phone-post-card');
  const atCap = await state(page);
  check(!!atCap.socialBonus['1'], 'the Australian trip has a persisted social-bonus record');
  await publishPhonePost(page, 'australia:volleyball', 'It was really fun.');
  await page.waitForSelector('.phone-post-card');
  check((await state(page)).coins === atCap.coins, 'posting after the per-trip cap cannot add a fourth coin');
  const postCount = (await state(page)).socialPosts.length;
  await closePhone(page);
  await openPhone(page);
  check(await page.locator('.phone-post-card').count() === postCount, 'posts persist after closing and reopening the phone');
  await closePhone(page);
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  await openPhone(page);
  check(await page.locator('.phone-post-card').count() === postCount, 'posts persist after a page reload');
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await page.waitForTimeout(400);
  const reloadedPosts = (await state(page)).socialPosts;
  const replay = await page.evaluate(() => ({
    posting: document.querySelectorAll('.phone-posting, .phone-typing').length,
    live: VA.Timeline.active().length,
    incomplete: document.querySelectorAll('.phone-post-card:not([data-complete="1"])').length,
    likes: Array.from(document.querySelectorAll('.phone-post-card')).map(c => [c.dataset.postId, Number(c.querySelector('.phone-likes').dataset.count)]),
  }));
  check(!replay.posting && !replay.live && !replay.incomplete &&
    replay.likes.every(([id, n]) => reloadedPosts.find(p => p.id === id).reactions['❤️'] === n),
    'reloaded posts render completed with final counts and never replay');
  const threadOk = await page.evaluate(() => Array.from(document.querySelectorAll('.phone-post-card')).every(card => {
    const kinds = Array.from(card.querySelectorAll('.phone-comment')).map(r => r.dataset.kind);
    const q = kinds.indexOf('question');
    return q < 0 || kinds.indexOf('player') < 0 || kinds.indexOf('player') > q;
  }));
  check(threadOk, 'after reload, every reply still sits below its question');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });

  // Chromebook readability: the wide phone fits with no horizontal overflow.
  for (const [w, h] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => {
      const device = document.querySelector('.phone-device').getBoundingClientRect();
      const screen = document.querySelector('#phone-screen');
      const text = document.querySelector('.phone-post-text');
      const scale = device.width / document.querySelector('.phone-device').offsetWidth;
      return {
        inside: device.left >= 0 && device.top >= 0 && device.right <= innerWidth && device.bottom <= innerHeight,
        noOverflow: screen.scrollWidth <= screen.clientWidth,
        width: device.width,
        textPx: parseFloat(getComputedStyle(text).fontSize) * scale,
      };
    });
    check(fit.inside && fit.noOverflow, `phone fits the ${w}x${h} viewport without horizontal overflow`);
    check(fit.width >= 560 && fit.textPx >= 18, `phone is wide (${Math.round(fit.width)}px) with large post text (${fit.textPx.toFixed(1)}px) at ${w}x${h}`);
    await page.screenshot({ path: SHOT(`phone-wide-${w}`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  await closePhone(page);

  /* ---------- PC: places, independent stars/text, edit and persistence ---------- */
  await openPc(page);
  await page.screenshot({ path: SHOT('pc-picker') });
  const reviewKeys = await page.locator('.review-place-option').evaluateAll(options => options.map(o => o.dataset.key));
  check(reviewKeys.length === 5 && !reviewKeys.some(key => key.endsWith(':soccer')), 'PC picker contains only earned places');
  await click(page, '.review-place-option[data-key="france:eiffel"]');
  await click(page, '.review-next');
  await page.waitForSelector('.review-star');
  const starValues = await page.locator('.review-star').evaluateAll(stars => stars.map(s => Number(s.dataset.stars)));
  check(starValues.join() === '1,2,3,4,5', 'stars 1–5 are all selectable');
  check(await page.locator('.review-star.selected').count() === 0, 'no star rating is selected initially');
  await click(page, '.review-star[data-stars="1"]');
  await page.screenshot({ path: SHOT('pc-stars') });
  await click(page, '.review-next');
  await page.fill('.review-text-input', 'It was beautiful.');
  await page.screenshot({ path: SHOT('pc-writing') });
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await recordPc(page);
  await click(page, '.review-publish');
  await page.waitForSelector('.review-posting');
  await page.screenshot({ path: SHOT('pc-posting') });
  saved = await state(page);
  check(saved.reviews['france:eiffel'].stars === 1 && saved.reviews['france:eiffel'].text === 'It was beautiful.', 'a positive sentence keeps the student\'s chosen 1-star rating');
  check(saved.reviews['france:eiffel'].helpful > 0 && !!saved.reviews['france:eiffel'].owner, 'the helpful count and owner reply are saved at publish');
  await page.waitForSelector('.review-online');
  await page.screenshot({ path: SHOT('pc-published') });
  await page.waitForSelector('.review-owner-typing');
  await page.screenshot({ path: SHOT('pc-owner-typing') });
  await pcComplete(page);
  const reviewLog = await pcLog(page);
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  const pcPosting = reviewLog.findIndex(s => s.posting);
  const pcOnline = reviewLog.findIndex(s => s.online);
  check(pcPosting === 0 && pcOnline > pcPosting, 'a review shows Posting… before it goes online');
  const helpfulValues = reviewLog.map(s => s.helpful);
  check(helpfulValues[0] === 0 && helpfulValues[helpfulValues.length - 1] === saved.reviews['france:eiffel'].helpful &&
    helpfulValues.every((v, i) => i === 0 || v >= helpfulValues[i - 1]), 'the helpful count starts at 0 and grows to the saved value');
  const firstTyping = reviewLog.findIndex(s => s.typing);
  const firstReply = reviewLog.findIndex(s => s.reply);
  check(firstTyping > pcOnline && firstReply > firstTyping && !reviewLog[firstReply].typing, 'the owner types before the reply appears');
  check(await page.locator('.review-live .review-card-stars').getAttribute('data-stars') === '1', 'the rendered rating stays at the chosen 1 star');

  await startReview(page, 'france:crepe', 4);
  await page.fill('.review-text-input', 'The food good.');
  await click(page, '.review-publish');
  await page.waitForSelector('.review-tip');
  saved = await state(page);
  check(saved.reviews['france:crepe'].text === 'The food good.', 'review text is stored exactly as the student wrote it');
  check((await page.locator('.review-tip').textContent()).includes('The food was good.'), 'a friendly one-time tip shows the model sentence');
  saved = await state(page);
  check(saved.reviews['france:crepe'].owner.mood === 'positive' && await vis(page, '.review-live .review-owner-reply[data-mood="positive"]'),
    'a 4-star review gets an enthusiastic owner reply');
  await page.screenshot({ path: SHOT('pc-owner-positive') });
  if (await vis(page, '.review-tip-close')) await click(page, '.review-tip-close');

  await click(page, '.review-tab-history');
  await page.waitForSelector('.review-card');
  await page.screenshot({ path: SHOT('pc-history') });
  await click(page, '.review-card[data-key="france:eiffel"] .review-edit');
  await page.waitForSelector('.review-text-input');
  await page.fill('.review-text-input', 'It was boring.');
  await click(page, '.review-publish');
  saved = await state(page);
  check(saved.reviews['france:eiffel'].text === 'It was boring.' && saved.reviews['france:eiffel'].stars === 1, 'a negative review publishes and Edit replaces the existing entry');
  await pcComplete(page);
  check(saved.reviews['france:eiffel'].owner.mood === 'negative' && saved.reviews['france:eiffel'].owner.topic === 'boring',
    'a 1-star "boring" review gets a reply about being boring');
  check(await page.locator('.review-live .review-card-stars').getAttribute('data-stars') === '1' &&
    (await page.locator('.review-live .review-card-text').textContent()) === 'It was boring.',
    'the owner reply leaves the rating and the negative opinion unchanged');
  await page.screenshot({ path: SHOT('pc-owner-negative') });

  // Owner reply banks: comic drama exists but is a minority, tone stays kind.
  const banks = await page.evaluate(() => {
    const R = VA.Reviews;
    const all = [];
    const walk = v => { if (typeof v === 'string') all.push(v); else if (v && typeof v === 'object' && !(v instanceof RegExp)) Object.values(v).forEach(walk); };
    walk(R.replies);
    const texts = ['It was boring.', 'The food was bad.', 'It was too expensive.', 'It was crowded.', 'I did not like it.',
      'It was not good.', 'It was hot.', 'It was noisy.', 'It was scary.', 'Not fun.', 'I was sad.', 'The people was rude.'];
    const events = ['crepe', 'eiffel', 'soccer', 'kebab', 'pyramids', 'icecream'];
    const negatives = [];
    events.forEach(id => texts.forEach(t => [1, 2].forEach(stars =>
      negatives.push(R.ownerReply('x:' + id, stars, t, id === 'crepe' || id === 'kebab' || id === 'icecream' ? 'ate' : 'saw')))));
    return {
      all,
      dramaShare: negatives.filter(r => r.style === 'drama').length / negatives.length,
      styles: [...new Set(negatives.map(r => r.style))],
      food: R.ownerReply('france:crepe', 1, 'The food was bad.', 'ate'),
      positive: R.ownerReply('france:crepe', 5, 'It was delicious.', 'ate'),
      hasDrama: negatives.some(r => r.style === 'drama' && /[?!]{2}/.test(r.text)),
    };
  });
  const forbidden = /\b(wrong|stupid|liar|lying|idiot|dumb|hate you|shut up|rude|mistake|change your (review|rating|stars?)|give us (more|5|five) stars|you should give|delete)\b/i;
  check(banks.all.length >= 25 && banks.all.every(t => !forbidden.test(t)), 'no owner reply insults, threatens or disputes the reviewer');
  check(banks.hasDrama && banks.dramaShare > 0 && banks.dramaShare < 0.5 && banks.styles.length >= 4,
    `negative replies mix styles and comic drama is a minority (${Math.round(banks.dramaShare * 100)}% drama)`);
  check(banks.food.topic === 'food' && banks.positive.mood === 'positive', 'food complaints and positive reviews get matching replies');

  // Closing mid-reveal cancels timers; history shows the saved final state.
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await startReview(page, 'australia:kangaroo', 2);
  await page.fill('.review-text-input', 'It was too crowded.');
  await click(page, '.review-publish');
  await page.waitForSelector('.review-posting');
  await closePc(page);
  check(await page.evaluate(() => VA.Timeline.active().length === 0), 'closing the PC mid-animation cancels its timeline');
  await openPc(page);
  await click(page, '.review-tab-history');
  const roo = page.locator('.review-card[data-key="australia:kangaroo"]');
  saved = await state(page);
  check(await roo.getAttribute('data-complete') === '1' && await roo.locator('.review-owner-reply').count() === 1 &&
    Number(await roo.locator('.review-helpful-count').getAttribute('data-count')) === saved.reviews['australia:kangaroo'].helpful &&
    !await roo.locator('.review-posting, .review-owner-typing').count(), 'an interrupted review opens completed in history');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  const pcFit = await page.evaluate(() => {
    const m = document.querySelector('.reviews-monitor').getBoundingClientRect();
    const s = document.querySelector('#reviews-screen');
    return m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight && s.scrollWidth <= s.clientWidth;
  });
  check(pcFit, 'the review site fits a 1366x768 Chromebook without horizontal overflow');
  await page.screenshot({ path: SHOT('pc-wide-1366') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const reviewSnapshot = JSON.stringify(saved.reviews);
  await closePc(page);
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  check(JSON.stringify((await state(page)).reviews) === reviewSnapshot, 'reviews persist after a page reload');
  await openPc(page);
  await closePc(page);

  /* ---------- suitcase: No returns without money; Yes gives allowance ---------- */
  const beforeNo = (await state(page)).coins;
  await click(page, '.bedroom-hotspot[data-action="trip"]');
  await dialogueChoice(page, 'No, thank you.');
  await advanceDialogueTo(page, () => document.querySelector('#scr-bedroom').classList.contains('active') && document.querySelector('#dialogue').style.display === 'none');
  check((await state(page)).coins === beforeNo, 'No returns to the bedroom without adding an allowance');
  await click(page, '.bedroom-hotspot[data-action="trip"]');
  await dialogueChoice(page, 'Yes, please!');
  await advanceDialogueTo(page, () => document.querySelector('#scr-map').classList.contains('active') && document.querySelector('#dialogue').style.display === 'none');
  check((await state(page)).coins === beforeNo + 12, 'Yes reaches the map with the regular allowance added');

  await browser.close();
  check(!errors.length, 'no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  if (failures.length) {
    console.error('\n' + failures.length + ' BEDROOM TEST(S) FAILED');
    process.exit(1);
  }
  console.log('\nBEDROOM TESTS OK');
})().catch(error => {
  console.error('BEDROOM TESTS CRASHED:', error.message || error);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
});
