/* ============================================================
   camera-pose.js — front camera + the small pose signal used by volleyball.

   MediaPipe runs locally from the vendored Tasks Vision bundle. Frames are
   read directly from the video element, never copied, recorded, or exposed.
   Landmarks leave this module only as seven named, mirrored screen points.
   ============================================================ */
'use strict';

VA.CameraPose = {
  BASE: 'assets/vendor/mediapipe',
  // Minimum spacing between pose checks. Inference time counts toward it, so
  // a slow Chromebook samples again at once instead of idling on top.
  MIN_INTERVAL_MS: 50,
  MIN_VISIBILITY: 0.35,
  // Shoulders, elbows, wrists and nose need no fine detail: a small frame
  // keeps inference cheap on classroom Chromebooks. CSS still fills the view.
  VIDEO: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },

  _provider: null,
  _loading: null,
  _model: 'idle', // idle | loading | ready | failed
  _preflight: null,
  _permission: 'unknown', // unknown | pending | granted | denied | unavailable
  _run: null,
  _state: null,

  _freshState() {
    return {
      running: false, tracks: 0, poseSeen: false, inferenceCount: 0,
      inferenceMs: 0, poseHz: 0, frameIntervalMs: 0, videoWidth: 0, videoHeight: 0,
    };
  },

  state() {
    return JSON.parse(JSON.stringify({ ...this._state, permission: this._permission, model: this._model }));
  },

  isSupported() {
    if (this._provider) return true;
    return location.protocol !== 'file:' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  _setProviderForTest(provider) {
    this.stop();
    this._provider = provider || null;
    this._loading = null;
    this._model = 'idle';
    this._preflight = null;
    this._permission = 'unknown';
  },

  _getUserMedia(constraints) {
    if (this._provider) return this._provider.getUserMedia(constraints);
    return navigator.mediaDevices.getUserMedia(constraints);
  },

  _constraints() {
    return { video: JSON.parse(JSON.stringify(this.VIDEO)), audio: false };
  },

  /* One landmarker for the whole session: preflight warms it, every
     activity reuses it. A failed load clears the cache so a later start
     can try again. */
  _loadLandmarker() {
    if (!this._loading) {
      const load = this._provider
        ? Promise.resolve().then(() => this._provider.loadLandmarker())
        : (async () => {
          const base = new URL(this.BASE, document.baseURI).href;
          const vision = await import(base + '/vision_bundle.mjs');
          const fileset = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
          return vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: base + '/pose_landmarker_lite.task', delegate: 'CPU' },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        })();
      const loading = load.then(landmarker => {
        if (this._loading === loading) this._model = 'ready';
        return landmarker;
      }, error => {
        if (this._loading === loading) { this._loading = null; this._model = 'failed'; }
        throw error;
      });
      this._loading = loading;
      this._model = 'loading';
    }
    return this._loading;
  },

  _reason(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
    return 'unavailable';
  },

  /* Called from the title's START / CONTINUE click, so the browser's camera
     prompt appears at the beginning of the game instead of during passport
     control. Warms the pose model, asks for the camera, and stops the stream
     at once: no camera light until an activity starts it. Resolves after the
     permission decision with the outcome; never rejects. The model keeps
     loading in the background and start() awaits the same promise. */
  preflight() {
    if (this._preflight) return this._preflight;
    const settings = VA.State && VA.State.data && VA.State.data.settings;
    if ((settings && settings.camera === false) || !this.isSupported()) return Promise.resolve('skipped');
    this._permission = 'pending';
    this._loadLandmarker().catch(error => console.warn('[CameraPose] pose model unavailable', error));
    this._preflight = (async () => {
      let stream = null;
      try {
        stream = await this._getUserMedia(this._constraints());
        this._permission = 'granted';
      } catch (error) {
        this._permission = this._reason(error);
      } finally {
        if (stream) stream.getTracks().forEach(track => track.stop());
      }
      return this._permission;
    })();
    return this._preflight;
  },

  /* A denial at preflight is remembered for the session so activities fall
     back without reopening the prompt — unless the teacher has since
     allowed the camera in the site settings. */
  async _deniedEarlier() {
    if (this._permission !== 'denied') return false;
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      if (status && status.state === 'granted') {
        this._permission = 'granted';
        return false;
      }
    } catch (error) { /* no Permissions API: keep the remembered denial */ }
    return true;
  },

  _pose(landmarks) {
    if (!landmarks || landmarks.length < 17) return null;
    const point = index => {
      const raw = landmarks[index];
      if (!raw || !isFinite(raw.x) || !isFinite(raw.y)) return null;
      const visibility = raw.visibility == null ? (raw.presence == null ? 1 : raw.presence) : raw.visibility;
      if (!isFinite(visibility) || visibility < this.MIN_VISIBILITY) return null;
      return { x: 1 - raw.x, y: raw.y, v: visibility };
    };
    return {
      leftShoulder: point(11), rightShoulder: point(12),
      leftElbow: point(13), rightElbow: point(14),
      leftWrist: point(15), rightWrist: point(16),
      nose: point(0),
    };
  },

  _complete(pose) {
    return !!(pose && pose.leftShoulder && pose.rightShoulder &&
      pose.leftElbow && pose.rightElbow && pose.leftWrist && pose.rightWrist);
  },

  async start({ videoEl, onPose = () => {}, onStatus = () => {} } = {}) {
    this.stop();
    const run = { stopped: false, stream: null, timer: 0, video: videoEl, visible: null };
    this._run = run;
    this._state = this._freshState();

    if (await this._deniedEarlier()) {
      if (this._run === run) this._run = null;
      throw 'denied';
    }
    if (run.stopped) throw 'cancelled';

    let stream;
    try {
      stream = await this._getUserMedia(this._constraints());
    } catch (error) {
      if (this._run === run) this._run = null;
      throw this._reason(error);
    }
    if (run.stopped) {
      stream.getTracks().forEach(track => track.stop());
      throw 'cancelled';
    }
    run.stream = stream;
    this._state.tracks = stream.getTracks().length;

    let landmarker;
    try {
      landmarker = await this._loadLandmarker();
    } catch (error) {
      console.warn('[CameraPose] pose model unavailable', error);
      if (this._run === run) this.stop();
      throw 'load-failed';
    }
    if (run.stopped) throw 'cancelled';

    if (videoEl) {
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.srcObject = stream;
      try { await videoEl.play(); } catch (error) { /* muted camera autoplay is normally allowed */ }
    }
    if (run.stopped) throw 'cancelled';
    this._state.running = true;
    this._showDebugBadge(run);

    // One inference at a time, always on the newest frame. The next check is
    // scheduled only after this one (and its pose handlers) finish.
    const tick = () => {
      if (run.stopped) return;
      const video = run.video;
      let wait = this.MIN_INTERVAL_MS;
      if (video && video.readyState >= 2) {
        const started = performance.now();
        let result = null;
        try { result = landmarker.detectForVideo(video, started); } catch (error) { result = null; }
        this._measure(run, started, performance.now() - started);
        this._state.inferenceCount++;
        const pose = this._pose(result && result.landmarks && result.landmarks[0]);
        const visible = this._complete(pose);
        if (visible) this._state.poseSeen = true;
        if (visible !== run.visible) {
          run.visible = visible;
          onStatus(visible ? 'pose' : 'no-pose');
        }
        onPose(pose);
        wait = Math.max(0, this.MIN_INTERVAL_MS - (performance.now() - started));
      }
      if (!run.stopped) run.timer = setTimeout(tick, wait);
    };
    run.timer = setTimeout(tick, 0);
  },

  /* Rolling (exponentially smoothed) timings for Chromebook diagnosis:
     inference cost, spacing between checks, and the resulting checks/s. */
  _measure(run, started, inferenceMs) {
    const smooth = (previous, next) => previous == null ? next : previous + (next - previous) * 0.2;
    const st = this._state;
    run.inferenceAvg = smooth(run.inferenceAvg, inferenceMs);
    st.inferenceMs = Math.round(run.inferenceAvg * 10) / 10;
    if (run.lastStart != null) {
      run.intervalAvg = smooth(run.intervalAvg, started - run.lastStart);
      st.frameIntervalMs = Math.round(run.intervalAvg * 10) / 10;
      st.poseHz = run.intervalAvg > 0 ? Math.round(10000 / run.intervalAvg) / 10 : 0;
    }
    run.lastStart = started;
    if (run.video) {
      st.videoWidth = run.video.videoWidth || 0;
      st.videoHeight = run.video.videoHeight || 0;
    }
    if (run.badge && started - (run.badgeAt || 0) > 500) {
      run.badgeAt = started;
      run.badge.textContent = `POSE ${st.poseHz.toFixed(1)}/s\n${Math.round(st.inferenceMs)}ms\n${st.videoWidth}×${st.videoHeight}`;
    }
  },

  // ?debug only: a small read-only stats badge while a pose activity runs.
  _showDebugBadge(run) {
    if (!new URLSearchParams(location.search).has('debug')) return;
    const badge = document.createElement('div');
    badge.className = 'camera-pose-debug';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = 'POSE …';
    document.body.appendChild(badge);
    run.badge = badge;
  },

  stop() {
    const run = this._run;
    this._run = null;
    if (!this._state) this._state = this._freshState();
    this._state.running = false;
    this._state.tracks = 0;
    if (!run) return;
    run.stopped = true;
    clearTimeout(run.timer);
    if (run.badge) run.badge.remove();
    if (run.stream) run.stream.getTracks().forEach(track => track.stop());
    if (run.video) {
      try { run.video.pause(); } catch (error) {}
      run.video.srcObject = null;
    }
  },
};
VA.CameraPose._state = VA.CameraPose._freshState();
