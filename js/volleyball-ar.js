/* ============================================================
   volleyball-ar.js — camera BUMP → SET → SPIKE, then the existing finale.

   The ball follows scripted screen-space paths. Pose checks are deliberately
   broad and semantic; a timing game using the same paths is the no-camera
   fallback. No image or landmark history leaves this session.
   ============================================================ */
'use strict';

(function () {
  const dist = (a, b) => (!a || !b) ? Infinity : Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => (!a || !b) ? null : ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pointSegmentDistance = (p, a, b) => {
    if (!p || !a || !b) return Infinity;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (!length2) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
    return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
  };

  const isBump = (pose, ball, tuning) => {
    if (!pose || !ball || !ball.hittable || !pose.leftWrist || !pose.rightWrist ||
        !pose.leftElbow || !pose.rightElbow) return false;
    if (dist(pose.leftWrist, pose.rightWrist) >= tuning.bumpWrists) return false;
    const wristMid = midpoint(pose.leftWrist, pose.rightWrist);
    return Math.min(
      pointSegmentDistance(ball, pose.leftElbow, pose.leftWrist),
      pointSegmentDistance(ball, pose.rightElbow, pose.rightWrist),
      dist(ball, wristMid)
    ) < tuning.bumpRadius;
  };

  const isSet = (pose, ball, tuning) => !!(pose && ball && ball.hittable &&
    pose.leftWrist && pose.rightWrist && pose.leftShoulder && pose.rightShoulder &&
    pose.leftWrist.y < pose.leftShoulder.y && pose.rightWrist.y < pose.rightShoulder.y &&
    Math.min(dist(ball, pose.leftWrist), dist(ball, pose.rightWrist)) < tuning.setRadius);

  const isSpike = (pose, prevPose, ball, tuning) => {
    if (!pose || !prevPose || !ball || !ball.hittable) return false;
    return ['left', 'right'].some(side => {
      const wrist = pose[side + 'Wrist'];
      const shoulder = pose[side + 'Shoulder'];
      const previous = prevPose[side + 'Wrist'];
      return !!(wrist && shoulder && previous && wrist.y < shoulder.y &&
        dist(wrist, previous) > tuning.spikeMotion &&
        dist(wrist, ball) < dist(previous, ball) &&
        dist(wrist, ball) < tuning.spikeRadius);
    });
  };

  // Waist-up, desk-friendly copy: it teaches the controls the detector needs,
  // never asks the student to stand or move back.
  const HINTS = {
    bump: 'うでをそろえてね！',
    set: 'りょうてを上にあげてね！',
    spike: 'うでを上からふってね！',
  };
  const COPY = {
    frame: 'Show your upper body!',
    frameJP: '上半身とうでが見えるようにしてね！',
    lost: 'Show your arms! 🙂',
    lostJP: 'りょううでが見えるようにしてね！',
    fallbackJP: 'ボールが光ったら「HIT!」をおしてね！',
  };
  const PHASES = ['bump', 'set', 'spike'];

  VA.VolleyballAR = {
    TUNING: {
      bumpWrists: 0.18,
      bumpRadius: 0.17,
      setRadius: 0.18,
      spikeMotion: 0.035,
      spikeRadius: 0.19,
      hitWindow: 430,
      incoming: { bump: 1900, set: 2100, spike: 1800 },
      contactPause: 180,
      returnMs: 650,
      retryPause: 300,
      readyMs: 500,
      tutorialMs: 1200, // first appearance of each move: demo before the ball
      startTimeout: 10000,
      lostPoseMs: 8000,
    },

    HINTS,
    COPY,
    _geom: { dist, pointSegmentDistance, midpoint, isBump, isSet, isSpike },
    _session: null,
    _snapshot: {
      active: false, mode: 'off', phase: 'idle', phaseIndex: -1,
      attempts: { bump: 0, set: 0, spike: 0 }, forgiveness: 1,
      paused: false, poseSeen: false, ball: null, hittable: false, done: false,
    },

    state() {
      const state = this._session ? this._session.publicState : this._snapshot;
      return JSON.parse(JSON.stringify(state));
    },

    start(cfg = {}, cine) {
      if (this._session) this._cleanup(this._session, true);
      VA.Dialogue.hide();
      const screen = VA.$('#scr-cine');
      if (!screen) return Promise.resolve();
      const ui = this._buildUI();
      screen.appendChild(ui.root);
      const publicState = {
        active: true, mode: 'starting', phase: 'ready', phaseIndex: -1,
        sequence: PHASES.slice(), attempts: { bump: 0, set: 0, spike: 0 },
        forgiveness: 1, paused: false, poseSeen: false, ball: null,
        hittable: false, lastHit: null, lastMiss: null, done: false, tutorial: null,
      };

      return new Promise(resolve => {
        const s = {
          cfg, cine, screen, ui, publicState, resolve, active: true, resolved: false,
          phaseIndex: -1, pose: null, prevPose: null, ballRun: null,
          timers: new Set(), shownHints: new Set(), raf: 0, lastFrame: performance.now(),
          startupTimer: 0, lostTimer: 0, readyTimer: 0, tutorialTimer: 0, hitButton: null,
          cameraStopped: false,
        };
        this._session = s;
        this._bind(s);
        this._frame(s, s.lastFrame);
        s.watch = setInterval(() => {
          if (!s.screen.classList.contains('active') || (VA.Screens.current && VA.Screens.current !== 'cine')) {
            this._cleanup(s, true);
          }
        }, 300);
        this._chooseMode(s);
      });
    },

    _buildUI() {
      const root = VA.el('div', 'volleyball-ar');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Beach volleyball');
      const video = document.createElement('video');
      video.className = 'volleyball-ar-video';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      const shade = VA.el('div', 'volleyball-ar-shade');
      const command = VA.el('div', 'volleyball-ar-command', COPY.frame);
      const hint = VA.el('div', 'volleyball-ar-hint', COPY.frameJP);
      const message = VA.el('div', 'volleyball-ar-message');
      const ball = VA.el('div', 'volleyball-ar-ball', '🏐');
      ball.hidden = true;
      // A tiny waist-up gesture demo shown beside the command the first time
      // each move appears. Instruction only — never detector feedback.
      const demo = VA.el('div', 'volleyball-ar-demo');
      demo.setAttribute('aria-hidden', 'true');
      demo.hidden = true;
      demo.append(
        VA.el('i', 'volleyball-ar-demo-head'),
        VA.el('i', 'volleyball-ar-demo-body'),
        VA.el('i', 'volleyball-ar-demo-arm demo-left'),
        VA.el('i', 'volleyball-ar-demo-arm demo-right'),
        VA.el('span', 'volleyball-ar-demo-ball', '🏐'),
      );
      root.append(video, shade, command, hint, message, demo, ball);
      return { root, video, command, hint, message, demo, ball };
    },

    _bind(s) {
      s.onKey = event => {
        if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
        if (s.publicState.mode !== 'fallback' || !s.publicState.hittable) return;
        event.preventDefault();
        this._hit(s, 'timing');
      };
      document.addEventListener('keydown', s.onKey);
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

    _cameraAllowed() {
      const settings = VA.State.data && VA.State.data.settings;
      return VA.CameraPose && VA.CameraPose.isSupported() && !(settings && settings.camera === false);
    },

    _chooseMode(s) {
      if (!this._cameraAllowed()) {
        this._switchFallback(s);
        return;
      }
      this._startCamera(s);
    },

    async _startCamera(s) {
      const p = s.publicState;
      p.mode = 'starting';
      s.ui.root.classList.add('is-camera');
      s.startupTimer = this._later(s, this.TUNING.startTimeout, () => {
        if (p.mode === 'starting') this._switchFallback(s);
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
      if (!s.active || p.mode !== 'starting') {
        VA.CameraPose.stop();
        return;
      }
      this._clearTimer(s, 'startupTimer');
      p.mode = 'camera';
      s.ui.root.classList.add('camera-running');
      s.ui.command.textContent = COPY.frame;
      s.ui.hint.textContent = COPY.frameJP;
      this._poseLost(s);
    },

    _poseComplete(pose) {
      return !!(pose && pose.leftShoulder && pose.rightShoulder &&
        pose.leftElbow && pose.rightElbow && pose.leftWrist && pose.rightWrist);
    },

    _receivePose(s, pose) {
      if (!s.active || (s.publicState.mode !== 'camera' && s.publicState.mode !== 'starting')) return;
      if (!this._poseComplete(pose)) {
        if (s.publicState.mode === 'camera') this._poseLost(s);
        return;
      }
      s.pose = pose;
      const p = s.publicState;
      p.poseSeen = true;
      if (p.mode !== 'camera') return;
      this._clearTimer(s, 'lostTimer');
      p.paused = false;
      if (s.ui.root.classList.contains('pose-lost')) {
        // Back in view: restore the move's own instruction, not the lost-pose one.
        s.ui.root.classList.remove('pose-lost');
        s.ui.hint.textContent = HINTS[p.phase] && !p.attempts[p.phase] ? HINTS[p.phase] : '';
      }
      s.ui.message.textContent = '';

      if (s.phaseIndex < 0 && !s.readyTimer) {
        s.ui.command.textContent = 'READY!';
        s.ui.hint.textContent = '';
        s.readyTimer = this._later(s, this.TUNING.readyMs, () => {
          s.readyTimer = 0;
          if (this._poseComplete(s.pose) && s.publicState.mode === 'camera') this._startPhase(s, 0);
        });
      }

      if (s.ballRun && p.hittable) {
        const tuning = this._effectiveTuning(s);
        const ball = p.ball;
        let hit = false;
        if (p.phase === 'bump') hit = isBump(pose, ball, tuning);
        else if (p.phase === 'set') hit = isSet(pose, ball, tuning);
        else if (p.phase === 'spike') hit = isSpike(pose, s.prevPose, ball, tuning);
        if (hit) this._hit(s, 'pose');
      }
      s.prevPose = pose;
    },

    _poseLost(s) {
      if (!s.active || s.publicState.mode !== 'camera') return;
      const p = s.publicState;
      p.paused = true;
      s.prevPose = null;
      this._clearTimer(s, 'readyTimer');
      s.ui.root.classList.add('pose-lost');
      if (s.phaseIndex < 0) {
        // Not found yet (before READY): keep the framing instruction.
        s.ui.command.textContent = COPY.frame;
        s.ui.message.textContent = '';
        s.ui.hint.textContent = COPY.frameJP;
      } else {
        s.ui.message.textContent = COPY.lost;
        s.ui.hint.textContent = COPY.lostJP;
      }
      if (!s.lostTimer) {
        s.lostTimer = this._later(s, this.TUNING.lostPoseMs, () => {
          s.lostTimer = 0;
          this._switchFallback(s);
        });
      }
    },

    _switchFallback(s) {
      if (!s.active || s.publicState.mode === 'fallback') return;
      this._cleanup(s, false, true);
      const p = s.publicState;
      p.mode = 'fallback';
      p.paused = false;
      s.ui.root.classList.remove('is-camera', 'camera-running', 'pose-lost');
      s.ui.root.classList.add('is-fallback');
      s.ui.message.textContent = '';
      // Gesture demos do not apply to tapping: end one in flight and send its ball.
      const tutorialPhase = p.tutorial;
      this._clearTimer(s, 'tutorialTimer');
      this._hideDemo(s);
      if (tutorialPhase) this._launchPhaseBall(s, tutorialPhase);
      s.ui.hint.textContent = COPY.fallbackJP;
      s.fallbackHintPending = true;
      if (!s.hitButton) {
        const button = VA.el('button', 'volleyball-ar-hit', 'GET READY');
        button.type = 'button';
        button.setAttribute('aria-keyshortcuts', 'Space Enter');
        s.onHitClick = () => {
          if (s.publicState.hittable) this._hit(s, 'timing');
        };
        button.addEventListener('click', s.onHitClick);
        s.hitButton = button;
        s.ui.root.appendChild(button);
      }
      if (s.phaseIndex < 0) this._startPhase(s, 0);
      else this._syncHitButton(s);
    },

    _forgiveness(attempts) {
      return 1 + Math.min(attempts * 0.15, 0.45);
    },

    _effectiveTuning(s) {
      const factor = s.publicState.forgiveness;
      return {
        bumpWrists: this.TUNING.bumpWrists * factor,
        bumpRadius: this.TUNING.bumpRadius * factor,
        setRadius: this.TUNING.setRadius * factor,
        spikeMotion: this.TUNING.spikeMotion,
        spikeRadius: this.TUNING.spikeRadius * factor,
      };
    },

    _target(s, phase) {
      const pose = s.pose;
      if (pose && this._poseComplete(pose)) {
        const shoulders = midpoint(pose.leftShoulder, pose.rightShoulder);
        // Lower chest / upper abdomen: above the desk edge for seated students.
        if (phase === 'bump') return { x: shoulders.x, y: Math.min(0.74, shoulders.y + 0.23) };
        // High balls stay below the command pill (top ~12% of the stage).
        if (phase === 'set') return { x: shoulders.x, y: Math.max(0.22, (pose.nose ? pose.nose.y : shoulders.y) - 0.13) };
        return { x: pose.rightShoulder.x, y: Math.max(0.22, pose.rightShoulder.y - 0.24) };
      }
      return phase === 'bump' ? { x: 0.5, y: 0.68 } :
        phase === 'set' ? { x: 0.5, y: 0.25 } : { x: 0.68, y: 0.27 };
    },

    _path(phase, target) {
      const starts = { bump: { x: 0.22, y: 0.08 }, set: { x: 0.82, y: 0.62 }, spike: { x: 0.12, y: 0.08 } };
      const exits = { bump: { x: 0.78, y: 0.08 }, set: { x: 0.20, y: 0.05 }, spike: { x: 1.08, y: 0.05 } };
      return { start: starts[phase], target, end: exits[phase] };
    },

    _startPhase(s, index) {
      if (!s.active) return;
      s.phaseIndex = index;
      const phase = PHASES[index];
      const p = s.publicState;
      p.phaseIndex = index;
      p.phase = phase;
      p.lastMiss = null;
      p.forgiveness = this._forgiveness(p.attempts[phase]);
      p.hittable = false;
      p.ball = null;
      s.ballRun = null;
      s.ui.ball.hidden = true;
      s.ui.command.textContent = phase.toUpperCase() + '!';
      s.ui.message.textContent = '';
      const firstAppearance = !s.shownHints.has(phase);
      if (firstAppearance) s.shownHints.add(phase);

      if (p.mode === 'fallback') {
        // Tapping needs no gesture demo; one tap instruction on the first ball.
        s.ui.hint.textContent = s.fallbackHintPending ? COPY.fallbackJP : '';
        s.fallbackHintPending = false;
        this._launchPhaseBall(s, phase);
        return;
      }
      if (!firstAppearance) {
        // Retries and later balls start at once — no tutorial replay.
        s.ui.hint.textContent = '';
        this._launchPhaseBall(s, phase);
        return;
      }
      this._showGestureTutorial(s, phase, () => this._launchPhaseBall(s, phase));
    },

    /* First appearance of a move: its Japanese instruction plus the tiny demo
       while the ball waits, then the real ball. Tracked by _later, so leaving
       the scene cancels the launch. */
    _showGestureTutorial(s, phase, done) {
      const p = s.publicState;
      p.tutorial = phase;
      s.ui.hint.textContent = HINTS[phase];
      const demo = s.ui.demo;
      demo.className = 'volleyball-ar-demo';
      demo.hidden = false;
      void demo.offsetWidth; // restart the CSS animation
      demo.classList.add('demo-' + phase);
      this._clearTimer(s, 'tutorialTimer');
      s.tutorialTimer = this._later(s, this.TUNING.tutorialMs, () => {
        s.tutorialTimer = 0;
        this._hideDemo(s);
        done();
      });
    },

    _hideDemo(s) {
      s.publicState.tutorial = null;
      s.ui.demo.hidden = true;
      s.ui.demo.className = 'volleyball-ar-demo';
    },

    _launchPhaseBall(s, phase) {
      if (!s.active) return;
      const p = s.publicState;
      const path = this._path(phase, this._target(s, phase));
      s.ballRun = {
        phase, stage: 'incoming', elapsed: 0, path,
        incoming: this.TUNING.incoming[phase] * p.forgiveness,
        window: this.TUNING.hitWindow * p.forgiveness,
      };
      p.ball = { x: path.start.x, y: path.start.y, hittable: false, stage: 'incoming' };
      s.ui.ball.hidden = false;
      this._renderBall(s);
      this._syncHitButton(s);
    },

    _lerp(a, b, t) { return a + (b - a) * t; },

    _frame(s, now) {
      if (!s.active) return;
      const delta = Math.min(50, Math.max(0, now - s.lastFrame));
      s.lastFrame = now;
      if (s.ballRun && !s.publicState.paused) this._advanceBall(s, delta);
      s.raf = requestAnimationFrame(next => this._frame(s, next));
    },

    _advanceBall(s, delta) {
      const run = s.ballRun;
      if (!run) return;
      run.elapsed += delta;
      const p = s.publicState;
      if (run.stage === 'incoming') {
        const t = Math.min(1, run.elapsed / run.incoming);
        p.ball.x = this._lerp(run.path.start.x, run.path.target.x, t);
        p.ball.y = this._lerp(run.path.start.y, run.path.target.y, t);
        p.hittable = Math.abs(run.elapsed - run.incoming) <= run.window / 2;
        p.ball.hittable = p.hittable;
        p.ball.stage = 'incoming';
        if (run.elapsed > run.incoming + run.window / 2) this._miss(s);
      } else if (run.stage === 'contact') {
        p.ball.x = run.path.target.x;
        p.ball.y = run.path.target.y;
        if (run.elapsed >= this.TUNING.contactPause) {
          run.stage = 'return';
          run.elapsed = 0;
          p.ball.stage = 'return';
        }
      } else if (run.stage === 'return') {
        const t = Math.min(1, run.elapsed / this.TUNING.returnMs);
        p.ball.x = this._lerp(run.path.target.x, run.path.end.x, t);
        p.ball.y = this._lerp(run.path.target.y, run.path.end.y, t);
        if (t >= 1) this._afterReturn(s);
      }
      if (s.ballRun) this._renderBall(s);
      this._syncHitButton(s);
    },

    _renderBall(s) {
      const ball = s.publicState.ball;
      if (!ball) { s.ui.ball.hidden = true; return; }
      s.ui.ball.style.left = (ball.x * 100) + '%';
      s.ui.ball.style.top = (ball.y * 100) + '%';
      s.ui.ball.classList.toggle('is-hittable', !!ball.hittable);
    },

    _syncHitButton(s) {
      if (!s.hitButton) return;
      const open = s.publicState.mode === 'fallback' && s.publicState.hittable;
      s.hitButton.textContent = open ? 'HIT!' : 'GET READY';
      s.hitButton.classList.toggle('is-open', open);
    },

    _hit(s, source) {
      const run = s.ballRun;
      if (!s.active || !run || run.stage !== 'incoming' || !s.publicState.hittable) return;
      const p = s.publicState;
      p.lastHit = run.phase;
      p.hittable = false;
      p.ball.hittable = false;
      p.ball.stage = 'contact';
      run.stage = 'contact';
      run.elapsed = 0;
      s.ui.command.textContent = run.phase === 'spike' ? 'SPIKE! 💥' : run.phase.toUpperCase() + '! ✨';
      s.ui.hint.textContent = '';
      s.ui.ball.classList.add('is-hit');
      this._later(s, 260, () => s.ui.ball.classList.remove('is-hit'));
      VA.Audio.sfx('pop');
      this._syncHitButton(s);
    },

    _miss(s) {
      const phase = s.publicState.phase;
      s.ballRun = null;
      s.publicState.ball = null;
      s.publicState.hittable = false;
      s.publicState.attempts[phase]++;
      s.publicState.forgiveness = this._forgiveness(s.publicState.attempts[phase]);
      s.publicState.lastMiss = phase;
      s.ui.ball.hidden = true;
      this._syncHitButton(s);
      this._later(s, this.TUNING.retryPause, () => this._startPhase(s, s.phaseIndex));
    },

    _afterReturn(s) {
      const phase = s.publicState.phase;
      s.ballRun = null;
      s.publicState.ball = null;
      s.publicState.hittable = false;
      s.ui.ball.hidden = true;
      if (phase === 'spike') this._finish(s);
      else this._startPhase(s, s.phaseIndex + 1);
    },

    _cleanupCamera(s) {
      if (!s.cameraStopped) {
        s.cameraStopped = true;
        VA.CameraPose.stop();
      }
      this._clearTimer(s, 'startupTimer');
      this._clearTimer(s, 'lostTimer');
      this._clearTimer(s, 'readyTimer');
      s.ui.video.srcObject = null;
    },

    _cleanup(s, resolveNow, cameraOnly = false) {
      if (!s || !s.active) return;
      this._cleanupCamera(s);
      if (cameraOnly) return;
      s.active = false;
      s.publicState.active = false;
      s.publicState.paused = false;
      cancelAnimationFrame(s.raf);
      clearInterval(s.watch);
      s.timers.forEach(clearTimeout);
      s.timers.clear();
      document.removeEventListener('keydown', s.onKey);
      if (s.hitButton && s.onHitClick) s.hitButton.removeEventListener('click', s.onHitClick);
      s.ui.root.remove();
      this._snapshot = JSON.parse(JSON.stringify(s.publicState));
      if (this._session === s) this._session = null;
      if (resolveNow && !s.resolved) {
        s.resolved = true;
        s.resolve();
      }
    },

    _finish(s) {
      if (!s.active) return;
      s.publicState.phase = 'finale';
      s.publicState.done = true;
      const cine = s.cine;
      this._cleanup(s, false);
      Promise.resolve(cine && cine.showVolleyballFinale ? cine.showVolleyballFinale() : undefined)
        .catch(() => {})
        .then(() => {
          this._snapshot.phase = 'done';
          if (!s.resolved) {
            s.resolved = true;
            s.resolve();
          }
        });
    },
  };
})();
