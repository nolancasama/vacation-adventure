/* Japanese / English / mixed writing on the phone and PC.

   Japanese is never blocked: friends and owners react to what they could
   understand, and English earns the normal response and bonus.

   Run: NODE_PATH=C:/Users/nolan/ui-verify/node_modules node tests/japanese-test.js */
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
  }, { ...populatedSave, bedroomGuide: { phoneSeen: true, phoneDone: true, pcSeen: true, pcDone: true } });
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('ERR_FILE_NOT_FOUND') || text.includes('blocked by CORS policy') || text.includes('net::ERR_FAILED')) return;
    errors.push('CONSOLE: ' + text);
  });
  const noPolice = async where => {
    const text = await page.locator(where).innerText();
    return !/\b(error|english only|wrong language|japanese detected|fail(ed)?)\b|%/i.test(text);
  };

  await page.goto(PAGE_URL);
  await page.waitForTimeout(900);
  await resume(page);

  /* ---------- phone: Japanese-only post goes online; friends ask for English ---------- */
  await openPhone(page);
  const coins0 = (await state(page)).coins;
  await page.evaluate(() => { VA.Timeline.scale = 1; });
  await startPhonePost(page, 'france:eiffel', '', 'めっちゃきれいだった！');
  await recordPhone(page);
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-posting');
  check(!await vis(page, '.phone-anyway') && !await vis(page, '.phone-cancel'), 'a Japanese-only post is never blocked');
  await phoneComplete(page);
  const jaLog = await phoneLog(page);
  await page.evaluate(() => { VA.Timeline.scale = 0.05; });
  let saved = await state(page);
  let post = saved.socialPosts[saved.socialPosts.length - 1];
  const eiffelId = post.id;
  check(saved.socialPosts.length === 1 && post.quality === 'japanese' && post.text === 'めっちゃきれいだった！',
    'the Japanese-only post is published unchanged');
  check(jaLog.findIndex(s => s.posting) >= 0 && jaLog.findIndex(s => s.online) > jaLog.findIndex(s => s.posting),
    'it uploads and goes online like any post');
  const jumps = jaLog.map((s, i) => i && s.comments > jaLog[i - 1].comments ? i : -1).filter(i => i > 0);
  check(jumps.length >= 2 && jumps.every(i => jaLog[i - 1].typing > 0), 'each friend types before commenting');
  const chips = await page.locator('.phone-published .phone-reaction').allTextContents();
  check(chips.some(t => t.includes('🤔')) && chips.some(t => t.includes('😕')), 'friends react with 🤔 and 😕');
  const comments = post.comments.map(c => c.text);
  check(comments.some(t => /understand|English|mean|read it/i.test(t)), 'a friend asks for English');
  check(saved.coins === coins0 && !post.rewardClaimed, 'a Japanese-only post earns no travel bonus yet');
  check((await page.locator('.phone-bonus').textContent()).includes('not yet') &&
    (await page.locator('.phone-bonus').textContent()).includes('English'), 'the bonus note says friends need some English');
  check(await vis(page, '.phone-published .phone-edit-post'), 'EDIT is offered after the reactions');
  check(await noPolice('.phone-published'), 'no error or language-police wording is shown');
  await page.screenshot({ path: SHOT('ja-phone-japanese-post') });
  const coolBank = await page.evaluate(() => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const out = VA.Phone.commentsFor({ quality: 'japanese', topic: 'food' }, false, VA.Phone.random('seed' + i), null);
      out.forEach(c => seen.add(c.text));
    }
    return { cool: VA.Phone.japanese.cool.some(t => seen.has(t)), confused: VA.Phone.japanese.confused.some(t => seen.has(t)), variety: seen.size };
  });
  check(coolBank.cool && coolBank.confused && coolBank.variety >= 8, 'friends mix confused, encouraging and "Japanese is cool!" comments with variety');

  /* ---------- editing into English updates the same post ---------- */
  await click(page, '.phone-published .phone-edit-post');
  await page.waitForSelector('.phone-caption-input');
  check(await page.inputValue('.phone-caption-input') === 'めっちゃきれいだった！' && (await page.locator('.phone-post').textContent()) === 'UPDATE',
    'Edit opens the composer with the original text');
  await page.fill('.phone-caption-input', 'It was beautiful! すごかった！');
  await click(page, '.phone-post');
  await phoneComplete(page);
  saved = await state(page);
  post = saved.socialPosts.find(p => p.id === eiffelId);
  check(saved.socialPosts.length === 1 && post.text === 'It was beautiful! すごかった！' && post.quality === 'clear' && post.editedAt,
    'editing updates the same post instead of creating another');
  check(post.comments.slice(0, 2).map(c => c.text).join() === comments.slice(0, 2).join() &&
    post.comments.some(c => /understand now|get it|I see/i.test(c.text)), 'old reactions stay as history and a friend now understands');
  check(post.rewardClaimed && saved.coins === coins0 + 1, 'the edited English post claims its travel bonus');
  check(!await vis(page, '.phone-published .phone-edit-post'), 'the edit invitation disappears once friends understand');
  await page.screenshot({ path: SHOT('ja-phone-edited') });

  /* ---------- replies: Japanese is allowed; English gets the normal answer ---------- */
  const thread = page.locator(`.phone-published .phone-thread:has(> .phone-comment[data-kind="friend"])`).last();
  const threadId = await thread.getAttribute('data-comment-id');
  await thread.locator('.phone-reply-link').click();
  await thread.locator('.phone-follow-input').fill('楽しかった！');
  await thread.locator('.phone-follow-send').click();
  await thread.locator('.phone-replies .phone-comment[data-kind="friend"]').waitFor();
  const jaAck = await thread.locator('.phone-replies .phone-comment[data-kind="friend"]').textContent();
  check(/English|mean/i.test(jaAck), 'a Japanese reply is sent and the friend asks for English');
  check(await thread.locator('.phone-reply-link').count() === 1, 'after a Japanese reply the student may try again in English');
  await thread.locator('.phone-reply-link').click();
  await thread.locator('.phone-follow-input').fill('Yes! It was fun!');
  await thread.locator('.phone-follow-send').click();
  await page.waitForFunction(id => {
    const t = Array.from(document.querySelectorAll('.phone-thread')).find(e => e.dataset.commentId === id);
    return t && t.querySelectorAll('.phone-replies .phone-comment[data-kind="player"]').length === 2 && !t.querySelector('.phone-typing');
  }, threadId);
  const kinds = await thread.locator('.phone-comment').evaluateAll(rows => rows.map(r => r.dataset.kind + ':' + r.textContent));
  check(kinds.length >= 4 && kinds[1].includes('楽しかった') && kinds[3].includes('It was fun'),
    'the thread stays chronological: comment, Japanese reply, request, English reply');
  const englishAck = kinds[4] || '';
  check(!/English/.test(englishAck), 'the English reply gets a normal response');
  check(await thread.locator('.phone-reply-link').count() === 0, 'no third reply is offered');
  await page.screenshot({ path: SHOT('ja-phone-replies') });
  await click(page, '.phone-published-controls .writing-primary');

  /* ---------- mixed posts are simply English; Japanese never triggers a contradiction ---------- */
  const coins1 = (await state(page)).coins;
  await publishPhonePost(page, 'france:crepe', 'I ate a crepe. おいしい！');
  await phoneComplete(page);
  saved = await state(page);
  post = saved.socialPosts[saved.socialPosts.length - 1];
  check(post.quality === 'clear' && post.rewardClaimed && saved.coins === coins1 + 1, 'a mixed English + Japanese post gets normal reactions and bonus');
  check(!post.comments.some(c => /Japanese|English/.test(c.text)) && !await vis(page, '.phone-published .phone-edit-post'),
    'a mixed post is not treated as Japanese-only');
  await page.screenshot({ path: SHOT('ja-phone-mixed') });
  await click(page, '.phone-published-controls .writing-primary');
  await publishPhonePost(page, 'australia:kangaroo', 'ピラミッドを見た');
  await phoneComplete(page);
  saved = await state(page);
  check(saved.socialPosts[saved.socialPosts.length - 1].quality === 'japanese', 'Japanese that might contradict the photo is treated as Japanese, not a contradiction');
  await click(page, '.phone-published-controls .writing-primary');
  await startPhonePost(page, 'australia:icecream', '', 'I saw the pyramids.');
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-anyway');
  check(/Pyramids\?.*Australia/i.test(await page.locator('.phone-outcome').textContent()), 'English contradictions still get the confused preview');
  await click(page, '.phone-edit');
  await page.fill('.phone-caption-input', '😂😂😂');
  const beforeEmoji = (await state(page)).socialPosts.length;
  await click(page, '.phone-post');
  await page.waitForSelector('.phone-cancel');
  check((await page.locator('.phone-outcome').textContent()).includes('But what happened?') && (await state(page)).socialPosts.length === beforeEmoji,
    'emoji-only text stays an unclear case with a playful nudge');
  await click(page, '.phone-cancel');
  await closePhone(page);

  /* ---------- PC: Japanese reviews publish; the owner reads the stars ---------- */
  await openPc(page);
  await startReview(page, 'france:eiffel', 5);
  await page.fill('.review-text-input', 'すごくきれいだった！');
  await click(page, '.review-publish');
  await pcComplete(page);
  saved = await state(page);
  let review = saved.reviews['france:eiffel'];
  check(review && review.text === 'すごくきれいだった！' && review.stars === 5, 'a Japanese-only review publishes unchanged');
  check(review.owner.style === 'japanese' && review.owner.mood === 'positive' && /Five stars|five stars/.test(review.owner.text) && /English/.test(review.owner.text),
    'a five-star Japanese review gets a happy owner who asks for English');
  check(await vis(page, '.review-live .review-edit-english') && await noPolice('.review-live'), 'the owner invites an English edit, with no error wording');
  await page.screenshot({ path: SHOT('ja-pc-five-star') });

  await startReview(page, 'france:crepe', 1);
  await page.fill('.review-text-input', 'ぜんぜんよくなかった');
  await click(page, '.review-publish');
  await pcComplete(page);
  review = (await state(page)).reviews['france:crepe'];
  check(review.stars === 1 && review.owner.mood === 'negative' && /one star|ONE STAR/i.test(review.owner.text) && /English/.test(review.owner.text),
    'a one-star Japanese review gets a comic, non-hostile owner who asks for English');
  await page.screenshot({ path: SHOT('ja-pc-one-star') });
  const jaBanks = await page.evaluate(() => JSON.stringify(VA.Reviews.japaneseReplies) + JSON.stringify(VA.Phone.japanese));
  check(!/\b(wrong|stupid|idiot|dumb|shut up|rude|mistake|bad english|not allowed|only english|change your (review|rating|stars?))\b/i.test(jaBanks),
    'no Japanese-reaction line scolds, insults or disputes the student');

  const reviewCount = Object.keys((await state(page)).reviews).length;
  await startReview(page, 'australia:kangaroo', 4);
  await page.fill('.review-text-input', 'It was fun! 楽しかった！');
  await click(page, '.review-publish');
  await pcComplete(page);
  review = (await state(page)).reviews['australia:kangaroo'];
  check(review.owner.style !== 'japanese' && review.owner.mood === 'positive' && !/Japanese/.test(review.owner.text),
    'a mixed English + Japanese review is treated normally');
  await page.screenshot({ path: SHOT('ja-pc-mixed') });

  await click(page, '.review-tab-history');
  await click(page, '.review-card[data-key="france:eiffel"] .review-edit-english');
  await page.waitForSelector('.review-text-input');
  check(await page.inputValue('.review-text-input') === 'すごくきれいだった！', 'Edit review opens the Japanese text for editing');
  await page.fill('.review-text-input', 'It was beautiful!');
  await click(page, '.review-publish');
  await pcComplete(page);
  saved = await state(page);
  review = saved.reviews['france:eiffel'];
  check(Object.keys(saved.reviews).length === reviewCount + 1 && review.text === 'It was beautiful!' && review.editedAt &&
    review.owner.style !== 'japanese' && review.owner.mood === 'positive', 'editing into English updates the same review and the owner now understands');
  await page.screenshot({ path: SHOT('ja-pc-edited') });

  await startReview(page, 'australia:icecream', 1);
  await page.fill('.review-text-input', 'It was boring.');
  await click(page, '.review-publish');
  await pcComplete(page);
  review = (await state(page)).reviews['australia:icecream'];
  check(review.owner.mood === 'negative' && review.owner.topic === 'boring', 'English owner responses are unchanged');
  await click(page, '.review-tab-history');
  check((await page.locator('.review-card[data-key="france:eiffel"] .review-status').textContent()).includes('Edited'), 'history marks the review as edited');
  await closePc(page);

  await browser.close();
  check(!errors.length, 'no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  if (failures.length) {
    console.error('\n' + failures.length + ' JAPANESE TEST(S) FAILED');
    process.exit(1);
  }
  console.log('\nJAPANESE TESTS OK');
})().catch(error => {
  console.error('JAPANESE TESTS CRASHED:', error.message || error);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
});
