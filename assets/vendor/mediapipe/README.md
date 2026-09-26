# MediaPipe Tasks Vision (vendored)

- Package: `@mediapipe/tasks-vision` 0.10.14 (Apache-2.0, Google LLC)
- Model: `face_landmarker.task` (float16/1) from storage.googleapis.com/mediapipe-models
- Only the SIMD wasm build is vendored; if it cannot load, the eating game
  falls back to tapping.

Loaded lazily by `js/camera-mouth.js` on the first camera eating interaction
only — never on the startup path. No video leaves the browser.
