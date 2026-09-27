/* ============================================================
   ar-handoff.js — reusable waist-up present / receive handoffs.

   A wrist is the hand: dwell to pick up, carry the attached object, then
   dwell at the destination. Camera failure quietly becomes a button action.
   No image or landmark history leaves this session.
   ============================================================ */
'use strict';

(function () {
  const dist = (a, b) => (!a || !b) ? Infinity : Math.hypot(a.x - b.x, a.y - b.y);
  const chestPoint = pose => {
    if (!pose || !pose.leftShoulder || !pose.rightShoulder) return null;
    return {
      x: (pose.leftShoulder.x + pose.rightShoulder.x) / 2,
      y: (pose.leftShoulder.y + pose.rightShoulder.y) / 2 + 0.16,
    };
  };
  const nearestWrist = (pose, point) => {
    if (!pose || !point) return { side: null, point: null, distance: Infinity };
    const choices = [
      { side: 'left', point: pose.leftWrist },
      { side: 'right', point: pose.rightWrist },
    ].filter(choice => choice.point);
    if (!choices.length) return { side: null, point: null, distance: Infinity };
    choices.forEach(choice => { choice.distance = dist(choice.point, point); });
    return choices.sort((a, b) => a.distance - b.distance)[0];
  };
  const clamp = value => Math.max(0.04, Math.min(0.96, value));

  const COPY = {
    frame: 'Show your upper body!',
    frameJP: '上半身とうでが見えるようにしてね！',
    lost: 'Show your arms! 🙂',
    lostJP: 'りょううでが見えるようにしてね！',
    receiveCarry: 'Bring it to you!',
    receiveCarryJP: '自分のほうにもってきてね！',
  };

  const inactive = () => ({
    active: false, mode: 'present', inputMode: 'fallback', stage: 'done', hand: null,
    dwelling: false, object: { x: 0.5, y: 0.5, attached: false }, target: null,
    poseSeen: false, paused: false, assist: false, done: false,
  });

  VA.ARHandoff = {
    TUNING: {
      pickupRadius: 0.13,
      targetRadius: 0.15,
      chestRadius: 0.18,
      dwellMs: 350,
      startTimeout: 10000,
      lostPoseMs: 12000,
      assistMs: 30000,
    },

    _geom: { dist, chestPoint, nearestWrist },
    _session: null,
    _snapshot: inactive(),

    state() {
      return JSON.parse(JSON.stringify(this._session ? this._session.publicState : this._snapshot));
    },

    present(cfg = {}) { return this._begin('present', cfg); },
    receive(cfg = {}) { return this._begin('receive', cfg); },

    _begin(mode, cfg) {
      if (this._session) this._cleanup(this._session, true);
      const screen = document.querySelector('.screen.active');
      if (!screen) return Promise.resolve();
      const ui = this._buildUI(mode, cfg);
      screen.appendChild(ui.root);
      const start = mode === 'present' ? { x: 0.50, y: 0.68 } : { x: 0.72, y: 0.42 };
      const target = mode === 'present' ? { x: 0.77, y: 0.38 } : null;
      const publicState = {
        active: true, mode, inputMode: 'starting', stage: 'pickup', hand: null,
        dwelling: false, object: { x: start.x, y: start.y, attached: false },
        target, poseSeen: false, paused: false, assist: false, done: false,
      };

      return new Promise(resolve => {
        const s = {
          mode, cfg, screen, ui, publicState, resolve, active: true, resolved: false,
          timers: new Set(), raf: 0, watch: 0, startupTimer: 0, lostTimer: 0,
          assistTimer: 0, finishTimer: 0, messageTimer: 0, cameraStopped: false, dwell: null,
        };
        this._session = s;
        this._bind(s);
        this._render(s);
        s.watch = setInterval(() => {
          if (!s.screen.classList.contains('active')) this._cleanup(s, true);
        }, 250);
        if (this._cameraAllowed()) this._startCamera(s);
        else this._switchFallback(s);
      });
    },

    _buildUI(mode, cfg) {
      const root = VA.el('div', 'ar-handoff');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', mode === 'present' ? 'Present passport' : 'Receive souvenir');
      const video = document.createElement('video');
      video.className = 'ar-handoff-video';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      const shade = VA.el('div', 'ar-handoff-shade');
      const command = VA.el('div', 'ar-handoff-command');
      command.textContent = COPY.frame;
      const jp = VA.el('div', 'ar-handoff-jp');
      jp.textContent = COPY.frameJP;
      const message = VA.el('div', 'ar-handoff-message');
      const object = VA.el('div', 'ar-handoff-object');
      if (mode === 'present') {
        object.classList.add('is-passport');
        const title = VA.el('strong', 'ar-handoff-passport-title', '✈ PASSPORT');
        const crest = VA.el('span', 'ar-handoff-passport-crest', '🛂');
        const name = VA.el('span', 'ar-handoff-passport-name');
        name.textContent = (VA.State.data && VA.State.data.name) || 'TRAVELER';
        object.append(title, crest, name);
      } else {
        object.classList.add('is-souvenir');
        const img = document.createElement('img');
        img.src = 'assets/objects/' + cfg.illustration;
        img.alt = cfg.label || 'Souvenir';
        object.appendChild(img);
      }
      const target = VA.el('div', 'ar-handoff-target');
      if (mode === 'present') target.textContent = '🛂 PASSPORT HERE';
      else target.setAttribute('aria-hidden', 'true');
      target.hidden = true;
      const fallback = VA.el('button', 'ar-handoff-fallback', mode === 'present' ? 'SHOW PASSPORT' : 'TAKE');
      fallback.type = 'button';
      fallback.hidden = true;
      fallback.setAttribute('aria-keyshortcuts', 'Space Enter');
      root.append(video, shade, command, jp, message, target, object, fallback);
      return { root, video, command, jp, message, object, target, fallback };
    },

    _bind(s) {
      s.onFallback = () => this._fallbackComplete(s);
      s.ui.fallback.addEventListener('click', s.onFallback);
      s.onKey = event => {
        if (event.repeat || (event.key !== ' ' && event.key !== 'Enter') || s.ui.fallback.hidden) return;
        event.preventDefault();
        this._fallbackComplete(s);
      };
      document.addEventListener('keydown', s.onKey);
    },

    _cameraAllowed() {
      const settings = VA.State.data && VA.State.data.settings;
      return !!(VA.CameraPose && VA.CameraPose.isSupported() && !(settings && settings.camera === false));
    },

    async _startCamera(s) {
      s.ui.root.classList.add('is-camera');
      s.startupTimer = this._later(s, this.TUNING.startTimeout, () => {
        if (!s.publicState.poseSeen) this._switchFallback(s);
      });
      try {
        await VA.CameraPose.start({
          videoEl: s.ui.video,
          onPose: pose => this._receivePose(s, pose),
          onStatus: () => {},
        });
      } catch (reason) {
        if (s.active && reason !== 'cancelled') this._switchFallback(s);
        return;
      }
      if (!s.active || s.publicState.inputMode === 'fallback') {
        this._stopCamera(s);
        return;
      }
      s.publicState.inputMode = 'camera';
      s.ui.root.classList.add('camera-running');
      s.assistTimer = this._later(s, this.TUNING.assistMs, () => this._showAssist(s));
    },

    _poseComplete(pose) {
      return !!(pose && pose.leftShoulder && pose.rightShoulder && pose.leftWrist && pose.rightWrist);
    },

    _receivePose(s, pose) {
      if (!s.active || s.publicState.inputMode === 'fallback') return;
      if (!this._poseComplete(pose)) {
        if (s.publicState.poseSeen) this._poseLost(s);
        return;
      }
      const p = s.publicState;
      const firstPose = !p.poseSeen;
      p.poseSeen = true;
      p.paused = false;
      this._clearTimer(s, 'startupTimer');
      this._clearTimer(s, 'lostTimer');
      s.ui.root.classList.remove('pose-lost');
      s.ui.message.textContent = '';
      this._setInstruction(s);
      if (firstPose && p.inputMode === 'starting') p.inputMode = 'camera';

      if (p.object.attached) {
        const wrist = pose[p.hand + 'Wrist'];
        if (wrist) {
          p.object.x = clamp(wrist.x + 0.025);
          p.object.y = clamp(wrist.y - 0.025);
        }
      }
      if (s.mode === 'receive' && p.stage === 'carry') {
        p.target = chestPoint(pose);
      }

      if (p.stage === 'pickup') {
        const nearest = nearestWrist(pose, p.object);
        this._dwell(s, nearest.distance <= this.TUNING.pickupRadius, 'pickup', nearest.side, () => {
          p.stage = 'carry';
          p.hand = nearest.side;
          p.object.attached = true;
          if (s.mode === 'present') p.target = { x: 0.77, y: 0.38 };
          else {
            p.target = chestPoint(pose);
            s.ui.message.textContent = 'Got it! ✨';
            VA.Audio.sfx('pop');
            s.messageTimer = this._later(s, 650, () => {
              s.messageTimer = 0;
              if (!p.done && !p.paused) s.ui.message.textContent = '';
            });
          }
          this._setInstruction(s);
        });
      } else if (p.stage === 'carry') {
        const radius = s.mode === 'present' ? this.TUNING.targetRadius : this.TUNING.chestRadius;
        this._dwell(s, dist(p.object, p.target) <= radius, 'target', p.hand, () => this._cameraComplete(s));
      }
    },

    _dwell(s, touching, zone, hand, complete) {
      const now = performance.now();
      const p = s.publicState;
      if (!touching || !hand) {
        this._resetDwell(s);
        return;
      }
      if (!s.dwell || s.dwell.zone !== zone || s.dwell.hand !== hand) {
        s.dwell = { zone, hand, since: now };
        p.dwelling = true;
        s.ui.root.classList.add('is-dwelling');
        s.ui.root.style.setProperty('--handoff-dwell', this.TUNING.dwellMs + 'ms');
        return;
      }
      if (now - s.dwell.since >= this.TUNING.dwellMs) {
        this._resetDwell(s);
        complete();
      }
    },

    _resetDwell(s) {
      s.dwell = null;
      s.publicState.dwelling = false;
      s.ui.root.classList.remove('is-dwelling');
    },

    _poseLost(s) {
      if (!s.active || s.publicState.inputMode !== 'camera') return;
      const p = s.publicState;
      p.paused = true;
      this._resetDwell(s);
      s.ui.root.classList.add('pose-lost');
      s.ui.jp.textContent = COPY.lostJP;
      s.ui.message.textContent = COPY.lost;
      if (!s.lostTimer) {
        s.lostTimer = this._later(s, this.TUNING.lostPoseMs, () => {
          s.lostTimer = 0;
          this._switchFallback(s);
        });
      }
    },

    _setInstruction(s) {
      if (s.publicState.paused) return;
      if (s.mode === 'receive' && s.publicState.stage === 'carry') {
        s.ui.command.textContent = COPY.receiveCarry;
        s.ui.jp.textContent = COPY.receiveCarryJP;
      } else {
        s.ui.command.textContent = s.cfg.instruction || (s.mode === 'present' ? 'Show your passport!' : 'Take it!');
        s.ui.jp.textContent = s.cfg.instructionJP || '';
      }
    },

    _showAssist(s) {
      if (!s.active || s.publicState.inputMode !== 'camera' || s.publicState.done) return;
      s.publicState.assist = true;
      s.ui.fallback.hidden = false;
      s.ui.root.classList.add('has-assist');
    },

    _switchFallback(s) {
      if (!s.active || s.publicState.inputMode === 'fallback') return;
      this._stopCamera(s);
      this._clearTimer(s, 'assistTimer');
      this._resetDwell(s);
      const p = s.publicState;
      p.inputMode = 'fallback';
      p.paused = false;
      p.assist = false;
      s.ui.root.classList.remove('is-camera', 'camera-running', 'pose-lost', 'has-assist');
      s.ui.root.classList.add('is-fallback');
      this._setInstruction(s);
      s.ui.message.textContent = '';
      s.ui.fallback.hidden = false;
    },

    _fallbackComplete(s) {
      if (!s.active || s.publicState.done || s.ui.fallback.hidden) return;
      s.publicState.done = true;
      s.publicState.stage = 'done';
      s.ui.fallback.disabled = true;
      s.ui.root.classList.add('is-completing');
      s.ui.message.textContent = s.mode === 'present' ? 'STAMP!' : 'GOT IT! ✨';
      this._stopCamera(s);
      s.finishTimer = this._later(s, 400, () => this._cleanup(s, true));
    },

    _cameraComplete(s) {
      if (!s.active || s.publicState.done) return;
      const p = s.publicState;
      p.done = true;
      p.stage = 'done';
      this._resetDwell(s);
      s.ui.message.textContent = s.mode === 'present' ? 'STAMP!' : 'GOT IT! ✨';
      s.ui.root.classList.add('is-success');
      this._stopCamera(s);
      s.finishTimer = this._later(s, 420, () => this._cleanup(s, true));
    },

    _render(s) {
      if (!s.active) return;
      const p = s.publicState;
      s.ui.object.style.left = (p.object.x * 100) + '%';
      s.ui.object.style.top = (p.object.y * 100) + '%';
      s.ui.object.classList.toggle('is-attached', p.object.attached);
      s.ui.target.hidden = !p.target || p.stage !== 'carry';
      if (p.target) {
        s.ui.target.style.left = (p.target.x * 100) + '%';
        s.ui.target.style.top = (p.target.y * 100) + '%';
      }
      s.ui.root.classList.toggle('is-carrying', p.stage === 'carry');
      s.raf = requestAnimationFrame(() => this._render(s));
    },

    _later(s, ms, fn) {
      const timer = setTimeout(() => {
        s.timers.delete(timer);
        if (s.active) fn();
      }, ms);
      s.timers.add(timer);
      return timer;
    },

    _clearTimer(s, name) {
      const timer = s[name];
      if (!timer) return;
      clearTimeout(timer);
      s.timers.delete(timer);
      s[name] = 0;
    },

    _stopCamera(s) {
      if (!s.cameraStopped) {
        s.cameraStopped = true;
        if (VA.CameraPose) VA.CameraPose.stop();
      }
      this._clearTimer(s, 'startupTimer');
      this._clearTimer(s, 'lostTimer');
      s.ui.video.srcObject = null;
    },

    _cleanup(s, resolveNow) {
      if (!s || !s.active) return;
      this._stopCamera(s);
      s.active = false;
      s.publicState.active = false;
      s.publicState.paused = false;
      cancelAnimationFrame(s.raf);
      clearInterval(s.watch);
      s.timers.forEach(clearTimeout);
      s.timers.clear();
      document.removeEventListener('keydown', s.onKey);
      s.ui.fallback.removeEventListener('click', s.onFallback);
      s.ui.root.remove();
      this._snapshot = JSON.parse(JSON.stringify(s.publicState));
      if (this._session === s) this._session = null;
      if (resolveNow && !s.resolved) {
        s.resolved = true;
        s.resolve();
      }
    },
  };
})();
