/* ============================================================
   timeline.js — bounded, cancellable reveal sequences.

   The phone and PC save their final outcome first, then use a timeline only
   to reveal it.  Each handle holds at most one pending timer, applies every
   step exactly once, and can be cancelled (leave the rest) or finished
   (apply the rest now).  VA.Timeline.scale speeds everything up for tests.
   ============================================================ */
'use strict';

VA.Timeline = {
  // test harnesses may set window.VA_TIMELINE_SCALE before boot
  scale: Number(window.VA_TIMELINE_SCALE) || 1,
  _live: new Set(),

  run(steps, opts = {}) {
    const list = (steps || []).filter(step => step && typeof step.apply === 'function');
    const speed = opts.speed || 1;
    let index = 0;
    let timer = null;
    const handle = {
      done: false,
      cancel: () => stop(),
      finish: () => {
        if (handle.done) return;
        clearTimeout(timer);
        while (index < list.length) step();
        stop();
      },
    };
    const stop = () => {
      if (handle.done) return;
      clearTimeout(timer);
      timer = null;
      handle.done = true;
      this._live.delete(handle);
      if (opts.onDone) opts.onDone();
    };
    const step = () => {
      const current = list[index++];
      try { current.apply(); } catch (e) { console.warn('timeline step failed', e); }
    };
    const next = () => {
      if (handle.done) return;
      if (index >= list.length) return stop();
      const delay = Math.max(0, (list[index].after || 0) * speed * this.scale);
      timer = setTimeout(() => {
        timer = null;
        if (handle.done) return;
        step();
        next();
      }, delay);
    };
    this._live.add(handle);
    if (VA.reducedMotion || opts.instant) handle.finish();
    else next();
    return handle;
  },

  active() { return Array.from(this._live); },
  cancelAll() { this.active().forEach(handle => handle.cancel()); },
};
