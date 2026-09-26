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
  check(await page.evaluate(() => !!document.querySelector('.phone-comment[data-kind="question"]').closest('.phone-thread').querySelector('.phone-reply-editor .phone-follow-input')),
    'the follow-up question opens its reply box inline, under the question');
  await page.evaluate(() => { VA.Timeline.scale = 1; });
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
  await page.screenshot({ path: SHOT('phone-reply-ordered') });
  await page.waitForSelector('.phone-published .phone-replies .phone-typing');
  await page.waitForFunction(() => {
    const thread = document.querySelector('.phone-comment[data-kind="question"]').closest('.phone-thread');
    return thread.querySelectorAll('.phone-reply').length === 2 && !thread.querySelector('.phone-typing');
  });
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  const savedQuestion = latest.comments.find(c => c.kind === 'question');
  check(latest.followUp.status === 'answered' && latest.comments.every(c => c.kind !== 'player') &&
    savedQuestion.replies.map(r => r.kind).join() === 'player,friend',
    'the saved thread nests the reply, then the friend answer, under the question');
  check(await page.evaluate(() => {
    const thread = document.querySelector('.phone-comment[data-kind="question"]').closest('.phone-thread');
    const rows = Array.from(thread.querySelectorAll('.phone-comment'));
    return rows.map(r => r.dataset.kind).join() === 'question,player,friend';
  }), 'the friend answer appends below the reply, inside the question thread');
  await page.evaluate(() => { document.querySelector('#phone-screen').scrollTop = 1e6; });
  await page.screenshot({ path: SHOT('phone-thread-complete') });

  /* Replies to any friend comment, inline and at most once. */
  const firstFriend = page.locator('.phone-published .phone-thread:has(> .phone-comment[data-kind="friend"])').first();
  const firstFriendId = await firstFriend.getAttribute('data-comment-id');
  const threadOrderBefore = await page.$$eval('.phone-published .phone-thread', els => els.map(e => e.dataset.commentId));
  const link = firstFriend.locator('.phone-reply-link');
  check(await link.count() === 1 && (await link.textContent()) === 'Reply', 'a normal friend comment offers a Reply action');
  check(await link.evaluate(el => !el.classList.contains('writing-primary') && parseFloat(getComputedStyle(el).fontSize) <= 15),
    'the Reply action is a subtle text link, not a big button');
  await link.scrollIntoViewIfNeeded();
  await page.screenshot({ path: SHOT('phone-reply-link') });
  await link.click();
  check(await firstFriend.locator('.phone-reply-editor .phone-follow-input').count() === 1 &&
    await page.locator('.phone-published .phone-reply-editor').count() === 1, 'Reply opens one input inside THAT comment thread');
  await firstFriend.locator('.phone-follow-input').fill('Thank you!');
  await page.screenshot({ path: SHOT('phone-reply-editor') });
  await firstFriend.locator('.phone-follow-send').click();
  const replyGeo = await firstFriend.evaluate(thread => {
    const parent = thread.querySelector(':scope > .phone-comment');
    const mine = thread.querySelector('.phone-replies .phone-comment[data-kind="player"]');
    return mine && { below: mine.getBoundingClientRect().top > parent.getBoundingClientRect().top,
      after: !!(parent.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check(!!replyGeo && replyGeo.below && replyGeo.after, 'the player reply renders beneath the comment it answers');
  await firstFriend.locator('.phone-typing').waitFor();
  await page.screenshot({ path: SHOT('phone-reply-typing') });
  await firstFriend.locator('.phone-replies .phone-comment[data-kind="friend"]').waitFor();
  await page.screenshot({ path: SHOT('phone-reply-ack') });
  check(await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const bar = document.querySelector('.phone-app-bar').getBoundingClientRect();
    return document.querySelector('#phone-overlay').scrollTop === 0 && bar.top >= stage.top;
  }), 'auto-scrolling new comments never pushes the phone top bar off the stage');
  check((await firstFriend.locator('.phone-replies .phone-comment[data-kind="friend"]').textContent()).includes('welcome'),
    'a friend acknowledgment follows the typing indicator');
  check(JSON.stringify(await page.$$eval('.phone-published .phone-thread', els => els.map(e => e.dataset.commentId))) === JSON.stringify(threadOrderBefore),
    'replying leaves the order of the other comments unchanged');
  check(await firstFriend.locator('.phone-reply-link').count() === 0, 'a comment accepts only one player reply');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  const answered = latest.comments.find(c => c.id === firstFriendId);
  check(!!answered && answered.replies.map(r => r.kind).join() === 'player,friend' && answered.replies[0].text === 'Thank you!',
    'the reply and acknowledgment are saved on that comment');
  check(await page.evaluate(() => { const p = VA.State.data.socialPosts.slice(-1)[0]; const c = p.comments.find(x => x.replies && x.replies.length);
    const before = JSON.stringify(c.replies); VA.Phone.sendReply(p, { comments: document.createElement('div') }, c, 'Again!'); return JSON.stringify(c.replies) === before; }),
    'a second reply to the same comment is refused');

  // Closing the phone mid-acknowledgment cancels the timer; the thread is saved complete.
  const secondFriend = page.locator('.phone-published .phone-thread:has(.phone-reply-link)').first();
  const secondId = await secondFriend.getAttribute('data-comment-id');
  await secondFriend.locator('.phone-reply-link').click();
  await secondFriend.locator('.phone-follow-input').fill('Thanks!');
  await secondFriend.locator('.phone-follow-send').click();
  await closePhone(page);
  check(await page.evaluate(() => VA.Timeline.active().length === 0), 'closing the phone cancels an active reply timeline');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  await openPhone(page);
  const reopenedThread = page.locator(`.phone-thread[data-comment-id="${secondId}"]`);
  check(await reopenedThread.locator('.phone-reply').count() === 2 && await reopenedThread.locator('.phone-typing').count() === 0,
    'the interrupted reply thread reopens in its final state');

  // Older saves stored the question outside the thread; migration restores
  // order, nests the reply, adds stable ids, and is idempotent.
  const migration = await page.evaluate(() => {
    const asker = VA.Phone.friends[VA.Phone.hash('post-legacy') % VA.Phone.friends.length];
    const other = VA.Phone.friends.find(f => f !== asker);
    const legacy = () => [{
      id: 'post-legacy', comments: [
        { who: `${other.avatar} ${other.name}`, text: 'Wow!' }, { who: 'Mio', text: 'Chocolate!' },
        { who: `${asker.avatar} ${asker.name}`, text: 'Cool! 😄' },
      ], followUp: { q: 'What flavor?', reply: 'Chocolate!' },
    }];
    const once = VA.Phone.migratePosts(legacy());
    const twice = VA.Phone.migratePosts(JSON.parse(JSON.stringify(once)));
    const current = VA.Phone.migratePosts(JSON.parse(JSON.stringify(VA.State.data.socialPosts)));
    return {
      top: once[0].comments.map(c => c.kind).join(),
      nested: (once[0].comments[1].replies || []).map(r => r.kind + ':' + r.text).join('|'),
      ids: once[0].comments.every(c => c.id && (c.replies || []).every(r => r.id)),
      status: once[0].followUp.status,
      idempotent: JSON.stringify(once) === JSON.stringify(twice),
      currentStable: JSON.stringify(current) === JSON.stringify(VA.State.data.socialPosts),
    };
  });
  check(migration.top === 'friend,question' && migration.nested === 'player:Chocolate!|friend:Cool! 😄' && migration.status === 'answered',
    'a legacy answered follow-up is migrated with the reply nested under the question');
  check(migration.ids && migration.idempotent && migration.currentStable, 'migration adds stable ids and is idempotent');

  /* One post per earned photo. */
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-memory-option');
  const postedEiffel = page.locator('.phone-memory-option[data-key="france:eiffel"]');
  check(await postedEiffel.evaluate(el => el.classList.contains('posted')) && (await postedEiffel.textContent()).includes('✓ Posted'),
    'a posted photo shows ✓ Posted');
  await page.screenshot({ path: SHOT('phone-picker-posted') });
  const postsBeforeRepost = (await state(page)).socialPosts.length;
  await postedEiffel.click();
  check(await vis(page, '.phone-view-post') && !await vis(page, '.phone-next'), 'tapping a posted photo opens its post instead of selecting it');
  await page.locator('.phone-view-post button').filter({ hasText: 'BACK TO PHOTOS' }).click();
  await page.waitForSelector('.phone-memory-option');
  check(await page.locator('.phone-memory-option.selected').count() === 0 && await page.locator('.phone-next').isDisabled(),
    'a posted photo never enables NEXT');
  check((await state(page)).socialPosts.length === postsBeforeRepost, 'a posted photo cannot start another post');
  await click(page, '.phone-close');

  await openPhone(page);
  const postsBeforeContradiction = (await state(page)).socialPosts.length;
  await publishPhonePost(page, 'france:crepe', 'I saw the pyramids.');
  await page.waitForSelector('.phone-outcome');
  check(await vis(page, '.phone-edit') && await vis(page, '.phone-anyway'), 'a contradiction offers EDIT POST and POST ANYWAY');
  check((await page.locator('.phone-outcome').textContent()).includes('🤔'), 'the contradiction preview includes a confused reaction');
  check(/Pyramids\?.*France/i.test(await page.locator('.phone-outcome').textContent()), 'the confused friend comment names the wrong thing');
  check((await state(page)).socialPosts.length === postsBeforeContradiction, 'a contradiction is not published before confirmation');
  await page.screenshot({ path: SHOT('phone-post-confused') });
  await click(page, '.phone-edit');
  check(await page.inputValue('.phone-caption-input') === 'I saw the pyramids.', 'EDIT POST keeps the caption text');
  await page.fill('.phone-caption-input', 'I eat crepe.');
  await click(page, '.phone-post');
  await page.waitForFunction(count => JSON.parse(localStorage.getItem('vacation-adventure-v1')).socialPosts.length > count, postsBeforeContradiction);
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.quality === 'minor', 'a relevant tense/article error publishes as minor');
  check(latest.comments.some(c => /You ate a crepe!/i.test(c.text)), 'the minor post has a conversational model comment');
  check(saved.coins === coinsBeforePosts + 2, 'a second photo from the same trip earns its one coin');

  const postsBeforeAnyway = saved.socialPosts.length;
  await publishPhonePost(page, 'australia:icecream', 'I saw the Eiffel Tower.');
  await page.waitForSelector('.phone-anyway');
  await click(page, '.phone-anyway');
  await page.waitForFunction(count => JSON.parse(localStorage.getItem('vacation-adventure-v1')).socialPosts.length > count, postsBeforeAnyway);
  await page.waitForSelector('.phone-post-card');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.quality === 'contradiction' && !latest.rewardClaimed, 'POST ANYWAY stores the contradiction with no bonus');

  const postsBeforeUnclear = saved.socialPosts.length;
  await publishPhonePost(page, 'australia:kangaroo', 'asdfgh');
  await page.waitForSelector('.phone-outcome');
  check(await vis(page, '.phone-edit') && await vis(page, '.phone-cancel'), 'an unclear post offers EDIT POST and CANCEL');
  check(!await vis(page, '.phone-anyway'), 'an unclear post never offers POST ANYWAY');
  check((await page.locator('.phone-outcome').textContent()).includes("friends aren't sure what you mean"), 'unclear recovery explains the problem gently');
  await click(page, '.phone-edit');
  await page.waitForSelector('.phone-caption-step');
  check(await vis(page, '.phone-help-rung1.show'), 'unclear recovery opens rung 1 of help automatically on EDIT');
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-outcome');
  await click(page, '.phone-cancel');
  check((await state(page)).socialPosts.length === postsBeforeUnclear, 'CANCEL exits without publishing an unclear post');

  await publishPhonePost(page, 'australia:kangaroo', 'It was great!');
  await page.waitForSelector('.phone-post-card');
  const afterKangaroo = await state(page);
  check(afterKangaroo.coins === coinsBeforePosts + 3, 'a clear post on a new trip earns its coin');
  // Skipping a follow-up keeps the question as history.
  await phoneComplete(page);
  await click(page, '.phone-follow-skip');
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.followUp.status === 'skipped' && latest.comments.some(c => c.kind === 'question') &&
    !await vis(page, '.phone-follow-up') && await vis(page, '.phone-published .phone-comment[data-kind="question"]'),
    'Skip removes the reply box but keeps the question');

  // Identical normalised text earns nothing; closing mid-reveal cancels timers.
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await publishPhonePost(page, 'australia:volleyball', 'It was great!');
  await page.waitForSelector('.phone-posting');
  check((await page.locator('.phone-bonus').textContent()).includes('Likes are just for fun!'), 'a no-bonus post uses the quiet likes message');
  check((await state(page)).coins === afterKangaroo.coins, 'an identical normalised caption earns no second coin');
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
  const capCheck = await page.evaluate(() => {
    const cap = VA.Data.SOCIAL_BONUS_CAP;
    const fake = { tripNo: 99, destId: 'egypt', eventId: 'x' };
    VA.State.data.socialBonus['99'] = { count: cap, memories: [] };
    const refused = VA.Phone.claimBonus(fake, 'A brand new sentence here.') === false;
    delete VA.State.data.socialBonus['99'];
    return refused;
  });
  check(capCheck && !!(await state(page)).socialBonus['1'], 'the per-trip bonus cap still refuses coins at the cap');

  // Every earned photo is now posted exactly once.
  saved = await state(page);
  const photoKeys = saved.socialPosts.map(p => `${p.tripNo}:${p.destId}:${p.eventId}`);
  check(photoKeys.length === 5 && new Set(photoKeys).size === 5, 'each earned photo produced exactly one post');
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-all-posted');
  check((await page.locator('.phone-all-posted').textContent()).includes("You've shared all your vacation photos!"),
    'with every photo posted, the picker shows the all-shared message');
  await page.screenshot({ path: SHOT('phone-all-posted') });
  await page.locator('#phone-screen button').filter({ hasText: 'BACK TO FEED' }).click();

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
  const threadOk = await page.evaluate(() => Array.from(document.querySelectorAll('.phone-thread')).every(thread => {
    const rows = Array.from(thread.querySelectorAll('.phone-comment'));
    return !rows[0].classList.contains('phone-reply') && rows.slice(1).every(r => r.classList.contains('phone-reply'));
  }));
  check(threadOk, 'after reload, every reply still sits directly under its own comment');
  check(await page.locator(`.phone-thread[data-comment-id="${firstFriendId}"] .phone-reply`).count() === 2,
    'a completed reply thread persists across reload');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });

  /* A new photo from a later trip may be posted once more. */
  await closePhone(page);
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('vacation-adventure-v1'));
    save.tripCount = 3;
    save.book.france.trip = 3;
    Object.values(save.book.france.photos).forEach(p => { p.trip = 3; });
    localStorage.setItem('vacation-adventure-v1', JSON.stringify(save));
  });
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  await openPhone(page);
  await click(page, '.phone-new-post');
  await page.waitForSelector('.phone-memory-option');
  const newEiffel = page.locator('.phone-memory-option[data-key="france:eiffel"]');
  check(!await newEiffel.evaluate(el => el.classList.contains('posted')) && await newEiffel.getAttribute('data-trip') === '3',
    'the Eiffel Tower photo from a later trip is a new, unposted photo');
  await newEiffel.click();
  check(!await page.locator('.phone-next').isDisabled(), 'the later-trip photo can be selected');
  await page.locator('.phone-memory-option.posted').first().click();
  check(await vis(page, '.phone-view-post'), 'an earlier trip’s posted photo still opens its post');
  await page.locator('.phone-view-post button').filter({ hasText: 'BACK TO PHOTOS' }).click();
  await page.locator('.phone-memory-option[data-key="france:eiffel"]:not(.posted)').click();

  /* Presentation: the phone rises from below the stage; controls stay on screen. */
  const phoneShape = () => page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const device = document.querySelector('.phone-device').getBoundingClientRect();
    const screen = document.querySelector('#phone-screen');
    const s = screen.getBoundingClientRect();
    return {
      belowStage: device.bottom > stage.bottom + 20,
      topInside: device.top > stage.top + 4,
      bottomAnchored: (device.top + device.bottom) / 2 > (stage.top + stage.bottom) / 2 + 20,
      screenInside: s.top >= stage.top && s.bottom <= stage.bottom + 0.5 && s.left >= stage.left && s.right <= stage.right,
      noOverflow: screen.scrollWidth <= screen.clientWidth && document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    };
  });
  const controlOnScreen = sel => page.evaluate(s => {
    const el = Array.from(document.querySelectorAll(s)).find(e => e.offsetParent);
    if (!el) return false;
    el.scrollIntoView({ block: 'nearest' });
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const screen = document.querySelector('#phone-screen').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= screen.top - 0.5 && r.bottom <= screen.bottom + 0.5 && r.bottom <= stage.bottom;
  }, sel);
  const controls = [];
  controls.push(['NEXT (picker)', await controlOnScreen('.phone-next')]);
  await click(page, '.phone-next');
  controls.push(['NEXT (title)', await controlOnScreen('.phone-title-step .phone-next')]);
  await click(page, '.phone-title-step .phone-next');
  await page.fill('.phone-caption-input', 'I saw the Eiffel Tower again.');
  controls.push(['POST', await controlOnScreen('.phone-post')]);
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-skip:not([hidden])');
  controls.push(['Skip', await controlOnScreen('.phone-skip')]);
  controls.push(['BACK TO FEED', await controlOnScreen('.phone-published-controls .writing-primary')]);
  await click(page, '.phone-skip');
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  controls.push(['REPLY link', await controlOnScreen('.phone-published .phone-reply-link')]);
  await page.locator('.phone-published .phone-reply-link').first().click();
  controls.push(['SEND', await controlOnScreen('.phone-published .phone-follow-send')]);
  check(controls.every(([, ok]) => ok), 'every phone control can be brought fully on screen: ' +
    controls.map(([n, ok]) => n + (ok ? ' ✓' : ' ✗')).join(', '));
  saved = await state(page);
  latest = saved.socialPosts[saved.socialPosts.length - 1];
  check(latest.tripNo === 3 && latest.eventId === 'eiffel', 'the later-trip photo publishes as its own post');
  await page.locator('#phone-screen button').filter({ hasText: 'BACK TO FEED' }).click();
  check(await page.evaluate(() => { const s = document.querySelector('#phone-screen'); s.scrollTop = 400; return s.scrollHeight > s.clientHeight && s.scrollTop > 0; }),
    'the feed scrolls inside the phone screen');

  // Chromebook readability: wide, bottom-anchored phone, no overflow.
  for (const [w, h] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const shape = await phoneShape();
    check(shape.belowStage && shape.topInside && shape.bottomAnchored,
      `phone is anchored to the bottom and its body extends below the stage at ${w}x${h}`);
    check(shape.screenInside && shape.noOverflow, `the whole phone screen stays on stage with no overflow at ${w}x${h}`);
    const fit = await page.evaluate(() => {
      const device = document.querySelector('.phone-device');
      const scale = device.getBoundingClientRect().width / device.offsetWidth;
      return { width: device.getBoundingClientRect().width, textPx: parseFloat(getComputedStyle(document.querySelector('.phone-post-text')).fontSize) * scale };
    });
    check(fit.width >= 560 && fit.textPx >= 18, `phone is wide (${Math.round(fit.width)}px) with large post text (${fit.textPx.toFixed(1)}px) at ${w}x${h}`);
    await page.evaluate(() => { document.querySelector('#phone-screen').scrollTop = 0; });
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
  const reviewCountBeforeEdit = Object.keys((await state(page)).reviews).length;
  await click(page, '.review-card[data-key="france:eiffel"] .review-edit');
  await page.waitForSelector('.review-text-input');
  await page.fill('.review-text-input', 'It was boring.');
  await page.screenshot({ path: SHOT('pc-edit') });
  await click(page, '.review-publish');
  saved = await state(page);
  check(saved.reviews['france:eiffel'].text === 'It was boring.' && saved.reviews['france:eiffel'].stars === 1, 'a negative review publishes and Edit replaces the existing entry');
  check(Object.keys(saved.reviews).length === reviewCountBeforeEdit, 'editing updates the same review key instead of adding one');
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

  /* One review per place: reviewed places are completed and open their review. */
  await click(page, '.review-tab-write');
  await page.waitForSelector('.review-place-option');
  const reviewedEiffel = page.locator('.review-place-option[data-key="france:eiffel"]');
  check(await reviewedEiffel.evaluate(el => el.classList.contains('reviewed')) &&
    (await reviewedEiffel.textContent()).includes('✓ Reviewed') && await reviewedEiffel.locator('.review-place-stars').count() === 1,
    'a reviewed place appears completed with its stars');
  check(!await page.locator('.review-place-option[data-key="australia:icecream"]').evaluate(el => el.classList.contains('reviewed')),
    'an unreviewed place stays open for a new review');
  await page.screenshot({ path: SHOT('pc-picker-reviewed') });
  const reviewKeysBefore = Object.keys((await state(page)).reviews).length;
  await reviewedEiffel.click();
  check(await vis(page, '.review-one-per-place') && !await vis(page, '.review-star') && !await vis(page, '.review-text-input') &&
    await vis(page, '.review-card[data-key="france:eiffel"] .review-edit'),
    'tapping a reviewed place opens the existing review (with Edit), not a new one');
  const guarded = await page.evaluate(() => {
    const memory = VA.Reviews.places().find(m => m.eventId === 'eiffel');
    VA.Reviews.draft = { memory, stars: 5, text: 'It was great.' };
    VA.Reviews.publish();
    return VA.State.data.reviews['france:eiffel'].text;
  });
  check(guarded === 'It was boring.' && Object.keys((await state(page)).reviews).length === reviewKeysBefore,
    'a second review of the same place is never written');
  for (const key of ['australia:icecream', 'australia:volleyball']) {
    await startReview(page, key, 5);
    await page.fill('.review-text-input', 'It was fun.');
    await click(page, '.review-publish');
    await pcComplete(page);
  }
  await click(page, '.review-tab-write');
  await page.waitForSelector('.review-all-done');
  check((await page.locator('.review-all-done').textContent()).includes("You've reviewed every place you've visited!") &&
    await page.locator('.review-place-option').count() === 0, 'with every place reviewed, the site shows the all-reviewed message');
  await page.screenshot({ path: SHOT('pc-all-reviewed') });
  saved = await state(page);
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

  // Revisiting France on a later trip does not open a second Eiffel Tower review.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('vacation-adventure-v1'));
    save.tripCount = 4;
    save.book.france.trip = 4;
    Object.values(save.book.france.photos).forEach(p => { p.trip = 4; });
    localStorage.setItem('vacation-adventure-v1', JSON.stringify(save));
  });
  await page.reload();
  await page.waitForTimeout(900);
  await resume(page);
  await openPc(page);
  check(await vis(page, '.review-all-done') && Object.keys((await state(page)).reviews).length === Object.keys(JSON.parse(reviewSnapshot)).length,
    'a revisited place keeps its one review and gets no second review slot');
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
