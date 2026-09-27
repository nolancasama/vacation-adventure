/* ============================================================
   sand-game.js — the student builds the Egypt sand pyramid by hand.

   Cinematic step: {sandGame:{pyramidId:'pyr', flagId:'flag'}}

   SCOOP → PACK → REVEAL → SMOOTH → FLAG, all pointer drags (mouse,
   touch, pen, touchpad click-drag).  No timer, no score, no failure:
   a missed drop just slides back.  Everything is laid out in stage
   (world) px on a layer inside #cine-world, so the cinematic camera
   zoom and the stage fit-scale both apply to visuals and hit tests
   alike.  The finished pyramid and flag are the scene's own props,
   left exactly where the old tap game put them (the photo reads them).
   ============================================================ */
'use strict';

VA.SandGame = {
  // Final pyramid: sand_pyramid.webp at 2.5× its prop size (as before).
  GROW_TO: 2.5,
  BUILD: { x: 480, y: 470 },           // centre of the build spot on the sand
  MOUND_BASE_Y: 488,                   // the pyramid art's visible base line
  // Open sand only: the backdrop paints a real bucket + spade near (672, 489).
  PILES: [{ x: 130, y: 480 }, { x: 600, y: 580 }, { x: 620, y: 388 }],
  PILE_GRAB: 60,
  PILE_SNAP: 115,
  // Mound size after 0..3 piles (stage px).
  MOUND: [{ w: 0, h: 0 }, { w: 66, h: 26 }, { w: 102, h: 40 }, { w: 136, h: 56 }],
  PACKS: 3,
  BUCKET_REST_Y: 350,                  // bucket bottom while hovering above the mound
  BUCKET_COVER_Y: 494,                 // bucket bottom when it sits over the sand
  PACK_Y: 444,                         // bucket bottom this low (and near centre) packs
  PACK_X: 105,
  LIFT_PX: 120,                        // upward drag that starts the reveal
  LIFT_MS: 520,
  // Rough patches as fractions of the final pyramid art box.
  PATCHES: [
    { id: 'left', fx: 0.30, fy: 0.59 },
    { id: 'right', fx: 0.71, fy: 0.57 },
    { id: 'front', fx: 0.50, fy: 0.39 },
  ],
  PATCH_HIT: 30,
  RUB_PX: 60,
  FLAG_START: { x: 590, y: 545 },
  FLAG_SNAP: 95,
  ASSIST_MS: 4500,
  COPY: {
    scoop: ['SCOOP THE SAND!', 'すなをあつめてね！'],
    pack: ['PACK IT!', 'しっかりつめてね！'],
    reveal: ['LIFT THE BUCKET!', 'バケツを上にあげてね！'],
    smooth: ['SMOOTH THE SIDES!', 'きれいにしてね！'],
    flag: ['PUT ON THE FLAG!', 'はたを上においてね！'],
    complete: ['✨ COMPLETE! ✨', ''],
  },

  _session: null,
  _snapshot: { active: false, phase: 'idle', collected: 0, piles: [], packs: 0, lifted: false, patches: [], flagPlaced: false, assists: 0, done: false, rescued: false },

  state() {
    const s = this._session ? this._session.pub : this._snapshot;
    return JSON.parse(JSON.stringify(s));
  },

  /* Stage-space conversion through #cine-world's rendered box, which
     already includes the stage fit-scale and the cinematic camera.  Divide
     by the world's own layout size, not VA.W: below 960 CSS px of viewport
     the flex #app shrinks #stage's layout width. */
  clientToWorld(cx, cy) {
    const w = VA.Cine.world;
    const r = w.getBoundingClientRect();
    return { x: (cx - r.left) * (w.offsetWidth || VA.W) / r.width, y: (cy - r.top) * (w.offsetHeight || VA.H) / r.height };
  },
  worldToClient(x, y) {
    const w = VA.Cine.world;
    const r = w.getBoundingClientRect();
    return { x: r.left + x * r.width / (w.offsetWidth || VA.W), y: r.top + y * r.height / (w.offsetHeight || VA.H) };
  },

  /* Test/skip seam: the same safe ending an internal error takes. */
  finishNow() {
    if (this._session) this._rescue(this._session, null);
  },

  play(cfg = {}, cine = VA.Cine) {
    if (this._session) this._session.cleanup(false);
    VA.Dialogue.hide();
    return new Promise(resolve => {
      const s = {
        cfg, cine, resolve, active: true, timers: new Set(), drag: null, busy: false,
        pub: { active: true, phase: 'scoop', collected: 0, piles: [], packs: 0, lifted: false, patches: [], flagPlaced: false, assists: 0, done: false, rescued: false },
      };
      s.cleanup = done => this._cleanup(s, done);
      this._session = s;
      try {
        s.pyr = cine._target(cfg.pyramidId || 'pyr');
        s.flag = cine._target(cfg.flagId || 'flag');
        this._geometry(s);
        s.pub.flagTarget = { ...s.geo.flag };
        this._build(s);
        this._bind(s);
        this._enter(s, 'scoop');
      } catch (err) {
        this._rescue(s, err);
        return;
      }
      // Leaving the cinematic mid-build (a test or a screen change) must not
      // leave the layer or listeners behind.
      s.watch = setInterval(() => {
        const screen = VA.$('#scr-cine');
        if (!screen || !screen.classList.contains('active') || (VA.Screens.current && VA.Screens.current !== 'cine')) s.cleanup(false);
      }, 400);
    });
  },

  /* Final pyramid box and flag spot, derived the same way the old tap game
     sized them so the saved photo composition is unchanged. */
  _geometry(s) {
    const pyr = s.pyr;
    const x = parseFloat(pyr.style.left) || 480;
    const ground = parseFloat(pyr.style.top) || 520;
    const h = Number(pyr.dataset.renderHeight || 57) * this.GROW_TO;
    const top = ground - h;
    s.geo = {
      x, ground, h, top,
      apex: { x, y: top + h * 0.21 },
      flag: { x: x + 12, y: top + 54 },
      patches: this.PATCHES.map(p => ({ id: p.id, x: x + (p.fx - 0.5) * h, y: top + p.fy * h })),
    };
  },

  _build(s) {
    const layer = VA.el('div', 'sand-game' + (VA.reducedMotion ? ' reduced-motion' : ''));
    layer.setAttribute('aria-label', 'Build a sand pyramid');
    const spot = VA.el('div', 'sand-build-spot');
    this._place(spot, this.BUILD.x, this.BUILD.y + 8);
    const mound = VA.el('div', 'sand-mound');
    mound.style.left = this.BUILD.x + 'px';
    mound.style.top = this.MOUND_BASE_Y + 'px';
    layer.append(spot, mound);
    const piles = this.PILES.map((p, i) => {
      const el = VA.el('div', 'sand-pile');
      el.appendChild(VA.el('div', 'sand-pile-body'));
      el.dataset.index = i;
      this._place(el, p.x, p.y);
      layer.appendChild(el);
      s.pub.piles.push({ placed: false, x: p.x, y: p.y });
      return { el, home: { ...p }, x: p.x, y: p.y, placed: false };
    });
    const flagSpot = VA.el('div', 'sand-flag-spot');
    flagSpot.hidden = true;
    this._place(flagSpot, s.geo.apex.x, s.geo.apex.y);
    layer.appendChild(flagSpot);

    const prompt = VA.el('div', 'sand-prompt');
    prompt.setAttribute('role', 'status');
    prompt.setAttribute('aria-live', 'polite');
    const en = VA.el('div', 'sand-prompt-en');
    const jp = VA.el('div', 'sand-prompt-jp');
    prompt.append(en, jp);

    s.cine.world.appendChild(layer);
    VA.$('#scr-cine').appendChild(prompt);
    s.ui = { layer, spot, mound, flagSpot, prompt, en, jp };
    s.piles = piles;
    s.patches = [];
  },

  _place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; },

  _bind(s) {
    const L = s.ui.layer;
    const guard = fn => e => { if (!s.active) return; try { fn(e); } catch (err) { this._rescue(s, err); } };
    s.onDown = guard(e => this._down(s, e));
    s.onMove = guard(e => this._move(s, e));
    s.onUp = guard(e => this._up(s, e, false));
    s.onCancel = guard(e => this._up(s, e, true));
    L.addEventListener('pointerdown', s.onDown);
    L.addEventListener('pointermove', s.onMove);
    L.addEventListener('pointerup', s.onUp);
    L.addEventListener('pointercancel', s.onCancel);
    L.addEventListener('lostpointercapture', s.onCancel);
  },

  _enter(s, phase) {
    s.pub.phase = phase;
    s.ui.layer.dataset.phase = phase;
    const [en, jp] = this.COPY[phase] || ['', ''];
    s.ui.en.textContent = en;
    s.ui.jp.textContent = jp;
    s.ui.prompt.hidden = !en;
    s.ui.prompt.classList.remove('pop'); void s.ui.prompt.offsetWidth; s.ui.prompt.classList.add('pop');
    this._armAssist(s);
  },

  _later(s, ms, fn) {
    const t = setTimeout(() => {
      s.timers.delete(t);
      if (!s.active) return;
      try { fn(); } catch (err) { this._rescue(s, err); }
    }, VA.reducedMotion ? Math.min(ms, 120) : ms);
    s.timers.add(t);
    return t;
  },

  /* ---------- first-action assist ---------- */
  _armAssist(s) {
    if (s.assistTimer) { clearTimeout(s.assistTimer); s.timers.delete(s.assistTimer); }
    s.assistTimer = this._later(s, this.ASSIST_MS, () => { s.assistTimer = null; this._assist(s); });
  },
  _stopAssist(s) {
    if (s.assistTimer) { clearTimeout(s.assistTimer); s.timers.delete(s.assistTimer); s.assistTimer = null; }
  },
  _nudge(el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1300);
  },
  _assist(s) {
    if (s.drag || s.busy) return;
    s.pub.assists++;
    const phase = s.pub.phase;
    if (phase === 'scoop') {
      const pile = s.piles.find(p => !p.placed);
      this._nudge(pile && pile.el, 'assist');
      this._nudge(s.ui.spot, 'assist');
    } else if (phase === 'pack') this._nudge(s.bucket, 'assist-down');
    else if (phase === 'reveal') this._nudge(s.bucket, 'assist-up');
    else if (phase === 'smooth') {
      const patch = s.patches.find(p => !p.done);
      this._nudge(patch && patch.el, 'assist');
    } else if (phase === 'flag') {
      this._nudge(s.flag, 'sand-assist');
      this._nudge(s.ui.flagSpot, 'assist');
    }
  },

  /* ---------- pointer routing ---------- */
  _down(s, e) {
    if (s.drag || s.busy) return;
    const p = this.clientToWorld(e.clientX, e.clientY);
    const phase = s.pub.phase;
    let drag = null;
    if (phase === 'scoop') {
      const pile = s.piles
        .filter(pl => !pl.placed && Math.hypot(pl.x - p.x, pl.y - p.y) <= this.PILE_GRAB)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (pile) {
        drag = { kind: 'pile', pile, dx: pile.x - p.x, dy: pile.y - p.y };
        pile.el.style.transition = 'none';
        pile.el.classList.add('dragging');
      }
    } else if ((phase === 'pack' || phase === 'reveal') && s.bucket && !s.pub.lifted && this._onBucket(s, p)) {
      drag = { kind: phase, dx: s.bx - p.x, dy: s.by - p.y, y0: p.y };
      s.bucket.style.transition = 'none';
      s.bucket.classList.add('dragging');
    } else if (phase === 'smooth') {
      drag = { kind: 'rub', last: p };
    } else if (phase === 'flag' && this._onFlag(s, p)) {
      const f = this._flagPos(s);
      drag = { kind: 'flag', dx: f.x - p.x, dy: f.y - p.y };
      s.flag.style.transition = 'none';
      s.flag.classList.add('sand-dragging');
    }
    if (!drag) return;
    e.preventDefault();
    drag.pointerId = e.pointerId;
    s.drag = drag;
    this._stopAssist(s);
    try { s.ui.layer.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
  },

  _move(s, e) {
    const d = s.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const p = this.clientToWorld(e.clientX, e.clientY);
    if (d.kind === 'pile') {
      d.pile.x = VA.clamp(p.x + d.dx, 30, VA.W - 30);
      d.pile.y = VA.clamp(p.y + d.dy, 60, VA.H - 12);
      this._place(d.pile.el, d.pile.x, d.pile.y);
      s.ui.spot.classList.toggle('near', this._pileNear(d.pile));
    } else if (d.kind === 'pack') {
      s.bx = VA.clamp(p.x + d.dx, 180, 780);
      s.by = VA.clamp(p.y + d.dy, 240, this.BUCKET_COVER_Y + 6);
      this._placeBucket(s);
      const aimed = Math.abs(s.bx - this.BUILD.x) <= this.PACK_X;
      s.ui.mound.classList.toggle('near', aimed && s.by >= this.PACK_Y - 60);
      if (aimed && s.by >= this.PACK_Y) this._pack(s);
    } else if (d.kind === 'reveal') {
      const lift = VA.clamp(d.y0 - p.y, 0, 220);
      s.by = this.BUCKET_COVER_Y - lift;
      this._placeBucket(s);
      if (lift >= this.LIFT_PX) this._reveal(s);
    } else if (d.kind === 'rub') {
      this._rub(s, d.last, p);
      d.last = p;
    } else if (d.kind === 'flag') {
      const x = VA.clamp(p.x + d.dx, 30, VA.W - 30);
      const y = VA.clamp(p.y + d.dy, 90, VA.H - 4);
      this._place(s.flag, x, y);
      s.ui.flagSpot.classList.toggle('near', this._flagNear(s));
    }
  },

  _up(s, e, cancelled) {
    const d = s.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    s.drag = null;
    try { s.ui.layer.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    if (d.kind === 'pile') this._dropPile(s, d.pile, cancelled);
    else if (d.kind === 'pack') this._settleBucket(s, this.BUCKET_REST_Y);
    else if (d.kind === 'reveal') this._settleBucket(s, this.BUCKET_COVER_Y);
    else if (d.kind === 'flag') this._dropFlag(s, cancelled);
    this._armAssist(s);
  },

  /* End a drag from inside (a pack or the reveal took over the bucket). */
  _endDrag(s) {
    const d = s.drag;
    s.drag = null;
    if (d) { try { s.ui.layer.releasePointerCapture(d.pointerId); } catch (_) { /* fine */ } }
  },

  /* ---------- SCOOP ---------- */
  _pileNear(pile) { return Math.hypot(pile.x - this.BUILD.x, pile.y - this.BUILD.y) <= this.PILE_SNAP; },

  _dropPile(s, pile, cancelled) {
    pile.el.classList.remove('dragging');
    s.ui.spot.classList.remove('near');
    if (!cancelled && this._pileNear(pile)) {
      pile.placed = true;
      const i = s.piles.indexOf(pile);
      s.pub.piles[i].placed = true;
      s.pub.collected++;
      pile.el.style.transition = 'left .16s ease-out, top .16s ease-out, opacity .22s ease .1s, transform .22s ease .1s';
      pile.x = this.BUILD.x; pile.y = this.BUILD.y;
      this._place(pile.el, pile.x, pile.y);
      pile.el.classList.add('merged');
      VA.Audio.sfx('pop');
      this._dust(s, this.BUILD.x, this.MOUND_BASE_Y - 10, 7);
      this._setMound(s, s.pub.collected);
      if (s.pub.collected >= this.PILES.length) {
        s.busy = true;
        this._later(s, 520, () => { s.busy = false; this._startPack(s); });
      }
    } else {
      // No "wrong": the sand just slides home.
      pile.el.style.transition = 'left .32s cubic-bezier(.3,1.3,.5,1), top .32s cubic-bezier(.3,1.3,.5,1)';
      pile.x = pile.home.x; pile.y = pile.home.y;
      this._place(pile.el, pile.x, pile.y);
    }
    s.pub.piles.forEach((p, i) => { p.x = s.piles[i].x; p.y = s.piles[i].y; });
  },

  _setMound(s, n) {
    const m = this.MOUND[Math.min(n, this.MOUND.length - 1)];
    s.ui.mound.style.width = m.w + 'px';
    s.ui.mound.style.height = m.h + 'px';
    s.ui.mound.classList.remove('bump'); void s.ui.mound.offsetWidth; s.ui.mound.classList.add('bump');
  },

  /* ---------- PACK ---------- */
  _startPack(s) {
    s.ui.spot.classList.add('gone');
    const bucket = VA.el('div', 'sand-bucket');
    bucket.innerHTML = this._bucketSVG();
    s.ui.layer.appendChild(bucket);
    s.bucket = bucket;
    s.bx = this.BUILD.x; s.by = this.BUCKET_REST_Y;
    this._placeBucket(s);
    bucket.classList.add('pop-in');
    this._enter(s, 'pack');
  },

  _placeBucket(s) {
    s.bucket.style.left = s.bx + 'px';
    s.bucket.style.top = s.by + 'px';
  },

  _onBucket(s, p) {
    return p.x >= s.bx - 88 && p.x <= s.bx + 88 && p.y >= s.by - 140 && p.y <= s.by + 14;
  },

  _settleBucket(s, y, x = this.BUILD.x, ms = 340) {
    if (!s.bucket) return;
    s.bucket.classList.remove('dragging');
    s.ui.mound.classList.remove('near');
    s.bucket.style.transition = `left ${ms}ms cubic-bezier(.3,1.2,.5,1), top ${ms}ms cubic-bezier(.3,1.2,.5,1)`;
    s.bx = x; s.by = y;
    this._placeBucket(s);
  },

  _pack(s) {
    // One continuous press counts once: the drag ends here.
    this._endDrag(s);
    s.busy = true;
    s.pub.packs++;
    s.bucket.classList.remove('dragging');
    s.ui.mound.classList.remove('near');
    s.bucket.style.transition = 'left 90ms ease-in, top 90ms ease-in';
    s.bx = this.BUILD.x; s.by = this.MOUND_BASE_Y - 4;
    this._placeBucket(s);
    VA.Audio.sfx('thump');
    s.ui.mound.classList.add('pack-' + s.pub.packs);
    s.ui.mound.classList.remove('squash'); void s.ui.mound.offsetWidth; s.ui.mound.classList.add('squash');
    this._dust(s, this.BUILD.x, this.MOUND_BASE_Y - 4, 6);
    if (s.pub.packs >= this.PACKS) {
      this._later(s, 260, () => this._startReveal(s));
    } else {
      this._later(s, 230, () => {
        this._settleBucket(s, this.BUCKET_REST_Y, this.BUILD.x, 380);
        this._later(s, 300, () => { s.busy = false; this._armAssist(s); });
      });
    }
  },

  /* ---------- REVEAL ---------- */
  _startReveal(s) {
    // The mold settles over the packed sand; underneath, the sand becomes
    // the (still rough) pyramid, hidden until the bucket is lifted off it.
    this._settleBucket(s, this.BUCKET_COVER_Y, this.BUILD.x, 220);
    this._later(s, 230, () => {
      s.ui.mound.hidden = true;
      this._showPyramid(s, false);
      s.patches = s.geo.patches.map(p => {
        const el = VA.el('div', 'sand-rough sand-rough-' + p.id);
        this._place(el, p.x, p.y);
        s.ui.layer.insertBefore(el, s.bucket);
        s.pub.patches.push({ id: p.id, x: p.x, y: p.y, rub: 0, done: false });
        return { ...p, el, rub: 0, done: false };
      });
      s.busy = false;
      this._enter(s, 'reveal');
    });
  },

  _showPyramid(s, pulse) {
    const pyr = s.pyr;
    if (!pyr) return;
    const em = pyr.querySelector('.prop-emoji');
    const art = em && em.querySelector('img');
    if (art) art.style.height = s.geo.h + 'px';
    else if (em) em.style.fontSize = (Number(pyr.dataset.baseSize || 44) * this.GROW_TO) + 'px';
    pyr.style.visibility = 'visible';
    if (pulse) { pyr.classList.remove('grow-pulse'); void pyr.offsetWidth; pyr.classList.add('grow-pulse'); }
  },

  _reveal(s) {
    this._endDrag(s);
    s.busy = true;
    s.pub.lifted = true;
    this._stopAssist(s);
    const b = s.bucket;
    b.classList.remove('dragging');
    b.classList.add('lifting');
    b.style.transition = `top ${this.LIFT_MS}ms cubic-bezier(.3,.1,.3,1), opacity ${this.LIFT_MS * 0.5}ms ease ${this.LIFT_MS * 0.5}ms`;
    s.by = 150;
    this._placeBucket(s);
    b.style.opacity = '0';
    VA.Audio.sfx('whoosh');
    this._grains(s);
    this._later(s, this.LIFT_MS, () => {
      b.remove();
      s.bucket = null;
      this._showPyramid(s, true);
      VA.Fx.sparkles(s.ui.layer, s.geo.x, s.geo.apex.y + 30, { n: 10 });
      VA.Audio.sfx('chime');
      this._later(s, 380, () => { s.busy = false; this._enter(s, 'smooth'); });
    });
  },

  _grains(s) {
    for (let i = 0; i < 12; i++) {
      const g = VA.el('span', 'sand-grain');
      this._place(g, s.geo.x + VA.rand(-70, 70), this.BUCKET_COVER_Y - VA.rand(10, 70));
      g.style.animationDelay = VA.rand(0.05, 0.3) + 's';
      s.ui.layer.appendChild(g);
      setTimeout(() => g.remove(), 1100);
    }
  },

  _dust(s, x, y, n) {
    for (let i = 0; i < n; i++) {
      const d = VA.el('span', 'sand-dust');
      this._place(d, x + VA.rand(-50, 50), y + VA.rand(-8, 6));
      d.style.setProperty('--dx', VA.rand(-26, 26) + 'px');
      s.ui.layer.appendChild(d);
      setTimeout(() => d.remove(), 800);
    }
  },

  /* ---------- SMOOTH ---------- */
  /* Walk the drag segment in small steps so a quick swipe and a slow one
     both count; each step feeds only the nearest rough patch it touches. */
  _rub(s, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) return;
    const steps = Math.max(1, Math.ceil(len / 4));
    const stepLen = len / steps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      let best = null;
      let bestD = this.PATCH_HIT;
      s.patches.forEach(p => {
        if (p.done) return;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= bestD) { best = p; bestD = d; }
      });
      if (best) this._rubPatch(s, best, stepLen);
    }
  },

  _rubPatch(s, p, amount) {
    p.rub += amount;
    const i = s.patches.indexOf(p);
    s.pub.patches[i].rub = Math.round(p.rub);
    p.el.style.opacity = String(1 - 0.55 * Math.min(1, p.rub / this.RUB_PX));
    p.el.classList.add('rubbing');
    clearTimeout(p.rubTimer);
    p.rubTimer = setTimeout(() => p.el.classList.remove('rubbing'), 220);
    const now = performance.now();
    if (!s.lastBrush || now - s.lastBrush > 200) { s.lastBrush = now; VA.Audio.sfx('page'); }
    if (p.rub < this.RUB_PX) return;
    p.done = true;
    s.pub.patches[i].done = true;
    p.el.classList.add('gone');
    VA.Fx.sparkles(s.ui.layer, p.x, p.y, { n: 3 });
    if (s.patches.every(q => q.done)) {
      this._endDrag(s);
      s.busy = true;
      this._later(s, 420, () => { s.busy = false; this._startFlag(s); });
    }
  },

  /* ---------- FLAG ---------- */
  _startFlag(s) {
    s.patches.forEach(p => p.el.remove());
    this._place(s.flag, this.FLAG_START.x, this.FLAG_START.y);
    s.flag.style.visibility = 'visible';
    s.flag.classList.remove('pop-in-bottom'); void s.flag.offsetWidth; s.flag.classList.add('pop-in-bottom');
    s.ui.flagSpot.hidden = false;
    VA.Audio.sfx('pop');
    this._enter(s, 'flag');
  },

  _flagPos(s) { return { x: parseFloat(s.flag.style.left) || 0, y: parseFloat(s.flag.style.top) || 0 }; },

  _onFlag(s, p) {
    const f = this._flagPos(s);
    return p.x >= f.x - 48 && p.x <= f.x + 44 && p.y >= f.y - 84 && p.y <= f.y + 12;
  },

  _flagNear(s) {
    const f = this._flagPos(s);
    return Math.hypot(f.x - s.geo.flag.x, f.y - s.geo.flag.y) <= this.FLAG_SNAP;
  },

  _dropFlag(s, cancelled) {
    s.flag.classList.remove('sand-dragging');
    s.ui.flagSpot.classList.remove('near');
    if (!cancelled && this._flagNear(s)) {
      s.flag.style.transition = 'left .18s ease-out, top .18s ease-out';
      this._place(s.flag, s.geo.flag.x, s.geo.flag.y);
      this._complete(s);
    } else {
      s.flag.style.transition = 'left .32s cubic-bezier(.3,1.3,.5,1), top .32s cubic-bezier(.3,1.3,.5,1)';
      this._place(s.flag, this.FLAG_START.x, this.FLAG_START.y);
    }
  },

  _complete(s) {
    s.busy = true;
    s.pub.flagPlaced = true;
    this._stopAssist(s);
    s.ui.flagSpot.hidden = true;
    this._enter(s, 'complete');
    this._stopAssist(s);
    s.ui.prompt.hidden = true;
    VA.Audio.sfx('chime');
    VA.Fx.captionBig(this.COPY.complete[0], 1300);
    VA.Fx.sparkles(s.cine.world, s.geo.x, s.geo.apex.y, { n: 14 });
    s.pyr.classList.remove('grow-pulse'); void s.pyr.offsetWidth; s.pyr.classList.add('grow-pulse');
    this._later(s, 1400, () => { s.pub.done = true; s.cleanup(true); });
  },

  /* ---------- safety + cleanup ---------- */
  /* Never trap the player: an unexpected error jumps to the finished
     pyramid and flag so the story continues. */
  _rescue(s, err) {
    if (err) console.warn('[SandGame] finishing safely after error', err);
    try {
      if (!s.geo && s.pyr) this._geometry(s);
      if (s.geo) {
        this._showPyramid(s, false);
        if (s.flag) {
          s.flag.style.transition = 'none';
          s.flag.classList.remove('sand-dragging');
          this._place(s.flag, s.geo.flag.x, s.geo.flag.y);
          s.flag.style.visibility = 'visible';
        }
      }
    } catch (_) { /* best effort */ }
    s.pub.rescued = true;
    s.pub.done = true;
    s.pub.phase = 'complete';
    s.pub.flagPlaced = true;
    s.cleanup(true);
  },

  _cleanup(s, done) {
    if (!s.active) return;
    s.active = false;
    clearInterval(s.watch);
    s.timers.forEach(clearTimeout);
    s.timers.clear();
    s.assistTimer = null;
    (s.patches || []).forEach(p => clearTimeout(p.rubTimer));
    if (s.ui) {
      const L = s.ui.layer;
      if (s.drag) { try { L.releasePointerCapture(s.drag.pointerId); } catch (_) { /* fine */ } }
      L.removeEventListener('pointerdown', s.onDown);
      L.removeEventListener('pointermove', s.onMove);
      L.removeEventListener('pointerup', s.onUp);
      L.removeEventListener('pointercancel', s.onCancel);
      L.removeEventListener('lostpointercapture', s.onCancel);
      L.remove();
      s.ui.prompt.remove();
    }
    s.drag = null;
    if (s.flag) s.flag.classList.remove('sand-dragging', 'sand-assist');
    s.pub.active = false;
    this._snapshot = JSON.parse(JSON.stringify(s.pub));
    if (this._session === s) this._session = null;
    if (done) s.resolve();
  },

  /* An upside-down beach pail used as the pyramid mold. */
  _bucketSVG() {
    return '<div class="sand-bucket-body"><svg viewBox="0 0 160 132" width="160" height="132" aria-hidden="true">' +
      '<path d="M40 30 Q80 -6 120 30" fill="none" stroke="#f4c542" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M44 24 L116 24 L140 118 L20 118 Z" fill="#e8513f"/>' +
      '<path d="M44 24 L62 24 L50 118 L20 118 Z" fill="#ff7a5f" opacity=".55"/>' +
      '<rect x="36" y="18" width="88" height="12" rx="6" fill="#c63b2d"/>' +
      '<rect x="12" y="112" width="136" height="16" rx="8" fill="#f4c542"/>' +
      '<rect x="12" y="112" width="136" height="6" rx="3" fill="#ffe08a" opacity=".7"/>' +
      '<path d="M66 58 L80 44 L94 58 Z M58 82 L80 60 L102 82 Z" fill="#ffd9a0" opacity=".55"/>' +
      '</svg></div>';
  },
};
