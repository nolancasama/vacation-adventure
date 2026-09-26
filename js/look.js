/* ============================================================
   look.js — reusable player-controlled cinematic LOOK step.

   The view is expressed in unzoomed 960×600 stage coordinates. Pan mode
   drives #cine-world's translate/scale; tower mode maps view.y to the shared
   Eiffel source-image crop. All controls and feedback remain stage-fixed.
   ============================================================ */
'use strict';

VA.Look = {
  _session: null,
  _pendingToken: 0,
  _panoramaOverrides: {},
  _observeViews: {},
  _snapshot: {
    active: false, view: { x: 480, y: 300 }, zoom: 1,
    target: { x: 480, y: 300 }, distance: 0,
    dwellMs: 0, found: false, decoyShown: false,
    presentation: 'scene', panorama: null, loaded: false, usedFallback: false,
  },

  state() {
    const s = this._session ? this._session.publicState : this._snapshot;
    return JSON.parse(JSON.stringify(s));
  },

  _setPanoramaForTest(file, url) {
    if (url == null) delete this._panoramaOverrides[file];
    else this._panoramaOverrides[file] = url;
  },

  run(cfg = {}, cine) {
    if (this._session) this._session.cleanup(false);
    const token = ++this._pendingToken;
    VA.Dialogue.hide();

    const screen = VA.$('#scr-cine');
    const world = cine && cine.world;
    if (!screen || !world) return new Promise(() => {});

    if (cfg.presentation === 'observe') return this._prepareObserve(cfg, cine, token);
    return this._begin(cfg, cine, {});
  },

  async _prepareObserve(cfg, cine, token) {
    const panorama = cfg.panorama;
    const url = this._panoramaOverrides[panorama] || ('assets/backgrounds/' + panorama);
    const loaded = await this._loadPanorama(url, 2500);
    if (token !== this._pendingToken) return new Promise(() => {});
    if (!loaded) {
      console.info('[LOOK observe fallback]', panorama);
      // Scene prep that only the in-scene search needs (e.g. bring the target on stage).
      if (cfg.fallback && cfg.fallback.before) {
        await cine.play(cfg.fallback.before);
        if (token !== this._pendingToken) return new Promise(() => {});
      }
      return this._begin(cfg.fallback || {}, cine, {
        presentation: 'observe', panorama, loaded: false, usedFallback: true,
      });
    }
    return this._begin(cfg, cine, {
      presentation: 'observe', panorama, loaded: true, usedFallback: false, url,
    });
  },

  _loadPanorama(url, timeoutMs) {
    return new Promise(resolve => {
      const image = new Image();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.src = url;
    });
  },

  _begin(cfg, cine, meta) {
    const screen = VA.$('#scr-cine');
    const world = cine && cine.world;
    const isObserve = cfg.presentation === 'observe' && !meta.usedFallback;

    const mode = isObserve ? 'observe' : (cfg.mode === 'tower' ? 'tower' : 'pan');
    const axis = cfg.axis || 'xy';
    const observeSize = isObserve ? (cfg.size || { w: 3000, h: 1000 }) : null;
    const observeWindow = isObserve ? (cfg.window || { w: 1280, h: 800 }) : null;
    const zoom = mode === 'tower' ? 1 : (isObserve ? VA.W / observeWindow.w : Math.max(1.01, Number(cfg.s) || 1.35));
    const start = this._startView(cfg, mode);
    const bounds = isObserve ? { size: observeSize, window: observeWindow } : null;
    const view = this._clampView(start, zoom, mode, bounds);
    const allowed = {
      left: axis === 'x' || axis === 'xy', right: axis === 'x' || axis === 'xy',
      up: axis === 'y' || axis === 'xy', down: axis === 'y' || axis === 'xy',
    };
    const ui = this._buildUI(cfg, allowed, isObserve);
    let observe = null;
    if (isObserve) {
      observe = this._buildObserve(cfg, meta.url, observeSize, zoom);
      ui.root.insertBefore(observe.viewport, ui.root.firstChild);
    }
    screen.appendChild(ui.root);
    if (isObserve) requestAnimationFrame(() => {
      if (ui.root.isConnected) ui.root.classList.add('is-visible');
    });
    const targetInfo = this._resolveTarget(cfg, cine, mode, observe);

    const publicState = {
      active: true,
      view: { x: view.x, y: view.y },
      zoom,
      target: {
        x: axis === 'y' ? view.x : targetInfo.center.x,
        y: axis === 'x' ? view.y : targetInfo.center.y,
      },
      distance: 0,
      dwellMs: 0,
      found: false,
      decoyShown: false,
      presentation: meta.presentation || 'scene',
      panorama: meta.panorama || null,
      loaded: !!meta.loaded,
      usedFallback: !!meta.usedFallback,
    };

    return new Promise(resolve => {
      const session = {
        cfg, cine, screen, world, mode, axis, zoom, allowed, ui, view, bounds, observe,
        targetInfo, publicState, resolve, resolved: false, active: true,
        keys: new Set(), buttonDirs: new Set(), pointer: null,
        startedAt: performance.now(), lastFrame: performance.now(),
        insideSince: null, outsideSince: null, shownDecoys: new Set(),
        attractAt: 0, raf: 0, timers: new Set(), glide: null,
        moveSpeed: isObserve ? 720 : 300,
      };
      session.cleanup = found => this._cleanup(session, found);
      this._session = session;
      this._bind(session);
      this._applyView(session);
      this._frame(session, performance.now());
    });
  },

  _buildObserve(cfg, url, size, scale) {
    const viewport = VA.el('div', 'look-observe-viewport');
    const world = VA.el('div', 'look-observe-world');
    world.style.width = size.w + 'px';
    world.style.height = size.h + 'px';
    const image = document.createElement('img');
    image.className = 'look-observe-panorama';
    image.src = url;
    image.alt = '';
    image.draggable = false;
    world.appendChild(image);
    const sprites = {};
    (cfg.sprites || []).forEach(spec => {
      let el;
      if (spec.char && VA.Data.CHARS[spec.char]) {
        el = VA.Art.actorEl(spec.char, {
          x: spec.x, y: spec.footY, scale: (Number(spec.height) || 300) / 300,
          tag: false, bob: false, flip: !!spec.flip,
        });
        el.querySelector('.actor-chip')?.remove();
      } else {
        el = VA.el('div', 'actor');
        el.style.left = spec.x + 'px';
        el.style.top = spec.footY + 'px';
        const spriteImage = document.createElement('img');
        spriteImage.src = 'assets/characters/' + spec.file;
        spriteImage.style.height = (Number(spec.height) || 300) + 'px';
        spriteImage.alt = '';
        el.appendChild(spriteImage);
      }
      el.classList.add('look-observe-sprite');
      el.dataset.spriteId = spec.id;
      world.appendChild(el);
      sprites[spec.id] = {
        spec, el, x: Number(spec.x) || 0, footY: Number(spec.footY) || 0,
        height: Number(spec.height) || 300, direction: 1,
        pathStartedAt: performance.now(), pauseUntil: 0,
      };
    });
    viewport.appendChild(world);
    return { viewport, world, image, sprites, size, scale };
  },

  _resolveTarget(cfg, cine, mode, observe = null) {
    if (cfg.targetRect) return this._rectInfo(cfg.targetRect);
    if (mode === 'observe' && observe && cfg.target && observe.sprites[cfg.target]) {
      const sprite = observe.sprites[cfg.target];
      return this._rectInfo({ x: sprite.x, y: sprite.footY - sprite.height * .48, w: 0, h: 0 }, sprite.el);
    }
    const el = cfg.target && cine._target(cfg.target);
    if (!el) return this._rectInfo({ x: VA.W / 2, y: VA.H / 2, w: 0, h: 0 });
    const x = parseFloat(el.style.left) || VA.W / 2;
    let y = parseFloat(el.style.top) || VA.H / 2;
    // Actors are bottom-anchored. Aim at the visible body, not its feet.
    if (el.classList.contains('actor')) {
      const art = el.querySelector('.actor-pending-photo, .actor-breathe-sprite, svg');
      const h = art ? (parseFloat(art.style.height) || art.offsetHeight || 260) : 260;
      y -= h * .45;
    }
    return this._rectInfo({ x, y, w: 0, h: 0 }, el);
  },

  _rectInfo(rect, el = null) {
    const x = Number(rect.x) || 0, y = Number(rect.y) || 0;
    const w = Math.max(0, Number(rect.w) || 0), h = Math.max(0, Number(rect.h) || 0);
    return { rect: { x, y, w, h }, center: { x: x + w / 2, y: y + h / 2 }, el };
  },

  _startView(cfg, mode) {
    if (mode === 'tower') {
      const pct = cfg.startPct == null ? 100 : Number(cfg.startPct);
      return { x: VA.W / 2, y: VA.clamp(pct, 0, 100) * VA.H / 100 };
    }
    if (mode === 'observe') {
      if (cfg.start === 'previous' && this._observeViews[cfg.panorama]) {
        return { ...this._observeViews[cfg.panorama] };
      }
      return {
        x: cfg.start && Number.isFinite(Number(cfg.start.x)) ? Number(cfg.start.x) : 640,
        y: cfg.start && Number.isFinite(Number(cfg.start.y)) ? Number(cfg.start.y) : 500,
      };
    }
    return {
      x: cfg.start && Number.isFinite(Number(cfg.start.x)) ? Number(cfg.start.x) : VA.W / 2,
      y: cfg.start && Number.isFinite(Number(cfg.start.y)) ? Number(cfg.start.y) : VA.H / 2,
    };
  },

  _clampView(view, zoom, mode, bounds = null) {
    if (mode === 'tower') return { x: VA.W / 2, y: VA.clamp(view.y, 0, VA.H) };
    if (mode === 'observe') {
      const halfW = bounds.window.w / 2, halfH = bounds.window.h / 2;
      return {
        x: VA.clamp(view.x, halfW, bounds.size.w - halfW),
        y: VA.clamp(view.y, halfH, bounds.size.h - halfH),
      };
    }
    const padX = VA.W / (2 * zoom), padY = VA.H / (2 * zoom);
    return {
      x: VA.clamp(view.x, padX, VA.W - padX),
      y: VA.clamp(view.y, padY, VA.H - padY),
    };
  },

  _distanceTo(info, view, axis) {
    const r = info.rect;
    const dx = view.x < r.x ? r.x - view.x : (view.x > r.x + r.w ? view.x - r.x - r.w : 0);
    const dy = view.y < r.y ? r.y - view.y : (view.y > r.y + r.h ? view.y - r.y - r.h : 0);
    if (axis === 'x') return Math.abs(dx);
    if (axis === 'y') return Math.abs(dy);
    return Math.hypot(dx, dy);
  },

  _buildUI(cfg, allowed, isObserve = false) {
    const root = VA.el('div', 'look-mode' + (isObserve ? ' look-observe' : ''));
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', cfg.prompt || 'Look around');

    const chip = VA.el('div', 'look-instruction');
    if (isObserve) chip.appendChild(VA.el('span', 'look-instruction-label', 'LOOK AROUND'));
    chip.appendChild(VA.el('span', 'look-prompt', VA.escape(cfg.prompt || 'Look!')));
    const jp = cfg.promptJP || cfg.jp;
    if (jp && VA.State.data.settings.jp) {
      const reveal = VA.el('button', 'look-jp-reveal', '? 日本語');
      reveal.type = 'button';
      const jpText = VA.el('span', 'look-prompt-jp', VA.escape(jp));
      jpText.hidden = true;
      reveal.addEventListener('click', e => {
        e.stopPropagation();
        reveal.remove();
        jpText.hidden = false;
        VA.Audio.sfx('click');
      });
      chip.append(reveal, jpText);
    }
    root.appendChild(chip);

    const reticle = VA.el('div', 'look-reticle');
    reticle.setAttribute('aria-hidden', 'true');
    const ring = VA.el('div', 'look-dwell-ring');
    const mark = VA.el('div', 'look-reticle-mark', '○');
    reticle.append(ring, mark);
    root.appendChild(reticle);

    const hint = VA.el('div', 'look-hint-arrow', '➜');
    hint.hidden = true;
    root.appendChild(hint);

    const controls = VA.el('div', 'look-controls');
    const labels = { left: '←', right: '→', up: '↑', down: '↓' };
    Object.keys(labels).forEach(dir => {
      if (!allowed[dir]) return;
      const button = VA.el('button', 'look-dir look-dir-' + dir, labels[dir]);
      button.type = 'button';
      button.dataset.dir = dir;
      button.setAttribute('aria-label', 'Look ' + dir);
      controls.appendChild(button);
    });
    root.appendChild(controls);

    const show = VA.el('button', 'look-show', 'Show me 👀');
    show.type = 'button';
    show.hidden = true;
    root.appendChild(show);

    const decoy = VA.el('div', 'look-decoy');
    decoy.hidden = true;
    root.appendChild(decoy);
    return { root, reticle, ring, mark, hint, controls, show, decoy };
  },

  _bind(s) {
    const keyDir = key => ({
      ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    })[key];
    s.onKeyDown = e => {
      const dir = keyDir(e.key);
      if (!dir || !s.allowed[dir]) return;
      e.preventDefault();
      s.keys.add(dir);
    };
    s.onKeyUp = e => {
      const dir = keyDir(e.key);
      if (!dir) return;
      e.preventDefault();
      s.keys.delete(dir);
    };
    s.onBlur = () => { s.keys.clear(); s.buttonDirs.clear(); };
    s.onPointerDown = e => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      s.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      s.screen.setPointerCapture && s.screen.setPointerCapture(e.pointerId);
    };
    s.onPointerMove = e => {
      if (!s.pointer || e.pointerId !== s.pointer.id) return;
      e.preventDefault();
      const stageRect = VA.$('#stage').getBoundingClientRect();
      const scaleX = stageRect.width / VA.W || 1, scaleY = stageRect.height / VA.H || 1;
      const dx = (e.clientX - s.pointer.x) / scaleX / s.zoom;
      const dy = (e.clientY - s.pointer.y) / scaleY / s.zoom;
      s.pointer.x = e.clientX; s.pointer.y = e.clientY;
      this._move(s, dx, dy);
    };
    s.onPointerUp = e => {
      if (!s.pointer || e.pointerId !== s.pointer.id) return;
      s.pointer = null;
    };

    document.addEventListener('keydown', s.onKeyDown);
    document.addEventListener('keyup', s.onKeyUp);
    window.addEventListener('blur', s.onBlur);
    s.screen.addEventListener('pointerdown', s.onPointerDown);
    s.screen.addEventListener('pointermove', s.onPointerMove);
    s.screen.addEventListener('pointerup', s.onPointerUp);
    s.screen.addEventListener('pointercancel', s.onPointerUp);

    s.dirHandlers = [];
    s.ui.controls.querySelectorAll('.look-dir').forEach(button => {
      const dir = button.dataset.dir;
      const down = e => {
        e.preventDefault(); e.stopPropagation();
        s.buttonDirs.add(dir);
        this._moveDir(s, dir, 28);
        button.setPointerCapture && button.setPointerCapture(e.pointerId);
      };
      const up = e => { e.preventDefault(); e.stopPropagation(); s.buttonDirs.delete(dir); };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      s.dirHandlers.push({ button, down, up });
    });
    s.onShow = e => { e.stopPropagation(); this._showTarget(s); };
    s.ui.show.addEventListener('click', s.onShow);
  },

  _moveDir(s, dir, amount) {
    const d = { left: [-amount, 0], right: [amount, 0], up: [0, -amount], down: [0, amount] }[dir];
    if (d) this._move(s, d[0], d[1]);
  },

  _move(s, dx, dy) {
    if (!s.active || s.glide || s.completing) return;
    if (s.axis === 'x') dy = 0;
    if (s.axis === 'y') dx = 0;
    const next = this._clampView({ x: s.view.x + dx, y: s.view.y + dy }, s.zoom, s.mode, s.bounds);
    s.view.x = next.x; s.view.y = next.y;
    this._applyView(s);
  },

  _applyView(s) {
    if (s.mode === 'tower') {
      s.cine.setTowerView(s.view.y / VA.H * 100, 0);
    } else if (s.mode === 'observe') {
      const tx = VA.W / 2 - s.view.x * s.zoom;
      const ty = VA.H / 2 - s.view.y * s.zoom;
      s.observe.world.style.transform = `translate(${tx}px, ${ty}px) scale(${s.zoom})`;
    } else {
      let tx = VA.W / 2 - s.view.x * s.zoom;
      let ty = VA.H / 2 - s.view.y * s.zoom;
      tx = VA.clamp(tx, VA.W - VA.W * s.zoom, 0);
      ty = VA.clamp(ty, VA.H - VA.H * s.zoom, 0);
      s.world.style.transition = 'none';
      s.world.style.transform = `translate(${tx}px, ${ty}px) scale(${s.zoom})`;
    }
    s.publicState.view.x = s.view.x;
    s.publicState.view.y = s.view.y;
  },

  _frame(s, now) {
    if (!s.active) return;
    if (!s.screen.classList.contains('active') || (VA.Screens.current && VA.Screens.current !== 'cine')) {
      s.cleanup(false);
      return;
    }
    const dt = Math.min(50, Math.max(0, now - s.lastFrame));
    s.lastFrame = now;
    const held = new Set([...s.keys, ...s.buttonDirs]);
    const speed = s.moveSpeed * dt / 1000;
    held.forEach(dir => this._moveDir(s, dir, speed));
    this._updateSprites(s, now);
    this._updateTarget(s, now);
    if (!s.active) return;
    this._updateAssists(s, now);
    this._updateAttract(s, now);
    s.raf = requestAnimationFrame(t => this._frame(s, t));
  },

  _updateSprites(s, now) {
    if (!s.observe) return;
    Object.values(s.observe.sprites).forEach(sprite => {
      const path = sprite.spec.path;
      if (!path || VA.reducedMotion) return;
      const from = Number(path.from == null ? sprite.spec.x : path.from);
      const to = Number(path.to == null ? sprite.spec.x : path.to);
      const duration = Math.max(300, Number(path.duration) || 5200);
      const pause = Math.max(0, Number(path.pause) || 350);
      const leg = duration + pause;
      const cycle = leg * 2;
      const phase = (now - sprite.pathStartedAt) % cycle;
      let p;
      if (phase < duration) p = phase / duration;
      else if (phase < leg) p = 1;
      else if (phase < leg + duration) p = 1 - (phase - leg) / duration;
      else p = 0;
      sprite.x = from + (to - from) * p;
      sprite.el.style.left = sprite.x + 'px';
    });
    if (s.cfg.target && s.observe.sprites[s.cfg.target]) {
      const sprite = s.observe.sprites[s.cfg.target];
      s.targetInfo = this._rectInfo({
        x: sprite.x, y: sprite.footY - sprite.height * .48, w: 0, h: 0,
      }, sprite.el);
      s.publicState.target.x = s.axis === 'y' ? s.view.x : s.targetInfo.center.x;
      s.publicState.target.y = s.axis === 'x' ? s.view.y : s.targetInfo.center.y;
    }
  },

  _updateTarget(s, now) {
    if (s.completing) return;
    const distance = this._distanceTo(s.targetInfo, s.view, s.axis);
    const radius = Math.max(0, Number(s.cfg.radius) || 90);
    const inside = distance <= radius;
    // The public seam describes distance to the accepted target region, not
    // merely to its geometric centre. This remains useful when an edge target
    // (such as Coco near the bottom of a panorama) cannot be centred exactly.
    s.publicState.distance = inside ? 0 : Math.round(distance * 10) / 10;
    s.ui.reticle.classList.toggle('is-near', !inside && distance <= radius * 2.2);
    s.ui.reticle.classList.toggle('is-centred', inside);
    s.ui.mark.textContent = inside ? '✨◎✨' : (distance <= radius * 2.2 ? '◉' : '○');

    if (inside) {
      if (s.insideSince == null) s.insideSince = now;
      s.outsideSince = null;
    } else if (s.insideSince != null) {
      if (s.outsideSince == null) s.outsideSince = now;
      if (now - s.outsideSince > 150) { s.insideSince = null; s.outsideSince = null; }
    }
    const hold = Math.max(100, Number(s.cfg.hold) || 600);
    const dwell = s.insideSince == null ? 0 : Math.min(hold, now - s.insideSince);
    s.publicState.dwellMs = Math.round(dwell);
    s.ui.ring.style.setProperty('--look-dwell', (dwell / hold * 360) + 'deg');
    if (dwell >= hold) { this._found(s); return; }

    (s.cfg.decoys || []).forEach((cfg, index) => {
      if (s.shownDecoys.has(index)) return;
      const info = cfg.targetRect ? this._rectInfo(cfg.targetRect) : this._resolveTarget(cfg, s.cine, s.mode, s.observe);
      const decoyRadius = Math.max(0, Number(cfg.radius) || radius);
      if (this._distanceTo(info, s.view, s.axis) <= decoyRadius) this._showDecoy(s, index, cfg.say);
    });
  },

  _updateAssists(s, now) {
    if (s.completing) return;
    const scale = VA.Timeline ? VA.Timeline.scale : 1;
    const elapsed = now - s.startedAt;
    const hintAt = (Number(s.cfg.hintAfter) || 5000) * scale;
    const showAt = (Number(s.cfg.showAfter) || 12000) * scale;
    if (elapsed >= hintAt) {
      s.ui.hint.hidden = false;
      const dx = s.axis === 'y' ? 0 : s.targetInfo.center.x - s.view.x;
      const dy = s.axis === 'x' ? 0 : s.targetInfo.center.y - s.view.y;
      s.ui.hint.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    }
    if (elapsed >= showAt) s.ui.show.hidden = false;
  },

  _updateAttract(s, now) {
    const attracts = [];
    if (s.cfg.attract) attracts.push(s.cfg.attract);
    if (s.observe) {
      Object.values(s.observe.sprites).forEach(sprite => {
        if (sprite.spec.attract) attracts.push({
          id: sprite.spec.id, anim: sprite.spec.anim, ...sprite.spec.attract,
        });
      });
    }
    s.attractTimes ||= {};
    attracts.forEach(a => {
      const key = a.id || 'main';
      if (now - (s.attractTimes[key] || 0) < (Number(a.every) || 1900)) return;
      s.attractTimes[key] = now;
      if (a.sfx) VA.Audio.sfx(a.sfx);
      if (VA.reducedMotion || !a.anim) return;
      const el = this._targetElement(s, a.id);
      const node = el && (el.classList.contains('prop') ? el : el.querySelector('.actor-svg-wrap > :not(.player-vfx-rig), img'));
      if (!node) return;
      node.classList.remove(a.anim); void node.offsetWidth; node.classList.add(a.anim);
      const timer = setTimeout(() => { node.classList.remove(a.anim); s.timers.delete(timer); }, (s.cine.ANIM_MS[a.anim] || 600) + 60);
      s.timers.add(timer);
    });
  },

  _targetElement(s, id) {
    if (s.observe && s.observe.sprites[id]) return s.observe.sprites[id].el;
    return id && s.cine._target(id);
  },

  _showDecoy(s, index, text) {
    s.shownDecoys.add(index);
    s.publicState.decoyShown = true;
    s.ui.decoy.textContent = text || 'Look at that! 😄';
    s.ui.decoy.hidden = false;
    const timer = setTimeout(() => {
      s.ui.decoy.hidden = true;
      s.timers.delete(timer);
    }, 2400);
    s.timers.add(timer);
  },

  _showTarget(s) {
    if (!s.active || s.glide) return;
    const target = {
      x: s.axis === 'y' ? s.view.x : s.targetInfo.center.x,
      y: s.axis === 'x' ? s.view.y : s.targetInfo.center.y,
    };
    const dest = this._clampView(target, s.zoom, s.mode, s.bounds);
    if (VA.reducedMotion) {
      s.view.x = dest.x; s.view.y = dest.y;
      this._applyView(s);
      this._found(s);
      return;
    }
    s.glide = { from: { x: s.view.x, y: s.view.y }, to: dest, start: performance.now(), dur: 700 };
    const glideFrame = now => {
      if (!s.active || !s.glide) return;
      const p = VA.clamp((now - s.glide.start) / s.glide.dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      s.view.x = s.glide.from.x + (s.glide.to.x - s.glide.from.x) * e;
      s.view.y = s.glide.from.y + (s.glide.to.y - s.glide.from.y) * e;
      this._applyView(s);
      if (p >= 1) { s.glide = null; this._found(s); }
      else s.glide.raf = requestAnimationFrame(glideFrame);
    };
    s.glide.raf = requestAnimationFrame(glideFrame);
  },

  _found(s) {
    if (!s.active || s.resolved) return;
    s.resolved = true;
    s.publicState.found = true;
    VA.Audio.sfx('chime');
    const at = s.targetInfo.center;
    if (s.mode !== 'observe') {
      VA.Fx.sparkles(s.world, at.x, at.y, { n: 12 });
      if (s.cfg.found) VA.Fx.captionBig(s.cfg.found);
      s.cleanup(true);
      return;
    }
    this._observeSparkles(s, at);
    s.completing = true;
    s.ui.hint.hidden = true;
    cancelAnimationFrame(s.raf);
    const found = VA.el('div', 'look-observe-found', VA.escape(s.cfg.found || 'Found it!'));
    s.ui.root.appendChild(found);
    const hold = setTimeout(() => {
      s.timers.delete(hold);
      s.ui.root.classList.add('is-leaving');
      const fade = setTimeout(() => {
        s.timers.delete(fade);
        s.cleanup(true);
      }, VA.reducedMotion ? 0 : 300);
      s.timers.add(fade);
    }, VA.reducedMotion ? 0 : 600);
    s.timers.add(hold);
  },

  _observeSparkles(s, at) {
    const burst = VA.el('div', 'look-observe-sparkles');
    burst.style.left = at.x + 'px';
    burst.style.top = at.y + 'px';
    for (let i = 0; i < 12; i++) {
      const sparkle = VA.el('span', '', i % 3 === 0 ? '⭐' : '✨');
      const angle = i / 12 * Math.PI * 2;
      const distance = 70 + (i % 4) * 22;
      sparkle.style.setProperty('--spark-x', (Math.cos(angle) * distance) + 'px');
      sparkle.style.setProperty('--spark-y', (Math.sin(angle) * distance) + 'px');
      sparkle.style.animationDelay = (i % 4) * 35 + 'ms';
      burst.appendChild(sparkle);
    }
    s.observe.world.appendChild(burst);
  },

  _cleanup(s, found) {
    if (!s.active) return;
    s.active = false;
    cancelAnimationFrame(s.raf);
    if (s.glide && s.glide.raf) cancelAnimationFrame(s.glide.raf);
    if (s.pointer && s.screen.hasPointerCapture && s.screen.hasPointerCapture(s.pointer.id)) {
      s.screen.releasePointerCapture(s.pointer.id);
    }
    s.timers.forEach(clearTimeout);
    s.timers.clear();
    if (s.mode === 'observe' && s.cfg.panorama) this._observeViews[s.cfg.panorama] = { ...s.view };
    const animations = [];
    if (s.cfg.attract) animations.push(s.cfg.attract);
    if (s.observe) Object.values(s.observe.sprites).forEach(sprite => animations.push({ id: sprite.spec.id, anim: sprite.spec.anim }));
    animations.forEach(attract => {
      if (!attract || !attract.anim) return;
      const el = this._targetElement(s, attract.id);
      const node = el && (el.classList.contains('prop') ? el : el.querySelector('.actor-svg-wrap > :not(.player-vfx-rig), img'));
      if (node) node.classList.remove(attract.anim);
    });
    document.removeEventListener('keydown', s.onKeyDown);
    document.removeEventListener('keyup', s.onKeyUp);
    window.removeEventListener('blur', s.onBlur);
    s.screen.removeEventListener('pointerdown', s.onPointerDown);
    s.screen.removeEventListener('pointermove', s.onPointerMove);
    s.screen.removeEventListener('pointerup', s.onPointerUp);
    s.screen.removeEventListener('pointercancel', s.onPointerUp);
    (s.dirHandlers || []).forEach(({ button, down, up }) => {
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', up);
    });
    s.ui.show.removeEventListener('click', s.onShow);
    s.ui.root.remove();
    s.publicState.active = false;
    this._snapshot = JSON.parse(JSON.stringify(s.publicState));
    if (this._session === s) this._session = null;
    if (found) s.resolve();
  },
};
