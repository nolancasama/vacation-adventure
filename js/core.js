/* ============================================================
   core.js — namespace, tiny utils, save state, screen manager,
   and one-off visual effects (fade, flash, toasts, flying photos).
   ============================================================ */
'use strict';

window.VA = {
  W: 960, H: 600,
  VERSION: '1.0.0',
  SAVE_KEY: 'vacation-adventure-v1',
};

/* ---------- tiny utils ---------- */
VA.$  = sel => document.querySelector(sel);
VA.$$ = sel => Array.from(document.querySelectorAll(sel));
VA.el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
VA.wait  = ms => new Promise(r => setTimeout(r, ms));
VA.rand  = (a, b) => a + Math.random() * (b - a);
VA.randi = (a, b) => Math.floor(VA.rand(a, b + 1));
VA.pick  = arr => arr[Math.floor(Math.random() * arr.length)];
VA.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* apply a chosen player look ('boy'/'girl') onto the single shared
   CHARS.player entry — every event script's `char: 'player'` reference
   keeps working unchanged; only the appearance/voice underneath changes */
VA.applyPlayerLook = lookId => {
  const look = VA.Data.PLAYER_LOOKS[lookId] || VA.Data.PLAYER_LOOKS.boy;
  Object.assign(VA.Data.CHARS.player, look);
};
/* Dev mode: asset-filename chips + the full home-souvenir preview (see
   VA.State.allHomeSouvenirsPreview). Toggled from Settings or Ctrl+Alt+D. */
VA.toggleDevLabels = force => {
  const s = VA.State.data.settings;
  s.labels = force != null ? force : !s.labels;
  VA.State.save();
  VA.$('#stage').classList.toggle('no-labels', !s.labels);
  if (VA.Screens.current === 'home') VA.UI.home();
  return s.labels;
};
VA.shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
VA.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- save state ---------- */
VA.State = {
  data: null,

  fresh() {
    return {
      v: 1,
      name: '',
      playerLook: 'boy', // 'boy' | 'girl' — chosen once, before naming
      coins: 0,
      tripCount: 0,
      // current trip: { dest, done:[eventIds], souvenir:{...}|null, no }
      trip: null,
      // scrapbook: destId -> { photos:{eventId:photo}, souvenir, done, trip }
      book: {},
      // Gifts Grandma has received, keyed by destination + souvenir ID.
      // Each record contains the permanent in-house display assignment.
      homeGifts: {},
      stamps: [],
      checkpoint: 'title',
      finaleDone: false,
      settings: { music: true, sfx: true, voice: true, jp: true, labels: false },
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(VA.SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
      this.data.homeGifts = this.data.homeGifts || {};
      this._migrateHomeGifts();
    } catch (e) {
      this.data = this.fresh();
    }
    return this.data;
  },

  save() {
    try { localStorage.setItem(VA.SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },

  reset() {
    this.data = this.fresh();
    this.save();
  },

  hasSave() {
    return !!(this.data && this.data.name);
  },

  checkpoint(name) {
    this.data.checkpoint = name;
    this.save();
  },

  /* coins */
  addCoins(n) {
    this.data.coins = Math.max(0, this.data.coins + n);
    this.save();
    VA.HUD && VA.HUD.refresh(true);
  },

  /* trips */
  startTrip(destId) {
    this.data.trip = { dest: destId, done: [], souvenir: null, no: this.data.tripCount + 1 };
    // starting (or restarting) a destination clears its old scrapbook page
    this.data.book[destId] = { photos: {}, souvenir: null, done: false, trip: this.data.trip.no };
    this.save();
  },

  addPhoto(photo) {
    const t = this.data.trip;
    if (!t) return;
    if (!t.done.includes(photo.event)) t.done.push(photo.event);
    this.data.book[t.dest].photos[photo.event] = photo;
    this.save();
  },

  setSouvenir(souv) {
    const t = this.data.trip;
    if (!t) return;
    t.souvenir = souv;
    this.data.book[t.dest].souvenir = souv;
    this.save();
  },

  /* A souvenir becomes a permanent house gift when it is handed to Grandma.
     Keeping this separate from the trip means replaying a destination never
     removes an earlier present from her home. */
  giftSouvenir(souv, destId) {
    if (!souv || !destId) return;
    const dest = VA.Data.destById(destId);
    // Saves made before house displays existed contain a small souvenir
    // snapshot. Rehydrate it from the current destination data first.
    const source = (dest && dest.souvenirs.find(item => item.id === souv.id)) || souv;
    if (!source.home) return;
    const id = source.uid || `${destId}_${source.id}`;
    const home = source.home;
    this.data.homeGifts[id] = {
      id,
      souvenirId: source.id,
      destination: destId,
      destinationName: dest ? dest.name : destId,
      label: source.label,
      icon: source.icon,
      file: source.file,
      displayLocation: home.slot,
      displayPosition: { x: home.x, y: home.y, w: home.w || home.size, h: home.h || home.size, scale: home.scale || 1, rot: home.rot || 0 },
      unlocked: true,
      relatedMemoryEvent: source.memory && source.memory.event,
      relatedGrammarAnswer: source.memory && source.memory.answer,
      relatedGrammarJP: source.memory && source.memory.answerJP,
      grandmaDialogue: source.grandmaLine || `I like this ${source.label.toLowerCase()}.`,
    };
    this.save();
  },

  homeSouvenirs() {
    return Object.values(this.data.homeGifts || {}).filter(g => g.unlocked);
  },

  /* Current slot definitions take precedence over positions stored by an
     older save, so home-layout refinements immediately fix existing gifts. */
  homePlacement(gift) {
    const dest = VA.Data.destById(gift.destination);
    const source = dest && (dest.souvenirs || []).find(item => item.id === gift.souvenirId);
    const home = source && source.home;
    const saved = gift.displayPosition || {};
    return {
      x: home ? home.x : saved.x,
      y: home ? home.y : saved.y,
      w: (home && (home.w || home.size)) || saved.w || saved.size,
      h: (home && (home.h || home.size)) || saved.h || saved.size,
      scale: (home && home.scale) || saved.scale || 1,
      rot: (home && home.rot) || 0,
    };
  },

  /* Dev-mode preview (labels setting on): every possible home gift laid
     out at once, regardless of whether it's actually been earned yet, so
     shelf placement can be checked without playing through the whole game. */
  allHomeSouvenirsPreview() {
    const out = [];
    VA.Data.DESTS.forEach(dest => {
      (dest.souvenirs || []).forEach(source => {
        if (!source.home) return;
        const home = source.home;
        out.push({
          id: `${dest.id}_${source.id}`,
          souvenirId: source.id,
          destination: dest.id,
          destinationName: dest.name,
          label: source.label,
          icon: source.icon,
          file: source.file,
          displayLocation: home.slot,
          displayPosition: { x: home.x, y: home.y, w: home.w || home.size, h: home.h || home.size, scale: home.scale || 1, rot: home.rot || 0 },
          unlocked: true,
          relatedMemoryEvent: source.memory && source.memory.event,
          relatedGrammarAnswer: source.memory && source.memory.answer,
          relatedGrammarJP: source.memory && source.memory.answerJP,
          grandmaDialogue: source.grandmaLine || `I like this ${source.label.toLowerCase()}.`,
        });
      });
    });
    return out;
  },

  /* Existing save files already know which completed trip had which souvenir.
     Populate the new house collection once without treating un-gifted trips as
     gifts. */
  _migrateHomeGifts() {
    if (!VA.Data || !VA.Data.DESTS) return;
    let changed = false;
    VA.Data.DESTS.forEach(dest => {
      const page = this.data.book && this.data.book[dest.id];
      if (!page || !page.done || !page.souvenir) return;
      const id = page.souvenir.uid || `${dest.id}_${page.souvenir.id}`;
      if (!this.data.homeGifts[id]) {
        const before = Object.keys(this.data.homeGifts).length;
        this.giftSouvenir(page.souvenir, dest.id);
        changed = changed || Object.keys(this.data.homeGifts).length !== before;
      }
    });
    if (changed) this.save();
  },

  addStamp(destId) {
    if (!this.data.stamps.includes(destId)) {
      this.data.stamps.push(destId);
      this.save();
    }
  },

  completeTrip() {
    const t = this.data.trip;
    if (!t) return;
    this.data.book[t.dest].done = true;
    this.data.tripCount = t.no;
    this.data.trip = null;
    this.save();
  },

  allDone() {
    return VA.Data.DESTS.every(d => this.data.book[d.id] && this.data.book[d.id].done);
  },

  /* photos of the CURRENT trip, keyed by verb (for the debrief) */
  tripPhotos() {
    const t = this.data.trip;
    if (!t) return {};
    return this.data.book[t.dest].photos;
  },

  albumPhotos() {
    const out = [];
    for (const d of VA.Data.DESTS) {
      const page = this.data.book[d.id];
      if (!page) continue;
      for (const ev of Object.values(page.photos)) out.push(ev);
    }
    return out;
  },
};

/* ---------- screen manager ---------- */
VA.Screens = {
  current: null,

  async show(id, opts = {}) {
    const { transition = 'wipe', ready = null } = opts;
    const next = VA.$('#scr-' + id);
    const previous = this.current ? VA.$('#scr-' + this.current) : null;
    if (!next || next === previous) return next;

    // Country travel keeps its established fade-and-flight sequence exactly as
    // it was. Every other ordinary screen handoff uses the cream wipe below.
    if (transition === 'travel') {
      await Promise.all([
        VA.Art.waitForScreenAssets(next),
        Promise.resolve(ready),
      ]);
      await VA.Fx.fadeOut(170);
      VA.$$('.screen').forEach(s => s.classList.remove('active'));
      next.classList.add('active');
      this.current = id;
      await VA.Fx.fadeIn(170);
      return next;
    }

    const assetsReady = Promise.all([
      VA.Art.waitForScreenAssets(next),
      Promise.resolve(ready),
    ]);

    if (transition === 'home') {
      await assetsReady;
      return this._crossfadeTo(next, previous, id);
    }

    VA.$('#stage').classList.add('is-transitioning');
    await VA.Fx.wipeIn();
    await assetsReady;
    VA.$$('.screen').forEach(s => s.classList.remove('active'));
    next.classList.add('active');
    this.current = id;
    await VA.Fx.afterNextPaint();
    await VA.Fx.wipeOut();
    VA.$('#stage').classList.remove('is-transitioning');
    return next;
  },

  async _crossfadeTo(next, previous, id) {
    if (!previous) {
      next.classList.add('active');
      this.current = id;
      return next;
    }
    VA.$('#stage').classList.add('is-transitioning');
    next.classList.add('active');
    next.style.opacity = '0';
    next.style.zIndex = '2';
    previous.style.opacity = '1';
    previous.style.zIndex = '1';
    previous.style.transition = 'opacity 360ms ease-in-out';
    next.style.transition = 'opacity 360ms ease-in-out';
    await VA.Fx.afterNextPaint();
    previous.style.opacity = '0';
    next.style.opacity = '1';
    await VA.wait(380);
    VA.$$('.screen').forEach(s => {
      if (s !== next) s.classList.remove('active');
      s.style.opacity = '';
      s.style.zIndex = '';
      s.style.transition = '';
    });
    VA.$('#stage').classList.remove('is-transitioning');
    this.current = id;
    return next;
  },
};

/* ---------- one-off visual FX ---------- */
VA.Fx = {
  afterNextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },
  async wipeIn(ms = 200) {
    const wipe = VA.$('#scene-wipe');
    wipe.style.transition = 'none';
    wipe.style.transform = 'translateX(-100%)';
    void wipe.offsetWidth;
    wipe.style.transition = `transform ${ms}ms cubic-bezier(.45,0,.25,1)`;
    wipe.style.transform = 'translateX(0)';
    await VA.wait(ms + 20);
  },
  async wipeOut(ms = 200) {
    const wipe = VA.$('#scene-wipe');
    wipe.style.transform = 'translateX(100%)';
    await VA.wait(ms + 20);
    wipe.style.transition = 'none';
    wipe.style.transform = 'translateX(-100%)';
  },
  fadeOut(ms = 300) {
    const f = VA.$('#fade');
    f.style.transitionDuration = ms + 'ms';
    f.classList.add('on');
    return VA.wait(ms + 20);
  },
  fadeIn(ms = 300) {
    const f = VA.$('#fade');
    f.style.transitionDuration = ms + 'ms';
    f.classList.remove('on');
    return VA.wait(ms + 20);
  },
  flash() {
    const f = VA.$('#flash');
    f.classList.remove('snap');
    void f.offsetWidth;
    f.classList.add('snap');
  },
  toast(text, ms = 1800) {
    const t = VA.$('#toast');
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
  },
  captionBig(text, ms = 1200) {
    const c = VA.$('#caption-big');
    c.textContent = text;
    c.style.display = 'block';
    clearTimeout(this._capTimer);
    this._capTimer = setTimeout(() => { c.style.display = 'none'; }, ms);
  },

  /* emoji sparkles bursting inside a parent element (stage or cine world) */
  sparkles(parent, x, y, opts = {}) {
    const n = opts.n || 8, chars = opts.chars || ['✨', '⭐'];
    for (let i = 0; i < n; i++) {
      const s = VA.el('span', 'fx-sparkle', VA.pick(chars));
      s.style.left = (x + VA.rand(-46, 46)) + 'px';
      s.style.top  = (y + VA.rand(-38, 30)) + 'px';
      s.style.animationDelay = VA.rand(0, 0.35) + 's';
      parent.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  },

  hearts(parent, x, y, opts = {}) {
    const n = opts.n || 5;
    for (let i = 0; i < n; i++) {
      const h = VA.el('span', 'float-heart', VA.pick(['💛', '🧡', '💕']));
      h.style.left = (x + VA.rand(-40, 40)) + 'px';
      h.style.top  = (y + VA.rand(-10, 10)) + 'px';
      h.style.animationDelay = (i * 0.14) + 's';
      parent.appendChild(h);
      setTimeout(() => h.remove(), 2100);
    }
  },

  steam(parent, x, y, opts = {}) {
    const n = opts.n || 6;
    for (let i = 0; i < n; i++) {
      const p = VA.el('span', 'fx-steam');
      p.style.left = (x + VA.rand(-12, 12)) + 'px';
      p.style.top  = (y + VA.rand(-6, 6)) + 'px';
      p.style.animationDelay = (i * 0.22) + 's';
      parent.appendChild(p);
      setTimeout(() => p.remove(), 2200);
    }
  },

  /* fly a polaroid clone from stage center to the album HUD button */
  flyPolaroidToHud(polaroidEl) {
    const layer = VA.$('#fly-layer');
    const fly = VA.el('div', 'fly-polaroid');
    fly.appendChild(polaroidEl);
    fly.style.left = '400px'; fly.style.top = '180px';
    fly.style.transform = 'scale(1)';
    layer.appendChild(fly);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fly.style.left = '822px'; fly.style.top = '10px';
      fly.style.transform = 'scale(0.12)';
      fly.style.opacity = '0.25';
    }));
    setTimeout(() => fly.remove(), 900);
    return VA.wait(850);
  },

  /* passport stamp slam in the middle of the screen */
  async stampSlam(destId) {
    const layer = VA.$('#stamp-layer');
    const wrap = VA.el('div', 'stamp-slam');
    wrap.appendChild(VA.Art.stampEl(destId));
    layer.appendChild(wrap);
    VA.Audio.sfx('stamp');
    await VA.wait(1400);
    wrap.style.transition = 'opacity .4s';
    wrap.style.opacity = '0';
    setTimeout(() => wrap.remove(), 450);
  },
};

/* ---------- stage scaling ---------- */
VA.Stage = {
  fit() {
    const stage = VA.$('#stage');
    // Fill the available viewport. The former 12px safety margin exposed the
    // dark page background as two distracting vertical strips beside the intro.
    const s = Math.min(window.innerWidth / VA.W, window.innerHeight / VA.H);
    stage.style.transform = 'scale(' + Math.min(s, 1.6) + ')';
  },
  init() {
    this.fit();
    window.addEventListener('resize', () => this.fit());
  },
};
