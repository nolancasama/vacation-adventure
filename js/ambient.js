/* ============================================================
   ambient.js — environmental animation on one overlay canvas.

   Scenes request a set of living effects:
     clouds · birds · shimmer (ocean) · twinkle (city lights)
     fireflies · particles (leaf/sand/petal/snow) · motes
   plus one-shot bursts (confetti).

   All positions are stage fractions (0..1) of the 960×600 stage.
   ============================================================ */
'use strict';

VA.Ambient = {
  canvas: null, ctx: null,
  fx: [],          // persistent scene effects
  shots: [],       // one-shot bursts (confetti)
  _raf: null,
  _last: 0,

  init() {
    this.canvas = VA.$('#ambient');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(2, 2); // canvas is 1920×1200 for crispness
  },

  /* build a scene's effect set (replaces the previous set) */
  set(list) {
    this.fx = [];
    if (list) {
      const mult = VA.reducedMotion ? 0.4 : 1;
      for (const cfg of list) {
        const make = this._makers[cfg.type];
        if (make) this.fx.push(make.call(this, cfg, mult));
      }
    }
    this._ensureLoop();
  },

  stop() { this.set(null); },

  burst(type, opts = {}) {
    if (type === 'confetti') this.shots.push(this._confetti(opts));
    this._ensureLoop();
  },

  _ensureLoop() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = t => {
      const dt = Math.min(0.05, (t - this._last) / 1000);
      this._last = t;
      this.ctx.clearRect(0, 0, VA.W, VA.H);
      for (const f of this.fx) f.step(dt, this.ctx);
      this.shots = this.shots.filter(s => s.step(dt, this.ctx));
      if (this.fx.length || this.shots.length) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._raf = null;
        this.ctx.clearRect(0, 0, VA.W, VA.H);
      }
    };
    this._raf = requestAnimationFrame(tick);
  },

  /* ---------- effect factories ---------- */
  _makers: {

    clouds(cfg, mult) {
      const n = Math.max(2, Math.round((cfg.n || 5) * mult));
      const band = cfg.band || [0.03, 0.3];
      const tint = cfg.tint || '255,255,255';
      // real painted cloud sprites, drawn once loaded; the procedural puff
      // cluster below stays as the fallback until they're cached (or if
      // they're never dropped into assets/objects/)
      const cloudPaths = ['cloud_1.png', 'cloud_2.png', 'cloud_3.png'].map(f => 'assets/objects/' + f);
      cloudPaths.forEach(p => VA.Art._loadImage(p));
      const cs = Array.from({ length: n }, () => ({
        x: Math.random() * 1.3 - 0.15,
        y: VA.rand(band[0], band[1]),
        s: VA.rand(0.025, 0.055),
        v: VA.rand(0.003, 0.008),
        a: VA.rand(0.35, 0.7),
        img: VA.pick(cloudPaths),
      }));
      return {
        step(dt, ctx) {
          for (const c of cs) {
            c.x += c.v * dt;
            if (c.x > 1.18) { c.x = -0.18; c.y = VA.rand(band[0], band[1]); c.img = VA.pick(cloudPaths); }
            const px = c.x * VA.W, py = c.y * VA.H, s = c.s * VA.W;
            const cached = VA.Art._imgCache[c.img];
            if (cached && cached.state === 'ok') {
              const img = cached.img;
              const w = s * 3.4, h = w * (img.naturalHeight / img.naturalWidth);
              ctx.save();
              ctx.globalAlpha = c.a;
              ctx.drawImage(img, px - w / 2, py - h / 2, w, h);
              ctx.restore();
            } else {
              ctx.fillStyle = `rgba(${tint},${c.a})`;
              [[0, 0, 1], [-0.9, 0.25, 0.7], [0.9, 0.22, 0.75], [-0.3, -0.35, 0.65], [0.45, -0.3, 0.6]]
                .forEach(([dx, dy, ds]) => {
                  ctx.beginPath();
                  ctx.arc(px + dx * s, py + dy * s, s * ds, 0, 7);
                  ctx.fill();
                });
            }
          }
        }
      };
    },

    birds(cfg, mult) {
      const band = cfg.band || [0.06, 0.3];
      const color = cfg.color || 'rgba(70,60,55,.85)';
      const size = cfg.size || 1;
      const every = cfg.every || [4, 10];
      let birds = [];
      let nextAt = VA.rand(1, 3);
      let clock = 0;
      return {
        step(dt, ctx) {
          clock += dt;
          if (clock > nextAt && mult > 0.3) {
            clock = 0; nextAt = VA.rand(every[0], every[1]);
            const ltr = Math.random() < 0.5;
            birds.push({
              x: ltr ? -0.05 : 1.05,
              y: VA.rand(band[0], band[1]),
              v: (ltr ? 1 : -1) * VA.rand(0.06, 0.11),
              ph: Math.random() * 6,
            });
          }
          birds = birds.filter(b => b.x > -0.1 && b.x < 1.1);
          for (const b of birds) {
            b.x += b.v * dt; b.ph += dt * 9;
            const px = b.x * VA.W, py = (b.y + Math.sin(b.ph * 0.4) * 0.01) * VA.H;
            const flap = Math.sin(b.ph) * 5 * size;
            ctx.strokeStyle = color; ctx.lineWidth = 2.2 * size; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px - 8 * size, py - flap);
            ctx.quadraticCurveTo(px, py + 3 * size, px + 8 * size, py - flap);
            ctx.stroke();
          }
        }
      };
    },

    shimmer(cfg, mult) {
      const r = cfg.rect || [0, 0.42, 1, 0.28]; // x,y,w,h fractions
      const n = Math.round((cfg.n || 26) * mult);
      const dots = Array.from({ length: n }, () => ({
        x: r[0] + Math.random() * r[2],
        y: r[1] + Math.random() * r[3],
        ph: Math.random() * 6,
        sp: VA.rand(1.2, 2.6),
      }));
      return {
        step(dt, ctx) {
          for (const d of dots) {
            d.ph += dt * d.sp;
            const a = (Math.sin(d.ph) + 1) / 2;
            if (a < 0.25) { if (Math.random() < 0.01) { d.x = r[0] + Math.random() * r[2]; d.y = r[1] + Math.random() * r[3]; } continue; }
            ctx.fillStyle = `rgba(255,255,255,${a * 0.75})`;
            const px = d.x * VA.W, py = d.y * VA.H, s = 1.4 + a * 2;
            ctx.beginPath();
            ctx.moveTo(px, py - s); ctx.lineTo(px + s, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s, py);
            ctx.fill();
          }
        }
      };
    },

    twinkle(cfg, mult) {
      const r = cfg.rect || [0.4, 0.1, 0.3, 0.6];
      const n = Math.round((cfg.n || 14) * mult);
      const color = cfg.color || '255,224,138';
      const dots = Array.from({ length: n }, () => ({
        x: r[0] + Math.random() * r[2],
        y: r[1] + Math.random() * r[3],
        ph: Math.random() * 6, sp: VA.rand(0.7, 1.8),
      }));
      return {
        step(dt, ctx) {
          for (const d of dots) {
            d.ph += dt * d.sp;
            const a = Math.max(0, Math.sin(d.ph));
            ctx.fillStyle = `rgba(${color},${a * 0.9})`;
            ctx.beginPath();
            ctx.arc(d.x * VA.W, d.y * VA.H, 1.1 + a * 1.6, 0, 7);
            ctx.fill();
          }
        }
      };
    },

    fireflies(cfg, mult) {
      const band = cfg.band || [0.55, 0.85];
      const n = Math.round((cfg.n || 8) * mult);
      const fs = Array.from({ length: n }, () => ({
        x: Math.random(), y: VA.rand(band[0], band[1]),
        ph: Math.random() * 6, vx: VA.rand(-0.012, 0.012), vy: VA.rand(-0.006, 0.006),
      }));
      return {
        step(dt, ctx) {
          for (const f of fs) {
            f.ph += dt * 1.6;
            f.x += f.vx * dt + Math.sin(f.ph * 0.6) * 0.0004;
            f.y += f.vy * dt + Math.cos(f.ph * 0.4) * 0.0003;
            if (f.x < 0 || f.x > 1) f.vx *= -1;
            if (f.y < band[0] || f.y > band[1]) f.vy *= -1;
            const a = (Math.sin(f.ph) + 1) / 2;
            const px = f.x * VA.W, py = f.y * VA.H;
            const g = ctx.createRadialGradient(px, py, 0, px, py, 7);
            g.addColorStop(0, `rgba(255,240,160,${0.5 * a + 0.15})`);
            g.addColorStop(1, 'rgba(255,240,160,0)');
            ctx.fillStyle = g;
            ctx.fillRect(px - 8, py - 8, 16, 16);
          }
        }
      };
    },

    particles(cfg, mult) {
      const kind = cfg.kind || 'leaf';
      const n = Math.round((cfg.n || 10) * mult);
      const K = {
        leaf:  { colors: ['#7cae5a', '#9cbf6e', '#b3a75a'], vy: [0.03, 0.06], vx: [-0.02, 0.02], s: [3, 5], spin: true },
        petal: { colors: ['#ffc4d0', '#ffd9e0', '#ffe9ee'], vy: [0.02, 0.05], vx: [-0.02, 0.03], s: [2.5, 4], spin: true },
        sand:  { colors: ['rgba(230,190,120,.8)', 'rgba(210,170,100,.7)'], vy: [0.005, 0.02], vx: [0.09, 0.16], s: [1.2, 2.2], spin: false },
        snow:  { colors: ['rgba(255,255,255,.9)'], vy: [0.03, 0.06], vx: [-0.01, 0.01], s: [1.5, 3], spin: false },
      }[kind];
      const ps = Array.from({ length: n }, () => ({
        x: Math.random(), y: Math.random(),
        vy: VA.rand(K.vy[0], K.vy[1]), vx: VA.rand(K.vx[0], K.vx[1]),
        s: VA.rand(K.s[0], K.s[1]), rot: Math.random() * 6, vr: VA.rand(-2, 2),
        c: VA.pick(K.colors),
      }));
      return {
        step(dt, ctx) {
          for (const q of ps) {
            q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
            if (q.y > 1.02 || q.x > 1.05) { q.y = -0.03 + (q.x > 1.05 ? Math.random() : 0); q.x = q.x > 1.05 ? -0.05 : Math.random(); }
            const px = q.x * VA.W, py = q.y * VA.H;
            ctx.fillStyle = q.c;
            if (K.spin) {
              ctx.save(); ctx.translate(px, py); ctx.rotate(q.rot);
              ctx.beginPath(); ctx.ellipse(0, 0, q.s * 1.6, q.s * 0.8, 0, 0, 7); ctx.fill();
              ctx.restore();
            } else {
              ctx.beginPath(); ctx.arc(px, py, q.s, 0, 7); ctx.fill();
            }
          }
        }
      };
    },

    motes(cfg, mult) {
      const r = cfg.rect || [0.1, 0.14, 0.3, 0.4];
      const n = Math.round((cfg.n || 9) * mult);
      const ms = Array.from({ length: n }, () => ({
        x: r[0] + Math.random() * r[2], y: r[1] + Math.random() * r[3], ph: Math.random() * 6,
      }));
      return {
        step(dt, ctx) {
          for (const m of ms) {
            m.ph += dt * 0.7;
            m.y -= dt * 0.006;
            if (m.y < r[1]) m.y = r[1] + r[3];
            const a = (Math.sin(m.ph) + 1) / 2;
            ctx.fillStyle = `rgba(255,244,214,${0.12 + a * 0.25})`;
            ctx.beginPath();
            ctx.arc((m.x + Math.sin(m.ph) * 0.004) * VA.W, m.y * VA.H, 1.6, 0, 7);
            ctx.fill();
          }
        }
      };
    },
  },

  /* ---------- one-shot confetti ---------- */
  _confetti(opts) {
    const n = VA.reducedMotion ? 30 : (opts.n || 90);
    const colors = ['#ff8a5c', '#ffd166', '#79b851', '#7ec8e3', '#e884b0', '#fff'];
    const ps = Array.from({ length: n }, () => ({
      x: VA.rand(0.15, 0.85), y: VA.rand(-0.15, -0.02),
      vx: VA.rand(-0.06, 0.06), vy: VA.rand(0.12, 0.3),
      s: VA.rand(3, 6), rot: Math.random() * 6, vr: VA.rand(-6, 6),
      c: VA.pick(colors),
    }));
    let life = 0;
    return {
      step(dt, ctx) {
        life += dt;
        for (const q of ps) {
          q.vy += dt * 0.12;
          q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
          ctx.save();
          ctx.translate(q.x * VA.W, q.y * VA.H);
          ctx.rotate(q.rot);
          ctx.fillStyle = q.c;
          ctx.fillRect(-q.s / 2, -q.s / 3, q.s, q.s * 0.66);
          ctx.restore();
        }
        return life < 3.4;
      }
    };
  },
};
