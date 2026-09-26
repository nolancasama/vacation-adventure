/* ============================================================
   camera-mouth.js — the ONLY place the webcam and face model live.

   Pretend-eating needs one signal: the mouth clearly opens, then
   clearly closes.  MediaPipe Face Landmarker (vendored under
   assets/vendor/mediapipe, loaded on first use only) gives lip
   landmarks; openness = inner-lip gap / mouth width.

   Nothing is recorded, uploaded or stored.  Frames go from the
   <video> element straight into the local model and are dropped.

   VA.CameraMouth.start({ videoEl, onBite, onStatus, onFrame })
     -> resolves once the camera and model are running,
        rejects with 'denied' | 'unavailable' | 'load-failed'
     onStatus('face' | 'no-face') as the face comes and goes
   VA.CameraMouth.stop()   stops every track and the inference loop
   ============================================================ */
'use strict';

VA.CameraMouth = {
  BASE: 'assets/vendor/mediapipe',
  // Tuned for an exaggerated "big bite": a relaxed or talking mouth sits
  // around 0.02-0.2, a deliberate wide-open bite well above 0.3.  The gap
  // between the two thresholds is the hysteresis that absorbs landmark
  // jitter, so hovering near one threshold never produces bites.
  OPEN: 0.32,
  CLOSE: 0.16,
  MIN_BITE_MS: 350,
  INTERVAL_MS: 130, // ~8 checks per second: plenty for a bite, gentle on a Chromebook

  _provider: null,  // test seam: { getUserMedia(constraints), loadLandmarker() }
  _loading: null,
  _run: null,
  _state: { running: false, tracks: 0, inferenceCount: 0, lastOpenness: null, mouth: 'unknown', bites: 0 },

  state() { return JSON.parse(JSON.stringify(this._state)); },

  /* The model loads over http(s) only: under file:// the ES module import and
     wasm fetch are blocked, so the eating game quietly stays tap-only there. */
  isSupported() {
    if (this._provider) return true;
    return location.protocol !== 'file:' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  _setProviderForTest(provider) {
    this.stop();
    this._provider = provider || null;
    this._loading = null;
  },

  /* ---------- pure bite detection (unit-tested) ---------- */
  createBiteDetector({ open = this.OPEN, close = this.CLOSE, minBiteMs = this.MIN_BITE_MS } = {}) {
    // 'unknown' until a closed mouth is seen, so a face that appears
    // mid-bite (or reappears) can never finish a bite it did not start.
    const d = { mouth: 'unknown', bites: 0, lastBiteAt: -Infinity };
    d.feed = (openness, t) => {
      if (openness == null || !isFinite(openness)) { d.mouth = 'unknown'; return false; }
      if (d.mouth === 'unknown') {
        if (openness <= close) d.mouth = 'closed';
        return false;
      }
      if (d.mouth === 'closed') {
        if (openness >= open) d.mouth = 'open';
        return false;
      }
      if (openness > close) return false; // still open: holding it never repeats
      d.mouth = 'closed';
      if (t - d.lastBiteAt < minBiteMs) return false;
      d.lastBiteAt = t;
      d.bites++;
      return true;
    };
    return d;
  },

  /* Landmarks are normalised to the frame, so scale to pixels before taking
     a ratio: 13/14 = inner upper/lower lip, 61/291 = mouth corners. */
  openness(landmarks, w = 1, h = 1) {
    if (!landmarks || landmarks.length < 292) return null;
    const dist = (a, b) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
    const width = dist(landmarks[61], landmarks[291]);
    if (!width) return null;
    return dist(landmarks[13], landmarks[14]) / width;
  },

  /* ---------- camera + model ---------- */
  _getUserMedia(constraints) {
    if (this._provider) return this._provider.getUserMedia(constraints);
    return navigator.mediaDevices.getUserMedia(constraints);
  },

  _loadLandmarker() {
    if (this._provider) return Promise.resolve(this._provider.loadLandmarker());
    if (!this._loading) {
      this._loading = (async () => {
        const base = new URL(this.BASE, document.baseURI).href;
        const vision = await import(base + '/vision_bundle.mjs');
        const fileset = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
        return vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: base + '/face_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      })().catch(error => { this._loading = null; throw error; });
    }
    return this._loading;
  },

  /* Start loading the model without touching the camera, e.g. as soon as a
     food event begins, so a later camera press starts faster. */
  prewarm() {
    if (!this.isSupported() || this._provider) return;
    this._loadLandmarker().catch(() => {});
  },

  _reason(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
    return 'unavailable';
  },

  async start({ videoEl, onBite = () => {}, onStatus = () => {}, onFrame = () => {} } = {}) {
    this.stop();
    const run = { stopped: false, stream: null, timer: 0, video: videoEl, detector: this.createBiteDetector(), face: null };
    this._run = run;
    Object.assign(this._state, { running: false, tracks: 0, inferenceCount: 0, lastOpenness: null, mouth: 'unknown', bites: 0 });

    let stream;
    try {
      stream = await this._getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
    } catch (error) {
      if (this._run === run) this._run = null;
      throw this._reason(error);
    }
    // Stopped (student tapped the food away, left the scene) while the
    // permission prompt was open: release the camera at once.
    if (run.stopped) { stream.getTracks().forEach(track => track.stop()); throw 'cancelled'; }
    run.stream = stream;
    this._state.tracks = stream.getTracks().length;

    let landmarker;
    try {
      landmarker = await this._loadLandmarker();
    } catch (error) {
      console.warn('[CameraMouth] face model unavailable', error);
      if (this._run === run) this.stop();
      throw 'load-failed';
    }
    if (run.stopped) throw 'cancelled';

    if (videoEl) {
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.srcObject = stream;
      try { await videoEl.play(); } catch (error) { /* autoplay of a muted stream is allowed; ignore */ }
    }
    if (run.stopped) throw 'cancelled';
    this._state.running = true;

    const tick = () => {
      if (run.stopped) return;
      const video = run.video;
      if (video && video.readyState >= 2) {
        let result = null;
        try { result = landmarker.detectForVideo(video, performance.now()); } catch (error) { result = null; }
        this._state.inferenceCount++;
        const landmarks = result && result.faceLandmarks && result.faceLandmarks[0];
        const openness = landmarks ? this.openness(landmarks, video.videoWidth || 1, video.videoHeight || 1) : null;
        this._state.lastOpenness = openness;
        const face = openness != null;
        if (face !== run.face) { run.face = face; onStatus(face ? 'face' : 'no-face'); }
        if (run.detector.feed(openness, performance.now())) {
          this._state.bites = run.detector.bites;
          onBite();
        }
        this._state.mouth = run.detector.mouth;
        onFrame({ face, openness, mouth: run.detector.mouth });
      }
      if (!run.stopped) run.timer = setTimeout(tick, this.INTERVAL_MS);
    };
    run.timer = setTimeout(tick, 0);
  },

  stop() {
    const run = this._run;
    this._run = null;
    this._state.running = false;
    if (!run) return;
    run.stopped = true;
    clearTimeout(run.timer);
    if (run.stream) run.stream.getTracks().forEach(track => track.stop());
    if (run.video) {
      try { run.video.pause(); } catch (error) {}
      run.video.srcObject = null;
    }
  },
};
