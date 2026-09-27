/* ============================================================
   camera-pose.js — front camera + the small pose signal used by volleyball.

   MediaPipe runs locally from the vendored Tasks Vision bundle. Frames are
   read directly from the video element, never copied, recorded, or exposed.
   Landmarks leave this module only as seven named, mirrored screen points.
   ============================================================ */
'use strict';

VA.CameraPose = {
  BASE: 'assets/vendor/mediapipe',
  INTERVAL_MS: 100,
  MIN_VISIBILITY: 0.35,

  _provider: null,
  _loading: null,
  _run: null,
  _state: { running: false, tracks: 0, poseSeen: false, inferenceCount: 0 },

  state() { return JSON.parse(JSON.stringify(this._state)); },

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
        return vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: base + '/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      })().catch(error => { this._loading = null; throw error; });
    }
    return this._loading;
  },

  _reason(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
    return 'unavailable';
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
    this._state = { running: false, tracks: 0, poseSeen: false, inferenceCount: 0 };

    let stream;
    try {
      stream = await this._getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
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

    const tick = () => {
      if (run.stopped) return;
      const video = run.video;
      if (video && video.readyState >= 2) {
        let result = null;
        try { result = landmarker.detectForVideo(video, performance.now()); } catch (error) { result = null; }
        this._state.inferenceCount++;
        const pose = this._pose(result && result.landmarks && result.landmarks[0]);
        const visible = this._complete(pose);
        if (visible) this._state.poseSeen = true;
        if (visible !== run.visible) {
          run.visible = visible;
          onStatus(visible ? 'pose' : 'no-pose');
        }
        onPose(pose);
      }
      if (!run.stopped) run.timer = setTimeout(tick, this.INTERVAL_MS);
    };
    run.timer = setTimeout(tick, 0);
  },

  stop() {
    const run = this._run;
    this._run = null;
    this._state.running = false;
    this._state.tracks = 0;
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
