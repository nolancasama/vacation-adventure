/* ============================================================
   social.js — Postcards, a local fictional friends feed.

   A post's final reactions and comments are decided and saved the moment it
   is published.  VA.Timeline then only reveals that saved outcome (posting,
   likes, typing, comments), so closing the phone mid-animation loses nothing
   and an old post never replays.
   ============================================================ */
'use strict';

VA.Writing = {
  insert(field, text) {
    const start = field.selectionStart == null ? field.value.length : field.selectionStart;
    const end = field.selectionEnd == null ? start : field.selectionEnd;
    const before = field.value.slice(0, start);
    const space = before && !/\s$/.test(before) ? ' ' : '';
    field.value = (before + space + text + field.value.slice(end)).slice(0, field.maxLength || 9999);
    const caret = Math.min(field.value.length, start + space.length + text.length);
    field.focus();
    field.setSelectionRange(caret, caret);
  },

  mic(field, status) {
    const btn = VA.el('button', 'writing-mic', '🎤');
    btn.type = 'button';
    btn.title = 'Dictate';
    if (!VA.Speech.available()) btn.hidden = true;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.add('listening');
      status.textContent = 'Listening…';
      const result = await VA.Speech.dictate();
      btn.disabled = false;
      btn.classList.remove('listening');
      if (result.status === 'ok' && result.transcript) {
        this.insert(field, result.transcript);
        status.textContent = '';
      } else if (result.status !== 'cancelled') {
        status.textContent = "Mic didn't work. Please type.";
      }
    });
    return btn;
  },

  /* Coaches are in-flow banners placed just before the element they point
     at, so they can never cover a button, field or star control. */
  coach(anchor, id, en, jp, suggestions) {
    if (!anchor || !anchor.parentNode) return null;
    const bubble = VA.el('div', 'writing-coach');
    bubble.dataset.coach = id;
    bubble.appendChild(VA.el('div', 'writing-coach-en', VA.escape(en)));
    if (suggestions) bubble.appendChild(VA.el('div', 'writing-coach-suggestions', VA.escape(suggestions)));
    if (VA.State.data.settings.jp && jp) {
      const reveal = VA.el('button', 'writing-coach-jp-toggle', '? 日本語');
      reveal.type = 'button';
      const japanese = VA.el('div', 'writing-coach-jp', VA.escape(jp));
      japanese.hidden = true;
      reveal.addEventListener('click', event => {
        event.stopPropagation();
        japanese.hidden = false;
        reveal.hidden = true;
      });
      bubble.append(reveal, japanese);
    }
    const close = VA.el('button', 'writing-coach-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide hint');
    close.addEventListener('click', event => { event.stopPropagation(); bubble.remove(); });
    bubble.appendChild(close);
    anchor.parentNode.insertBefore(bubble, anchor);
    return bubble;
  },
};

/* Small shared helpers for the phone and the PC. */
VA.Social = {
  playerName() { return VA.State.data.name || 'Traveler'; },

  playerAvatar(cls = '') {
    const wrap = VA.el('span', 'social-avatar social-avatar-player ' + cls);
    const look = VA.State.data.playerLook === 'girl' ? 'girl' : 'boy';
    const img = document.createElement('img');
    img.alt = '';
    img.src = `assets/characters/travel_${look}_excited.webp`;
    img.addEventListener('error', () => {
      wrap.textContent = this.initials(this.playerName());
    }, { once: true });
    wrap.appendChild(img);
    return wrap;
  },

  imageAvatar(src, fallback, color, cls = '') {
    const wrap = VA.el('span', 'social-avatar ' + cls);
    wrap.style.background = color || '#e8edf1';
    if (!src) { wrap.textContent = fallback; return wrap; }
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    img.addEventListener('error', () => { wrap.textContent = fallback; }, { once: true });
    wrap.appendChild(img);
    return wrap;
  },

  emojiAvatar(emoji, color, cls = '') {
    const wrap = VA.el('span', 'social-avatar social-avatar-emoji ' + cls, VA.escape(emoji));
    wrap.style.background = color;
    return wrap;
  },

  initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  },

  handle(name) {
    return (String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'traveler') + '.travels';
  },

  ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  },

  typingRow(avatar, name, cls) {
    const row = VA.el('div', cls);
    row.appendChild(avatar);
    row.appendChild(VA.el('span', 'social-typing-text', `${VA.escape(name)} is typing…`));
    row.appendChild(VA.el('span', 'social-typing-dots', '<i></i><i></i><i></i>'));
    return row;
  },

  /* A full-bleed crop of the keepsake photo (the polaroid canvas without its
     white frame and handwritten caption). */
  photo(photo, base = 480, aspect = 16 / 9) {
    const inset = 12;
    const full = base + inset * 2;
    const sceneH = full * 1.15 * 0.62;
    const frameH = Math.min(sceneH, base / aspect);
    // a wide crop keeps the likes row on screen; the Eiffel Tower keeps its top
    const focus = photo && photo.backdrop === 'event_france_eiffel.webp' ? 0.25 : 0.5;
    const offsetY = inset + (sceneH - frameH) * focus;
    const frame = VA.el('div', 'social-photo');
    frame.style.aspectRatio = `${base} / ${frameH.toFixed(2)}`;
    const polaroid = VA.Art.polaroid(photo, full);
    polaroid.style.position = 'absolute';
    polaroid.style.left = (-inset / base * 100) + '%';
    polaroid.style.top = (-offsetY / frameH * 100) + '%';
    polaroid.style.width = (full / base * 100) + '%';
    polaroid.style.height = (full * 1.15 / frameH * 100) + '%';
    const canvas = polaroid.querySelector('canvas');
    if (canvas) { canvas.style.width = '100%'; canvas.style.height = '100%'; }
    frame.appendChild(polaroid);
    return frame;
  },

  /* Irregular, strictly rising counts ending exactly at `total` (likes,
     "found this helpful"), e.g. 2, 5, 8, 11, 15. */
  rise(total, random) {
    if (total <= 0) return [];
    const count = Math.min(total, 4 + Math.floor(random() * 3));
    const weights = Array.from({ length: count }, (_, i) => (i === 0 ? 0.5 : 0.6 + random()));
    const sum = weights.reduce((a, b) => a + b, 0);
    const values = [];
    let acc = 0;
    weights.forEach((w, i) => {
      acc += w;
      let value = i === count - 1 ? total : Math.max(1, Math.round(total * acc / sum));
      if (values.length && value <= values[values.length - 1]) value = values[values.length - 1] + 1;
      values.push(Math.min(value, total));
    });
    return values.filter((v, i) => i === 0 || v > values[i - 1]);
  },

  /* Keeps newly arrived activity visible inside a scrolling device screen. */
  show(el) {
    if (!el || !el.isConnected) return;
    // scroll only the device screen: scrollIntoView would also shift the
    // clipped overlay and push the phone's top bar off the stage
    const box = el.closest('#phone-screen, #reviews-screen');
    if (!box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const scale = b.height / box.clientHeight || 1;
    // the sticky Skip / BACK TO FEED bar covers the bottom of the screen
    const sticky = box.querySelector('.phone-published-controls');
    const bottom = sticky && !sticky.contains(el) ? Math.min(b.bottom, sticky.getBoundingClientRect().top) : b.bottom;
    let delta = 0;
    if (r.bottom > bottom) delta = (r.bottom - bottom) / scale + 12;
    else if (r.top < b.top) delta = (r.top - b.top) / scale - 12;
    if (delta) box.scrollBy({ top: delta, behavior: VA.reducedMotion ? 'auto' : 'smooth' });
  },

  /* Plays at most one sound of each kind per window, so a finished-at-once
     timeline never stacks notifications. */
  _lastSound: {},
  ping(name, gap = 1200) {
    const now = Date.now();
    if (now - (this._lastSound[name] || 0) < gap) return;
    this._lastSound[name] = now;
    VA.Audio.sfx(name);
  },
};

VA.Phone = {
  draft: null,
  timeline: null,
  friends: [
    { name: 'Mia', handle: 'mia.hops', avatar: '🐰', color: '#ffdce5' },
    { name: 'Leo', handle: 'leo.fox', avatar: '🦊', color: '#ffe3c7' },
    { name: 'Nina', handle: 'nina.bamboo', avatar: '🐼', color: '#e2ebef' },
    { name: 'Omar', handle: 'omar.jumps', avatar: '🐸', color: '#d8f0cf' },
    { name: 'Aya', handle: 'aya.gumtree', avatar: '🐨', color: '#e6e0f5' },
  ],
  banks: {
    food: ['Yummy! 😋', 'That looks delicious!', 'I want to eat that! 🤤'],
    landmark: ['Wow! 😮', 'So beautiful! ✨', 'I want to go there!'],
    activity: ['That looks fun! 😄', 'Nice! 👏', 'I want to play too!'],
  },
  followUpReplies: {
    ate: ['Yum! That sounds great! ❤️', 'Lucky you! Now I am hungry! 😋'],
    played: ['That sounds so fun! 😄', 'Cool! Let’s play together next time! 🙌'],
    saw: ['Wow, I want to see it too! 😮', 'Amazing! Thanks for telling me! 😊'],
  },
  positiveExtras: ['🔥', '😊'],
  // The friends are international: friendly, curious, never scolding.
  japanese: {
    confused: ["I don't understand Japanese! 😅", 'What does that mean? 🤔', 'Hmm? I can’t read it! 😅',
      'Ooh, what does it say? 🤔'],
    encouraging: ['Can you tell me in English?', 'I want to understand your trip! Can you write it in English?',
      'English, please! 😄', 'Tell us in English! I want to know! 😊'],
    cool: ['Wow! You can speak Japanese! 😮', 'Cool! Japanese! 🎌✨', 'Japanese looks awesome! 😄',
      'Whoa! Japanese! That’s amazing! 😄'],
    understoodNow: ['Oh! I understand now! 😄', 'Ahh, now I get it! 😊', 'Oh, I see! Thanks for the English! 😄'],
    still: ['Still Japanese? 😅 English, please!', 'Hmm, I still can’t read it! 😅 Can you try English?'],
    reply: ["I don't understand Japanese! 😅 Can you say it in English?", 'Wow, Japanese! 😮 …but what does it mean?',
      'Hmm? 🤔 Can you tell me in English?'],
  },

  open() {
    VA.Bedroom.clearNotificationTimers();
    this.draft = null;
    this.openGuideStage = VA.Bedroom.guideStage(VA.State.data);
    if (VA.Memories.list().length && !VA.State.data.bedroomGuide.phoneDone) {
      VA.State.data.bedroomGuide.phoneSeen = true;
      VA.State.save();
      VA.Bedroom.renderGuide();
    }
    const overlay = VA.$('#phone-overlay');
    overlay.style.display = 'flex';
    overlay.classList.add('phone-overlay');
    this.feed();
  },

  close() {
    this.stopTimeline();
    VA.Speech.cancel();
    VA.$('#phone-overlay').style.display = 'none';
    this.draft = null;
    const stage = VA.Bedroom.guideStage(VA.State.data);
    VA.Bedroom.renderGuide(stage === 'pc-new' && /^phone-/.test(this.openGuideStage || ''));
  },

  stopTimeline() {
    if (this.timeline) this.timeline.cancel();
    this.timeline = null;
  },

  play(steps, speed) {
    this.stopTimeline();
    this.timeline = VA.Timeline.run(steps, { speed });
    return this.timeline;
  },

  shell(title) {
    this.stopTimeline();
    const screen = VA.$('#phone-screen');
    screen.innerHTML = '';
    screen.scrollTop = 0;
    const bar = VA.el('div', 'phone-app-bar');
    bar.appendChild(VA.el('strong', '', title || 'Postcards'));
    const close = VA.el('button', 'phone-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close phone');
    close.addEventListener('click', () => this.close());
    bar.appendChild(close);
    screen.appendChild(bar);
    return screen;
  },

  feed() {
    const screen = this.shell('Postcards');
    const top = VA.el('div', 'phone-feed-top');
    top.appendChild(VA.el('span', '', 'Friends’ travel posts'));
    const fresh = VA.el('button', 'phone-new-post', '+ NEW POST');
    fresh.type = 'button';
    fresh.addEventListener('click', () => this.picker());
    top.appendChild(fresh);
    screen.appendChild(top);
    if (!VA.State.data.bedroomGuide.phoneDone && VA.Memories.list().length) {
      VA.Writing.coach(top, 'phone-feed', 'Tap + NEW POST to share a photo!', '＋NEW POSTで写真をシェアしよう！');
    }

    const posts = VA.State.data.socialPosts.slice().reverse();
    if (!posts.length) {
      screen.appendChild(VA.el('div', 'phone-empty', 'No posts yet.<br><small>Share a photo from your trip!</small>'));
    }
    posts.forEach(post => screen.appendChild(this.postCard(post)));
  },

  /* ---------- post card ---------- */

  postCard(post, live) {
    const memory = this.memoryFor(post);
    const name = VA.Social.playerName();
    const card = VA.el('article', 'phone-post-card');
    card.dataset.postId = post.id;

    const head = VA.el('header', 'phone-post-head');
    head.appendChild(VA.Social.playerAvatar('phone-avatar'));
    const who = VA.el('div', 'phone-post-who');
    who.appendChild(VA.el('b', '', VA.escape(name)));
    const place = memory && memory.evt && memory.dest ? `${memory.evt.title}, ${memory.dest.name}` : '';
    who.appendChild(VA.el('small', '', VA.escape(place || '@' + VA.Social.handle(name))));
    head.appendChild(who);
    card.appendChild(head);

    const photo = VA.Social.photo(post.photo);
    photo.classList.add('phone-post-photo');
    card.appendChild(photo);

    const actions = VA.el('div', 'phone-post-actions');
    const like = VA.el('span', 'phone-likes');
    const commentCount = VA.el('span', 'phone-comment-count');
    const status = VA.el('span', 'phone-post-status');
    actions.append(like, commentCount, status);
    card.appendChild(actions);

    const reactions = VA.el('div', 'phone-reactions');
    card.appendChild(reactions);

    const caption = VA.el('div', 'phone-caption');
    const title = post.title || (memory && memory.evt ? memory.evt.title : 'My Vacation!');
    caption.appendChild(VA.el('h3', '', VA.escape(title)));
    caption.appendChild(VA.el('p', 'phone-post-text', `<b>${VA.escape(name)}</b> ${VA.escape(post.text)}`));
    card.appendChild(caption);

    const comments = VA.el('div', 'phone-comments');
    card.appendChild(comments);
    const composer = VA.el('div', 'phone-composer-slot');
    card.appendChild(composer);
    const editSlot = VA.el('div', 'phone-edit-slot');
    card.appendChild(editSlot);

    const ui = { card, like, commentCount, status, reactions, comments, composer, editSlot, typing: null };
    card._ui = ui;
    if (live) {
      this.setLikes(ui, 0);
      this.setCommentCount(ui, 0);
    } else {
      this.fill(post, ui);
    }
    return card;
  },

  fill(post, ui) {
    const reactions = post.reactions || {};
    this.setLikes(ui, reactions['❤️'] || 0);
    ui.reactions.innerHTML = '';
    Object.entries(reactions).filter(([emoji]) => emoji !== '❤️')
      .forEach(([emoji, count]) => this.addChip(ui, emoji, count));
    ui.comments.innerHTML = '';
    (post.comments || []).forEach(comment => ui.comments.appendChild(this.thread(post, ui, comment)));
    this.setCommentCount(ui, this.countComments(post));
    ui.status.textContent = post.editedAt ? `Edited · ${VA.Social.ago(post.editedAt)}` : VA.Social.ago(post.createdAt);
    this.renderComposer(post, ui);
    this.renderEditPrompt(post, ui);
    ui.card.dataset.complete = '1';
  },

  setLikes(ui, count, animate) {
    ui.like.innerHTML = count > 0
      ? `<span class="phone-heart on">❤️</span><b>${count}</b>`
      : '<span class="phone-heart">♡</span><b>0</b>';
    ui.like.dataset.count = count;
    if (animate) {
      ui.like.classList.remove('bump');
      void ui.like.offsetWidth;
      ui.like.classList.add('bump');
      VA.Social.ping('like');
    }
  },

  setCommentCount(ui, count) {
    ui.commentCount.innerHTML = `<span class="phone-bubble">💬</span><b>${count}</b>`;
    ui.commentCount.dataset.count = count;
  },

  addChip(ui, emoji, count, animate) {
    const chip = VA.el('span', 'phone-reaction' + (animate ? ' arrive' : ''), `${emoji} ${count}`);
    ui.reactions.appendChild(chip);
    return chip;
  },

  friendAvatar(index, cls = '') {
    const friend = this.friends[index] || this.friends[0];
    return VA.Social.emojiAvatar(friend.avatar, friend.color, cls);
  },

  /* `ui` is passed only for top-level comments on a real post; it enables
     the subtle Reply link.  Replies (id "…-rN") render indented. */
  commentRow(post, comment, animate, ui) {
    const isReply = /-r\d+$/.test(comment.id || '');
    const row = VA.el('div', `phone-comment phone-comment-${comment.kind || 'friend'}` +
      (isReply ? ' phone-reply' : '') + (animate ? ' arrive' : ''));
    row.dataset.kind = comment.kind || 'friend';
    if (comment.id) row.dataset.commentId = comment.id;
    const pending = comment.kind === 'question' && post.followUp && post.followUp.status === 'pending';
    if (pending) row.classList.add('pending');
    row.appendChild(comment.kind === 'player' ? VA.Social.playerAvatar('phone-comment-avatar')
      : this.friendAvatar(comment.friend, 'phone-comment-avatar'));
    const body = VA.el('div', 'phone-comment-body');
    body.appendChild(VA.el('p', '', `<b>${VA.escape(comment.who)}</b> ${VA.escape(comment.text)}`));
    const meta = VA.el('div', 'phone-comment-meta');
    const time = animate ? 'just now' : VA.Social.ago(comment.at || post.createdAt);
    if (time) meta.appendChild(VA.el('small', 'phone-comment-time', time));
    if (ui && !isReply && !pending && this.canReply(comment)) meta.appendChild(this.replyLink(post, ui, comment));
    if (meta.childNodes.length) body.appendChild(meta);
    row.appendChild(body);
    return row;
  },

  memoryFor(post) {
    return VA.Memories.list().find(m => m.destId === post.destId && m.eventId === post.eventId) || {
      tripNo: post.tripNo,
      destId: post.destId,
      eventId: post.eventId,
      photo: post.photo,
      dest: VA.Data.destById(post.destId),
      evt: (VA.Data.destById(post.destId) || { events: [] }).events.find(e => e.id === post.eventId),
    };
  },

  /* ---------- composing ---------- */

  /* One post per earned photo: a photo is identified by its trip as well as
     its place, so a new photo from a later trip can be posted again. */
  postFor(memory) {
    return VA.State.data.socialPosts.find(p => p.tripNo === memory.tripNo &&
      p.destId === memory.destId && p.eventId === memory.eventId) || null;
  },

  picker() {
    const screen = this.shell('Choose a photo');
    const memories = VA.Memories.list();
    if (!memories.length) return;
    if (memories.every(memory => this.postFor(memory))) {
      const done = VA.el('div', 'phone-empty phone-all-posted',
        "You've shared all your vacation photos!<br><small>Take more photos on your next trip.</small>");
      if (VA.State.data.settings.jp) done.appendChild(VA.el('small', 'writing-jp', '次の旅行でまた写真をとろう！'));
      screen.appendChild(done);
      const back = VA.el('button', 'phone-next writing-primary', 'BACK TO FEED');
      back.type = 'button';
      back.addEventListener('click', () => this.feed());
      screen.appendChild(back);
      return;
    }
    const list = VA.el('div', 'phone-memory-list');
    let nextScrollBusy = false;
    let nextScrollTimer = 0;
    let current = null;
    memories.forEach(memory => {
      if (memory.destId !== current) {
        current = memory.destId;
        list.appendChild(VA.el('h3', 'phone-memory-group', `${memory.dest.flag} ${VA.escape(memory.dest.name)}`));
      }
      const post = this.postFor(memory);
      const btn = VA.el('button', 'phone-memory-option' + (post ? ' posted' : ''));
      btn.type = 'button';
      btn.dataset.key = `${memory.destId}:${memory.eventId}`;
      btn.dataset.trip = memory.tripNo;
      btn.appendChild(VA.Art.polaroid(memory.photo, 112));
      btn.appendChild(VA.el('span', '', `${memory.evt.icon || memory.photo.icon} ${VA.escape(memory.evt.title)}`));
      if (post) {
        btn.appendChild(VA.el('small', 'phone-posted-badge', '✓ Posted · View'));
        btn.setAttribute('aria-label', `${memory.evt.title}: already posted. View post.`);
        btn.addEventListener('click', () => this.viewPost(post));
      } else {
        btn.setAttribute('aria-pressed', 'false');
        const selectedState = VA.el('span', 'phone-selection-state');
        selectedState.setAttribute('aria-hidden', 'true');
        selectedState.append(
          VA.el('span', 'phone-selected-check', '✓'),
          VA.el('span', 'phone-selected-label', 'Selected')
        );
        btn.appendChild(selectedState);
        btn.addEventListener('click', () => {
          list.querySelectorAll('.phone-memory-option').forEach(el => {
            el.classList.remove('selected', 'phone-memory-pop');
            if (!el.classList.contains('posted')) el.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('selected');
          btn.setAttribute('aria-pressed', 'true');
          if (!VA.reducedMotion) {
            void btn.offsetWidth;
            btn.classList.add('phone-memory-pop');
          }
          this.draft = { memory, title: '', text: '', help: 0 };
          next.disabled = false;
          requestAnimationFrame(() => {
            const box = VA.$('#phone-screen');
            if (!box || nextScrollBusy || !next.isConnected) return;
            const buttonRect = next.getBoundingClientRect();
            const boxRect = box.getBoundingClientRect();
            if (buttonRect.top >= boxRect.top && buttonRect.bottom <= boxRect.bottom) return;
            nextScrollBusy = true;
            VA.Social.show(next);
            clearTimeout(nextScrollTimer);
            nextScrollTimer = setTimeout(() => { nextScrollBusy = false; }, VA.reducedMotion ? 0 : 425);
          });
        });
      }
      list.appendChild(btn);
    });
    screen.appendChild(list);
    if (!VA.State.data.bedroomGuide.phoneDone) {
      VA.Writing.coach(list, 'phone-picker', 'Choose a photo from your trip.', '写真を1まい選んでね。');
    }
    const next = VA.el('button', 'phone-next writing-primary', 'NEXT');
    next.type = 'button';
    next.disabled = true;
    next.addEventListener('click', () => this.titleStep());
    screen.appendChild(next);
  },

  viewPost(post) {
    const screen = this.shell('Postcards');
    const wrap = VA.el('div', 'phone-outcome phone-view-post');
    wrap.appendChild(this.postCard(post));
    const back = VA.el('button', 'writing-primary', 'BACK TO PHOTOS');
    back.type = 'button';
    back.addEventListener('click', () => this.picker());
    wrap.appendChild(back);
    screen.appendChild(wrap);
  },

  titleStep() {
    const screen = this.shell('Add a title');
    const wrap = VA.el('div', 'phone-title-step');
    wrap.appendChild(VA.el('label', '', 'Title (optional)'));
    const input = VA.el('input', 'phone-title-input');
    input.maxLength = 40;
    input.placeholder = 'My Vacation!';
    input.value = this.draft.title;
    wrap.appendChild(input);
    if (VA.Speech.available()) {
      const status = VA.el('small', 'writing-mic-status');
      wrap.appendChild(VA.Writing.mic(input, status));
      wrap.appendChild(status);
    }
    const next = VA.el('button', 'phone-next writing-primary', 'NEXT');
    next.addEventListener('click', () => { this.draft.title = input.value.trim(); this.captionStep(); });
    wrap.appendChild(next);
    screen.appendChild(wrap);
    if (!VA.State.data.bedroomGuide.phoneDone) {
      VA.Writing.coach(wrap, 'phone-title', 'Give your post a title.', 'タイトルをつけよう。');
    }
    input.focus();
  },

  captionStep(openHelp) {
    const screen = this.shell(this.draft.editing ? 'Edit post' : 'New post');
    const memory = this.draft.memory;
    const form = VA.el('div', 'phone-caption-step');
    const preview = VA.el('div', 'phone-caption-preview');
    preview.appendChild(VA.Social.photo(memory.photo, 120));
    preview.appendChild(VA.el('label', '', 'What do you want to tell your friends?'));
    form.appendChild(preview);
    const writing = VA.el('div', 'phone-writing-area');
    const field = VA.el('textarea', 'phone-caption-input');
    field.maxLength = 160;
    field.rows = 3;
    field.placeholder = 'Write one or more short sentences.';
    field.value = this.draft.text;
    writing.appendChild(field);
    const status = VA.el('small', 'writing-mic-status');
    writing.appendChild(VA.Writing.mic(field, status));
    writing.appendChild(status);
    form.appendChild(writing);
    const help = this.postHelp(field);
    form.appendChild(help.wrap);
    if (openHelp) help.open(1);
    const post = VA.el('button', 'phone-post writing-primary', this.draft.editing ? 'UPDATE' : 'POST');
    post.type = 'button';
    post.addEventListener('click', () => {
      if (post.disabled) return;
      post.disabled = true;
      this.draft.text = field.value.trim();
      this.submit();
    });
    form.appendChild(post);
    screen.appendChild(form);
    if (!VA.State.data.bedroomGuide.phoneDone) {
      VA.Writing.coach(writing, 'phone-caption', 'Write about your trip, then tap POST!', '旅行のことを書いて、POSTをタップ！');
    }
    field.focus();
  },

  postHelp(field) {
    const memory = this.draft.memory;
    const wrap = VA.el('div', 'writing-help');
    const button = VA.el('button', 'phone-help', '💡 Help');
    const rung1 = VA.el('div', 'phone-help-rung1 writing-help-rung');
    const object = VA.Lang.memoryObject(memory.evt.caption);
    const starters = [`I went to ___.`, `I ${memory.evt.verb} ___.`, 'It was ___.'];
    starters.forEach(text => {
      const chip = VA.el('button', 'writing-chip', text);
      chip.type = 'button';
      chip.addEventListener('click', () => VA.Writing.insert(field, text));
      rung1.appendChild(chip);
    });
    const rung2 = VA.el('div', 'writing-help-rung phone-help-rung2');
    const adjectives = memory.evt.verb === 'ate' ? ['delicious', 'yummy', 'sweet'] :
      memory.evt.verb === 'played' ? ['fun', 'exciting', 'great'] : ['beautiful', 'big', 'amazing'];
    rung2.appendChild(VA.el('div', 'writing-word-bank', [object, ...adjectives].map(VA.escape).join(' · ')));
    if (VA.State.data.settings.jp) rung2.appendChild(VA.el('small', 'writing-jp', '写真の思い出を英語で書いてみよう。'));
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

  /* Japanese is never blocked.  A Japanese-only post goes online and the
     international friends react to what they could understand; mixed text is
     judged by its English part, so "It was fun! 楽しかった！" is simply English
     with extra feeling.  The contradiction check only runs on English, since
     the local evaluator cannot read Japanese meaning. */
  submit() {
    const memory = this.draft.memory;
    const allEvents = [];
    VA.Data.DESTS.forEach(dest => dest.events.forEach(evt => allEvents.push({ evt, dest })));
    const language = VA.Lang.languageOf(this.draft.text);
    const topic = memory.evt.verb === 'ate' ? 'food' : memory.evt.verb === 'played' ? 'activity' : 'landmark';
    if (language === 'japanese') return this.publish({ quality: 'japanese', topic });
    const english = language === 'mixed' ? VA.Lang.englishPart(this.draft.text) : this.draft.text;
    const result = VA.Lang.evaluatePost(english, memory, allEvents);
    if (language === 'mixed' && result.quality === 'unclear') return this.publish({ quality: 'japanese', topic });
    if (result.quality === 'contradiction') return this.problem(result, true);
    if (result.quality === 'unclear') return this.problem(result, false);
    this.publish(result);
  },

  confusedText(result) {
    return `${this.pretty(result.wrongThing || 'That')}? 🤔 Isn't that ${this.draft.memory.dest.name}?`;
  },

  problem(result, canPost) {
    const screen = this.shell(canPost ? 'Friends preview' : 'Let’s try again');
    const card = VA.el('div', 'phone-outcome phone-problem');
    if (canPost) {
      card.appendChild(VA.el('p', 'phone-problem-lead', 'Your friends might be confused…'));
      card.appendChild(VA.el('div', 'phone-preview-reactions', '🤔 2　😕 1'));
      const friend = this.hash(this.draft.memory.eventId) % this.friends.length;
      const row = this.commentRow({}, { who: this.friends[friend].name, friend, kind: 'friend', text: this.confusedText(result) });
      card.appendChild(row);
    } else if (/\p{Extended_Pictographic}/u.test(this.draft.text) && VA.Lang.languageOf(this.draft.text) === 'unclear') {
      card.appendChild(VA.el('p', '', 'Haha! 😂 But what happened? Tell us about your trip!'));
      if (VA.State.data.settings.jp) card.appendChild(VA.el('p', 'writing-jp', '何があったか書いてみよう。'));
    } else {
      card.appendChild(VA.el('p', '', "Hmm… your friends aren't sure what you mean. Try editing your post."));
      if (VA.State.data.settings.jp) card.appendChild(VA.el('p', 'writing-jp', 'もう少し英語で書いてみよう。'));
    }
    const edit = VA.el('button', 'phone-edit writing-primary', 'EDIT POST');
    edit.addEventListener('click', () => this.captionStep(!canPost));
    card.appendChild(edit);
    if (canPost) {
      const anyway = VA.el('button', 'phone-anyway', 'POST ANYWAY');
      anyway.addEventListener('click', () => { anyway.disabled = true; this.publish(result, true); });
      card.appendChild(anyway);
    } else {
      const cancel = VA.el('button', 'phone-cancel', 'CANCEL');
      cancel.addEventListener('click', () => this.draft && this.draft.editing ? this.viewPostById(this.draft.editing) : this.feed());
      card.appendChild(cancel);
    }
    screen.appendChild(card);
  },

  reactionsFor(quality, random) {
    const n = (min, spread) => min + Math.floor(random() * spread);
    if (quality === 'contradiction') return { '❤️': n(1, 2), '🤔': n(2, 4), '😕': n(1, 3) };
    if (quality === 'japanese') return { '❤️': n(1, 3), '🤔': n(2, 4), '😕': n(1, 3), '😅': n(1, 2) };
    if (quality === 'clear') {
      const extra = this.positiveExtras[Math.floor(random() * this.positiveExtras.length)];
      return { '❤️': n(14, 10), '😮': n(3, 5), '👏': n(2, 5), [extra]: n(2, 4) };
    }
    return { '❤️': n(8, 7), '😊': n(2, 4), '👏': n(1, 4) };
  },

  understood(quality) { return quality === 'clear' || quality === 'minor'; },

  /* Builds the friend comments for one outcome.  `lead` optionally opens
     with a friend who now understands an edited post. */
  commentsFor(result, confused, random, memory, lead) {
    const comments = [];
    const used = new Set();
    const pickFriend = i => {
      let friend = (Math.floor(random() * this.friends.length) + i) % this.friends.length;
      while (used.has(friend)) friend = (friend + 1) % this.friends.length;
      used.add(friend);
      return friend;
    };
    const say = (friend, text) => comments.push({ who: this.friends[friend].name, friend, kind: 'friend', text });
    const pick = (bank, salt) => bank[Math.floor(random() * bank.length + salt) % bank.length];
    if (lead != null) { used.add(lead); say(lead, pick(this.japanese.understoodNow, 0)); }
    if (result.quality === 'japanese') {
      say(pickFriend(0), pick(this.japanese.confused, 0));
      say(pickFriend(1), pick(this.japanese.encouraging, 1));
      // usually one friend just thinks Japanese is cool, so it never feels like a scolding
      if (random() < 0.7) say(pickFriend(2), pick(this.japanese.cool, 2));
      return comments;
    }
    if (confused) {
      const friend = lead != null ? pickFriend(0) : this.hash(memory.eventId) % this.friends.length;
      used.add(friend);
      say(friend, this.confusedText(result));
      const other = pickFriend(1);
      say(other, 'Hmm… I’m a little confused. 😕');
      return comments;
    }
    const bank = this.banks[result.topic];
    const count = (result.quality === 'clear' ? 3 : 2) - (lead != null ? 1 : 0);
    const start = Math.floor(random() * bank.length);
    for (let i = 0; i < count; i++) {
      let text = bank[(start + i) % bank.length];
      if (result.quality === 'minor' && i === 0 && result.model) text = `Wow! ${result.model} 😮`;
      say(pickFriend(i), text);
    }
    return comments;
  },

  followUpFor(memory, id, excludeId) {
    const earlierGood = VA.State.data.socialPosts.some(p => p.id !== excludeId && p.tripNo === memory.tripNo && this.understood(p.quality));
    if (earlierGood) return null;
    const asker = this.hash(id) % this.friends.length;
    const q = memory.evt.verb === 'ate' ? 'Was it good?' :
      memory.evt.verb === 'played' ? 'Who did you play with?' : 'Was it big?';
    return { comment: { who: this.friends[asker].name, friend: asker, kind: 'question', text: q },
      followUp: { q, friend: asker, status: 'pending', reply: null } };
  },

  publish(result, confused) {
    if (this.draft.editing) return this.applyEdit(result, confused);
    const memory = this.draft.memory;
    const existing = this.postFor(memory);
    if (existing) return this.viewPost(existing);
    const posts = VA.State.data.socialPosts;
    const id = `post-${posts.length + 1}-${memory.tripNo}-${memory.eventId}`;
    const random = this.random(id + '|' + this.draft.text);
    const quality = confused ? 'contradiction' : result.quality;
    const reactions = this.reactionsFor(quality, random);
    const comments = this.commentsFor(result, confused, random, memory);
    let followUp = null;
    if (this.understood(quality)) {
      const ask = this.followUpFor(memory, id);
      if (ask) { comments.push(ask.comment); followUp = ask.followUp; }
    }
    comments.forEach((comment, i) => { comment.id = `${id}-c${i}`; });
    const rewardClaimed = this.understood(quality) && this.claimBonus(memory, this.draft.text);
    const post = {
      id,
      tripNo: memory.tripNo,
      destId: memory.destId,
      eventId: memory.eventId,
      photo: JSON.parse(JSON.stringify(memory.photo)),
      title: this.draft.title,
      text: this.draft.text,
      quality,
      reactions,
      comments,
      followUp,
      rewardClaimed,
      createdAt: Date.now(),
    };
    posts.push(post);
    const firstPost = !VA.State.data.bedroomGuide.phoneDone;
    this.justCompletedGuide = firstPost;
    if (firstPost) {
      VA.State.data.bedroomGuide.phoneSeen = true;
      VA.State.data.bedroomGuide.phoneDone = true;
    }
    VA.State.save();
    if (rewardClaimed) VA.State.addCoins(1);
    this.published(post, firstPost ? 1 : 0.6);
  },

  /* Editing keeps one post: old comments stay as history, the new outcome
     adds reactions and comments, and the bonus can be claimed if it never
     was (same cap, memory and duplicate-text rules). */
  canEdit(post) { return post && (post.quality === 'japanese' || post.quality === 'contradiction'); },

  editPost(post) {
    const memory = this.memoryFor(post);
    if (!memory || !memory.evt || !this.canEdit(post)) return;
    this.draft = { memory, title: post.title || '', text: post.text, help: 0, editing: post.id };
    this.captionStep();
  },

  viewPostById(id) {
    const post = VA.State.data.socialPosts.find(p => p.id === id);
    return post ? this.viewPost(post) : this.feed();
  },

  applyEdit(result, confused) {
    const post = VA.State.data.socialPosts.find(p => p.id === this.draft.editing);
    if (!post || !this.canEdit(post)) return this.feed();
    const memory = this.draft.memory;
    const text = this.draft.text;
    const quality = confused ? 'contradiction' : result.quality;
    if (text === post.text) return this.viewPost(post);
    const random = this.random(post.id + '|edit|' + text);
    const since = post.comments.length;
    const wasConfused = post.comments.find(c => c.kind === 'friend');
    let added;
    if (quality === 'japanese' && post.quality === 'japanese') {
      const friend = wasConfused ? wasConfused.friend : 0;
      added = [{ who: this.friends[friend].name, friend, kind: 'friend', text: this.japanese.still[Math.floor(random() * this.japanese.still.length)] }];
    } else {
      added = this.commentsFor(result, confused, random, memory,
        this.understood(quality) && wasConfused ? wasConfused.friend : null);
    }
    if (this.understood(quality) && !post.followUp) {
      const ask = this.followUpFor(memory, post.id, post.id);
      if (ask) { added.push(ask.comment); post.followUp = ask.followUp; }
    }
    added.forEach((comment, i) => { comment.id = `${post.id}-c${since + i}`; });
    // the bonus check must run before the post's own text changes
    const claim = this.understood(quality) && !post.rewardClaimed && this.claimBonus(memory, text);
    post.comments.push(...added);
    post.text = text;
    post.quality = quality;
    post.reactions = this.reactionsFor(quality, random);
    post.editedAt = Date.now();
    if (claim) post.rewardClaimed = true;
    VA.State.save();
    if (claim) VA.State.addCoins(1);
    this.draft = null;
    this.published(post, 0.6, { since, edited: true, claimed: claim });
  },

  claimBonus(memory, text) {
    const key = String(memory.tripNo);
    const bonus = VA.State.data.socialBonus[key] || { count: 0, memories: [] };
    bonus.memories = bonus.memories || [];
    const memoryKey = `${memory.destId}:${memory.eventId}`;
    const normalized = this.normalize(text);
    const duplicateText = VA.State.data.socialPosts.some(p => this.normalize(p.text) === normalized);
    if (bonus.count >= VA.Data.SOCIAL_BONUS_CAP || bonus.memories.includes(memoryKey) || duplicateText) return false;
    bonus.count += 1;
    bonus.memories.push(memoryKey);
    VA.State.data.socialBonus[key] = bonus;
    return true;
  },

  /* ---------- the live reveal ---------- */

  bonusNote(post, claimed) {
    if (post.quality === 'japanese') return 'Travel bonus: not yet — your friends need some English!';
    if (claimed) return 'Travel bonus: +1 💰';
    return 'Likes are just for fun!';
  },

  published(post, speed = 1, opts = {}) {
    const since = opts.since || 0;
    const screen = this.shell('Postcards');
    const outcome = VA.el('div', 'phone-outcome phone-published');
    const posting = VA.el('div', 'phone-posting', `<span>${opts.edited ? 'Updating…' : 'Posting…'}</span><div class="social-progress"><i></i></div>`);
    posting.style.setProperty('--posting-ms', Math.round(1200 * speed * VA.Timeline.scale) + 'ms');
    outcome.appendChild(posting);
    const notes = VA.el('div', 'phone-published-notes');
    notes.hidden = true;
    const bonus = VA.el('span', 'phone-bonus', this.bonusNote(post, opts.edited ? opts.claimed : post.rewardClaimed));
    notes.appendChild(bonus);
    if (this.justCompletedGuide) {
      notes.appendChild(VA.el('span', 'writing-guide-outcome', 'Your friends reacted! 🎉'));
      this.justCompletedGuide = false;
    }
    outcome.appendChild(notes);
    const card = this.postCard(post, true);
    card.classList.add('is-posting');
    outcome.appendChild(card);
    const ui = card._ui;
    // an edited post keeps its earlier comments on screen as history
    post.comments.slice(0, since).forEach(comment => ui.comments.appendChild(this.thread(post, ui, comment)));
    const controls = VA.el('div', 'phone-published-controls');
    const skip = VA.el('button', 'social-skip phone-skip', 'Skip ›');
    skip.type = 'button';
    skip.hidden = true;
    const done = VA.el('button', 'writing-primary', 'BACK TO FEED');
    done.type = 'button';
    done.addEventListener('click', () => this.feed());
    controls.append(skip, done);
    outcome.appendChild(controls);
    screen.appendChild(outcome);

    const online = () => {
      posting.remove();
      card.classList.remove('is-posting');
      ui.status.textContent = opts.edited ? 'Updated ✓ · just now' : 'Posted ✓ · just now';
      ui.status.classList.add('online');
      notes.hidden = false;
      skip.hidden = false;
      if (opts.edited ? opts.claimed : post.rewardClaimed) VA.Audio.sfx('coins');
      VA.Social.ping('postUp');
    };
    const finished = () => {
      skip.hidden = true;
      this.renderComposer(post, ui);
      this.renderEditPrompt(post, ui);
      ui.card.dataset.complete = '1';
      VA.Social.show(ui.comments.querySelector('.phone-reply-editor') || ui.editSlot.firstChild || ui.comments.lastChild);
    };
    const handle = this.play(this.revealSteps(post, ui, online, finished, since), speed);
    skip.addEventListener('click', () => handle.finish());
    card.addEventListener('click', event => {
      if (!event.target.closest('button, input, textarea')) handle.finish();
    });
  },

  /* After friends could not understand a post, invite (never force) an edit. */
  renderEditPrompt(post, ui) {
    ui.editSlot.innerHTML = '';
    if (!this.canEdit(post)) return;
    const box = VA.el('div', 'phone-edit-prompt');
    box.appendChild(VA.el('p', '', post.quality === 'japanese'
      ? 'Your international friends want to understand you. Try adding some English!'
      : 'Your friends are confused. You can fix your post!'));
    if (VA.State.data.settings.jp && post.quality === 'japanese') {
      box.appendChild(VA.el('small', 'writing-jp', '英語を少し足すと、友だちに伝わるよ。'));
    }
    const edit = VA.el('button', 'phone-edit-post', '✏️ Edit post');
    edit.type = 'button';
    edit.addEventListener('click', event => { event.stopPropagation(); this.editPost(post); });
    box.appendChild(edit);
    ui.editSlot.appendChild(box);
  },

  likeSteps(total, random) { return VA.Social.rise(total, random); },

  revealSteps(post, ui, online, finished, since = 0) {
    const random = this.random(post.id + '|reveal|' + since);
    const between = (a, b) => Math.round(a + random() * (b - a));
    const reactions = post.reactions || {};
    const likes = this.likeSteps(reactions['❤️'] || 0, random);
    const chips = Object.entries(reactions).filter(([emoji]) => emoji !== '❤️');
    const fresh = post.comments.slice(since);
    const friendComments = fresh.filter(c => c.kind !== 'question');
    const questions = fresh.filter(c => c.kind === 'question');
    let li = 0;
    let ci = 0;
    let shown = this.countComments({ comments: post.comments.slice(0, since) });
    this.setCommentCount(ui, shown);
    const steps = [{ after: 1200, apply: online }];
    const like = () => {
      if (li >= likes.length) return;
      const value = likes[li++];
      steps.push({ after: between(350, 750), apply: () => this.setLikes(ui, value, true) });
    };
    const chip = () => {
      if (ci >= chips.length) return;
      const [emoji, count] = chips[ci++];
      steps.push({ after: between(300, 650), apply: () => this.addChip(ui, emoji, count, true) });
    };
    const comment = c => {
      steps.push({ after: between(450, 800), apply: () => this.showTyping(ui, c) });
      steps.push({ after: between(800, 1500), apply: () => this.showComment(post, ui, c, ++shown) });
    };
    like();
    chip();
    like();
    friendComments.forEach(c => { comment(c); like(); chip(); });
    while (li < likes.length || ci < chips.length) { like(); chip(); }
    questions.forEach(comment);
    steps.push({ after: 250, apply: finished });
    return steps;
  },

  showTyping(ui, comment, container) {
    this.clearTyping(ui);
    const friend = this.friends[comment.friend] || this.friends[0];
    ui.typing = VA.Social.typingRow(this.friendAvatar(comment.friend, 'phone-comment-avatar'), friend.name,
      'phone-typing social-typing' + (container ? ' phone-reply' : ''));
    (container || ui.comments).appendChild(ui.typing);
    VA.Social.show(ui.typing);
  },

  clearTyping(ui) {
    if (ui.typing) ui.typing.remove();
    ui.typing = null;
  },

  showComment(post, ui, comment, count) {
    this.clearTyping(ui);
    const thread = this.thread(post, ui, comment, true);
    ui.comments.appendChild(thread);
    VA.Social.show(thread);
    if (count != null) this.setCommentCount(ui, count);
    VA.Social.ping('comment', 300);
  },

  /* ---------- threads and replies ----------
     Each top-level comment owns its replies (one player reply, then at most
     one short acknowledgment), so a reply always renders directly under the
     comment it answers.  There is no reply-to-reply. */

  countComments(post) {
    return (post.comments || []).reduce((n, c) => n + 1 + (c.replies || []).length, 0);
  },

  thread(post, ui, comment, animate) {
    const thread = VA.el('div', 'phone-thread');
    thread.dataset.commentId = comment.id || '';
    thread.appendChild(this.commentRow(post, comment, animate, ui));
    const replies = VA.el('div', 'phone-replies');
    (comment.replies || []).forEach(reply => replies.appendChild(this.commentRow(post, reply, false)));
    thread.appendChild(replies);
    return thread;
  },

  /* One player reply per comment, except that a Japanese-only reply leaves
     room for one more try in English (at most two). */
  canReply(comment) {
    if (comment.kind !== 'friend' && comment.kind !== 'question') return false;
    const mine = (comment.replies || []).filter(reply => reply.kind === 'player');
    return !mine.length || (mine.length === 1 && VA.Lang.languageOf(mine[0].text) === 'japanese');
  },

  replyLink(post, ui, comment) {
    const link = VA.el('button', 'phone-reply-link', 'Reply');
    link.type = 'button';
    link.addEventListener('click', event => {
      event.stopPropagation();
      this.openReply(post, ui, comment, false);
    });
    return link;
  },

  refreshReplyLink(post, ui, comment, thread) {
    const row = thread.querySelector(':scope > .phone-comment');
    if (!row || row.querySelector('.phone-reply-link') || !this.canReply(comment)) return;
    let meta = row.querySelector('.phone-comment-meta');
    if (!meta) { meta = VA.el('div', 'phone-comment-meta'); row.querySelector('.phone-comment-body').appendChild(meta); }
    meta.appendChild(this.replyLink(post, ui, comment));
  },

  threadFor(ui, comment) {
    return Array.from(ui.comments.querySelectorAll('.phone-thread'))
      .find(el => el.dataset.commentId === String(comment.id)) || null;
  },

  renderComposer(post, ui) {
    ui.composer.innerHTML = '';
    if (!post.followUp || post.followUp.status !== 'pending') return;
    const question = (post.comments || []).find(c => c.kind === 'question');
    if (question) this.openReply(post, ui, question, true);
  },

  /* Opens the inline reply editor under one comment.  A pending follow-up
     question opens its editor automatically and offers Skip; any other
     comment opens only when the student taps its Reply link. */
  openReply(post, ui, comment, auto) {
    const thread = this.threadFor(ui, comment);
    if (!thread || !this.canReply(comment)) return null;
    if (!auto) ui.comments.querySelectorAll('.phone-reply-editor:not(.auto)').forEach(el => el.remove());
    const existing = thread.querySelector('.phone-reply-editor');
    if (existing) { existing.querySelector('input').focus(); return existing; }

    const isQuestion = comment.kind === 'question';
    const box = VA.el('div', 'phone-follow-up phone-reply-editor' + (auto ? ' auto' : ''));
    box.appendChild(VA.el('div', 'phone-follow-label', `↳ Reply to ${VA.escape(comment.who)}`));
    const row = VA.el('div', 'phone-follow-row');
    const input = VA.el('input', 'phone-follow-input');
    input.maxLength = 100;
    input.placeholder = 'Write a reply…';
    row.appendChild(input);
    const status = VA.el('small', 'writing-mic-status');
    row.appendChild(VA.Writing.mic(input, status));
    const send = VA.el('button', 'phone-follow-send', 'SEND');
    send.type = 'button';
    row.appendChild(send);
    box.appendChild(row);
    box.appendChild(status);
    const dismiss = VA.el('button', isQuestion && auto ? 'phone-follow-skip' : 'phone-reply-cancel',
      isQuestion && auto ? 'Skip' : 'Cancel');
    dismiss.type = 'button';
    box.appendChild(dismiss);
    thread.appendChild(box);

    const submit = () => {
      const text = input.value.trim();
      if (text) this.sendReply(post, ui, comment, text);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    dismiss.addEventListener('click', () => {
      box.remove();
      if (isQuestion && post.followUp && post.followUp.status === 'pending') {
        post.followUp.status = 'skipped';
        VA.State.save();
        ui.comments.querySelectorAll('.phone-comment.pending').forEach(el => el.classList.remove('pending'));
      }
    });
    if (!auto) input.focus();
    return box;
  },

  sendReply(post, ui, comment, text) {
    // a reveal still running is completed first so nothing is left half-shown
    if (this.timeline && !this.timeline.done) this.timeline.finish();
    if (!this.canReply(comment)) return;
    const now = Date.now();
    comment.replies = comment.replies || [];
    const mine = { id: `${comment.id}-r${comment.replies.length + 1}`, kind: 'player', who: VA.Social.playerName(), text, at: now };
    comment.replies.push(mine);
    const ackText = this.ackFor(post, comment, text);
    const ack = ackText ? { id: `${comment.id}-r${comment.replies.length + 1}`, kind: 'friend', friend: comment.friend, who: comment.who, text: ackText, at: now } : null;
    if (ack) comment.replies.push(ack);
    if (comment.kind === 'question' && post.followUp) {
      post.followUp.reply = text;
      post.followUp.status = 'answered';
    }
    VA.State.save();

    const thread = this.threadFor(ui, comment);
    if (!thread) return;
    thread.querySelectorAll('.phone-reply-editor').forEach(el => el.remove());
    thread.querySelectorAll('.phone-comment.pending').forEach(el => el.classList.remove('pending'));
    const link = thread.querySelector('.phone-reply-link');
    if (link) link.remove();
    const replies = thread.querySelector('.phone-replies');
    const mineRow = this.commentRow(post, mine, true);
    replies.appendChild(mineRow);
    VA.Social.show(mineRow);
    this.setCommentCount(ui, this.countComments(post) - (ack ? 1 : 0));
    VA.Social.ping('comment', 300);
    if (!ack) return this.refreshReplyLink(post, ui, comment, thread);
    const random = this.random(ack.id + '|' + text);
    this.play([
      { after: 500, apply: () => this.showTyping(ui, ack, replies) },
      { after: 800 + Math.round(random() * 700), apply: () => {
        this.clearTyping(ui);
        const row = this.commentRow(post, ack, true);
        replies.appendChild(row);
        VA.Social.show(row);
        this.setCommentCount(ui, this.countComments(post));
        VA.Social.ping('comment', 300);
        // after a Japanese reply, the friend's request invites one more try
        this.refreshReplyLink(post, ui, comment, thread);
      } },
    ]);
  },

  /* Short, deterministic acknowledgments.  Thanks and flavours always get
     an answer, a follow-up question always does, other replies usually do. */
  ackFor(post, comment, text) {
    // a Japanese-only reply always gets a friendly request for English
    if (VA.Lang.languageOf(text) === 'japanese') {
      return this.japanese.reply[this.hash(comment.id + '|' + text) % this.japanese.reply.length];
    }
    const t = VA.Lang.englishPart(text).toLowerCase();
    if (/\bthank/.test(t)) return 'You’re welcome! 😊';
    const flavor = t.match(/\b(chocolate|vanilla|strawberry|mango|banana|lemon|matcha|caramel|cheese)\b/);
    if (flavor) return `${this.pretty(flavor[1])} is my favorite! ❤️`;
    if (comment.kind === 'question') return this.replyFor(post);
    if (this.hash(comment.id + '|' + t) % 3 === 2) return null;
    if (/\b(yes|yeah|yep)\b/.test(t)) return 'Nice! 😄';
    if (/\b(no|not)\b/.test(t)) return 'Oh, okay! 😊';
    const verb = ((this.memoryFor(post) || {}).evt || {}).verb;
    const bank = this.acks[verb] || this.acks.saw;
    return bank[this.hash(comment.id + '|ack') % bank.length];
  },

  acks: {
    ate: ['Yum! ❤️', 'Sounds tasty! 😋'],
    saw: ['Wow! 😮', 'So cool! ✨'],
    played: ['Fun! 😄', 'Nice! 🙌'],
  },

  replyFor(post) {
    const evt = (this.memoryFor(post) || {}).evt || {};
    const bank = this.followUpReplies[evt.verb] || this.followUpReplies.saw;
    return bank[this.hash(post.id + '|reply') % bank.length];
  },

  /* Save migration, idempotent:
     1. legacy friend comments ('🐰 Mia') gain friend/kind fields;
     2. a legacy follow-up stored outside the thread becomes a question
        comment (older saves rendered the reply above it);
     3. a reply and friend answer stored after the question at top level are
        nested under the question;
     4. every comment and reply gets a stable id. */
  migratePosts(posts) {
    (posts || []).forEach(post => {
      post.comments = (post.comments || []).map(comment => this.normalizeComment(comment));
      const f = post.followUp;
      if (f && !f.status) {
        const friend = this.hash(post.id) % this.friends.length;
        const question = { who: this.friends[friend].name, friend, kind: 'question', text: f.q };
        if (!post.comments.some(c => c.kind === 'question')) {
          const replyAt = f.reply ? post.comments.findIndex(c => c.kind === 'player') : -1;
          post.comments.splice(replyAt < 0 ? post.comments.length : replyAt, 0, question);
        }
        f.friend = friend;
        f.status = f.reply ? 'answered' : 'pending';
      }
      const qi = post.comments.findIndex(c => c.kind === 'question');
      if (qi >= 0 && post.comments[qi + 1] && post.comments[qi + 1].kind === 'player') {
        const question = post.comments[qi];
        const moved = [post.comments[qi + 1]];
        const answer = post.comments[qi + 2];
        if (answer && answer.kind === 'friend' && answer.friend === question.friend) moved.push(answer);
        post.comments.splice(qi + 1, moved.length);
        question.replies = (question.replies || []).concat(moved);
      }
      post.comments.forEach((comment, i) => {
        if (!comment.id) comment.id = `${post.id}-c${i}`;
        (comment.replies || []).forEach((reply, j) => { if (!reply.id) reply.id = `${comment.id}-r${j + 1}`; });
      });
    });
    return posts;
  },

  normalizeComment(comment) {
    if (!comment || comment.kind) return comment;
    const match = String(comment.who || '').match(/^([^\w\s]\S*)\s+(.+)$/u);
    const index = match ? this.friends.findIndex(f => f.name === match[2]) : -1;
    if (index >= 0) return { who: this.friends[index].name, friend: index, kind: 'friend', text: comment.text };
    return { who: comment.who, kind: 'player', text: comment.text };
  },

  normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  },
  pretty(text) { return String(text || '').replace(/\b\w/g, c => c.toUpperCase()); },
  hash(text) {
    let h = 2166136261;
    for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  random(seed) {
    let n = this.hash(seed) || 1;
    return () => { n = Math.imul(n ^ (n >>> 15), 1 | n); n ^= n + Math.imul(n ^ (n >>> 7), 61 | n); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; };
  },
};
