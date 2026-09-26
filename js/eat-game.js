/* ============================================================
   eat-game.js — the student actually eats the food.

   Cinematic step: {eatGame:{shape:'icecream', illustration:'icecream.webp', bites:3}}

   The food is shown large; every bite cuts a visible piece out of
   it (CSS mask holes).  TAP TO EAT is the reliable fallback until
   webcam eating is active, and returns if it stalls.  The front webcam
   (VA.CameraMouth) starts by default unless Settings turns it off.
   Mouth bites and taps count toward the same total.
   ============================================================ */
'use strict';

VA.EatGame = {
  /* Bite geometry per food, cumulative per bite: x/y are fractions of the
     illustration box, r a fraction of its width.  The last stage leaves
     what a finished snack leaves: an empty cone, a clean plate, a bare
     skewer (the plate and skewer are redrawn underneath, see styles.css). */
  SHAPES: {
    icecream: [
      [{ x: .80, y: .06, r: .24 }, { x: .60, y: .02, r: .16 }],
      [{ x: .22, y: .10, r: .26 }, { x: .45, y: .16, r: .20 }],
      [{ x: .50, y: .20, r: .56 }, { x: .10, y: .40, r: .12 }, { x: .90, y: .40, r: .12 }],
    ],
    // Holes stay inside the plate's rim; the underlay redraws its cream
    // centre and pink ring, so the last bite leaves a clean plate.
    crepe: [
      [{ x: .15, y: .39, r: .08 }, { x: .20, y: .34, r: .07 }, { x: .19, y: .46, r: .08 }],
      [{ x: .30, y: .41, r: .11 }, { x: .30, y: .56, r: .10 }, { x: .37, y: .32, r: .07 }, { x: .42, y: .63, r: .08 }],
      [{ x: .52, y: .47, r: .20 }, { x: .70, y: .34, r: .11 }, { x: .62, y: .64, r: .11 }, { x: .78, y: .42, r: .09 },
       { x: .46, y: .35, r: .09 }, { x: .57, y: .73, r: .05 }, { x: .80, y: .28, r: .05 }, { x: .50, y: .66, r: .08 },
       { x: .74, y: .55, r: .07 }, { x: .62, y: .30, r: .07 }],
    ],
    // Eaten from the pointed end up; the skewer is redrawn underneath.
    kebab: [
      [{ x: .20, y: .68, r: .13 }, { x: .17, y: .76, r: .08 }, { x: .30, y: .64, r: .08 }, { x: .28, y: .73, r: .07 }, { x: .23, y: .80, r: .06 }],
      [{ x: .33, y: .60, r: .10 }, { x: .41, y: .52, r: .11 }, { x: .50, y: .44, r: .10 }, { x: .42, y: .62, r: .07 },
       { x: .52, y: .60, r: .07 }, { x: .50, y: .67, r: .05 }, { x: .45, y: .67, r: .05 }, { x: .36, y: .70, r: .045 }],
      [{ x: .58, y: .37, r: .12 }, { x: .69, y: .29, r: .12 }, { x: .78, y: .20, r: .10 }, { x: .64, y: .44, r: .08 },
       { x: .64, y: .52, r: .06 }, { x: .73, y: .44, r: .06 }, { x: .53, y: .52, r: .06 }, { x: .83, y: .30, r: .04 }, { x: .60, y: .58, r: .05 }],
    ],
  },
  WORDS: ['CHOMP!'],
  START_TIMEOUT_MS: 8000,
  REMINDER_MS: 6000,
  STALL_MS: 10000,

  _session: null,
  _snapshot: { active: false, bites: 0, needed: 0, taps: 0, cameraBites: 0, camera: 'off', message: '', faceSeen: false, mouth: 'unknown', tutorial: false, reminder: false, tapFallback: false, done: false },

  state() {
    const s = this._session ? this._session.publicState : this._snapshot;
    return JSON.parse(JSON.stringify(s));
  },

  play(cfg = {}, cine) {
    if (this._session) this._session.cleanup(false);
    VA.Dialogue.hide();
    const screen = VA.$('#scr-cine');
    if (!screen) return Promise.resolve();

    const shape = this.SHAPES[cfg.shape] || this.SHAPES.icecream;
    const needed = Math.max(1, Math.min(cfg.bites || shape.length, shape.length));
    const ui = this._buildUI(cfg);
    screen.appendChild(ui.root);

    const publicState = {
      active: true, bites: 0, needed, taps: 0, cameraBites: 0,
      camera: 'off', message: '', faceSeen: false, mouth: 'unknown', tutorial: false, reminder: false, tapFallback: true, done: false,
    };

    return new Promise(resolve => {
      const s = {
        cfg, cine, screen, ui, shape, needed, publicState, resolve,
        active: true, lastBiteAt: -Infinity, timers: new Set(), holes: [], reminderDisabled: false,
        tapFallbackEnabled: true, stallTimer: null,
      };
      s.cleanup = done => this._cleanup(s, done);
      this._session = s;
      this._bind(s);
      this._render(s);
      this._maybeAutoCamera(s);
      // Leaving the cinematic mid-meal (e.g. a test or a screen change)
      // must never leave the camera running.
      s.watch = setInterval(() => {
        if (!s.screen.classList.contains('active') || (VA.Screens.current && VA.Screens.current !== 'cine')) s.cleanup(false);
      }, 400);
    });
  },

  _buildUI(cfg) {
    const root = VA.el('div', 'eat-game' + (VA.reducedMotion ? ' reduced-motion' : ''));
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Eat');
    const title = VA.el('div', 'eat-title', 'EAT! 😋');
    const tutorial = VA.el('div', 'eat-tutorial');
    tutorial.hidden = true;
    const tutorialText = VA.el('div', 'eat-tutorial-text', '口をあけて、とじてね！');
    const demo = VA.el('div', 'eat-mouth-demo');
    demo.setAttribute('aria-label', '口をあけて、とじる mouth demo');
    demo.append(VA.el('span', 'eat-demo-face'), VA.el('span', 'eat-demo-chomp', 'CHOMP!'));
    tutorial.append(tutorialText, demo);
    const stage = VA.el('div', 'eat-food-stage eat-food-' + (cfg.shape || 'icecream'));
    const underlay = VA.el('div', 'eat-underlay');
    const food = document.createElement('img');
    food.className = 'eat-food';
    food.alt = cfg.word || 'Food';
    food.src = 'assets/objects/' + (cfg.illustration || 'icecream.webp');
    const pop = VA.el('div', 'eat-pop');
    const crumbs = VA.el('div', 'eat-crumbs');
    stage.append(underlay, food, crumbs, pop);
    const dots = VA.el('div', 'eat-dots');
    const tap = VA.el('button', 'eat-tap', 'TAP TO EAT');
    tap.type = 'button';
    tap.append(VA.el('span', 'eat-tap-keys', 'Space / Enter'));
    tap.setAttribute('aria-label', 'TAP TO EAT. Space or Enter');
    tap.setAttribute('aria-keyshortcuts', 'Space Enter');

    const cameraArea = VA.el('div', 'eat-camera-area');
    cameraArea.hidden = true;
    const cam = VA.el('div', 'eat-cam');
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    const face = VA.el('span', 'eat-cam-face', '○');
    cam.append(video, face);
    const status = VA.el('div', 'eat-status');
    cameraArea.append(cam, status);

    root.append(VA.el('div', 'eat-backdrop'), title, tutorial, stage, dots, cameraArea, tap);
    return { root, title, tutorial, stage, food, pop, crumbs, dots, tap, cameraArea, cam, video, face, status };
  },

  _cameraOffered() {
    const settings = VA.State.data && VA.State.data.settings;
    return VA.CameraMouth.isSupported() && !(settings && settings.camera === false);
  },

  _setTapFallback(s, enabled) {
    if (!s || !s.ui || !s.ui.tap) return;
    s.tapFallbackEnabled = !!enabled;
    s.publicState.tapFallback = s.tapFallbackEnabled;
    s.ui.tap.hidden = !s.tapFallbackEnabled;
    s.ui.tap.disabled = !s.tapFallbackEnabled || s.publicState.done;
  },

  _bind(s) {
    s.onTap = () => {
      if (!s.tapFallbackEnabled) return;
      this._bite(s, 'tap');
    };
    s.onKey = event => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
      // A focused button already turns Space/Enter into its own click.
      if (event.target && event.target.tagName === 'BUTTON') return;
      if (!s.tapFallbackEnabled) return;
      event.preventDefault();
      this._bite(s, 'tap');
    };
    s.ui.tap.addEventListener('click', s.onTap);
    document.addEventListener('keydown', s.onKey);
  },

  _later(s, ms, fn) {
    const timer = setTimeout(() => { s.timers.delete(timer); if (s.active) fn(); }, ms);
    s.timers.add(timer);
    return timer;
  },

  _status(s, text) {
    s.publicState.message = text || '';
    s.ui.status.textContent = text || '';
    s.ui.status.hidden = !text;
  },

  _showTutorial(s, reminder = false) {
    if (!s.active || s.publicState.camera === 'off' || s.publicState.camera === 'failed') return;
    s.publicState.tutorial = !reminder;
    s.publicState.reminder = reminder;
    s.ui.tutorial.classList.toggle('is-reminder', reminder);
    s.ui.tutorial.classList.remove('fade-out');
    s.ui.tutorial.hidden = false;
  },

  _hideTutorial(s, fade = false) {
    s.publicState.tutorial = false;
    s.publicState.reminder = false;
    if (fade && !VA.reducedMotion) {
      s.ui.tutorial.classList.add('fade-out');
      this._later(s, 350, () => { s.ui.tutorial.hidden = true; });
    } else s.ui.tutorial.hidden = true;
  },

  _scheduleReminder(s) {
    if (s.reminderDisabled || !VA.State.data.guides.eating || s.publicState.camera !== 'on') return;
    this._later(s, this.REMINDER_MS, () => {
      if (!s.reminderDisabled && s.publicState.camera === 'on' && !s.publicState.done) this._showTutorial(s, true);
    });
  },

  /* ---------- bites ---------- */
  _bite(s, source) {
    if (!s.active || s.publicState.done) return;
    const now = performance.now();
    if (now - s.lastBiteAt < 250) return; // a double-tap is one bite, and each bite gets its moment
    s.lastBiteAt = now;
    const p = s.publicState;
    p.bites++;
    if (source === 'camera') {
      p.cameraBites++;
      this._setTapFallback(s, false);
      this._scheduleStallFallback(s);
      if (!VA.State.data.guides.eating) {
        VA.State.data.guides.eating = true;
        VA.State.save();
      }
      this._hideTutorial(s, true);
      this._scheduleReminder(s);
    } else {
      p.taps++;
      s.reminderDisabled = true;
      if (p.reminder) this._hideTutorial(s);
    }
    s.holes = s.holes.concat(s.shape[p.bites - 1] || []);
    VA.Audio.sfx('bite');
    this._render(s);
    // The big CHOMP! pop over the food is the bite feedback; the prompt
    // stays "EAT!" so the word never shows twice.
    this._burst(s, s.shape[p.bites - 1] || []);
    if (p.bites >= s.needed) {
      if (source === 'tap' && p.camera === 'on' && !VA.State.data.guides.eating) {
        VA.State.data.guides.eating = true;
        VA.State.save();
      }
      this._finish(s);
    }
  },

  _render(s) {
    const { food, dots } = s.ui;
    dots.textContent = '';
    for (let i = 0; i < s.needed; i++) {
      dots.appendChild(VA.el('span', 'eat-dot' + (i < s.publicState.bites ? ' eaten' : '')));
    }
    s.ui.stage.dataset.bites = s.publicState.bites;
    if (!s.holes.length) { food.style.maskImage = food.style.webkitMaskImage = ''; return; }
    const apply = () => {
      const w = food.offsetWidth;
      if (!w) return false;
      const mask = s.holes.map(h =>
        `radial-gradient(circle ${Math.round(h.r * w)}px at ${h.x * 100}% ${h.y * 100}%, transparent 97%, #000 100%)`
      ).join(', ');
      food.style.webkitMaskImage = mask;
      food.style.maskImage = mask;
      return true;
    };
    if (!apply()) food.addEventListener('load', apply, { once: true });
  },

  _burst(s, holes) {
    const { pop, crumbs, stage } = s.ui;
    const words = this.WORDS;
    pop.textContent = words[(s.publicState.bites - 1) % words.length];
    pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
    stage.classList.remove('chomp'); void stage.offsetWidth; stage.classList.add('chomp');
    if (VA.reducedMotion) return;
    const at = holes[0] || { x: .5, y: .5 };
    crumbs.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const crumb = VA.el('i', 'eat-crumb');
      crumb.style.left = at.x * 100 + '%';
      crumb.style.top = at.y * 100 + '%';
      crumb.style.setProperty('--dx', VA.rand(-90, 90) + 'px');
      crumb.style.setProperty('--dy', VA.rand(30, 130) + 'px');
      crumb.style.animationDelay = VA.rand(0, .08) + 's';
      crumbs.appendChild(crumb);
    }
  },

  _finish(s) {
    s.publicState.done = true;
    this._setTapFallback(s, false);
    this._stopCamera(s, '');
    this._hideTutorial(s);
    s.ui.title.textContent = 'All gone! 😋';
    s.ui.root.classList.add('is-done');
    this._later(s, 350, () => VA.Audio.sfx('chime'));
    this._later(s, 1400, () => s.cleanup(true));
  },

  /* ---------- camera (default when supported and enabled) ---------- */
  async _maybeAutoCamera(s) {
    if (this._cameraOffered()) this._startCamera(s);
  },

  async _startCamera(s) {
    if (!s.active || s.publicState.done || s.publicState.camera !== 'off') return;
    const p = s.publicState;
    p.camera = 'starting';
    this._setTapFallback(s, true);
    s.ui.cameraArea.hidden = false;
    this._status(s, '📷 Camera starting…');
    if (!VA.State.data.guides.eating) this._showTutorial(s);
    const timeout = this._later(s, this.START_TIMEOUT_MS, () => {
      if (p.camera !== 'starting') return;
      p.camera = 'failed';
      this._setTapFallback(s, true);
      VA.CameraMouth.stop();
      s.ui.cameraArea.hidden = true;
      this._hideTutorial(s);
      this._status(s, '');
    });
    try {
      await VA.CameraMouth.start({
        videoEl: s.ui.video,
        onBite: () => this._bite(s, 'camera'),
        onStatus: status => {
          if (!s.active) return;
          const seen = status === 'face';
          s.ui.cam.classList.toggle('has-face', seen);
          p.faceSeen = p.faceSeen || seen;
          if (!seen) {
            p.mouth = 'unknown';
            s.ui.face.textContent = '○';
            this._status(s, 'Show your face 🙂');
          }
        },
        onFrame: detail => {
          if (!s.active || !detail.face) return;
          const openness = detail.openness;
          p.mouth = openness >= VA.CameraMouth.OPEN ? 'open' : openness > VA.CameraMouth.CLOSE ? 'opening' : 'closed';
          s.ui.face.textContent = p.mouth === 'open' ? '●' : p.mouth === 'opening' ? '◔' : '○';
          this._status(s, '');
        },
      });
    } catch (reason) {
      if (!s.active || reason === 'cancelled') return;
      p.camera = 'failed';
      this._setTapFallback(s, true);
      s.timers.delete(timeout); clearTimeout(timeout);
      s.ui.cameraArea.hidden = true;
      this._hideTutorial(s);
      this._status(s, '');
      return;
    }
    if (!s.active || p.done || p.camera !== 'starting') { VA.CameraMouth.stop(); return; }
    p.camera = 'on';
    this._setTapFallback(s, false);
    s.timers.delete(timeout); clearTimeout(timeout);
    if (!p.faceSeen) this._status(s, 'Show your face 🙂');
    this._scheduleReminder(s);
    this._scheduleStallFallback(s);
  },

  _scheduleStallFallback(s) {
    if (s.stallTimer) {
      s.timers.delete(s.stallTimer);
      clearTimeout(s.stallTimer);
    }
    s.stallTimer = this._later(s, this.STALL_MS, () => {
      s.stallTimer = null;
      if (s.publicState.camera === 'on' && !s.publicState.done) this._setTapFallback(s, true);
    });
  },

  _stopCamera(s, message) {
    VA.CameraMouth.stop();
    const p = s.publicState;
    if (p.camera === 'starting' || p.camera === 'on') p.camera = 'off';
    if (!p.done) this._setTapFallback(s, true);
    s.ui.cameraArea.hidden = true;
    if (message != null) this._status(s, message);
  },

  _cleanup(s, done) {
    if (!s.active) return;
    s.active = false;
    VA.CameraMouth.stop();
    clearInterval(s.watch);
    s.timers.forEach(clearTimeout);
    s.timers.clear();
    document.removeEventListener('keydown', s.onKey);
    s.ui.tap.removeEventListener('click', s.onTap);
    s.ui.root.remove();
    s.publicState.active = false;
    if (s.publicState.camera !== 'failed') s.publicState.camera = 'off';
    this._snapshot = JSON.parse(JSON.stringify(s.publicState));
    if (this._session === s) this._session = null;
    if (done) s.resolve();
  },
};
