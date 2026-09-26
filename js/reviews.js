/* ============================================================
   reviews.js — TripStars, a local fictional travel-review site.

   Like the phone, a review's final outcome (helpful count and the owner's
   reply) is saved the moment it is published; VA.Timeline only reveals it.
   Owner replies react to the student's opinion but never change the stars
   or say the opinion is wrong.
   ============================================================ */
'use strict';

VA.Reviews = {
  draft: null,
  timeline: null,

  /* Fictional operators, keyed by event id; ordinary names, no caricature. */
  owners: {
    icecream: { name: 'Jack', role: 'Owner', img: 'vendor_icecream-alpha.webp', emoji: '🍦', color: '#dff1fb' },
    kangaroo: { name: 'Sam', role: 'Park Ranger', img: 'ranger_australia-alpha.webp', emoji: '🦘', color: '#e4f3da' },
    volleyball: { name: 'Beach Club', role: 'Staff', emoji: '🏐', color: '#fff0c9' },
    crepe: { name: 'Pierre', role: 'Owner', img: 'vendor_crepe-clean.webp', emoji: '🥞', color: '#e0eef7' },
    eiffel: { name: 'Marie', role: 'Tour Guide', img: 'guide_paris.webp', emoji: '🗼', color: '#f3e3f1' },
    soccer: { name: 'Park Staff', role: '', emoji: '⚽', color: '#e2f1dc' },
    kebab: { name: 'Hassan', role: 'Owner', img: 'vendor_kebab.webp', emoji: '🍢', color: '#f8e1de' },
    pyramids: { name: 'Amira', role: 'Tour Guide', img: 'guide_egypt.webp', emoji: '🔺', color: '#f6ead3' },
    sand: { name: 'Desert Camp', role: 'Staff', emoji: '🏖️', color: '#f7ecd6' },
  },

  /* Reply banks.  Every line must stay theatrical, kind and family-friendly:
     never insult the reviewer, never ask them to change their stars, never
     say their opinion is wrong (tests scan every entry). */
  replies: {
    positive: {
      ate: ["Thank you so much! We're very happy you enjoyed it! ❤️ Please visit us again!",
        'Thank you!! The chef is smiling right now! 😄'],
      saw: ["Thank you for visiting! We're so happy you liked it! ✨",
        'Wonderful! Please come back and bring your family! 😊'],
      played: ['Thank you for playing with us! You were great! 🙌',
        'Yay! Come back and play again soon! 😄'],
    },
    neutral: ['Thank you for visiting! We will try to make it even better next time. 😊',
      'Thank you for your review! We hope to see you again! 🙂'],
    negative: {
      drama: ['Oh no!! 😱 Please give us another chance! 😭'],
      apology: ["We're sorry you didn't enjoy it. Thank you for telling us. 🙏"],
      sad: ['Oh… that makes us a little sad. 😢 Thank you for your honest review.'],
      improve: ['Thank you for your review! We will work hard to make it better! 💪'],
    },
    topics: [
      { id: 'boring', match: /\b(boring|bored|borring|boaring)\b/,
        drama: 'BORING?! 😱 We practiced all week! Please give us another chance! 😭',
        calm: "Boring? Oh no! Next time we'll try something more exciting! 🎉" },
      { id: 'food', verb: 'ate', match: /\b(bad|yucky|gross|terrible|awful|not (good|delicious|tasty|yummy))\b/,
        drama: "WHAT?! 😭 My grandmother taught me that recipe! Come back — I'll make it again! 😤",
        calm: "We're sorry it wasn't delicious. We will practice our recipe! 🍳" },
      { id: 'expensive', match: /\b(expensive|expencive|pricey|too much money)\b/,
        drama: 'Too expensive?! 😵 Okay... maybe the souvenir hats WERE a little expensive.',
        calm: "Thank you for telling us. We'll think about our prices! 💰" },
      { id: 'crowded', match: /\b(crowded|crowd|too many people)\b/,
        drama: 'Crowded?! 😵 Everyone wanted to come too! Please visit early next time!',
        calm: "So many people, right? 😅 Try the morning — it's much quieter!" },
      { id: 'hot', match: /\b(hot|too hot)\b/,
        drama: 'Too hot?! 🥵 Even our fan wants a holiday!',
        calm: "Phew! It was really hot! 🥵 Next time we'll have more cold water!" },
      { id: 'cold', match: /\b(cold|too cold)\b/,
        drama: 'Brrr?! 🥶 Okay, okay, we will buy a big heater!',
        calm: 'Brrr! Sorry! 🥶 Next time bring a warm jacket!' },
      { id: 'noisy', match: /\b(noisy|loud)\b/,
        drama: 'NOISY?! 🙉 …Sorry, was I shouting just now?',
        calm: "Sorry! 🙉 We'll try to be a little quieter!" },
      { id: 'scary', match: /\b(scary|scared)\b/,
        drama: 'Scary?! 😨 Oh no — even I am scared now!',
        calm: "Oh no! 😨 Don't worry — we'll make it friendlier next time!" },
      { id: 'small', match: /\b(small|too small)\b/,
        drama: 'Small?! 😮 …Okay, maybe it is a little small. We still love it! 😅',
        calm: 'Thank you! We will try to make it bigger and better! 😊' },
    ],
  },

  starLabels: ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'],

  open() {
    this.draft = null;
    this.openGuideStage = VA.Bedroom.guideStage(VA.State.data);
    if (VA.Memories.list().length && !VA.State.data.bedroomGuide.pcDone) {
      VA.State.data.bedroomGuide.pcSeen = true;
      VA.State.save();
      VA.Bedroom.renderGuide();
    }
    const overlay = VA.$('#reviews-overlay');
    overlay.style.display = 'flex';
    overlay.classList.add('reviews-overlay');
    this.picker();
  },

  close() {
    this.stopTimeline();
    VA.Speech.cancel();
    VA.$('#reviews-overlay').style.display = 'none';
    this.draft = null;
    VA.Bedroom.renderGuide();
  },

  stopTimeline() {
    if (this.timeline) this.timeline.cancel();
    this.timeline = null;
  },

  shell(active) {
    this.stopTimeline();
    const screen = VA.$('#reviews-screen');
    screen.innerHTML = '';
    screen.scrollTop = 0;
    const browser = VA.el('div', 'review-browser-bar');
    browser.innerHTML = '<span class="review-dots"><i></i><i></i><i></i></span>' +
      '<span class="review-address">🔒 tripstars.example/reviews</span>';
    const close = VA.el('button', 'reviews-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close computer');
    close.addEventListener('click', () => this.close());
    browser.appendChild(close);
    screen.appendChild(browser);
    const site = VA.el('header', 'review-site-bar');
    site.appendChild(VA.el('strong', 'review-logo', '<span>★</span> TripStars'));
    const tabs = VA.el('nav', 'review-tabs');
    const write = VA.el('button', 'review-tab-write' + (active === 'write' ? ' active' : ''), 'Write a review');
    const history = VA.el('button', 'review-tab-history' + (active === 'history' ? ' active' : ''), 'My reviews');
    write.addEventListener('click', () => this.picker());
    history.addEventListener('click', () => this.history());
    tabs.append(write, history);
    site.appendChild(tabs);
    screen.appendChild(site);
    const content = VA.el('main', 'review-content');
    screen.appendChild(content);
    return content;
  },

  /* ---------- place details ---------- */

  place(destId, eventId) {
    const dest = VA.Data.destById(destId);
    const evt = dest && dest.events.find(event => event.id === eventId);
    const memory = VA.Memories.list().find(m => m.destId === destId && m.eventId === eventId);
    return dest && evt ? { dest, evt, photo: memory && memory.photo } : null;
  },

  placeHeader(place, tripNo, compact) {
    const head = VA.el('div', 'review-place-header' + (compact ? ' compact' : ''));
    if (place.photo) head.appendChild(VA.Social.photo(place.photo, compact ? 104 : 150, 4 / 3));
    else head.appendChild(VA.el('span', 'review-place-icon', place.evt.icon || '📍'));
    const text = VA.el('div', 'review-place-text');
    text.appendChild(VA.el('h2', '', VA.escape(place.evt.title)));
    text.appendChild(VA.el('p', 'review-place-name', `${place.dest.flag} ${VA.escape(place.dest.name)}` +
      (tripNo ? ` · You visited on Trip ${tripNo}` : '')));
    head.appendChild(text);
    return head;
  },

  owner(eventId) {
    return this.owners[eventId] || { name: 'The Team', role: '', emoji: '⭐', color: '#e8edf1' };
  },

  ownerAvatar(owner) {
    return VA.Social.imageAvatar(owner.img ? 'assets/characters/' + owner.img : null, owner.emoji, owner.color,
      'review-owner-avatar' + (owner.img ? ' review-owner-portrait' : ''));
  },

  ownerTitle(owner) {
    return owner.role ? `${owner.name} · ${owner.role}` : owner.name;
  },

  /* ---------- writing flow ---------- */

  picker() {
    const content = this.shell('write');
    content.appendChild(VA.el('h2', 'review-page-title', 'Where did you go?'));
    const memories = this.places();
    if (!memories.length) return;
    // One review per place (destId:eventId), not per trip: a reviewed place
    // opens its existing review, which can be edited from there.
    if (memories.every(memory => VA.State.data.reviews[`${memory.destId}:${memory.eventId}`])) {
      content.firstChild.remove();
      const done = VA.el('div', 'review-empty review-all-done',
        "You've reviewed every place you've visited!<br><small>Visit somewhere new to write another review.</small>");
      if (VA.State.data.settings.jp) done.appendChild(VA.el('small', 'writing-jp', '新しい場所に行ったら、またレビューを書こう！'));
      content.appendChild(done);
      const mine = VA.el('button', 'review-next writing-primary', 'MY REVIEWS');
      mine.type = 'button';
      mine.addEventListener('click', () => this.history());
      content.appendChild(mine);
      return;
    }
    const grid = VA.el('div', 'review-place-grid');
    memories.forEach(memory => {
      const key = `${memory.destId}:${memory.eventId}`;
      const review = VA.State.data.reviews[key];
      const btn = VA.el('button', 'review-place-option' + (review ? ' reviewed' : ''));
      btn.type = 'button';
      btn.dataset.key = key;
      btn.appendChild(VA.Social.photo(memory.photo, 220, 16 / 10));
      const label = VA.el('span', 'review-place-label');
      label.appendChild(VA.el('b', '', `${memory.evt.icon || memory.photo.icon} ${VA.escape(memory.evt.title)}`));
      label.appendChild(VA.el('small', '', `${memory.dest.flag} ${VA.escape(memory.dest.name)}`));
      if (review) {
        label.appendChild(VA.el('span', 'review-place-stars', '★'.repeat(review.stars) +
          '<span class="review-star-off">' + '★'.repeat(5 - review.stars) + '</span>'));
        label.appendChild(VA.el('small', 'review-place-done', '✓ Reviewed · View'));
        btn.setAttribute('aria-label', `${memory.evt.title}: already reviewed. View your review.`);
        btn.addEventListener('click', () => this.viewReview(key));
      } else {
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.review-place-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          this.draft = { memory, stars: 0, text: '' };
          next.disabled = false;
        });
      }
      btn.appendChild(label);
      grid.appendChild(btn);
    });
    content.appendChild(grid);
    if (!VA.State.data.bedroomGuide.pcDone) {
      VA.Writing.coach(grid, 'pc-picker', 'Choose a place you visited.', '行った場所を選んでね。');
    }
    const next = VA.el('button', 'review-next writing-primary', 'NEXT');
    next.type = 'button';
    next.disabled = true;
    next.addEventListener('click', () => this.stars());
    content.appendChild(next);
  },

  places() {
    const seen = new Set();
    return VA.Memories.list().filter(memory => {
      const key = `${memory.destId}:${memory.eventId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  stars() {
    const content = this.shell('write');
    const memory = this.draft.memory;
    content.appendChild(this.placeHeader({ dest: memory.dest, evt: memory.evt, photo: memory.photo }, memory.tripNo, true));
    content.appendChild(VA.el('h3', 'review-step-title', 'How was it? Tap the stars.'));
    const row = VA.el('div', 'review-star-row');
    const label = VA.el('div', 'review-star-label', '&nbsp;');
    const paint = n => {
      row.querySelectorAll('.review-star').forEach((el, i) => el.classList.toggle('selected', i < n));
      label.textContent = n ? this.starLabels[n] : ' ';
    };
    for (let n = 1; n <= 5; n++) {
      const star = VA.el('button', 'review-star', '★');
      star.type = 'button';
      star.dataset.stars = n;
      star.setAttribute('aria-label', `${n} star${n === 1 ? '' : 's'}`);
      star.addEventListener('click', () => {
        this.draft.stars = n;
        paint(n);
        next.disabled = false;
      });
      row.appendChild(star);
    }
    content.appendChild(row);
    content.appendChild(label);
    if (!VA.State.data.bedroomGuide.pcDone) {
      VA.Writing.coach(row, 'pc-stars', "How many stars? It's your opinion!", '星はいくつ？あなたの意見でOK！');
    }
    const next = VA.el('button', 'review-next writing-primary', 'NEXT');
    next.type = 'button';
    next.disabled = !this.draft.stars;
    next.addEventListener('click', () => this.writer());
    content.appendChild(next);
    if (this.draft.stars) paint(this.draft.stars);
  },

  writer(openHelp, errorMessage) {
    const content = this.shell('write');
    const memory = this.draft.memory;
    content.appendChild(this.placeHeader({ dest: memory.dest, evt: memory.evt, photo: memory.photo }, memory.tripNo, true));
    const chosen = VA.el('div', 'review-chosen');
    chosen.appendChild(VA.el('span', 'review-chosen-stars', '★'.repeat(this.draft.stars) + '☆'.repeat(5 - this.draft.stars)));
    chosen.appendChild(VA.el('span', 'review-chosen-label', this.starLabels[this.draft.stars]));
    content.appendChild(chosen);
    if (errorMessage) {
      const error = VA.el('div', 'review-error', 'Can you write a little more?');
      if (VA.State.data.settings.jp) error.appendChild(VA.el('small', 'writing-jp', 'もう少し書いてみよう。'));
      content.appendChild(error);
    }
    content.appendChild(VA.el('label', 'review-write-label', 'Your review'));
    const writing = VA.el('div', 'review-writing-area');
    const field = VA.el('textarea', 'review-text-input');
    field.maxLength = 200;
    field.rows = 4;
    field.placeholder = 'Write 1–3 sentences.';
    field.value = this.draft.text;
    writing.appendChild(field);
    const status = VA.el('small', 'writing-mic-status');
    writing.appendChild(VA.Writing.mic(field, status));
    writing.appendChild(status);
    content.appendChild(writing);
    if (!VA.State.data.bedroomGuide.pcDone) {
      VA.Writing.coach(writing, 'pc-writing', 'Write what you thought.', '思ったことを書こう。',
        'For example: It was delicious. / It was beautiful. / It was fun.');
    }
    const help = this.help(field);
    content.appendChild(help.wrap);
    if (openHelp) help.open(1);
    const publish = VA.el('button', 'review-publish writing-primary', 'PUBLISH REVIEW');
    publish.type = 'button';
    publish.addEventListener('click', () => {
      if (publish.disabled) return;
      publish.disabled = true;
      this.draft.text = field.value.trim();
      this.publish();
    });
    content.appendChild(publish);
    field.focus();
  },

  help(field) {
    const wrap = VA.el('div', 'writing-help review-help-wrap');
    const button = VA.el('button', 'review-help', '💡 Help');
    const rung1 = VA.el('div', 'review-help-rung1 writing-help-rung');
    ['It was ___.', 'I liked it.', "I didn't like it.", 'The ___ was ___.'].forEach(text => {
      const chip = VA.el('button', 'writing-chip', text);
      chip.type = 'button';
      chip.addEventListener('click', () => VA.Writing.insert(field, text));
      rung1.appendChild(chip);
    });
    const rung2 = VA.el('div', 'review-help-rung2 writing-help-rung');
    rung2.appendChild(VA.el('div', 'writing-word-bank',
      'good · great · fun · beautiful · interesting · delicious · boring · crowded · expensive · noisy · scary'));
    if (VA.State.data.settings.jp) rung2.appendChild(VA.el('small', 'writing-jp', '自分の意見を英語で書いてみよう。'));
    let rung = 0;
    const open = force => {
      rung = force || Math.min(2, rung + 1);
      rung1.classList.toggle('show', rung >= 1);
      rung2.classList.toggle('show', rung >= 2);
    };
    button.addEventListener('click', () => open());
    wrap.append(button, rung1, rung2);
    return { wrap, open };
  },

  /* ---------- publishing ---------- */

  /* The owner's reply depends on the stars (mood) and, for low ratings, on
     what the student wrote.  Comic drama is only one of several styles. */
  ownerReply(key, stars, text, verb) {
    const pick = (list, salt) => list[VA.Phone.hash(key + '|' + text + '|' + stars + '|' + salt) % list.length];
    if (stars >= 4) {
      const bank = this.replies.positive[verb] || this.replies.positive.saw;
      return { mood: 'positive', text: pick(bank, 'p') };
    }
    if (stars === 3) return { mood: 'neutral', text: pick(this.replies.neutral, 'n') };
    const lower = String(text || '').toLowerCase();
    const topic = this.replies.topics.find(t => (!t.verb || t.verb === verb) && t.match.test(lower));
    const roll = VA.Phone.hash(key + '|' + text + '|style') % 3;
    if (topic) return { mood: 'negative', style: roll === 0 ? 'drama' : 'calm', topic: topic.id, text: roll === 0 ? topic.drama : topic.calm };
    const styles = ['drama', 'apology', 'sad', 'improve'];
    const style = styles[VA.Phone.hash(key + '|' + text + '|generic') % styles.length];
    return { mood: 'negative', style, text: pick(this.replies.negative[style], style) };
  },

  /* The owner cannot read Japanese but can read the stars: a Japanese-only
     review is published, and the owner reacts to the rating and asks,
     theatrically but kindly, for some English. */
  japaneseReplies: {
    positive: ['{Stars}!! Thank you! 😭❤️ I can’t read Japanese, though! Can you tell me in English too?',
      'Thank you for the {stars}! ⭐ Japanese looks cool, but I don’t understand it. 😅 Can you add some English?'],
    neutral: ['Thank you for your review! But I can’t read Japanese. 😭 Could you write it in English?',
      'I wish I could understand this! 😅 Can you add some English?'],
    negative: ['{STARS}?! 😱 I can’t read Japanese, but that star rating scares me! Please tell me what happened in English! 😭',
      '{Stars}… 😢 I can’t read it, but I want to make it better! Can you tell us in English?'],
  },

  japaneseOwnerReply(key, stars, text) {
    const mood = stars >= 4 ? 'positive' : stars === 3 ? 'neutral' : 'negative';
    const bank = this.japaneseReplies[mood];
    const words = ['', 'one star', 'two stars', 'three stars', 'four stars', 'five stars'];
    const word = words[stars] || 'stars';
    const line = bank[VA.Phone.hash(key + '|' + text + '|ja') % bank.length]
      .replace('{STARS}', word.toUpperCase())
      .replace('{Stars}', word[0].toUpperCase() + word.slice(1))
      .replace('{stars}', word);
    return { mood, style: 'japanese', text: line };
  },

  helpfulFor(key, text) {
    return 1 + (VA.Phone.hash(key + '|' + text + '|helpful') % 7);
  },

  publish() {
    if (!this.draft.stars) return this.stars();
    const eligible = this.places().some(memory => memory.destId === this.draft.memory.destId && memory.eventId === this.draft.memory.eventId);
    if (!eligible) return this.picker();
    // Japanese is never blocked; mixed text is judged by its English part
    const language = VA.Lang.languageOf(this.draft.text);
    const english = language === 'mixed' ? VA.Lang.englishPart(this.draft.text) : this.draft.text;
    const result = language === 'japanese' ? { ok: false, model: null } : VA.Lang.evaluateReview(english);
    const japaneseOnly = language === 'japanese' || (language === 'mixed' && !result.ok);
    if (!result.ok && !japaneseOnly) return this.writer(true, true);
    const memory = this.draft.memory;
    const key = `${memory.destId}:${memory.eventId}`;
    // a second review of the same place is never written; only Edit replaces it
    if (VA.State.data.reviews[key] && this.draft.editing !== key) return this.viewReview(key);
    const review = {
      destId: memory.destId,
      eventId: memory.eventId,
      tripNo: memory.tripNo,
      stars: this.draft.stars,
      text: this.draft.text,
      updatedAt: Date.now(),
      helpful: japaneseOnly ? VA.Phone.hash(key + '|' + this.draft.text) % 2 : this.helpfulFor(key, this.draft.text),
      owner: japaneseOnly ? this.japaneseOwnerReply(key, this.draft.stars, this.draft.text)
        : this.ownerReply(key, this.draft.stars, english, memory.evt.verb),
    };
    if (this.draft.editing) review.editedAt = review.updatedAt;
    VA.State.data.reviews[key] = review;
    const firstReview = !VA.State.data.bedroomGuide.pcDone;
    this.justCompletedGuide = firstReview;
    if (firstReview) {
      VA.State.data.bedroomGuide.pcSeen = true;
      VA.State.data.bedroomGuide.pcDone = true;
    }
    VA.State.save();
    this.published(key, review, japaneseOnly ? null : result.model, firstReview ? 1 : 0.6);
  },

  /* ---------- review card ---------- */

  reviewCard(key, review, live) {
    const place = this.place(review.destId, review.eventId);
    if (!place) return null;
    const card = VA.el('article', 'review-card');
    card.dataset.key = key;
    const head = VA.el('div', 'review-card-head');
    head.appendChild(VA.Social.playerAvatar('review-avatar'));
    const who = VA.el('div', 'review-card-who');
    who.appendChild(VA.el('b', '', VA.escape(VA.Social.playerName())));
    who.appendChild(VA.el('small', '', `Visited ${VA.escape(place.dest.name)}` + (review.tripNo ? ` · Trip ${review.tripNo}` : '')));
    head.appendChild(who);
    const status = VA.el('span', 'review-status');
    head.appendChild(status);
    card.appendChild(head);

    const title = VA.el('div', 'review-card-title');
    title.appendChild(VA.el('span', '', `${place.evt.icon} ${VA.escape(place.evt.title)}`));
    title.appendChild(VA.el('small', '', `${place.dest.flag} ${VA.escape(place.dest.name)}`));
    card.appendChild(title);
    const stars = VA.el('div', 'review-card-stars', '★'.repeat(review.stars) + '<span class="review-star-off">' + '★'.repeat(5 - review.stars) + '</span>');
    stars.dataset.stars = review.stars;
    stars.setAttribute('aria-label', `${review.stars} out of 5 stars`);
    card.appendChild(stars);
    card.appendChild(VA.el('p', 'review-card-text', VA.escape(review.text)));

    const helpful = VA.el('div', 'review-helpful');
    const helpfulText = VA.el('span', 'review-helpful-count');
    helpful.appendChild(helpfulText);
    helpful.appendChild(VA.el('span', 'review-helpful-pill', '👍 Helpful'));
    const edit = VA.el('button', 'review-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => this.edit(review));
    helpful.appendChild(edit);
    card.appendChild(helpful);
    const ownerSlot = VA.el('div', 'review-owner');
    card.appendChild(ownerSlot);

    const ui = { card, status, helpfulText, ownerSlot, typing: null };
    card._ui = ui;
    if (live) {
      this.setHelpful(ui, 0);
    } else {
      status.textContent = (review.editedAt ? 'Edited · ' : '') + this.date(review.updatedAt);
      this.setHelpful(ui, review.helpful != null ? review.helpful : this.helpfulFor(key, review.text));
      if (review.owner) this.showOwner(ui, review, false);
      card.dataset.complete = '1';
    }
    return card;
  },

  date(ts) {
    if (!ts || ts < 1e11) return '';
    const ago = VA.Social.ago(ts);
    if (ago && !/d$/.test(ago)) return ago === 'just now' ? 'just now' : ago + ' ago';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  setHelpful(ui, count) {
    ui.helpfulText.textContent = count <= 0 ? 'Be the first to find this helpful'
      : count === 1 ? '1 person found this helpful' : `${count} people found this helpful`;
    ui.helpfulText.dataset.count = count;
  },

  showOwner(ui, review, animate) {
    this.clearTyping(ui);
    const owner = this.owner(review.eventId);
    const block = VA.el('div', 'review-owner-reply' + (animate ? ' review-arrive' : ''));
    block.dataset.mood = review.owner.mood;
    if (review.owner.style) block.dataset.style = review.owner.style;
    block.appendChild(this.ownerAvatar(owner));
    const body = VA.el('div', 'review-owner-body');
    body.appendChild(VA.el('div', 'review-owner-name', `<b>${VA.escape(this.ownerTitle(owner))}</b>` +
      `<span>${owner.role === 'Owner' ? 'Response from the owner' : 'Official response'}</span>`));
    body.appendChild(VA.el('p', 'review-owner-text', VA.escape(review.owner.text)));
    block.appendChild(body);
    ui.ownerSlot.innerHTML = '';
    ui.ownerSlot.appendChild(block);
    // the owner could not read it: invite (never force) an edit with English
    if (review.owner.style === 'japanese') {
      const invite = VA.el('div', 'review-edit-invite');
      invite.appendChild(VA.el('p', '', 'The owner wants to understand you. Try adding some English!'));
      if (VA.State.data.settings.jp) invite.appendChild(VA.el('small', 'writing-jp', '英語を少し足すと、オーナーに伝わるよ。'));
      const edit = VA.el('button', 'review-edit-english', '✏️ Edit review');
      edit.type = 'button';
      edit.addEventListener('click', event => { event.stopPropagation(); this.edit(review); });
      invite.appendChild(edit);
      ui.ownerSlot.appendChild(invite);
    }
    return block;
  },

  showTyping(ui, review) {
    const owner = this.owner(review.eventId);
    ui.typing = VA.Social.typingRow(this.ownerAvatar(owner), this.ownerTitle(owner), 'review-owner-typing social-typing');
    ui.ownerSlot.innerHTML = '';
    ui.ownerSlot.appendChild(ui.typing);
    VA.Social.show(ui.typing);
  },

  clearTyping(ui) {
    if (ui.typing) ui.typing.remove();
    ui.typing = null;
  },

  published(key, review, tip, speed = 1) {
    const content = this.shell('write');
    const place = this.place(review.destId, review.eventId);
    content.appendChild(this.placeHeader(place, review.tripNo));
    let guide = null;
    if (this.justCompletedGuide) {
      guide = VA.el('div', 'writing-guide-outcome', 'Your review is online! ★');
      guide.hidden = true;
      content.appendChild(guide);
      this.justCompletedGuide = false;
    }
    const card = this.reviewCard(key, review, true);
    card.classList.add('review-live');
    const ui = card._ui;
    const posting = VA.el('span', 'review-posting', '<i class="review-spinner"></i>Posting…');
    ui.status.appendChild(posting);
    content.appendChild(card);
    const tipSlot = VA.el('div', 'review-tip-slot');
    content.appendChild(tipSlot);
    const skip = VA.el('button', 'social-skip review-skip', 'Skip ›');
    skip.type = 'button';
    skip.hidden = true;
    content.appendChild(skip);

    const random = VA.Phone.random(key + '|' + review.text + '|reveal');
    const between = (a, b) => Math.round(a + random() * (b - a));
    const steps = [{
      after: 1200,
      apply: () => {
        ui.status.innerHTML = '<span class="review-online">Online ✓</span> · just now';
        if (guide) guide.hidden = false;
        skip.hidden = false;
        VA.Social.ping('reviewUp');
      },
    }];
    VA.Social.rise(review.helpful || 0, random).forEach(value => {
      steps.push({ after: between(500, 900), apply: () => this.setHelpful(ui, value) });
    });
    if (review.owner) {
      steps.push({ after: between(600, 900), apply: () => this.showTyping(ui, review) });
      steps.push({ after: between(1400, 1900), apply: () => {
        VA.Social.show(this.showOwner(ui, review, true));
        VA.Social.ping('ownerReply');
      } });
    }
    steps.push({
      after: 250,
      apply: () => {
        skip.hidden = true;
        card.dataset.complete = '1';
        if (tip) tipSlot.appendChild(this.tip(tip));
      },
    });
    this.timeline = VA.Timeline.run(steps, { speed });
    const handle = this.timeline;
    skip.addEventListener('click', () => handle.finish());
    card.addEventListener('click', event => {
      if (!event.target.closest('button')) handle.finish();
    });
  },

  tip(model) {
    const note = VA.el('div', 'review-tip', `✨ Nice review! You can also say: ${VA.escape(model)}`);
    const close = VA.el('button', 'review-tip-close', 'Got it');
    close.type = 'button';
    close.addEventListener('click', () => note.remove());
    note.appendChild(close);
    return note;
  },

  history() {
    const content = this.shell('history');
    const reviews = Object.entries(VA.State.data.reviews).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    content.appendChild(VA.el('h2', 'review-page-title', 'My reviews'));
    if (!reviews.length) {
      content.appendChild(VA.el('div', 'review-empty', 'No reviews yet.'));
      return;
    }
    reviews.forEach(([key, review]) => {
      const card = this.reviewCard(key, review, false);
      if (card) content.appendChild(card);
    });
  },

  viewReview(key) {
    const review = VA.State.data.reviews[key];
    if (!review) return this.picker();
    const content = this.shell('history');
    const place = this.place(review.destId, review.eventId);
    if (place) content.appendChild(this.placeHeader(place, review.tripNo));
    content.appendChild(VA.el('p', 'review-one-per-place', 'You already reviewed this place. You can edit your review.'));
    const card = this.reviewCard(key, review, false);
    if (card) content.appendChild(card);
  },

  edit(review) {
    const memory = this.places().find(item => item.destId === review.destId && item.eventId === review.eventId);
    if (!memory) return this.picker();
    this.draft = { memory, stars: review.stars, text: review.text, editing: `${review.destId}:${review.eventId}` };
    this.writer();
  },
};
