/* ============================================================
   art.js — placeholder art system.

   NO real artwork ships with the game. Every visual is either:
     • a procedural "painted sketch" on canvas (backgrounds), or
     • a simple generated SVG figure (characters), or
     • an emoji stand-in (small objects/props)
   ...and every one is labeled with the REAL asset filename it
   stands in for (small chip in the corner).

   Drop the real file into assets/<kind>/<file> and it is used
   automatically — the chip then shows a ✓.
   ============================================================ */
'use strict';

VA.Art = {

  /* ---------------------------------------------------------
     layer(parent, {painter, file, kind, w, h}) — a scene layer:
     procedural canvas now, real image when the file exists.

     Real images are cached by path (VA._imgCache) so revisiting a
     screen never re-fetches/re-decodes art that already loaded —
     without this, every navigation briefly flashed back to the
     placeholder canvas before swapping to the real art again.
     --------------------------------------------------------- */
  _imgCache: {},

  _loadImage(path, onReady, onError) {
    let entry = this._imgCache[path];
    if (!entry) {
      entry = this._imgCache[path] = { state: 'pending', img: null, cbs: [], errorCbs: [] };
      const img = new Image();
      img.onload = () => {
        entry.state = 'ok'; entry.img = img;
        entry.cbs.forEach(cb => cb(img)); entry.cbs = [];
      };
      img.onerror = () => {
        entry.state = 'fail'; entry.cbs = [];
        entry.errorCbs.forEach(cb => cb(path)); entry.errorCbs = [];
      };
      img.src = path;
    }
    if (entry.state === 'ok' && onReady) onReady(entry.img);
    else if (entry.state === 'pending' && onReady) entry.cbs.push(onReady);
    if (entry.state === 'fail' && onError) onError(path);
    else if (entry.state === 'pending' && onError) entry.errorCbs.push(onError);
    return entry;
  },

  /* Start decoding screen art while another screen is visible.  This lets the
     first visit use the real bitmap directly instead of briefly showing its
     procedural fallback. */
  preload(paths) {
    paths.forEach(path => this._loadImage(path));
  },

  /* Load a scene's initial bitmap set concurrently.  Image.decode() gives the
     browser a chance to finish decoding before the scene is assembled, so the
     first visible frame contains real pixels rather than late-loading sprites.

     An image already cached as 'ok' has already loaded and painted at least
     once — skip re-decoding it. Re-running decode() on an already-painted
     <img> can spuriously reject (seen under file:// specifically, worded as
     a CORS failure even though nothing cross-origin is happening), and since
     the image is demonstrably already usable, a rejection here must never
     poison its cache entry the way a genuine load failure should. */
  preloadAndWait(paths) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    return Promise.all(uniquePaths.map(path => new Promise(resolve => {
      const already = this._imgCache[path];
      if (already && already.state === 'ok') { resolve({ path, ok: true }); return; }
      const ready = img => {
        const decoded = img.decode ? img.decode() : Promise.resolve();
        decoded.then(
          () => resolve({ path, ok: true }),
          () => resolve({ path, ok: true }), // image loaded fine; decode() itself is just a hint
        );
      };
      const failed = file => {
        console.error(`[Asset preload failed] ${file}`);
        resolve({ path: file, ok: false });
      };
      this._loadImage(path, ready, failed);
    })));
  },

  /* Every scene layer and sprite registers its source path.  The screen
     manager can then wait for just the incoming screen's assets, instead of
     holding a transition for unrelated background preloads. */
  waitForScreenAssets(screen) {
    if (!screen) return Promise.resolve([]);
    const paths = [
      ...Array.from(screen.querySelectorAll('[data-asset-path]'), el => el.dataset.assetPath),
      ...Array.from(screen.querySelectorAll('img[src]'), img => img.getAttribute('src')),
    ].filter(path => path && !path.startsWith('data:'));
    return this.preloadAndWait(paths);
  },

  layer(parent, opts) {
    const { painter, file, kind = 'backgrounds', w = VA.W, h = VA.H, chip = true, fallback } = opts;
    const lay = VA.el('div', 'art-layer');
    const path = file ? ('assets/' + kind + '/' + file) : null;
    if (path) lay.dataset.assetPath = path;
    const cached = path ? this._imgCache[path] : null;
    const alreadyLoaded = !!(cached && cached.state === 'ok');
    // When a real asset is supplied, begin painting that same asset right
    // away.  This prevents the procedural default art from flashing before
    // the decoded <img> clone is ready on a screen's first visit.
    if (path) {
      lay.style.background = `center / cover no-repeat url("${path}")`;
    }
    const assetFailed = !!(cached && cached.state === 'fail');
    const useFallback = fallback == null ? (!file || assetFailed) : fallback;

    // Procedural art is now only a true fallback for layers without a supplied
    // file (or for callers that explicitly request one).
    const renderFallback = () => {
      if (lay.querySelector('canvas')) return;
      const cv = document.createElement('canvas');
      const scale = 2; // crispness when the stage is upscaled
      cv.width = w * scale; cv.height = h * scale;
      const ctx = cv.getContext('2d');
      ctx.scale(scale, scale);
      const fn = this.painters[painter];
      if (fn) fn(ctx, w, h); else this.painters._missing(ctx, w, h, painter || file);
      lay.appendChild(cv);
    };
    if (!alreadyLoaded && useFallback) renderFallback();

    if (file && chip) {
      lay.appendChild(VA.el('span', 'asset-chip' + (alreadyLoaded ? ' real' : ''), file));
    }
    if (path) {
      this._loadImage(path, img => {
        const clone = img.cloneNode(); // decoded bitmap is shared, cloning is cheap
        const chipEl = lay.querySelector('.asset-chip');
        if (chipEl) lay.insertBefore(clone, chipEl); else lay.appendChild(clone);
        if (chipEl) chipEl.classList.add('real');
      }, renderFallback);
    }
    if (parent) parent.appendChild(lay);
    return lay;
  },

  /* ---------------------------------------------------------
     Painter toolkit — all coordinates are FRACTIONS (0..1) of
     the canvas, so the same painter draws backgrounds, card
     thumbnails and polaroid photos.
     --------------------------------------------------------- */
  _p(ctx, w, h) {
    const X = f => f * w, Y = f => f * h;
    const p = {
      grad(stops, y0 = 0, y1 = 1) {
        const g = ctx.createLinearGradient(0, Y(y0), 0, Y(y1));
        stops.forEach(([o, c]) => g.addColorStop(o, c));
        return g;
      },
      sky(stops, to = 1) { ctx.fillStyle = p.grad(stops, 0, to); ctx.fillRect(0, 0, w, Y(to)); },
      rect(x, y, ww, hh, c, r = 0) {
        ctx.fillStyle = c;
        if (!r) return ctx.fillRect(X(x), Y(y), X(ww), Y(hh));
        const rx = X(x), ry = Y(y), rw = X(ww), rh = Y(hh), rr = Math.min(r * w, rw / 2, rh / 2);
        ctx.beginPath();
        ctx.moveTo(rx + rr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
        ctx.arcTo(rx, ry + rh, rx, ry, rr);
        ctx.arcTo(rx, ry, rx + rw, ry, rr);
        ctx.fill();
      },
      circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r * w, 0, 7); ctx.fill(); },
      ellipse(x, y, rx, ry, c, rot = 0) {
        ctx.fillStyle = c; ctx.beginPath();
        ctx.ellipse(X(x), Y(y), rx * w, ry * h, rot, 0, 7); ctx.fill();
      },
      tri(x1, y1, x2, y2, x3, y3, c) {
        ctx.fillStyle = c; ctx.beginPath();
        ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.lineTo(X(x3), Y(y3));
        ctx.closePath(); ctx.fill();
      },
      poly(pts, c) {
        ctx.fillStyle = c; ctx.beginPath();
        pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
        ctx.closePath(); ctx.fill();
      },
      line(x1, y1, x2, y2, c, lw = 0.004) {
        ctx.strokeStyle = c; ctx.lineWidth = lw * w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
      },
      sun(x, y, r, c = '#ffe9a3') {
        const g = ctx.createRadialGradient(X(x), Y(y), 1, X(x), Y(y), r * 2.6 * w);
        g.addColorStop(0, c); g.addColorStop(0.35, c + 'cc'); g.addColorStop(1, c + '00');
        ctx.fillStyle = g; ctx.fillRect(X(x) - r * 3 * w, Y(y) - r * 3 * w, r * 6 * w, r * 6 * w);
        p.circle(x, y, r, '#fff6d8');
      },
      cloud(x, y, s, a = 0.85) {
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        [[0, 0, 1], [-0.9, 0.25, 0.72], [0.9, 0.22, 0.78], [-0.35, -0.35, 0.7], [0.42, -0.3, 0.65]]
          .forEach(([dx, dy, ds]) => {
            ctx.beginPath();
            ctx.arc(X(x) + dx * s * w, Y(y) + dy * s * w, s * ds * w, 0, 7);
            ctx.fill();
          });
      },
      sea(y0, y1, bands) {
        const bh = (y1 - y0) / bands.length;
        bands.forEach((c, i) => p.rect(0, y0 + bh * i, 1, bh + 0.003, c));
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        for (let i = 0; i < 14; i++) p.ellipse(Math.random(), y1 - 0.01, 0.02 + Math.random() * 0.02, 0.004, 'rgba(255,255,255,.7)');
      },
      palm(x, y, s = 1, lean = 1) {
        ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 0.011 * s * w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(x), Y(y));
        ctx.quadraticCurveTo(X(x) + 0.02 * lean * w, Y(y) - 0.12 * s * h, X(x) + 0.045 * lean * s * w, Y(y) - 0.22 * s * h);
        ctx.stroke();
        const tx = x + 0.045 * lean * s, ty = y - 0.22 * s;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          p.ellipse(tx + Math.cos(ang) * 0.035 * s, ty + Math.sin(ang) * 0.028 * s * (h / w) * 1.6,
            0.034 * s, 0.013 * s * 1.6, '#5f9e4c', ang);
        }
        p.circle(tx, ty, 0.008 * s, '#7a5a34');
      },
      pyramid(x, base, peakY, halfW, c1 = '#dca75f', c2 = '#b3803f') {
        p.tri(x - halfW, base, x, peakY, x + halfW, base, c1);
        p.tri(x, peakY, x + halfW * 0.18, base, x + halfW, base, c2);
      },
      tent(x, y, s, c1, c2) {
        p.tri(x - s, y, x, y - s * 1.5, x + s, y, c1);
        p.tri(x - s * 0.33, y, x, y - s * 1.4, x + s * 0.33, y, c2);
      },
      windows(x0, x1, y0, y1, n, c = '#ffd166') {
        for (let i = 0; i < n; i++) {
          const wx = x0 + Math.random() * (x1 - x0), wy = y0 + Math.random() * (y1 - y0);
          p.rect(wx, wy, 0.008, 0.014, Math.random() < 0.75 ? c : '#ffb35c');
        }
      },
      stringLights(x0, x1, y, sag, n = 9) {
        ctx.strokeStyle = 'rgba(60,45,60,.7)'; ctx.lineWidth = 0.002 * w;
        ctx.beginPath(); ctx.moveTo(X(x0), Y(y));
        ctx.quadraticCurveTo(X((x0 + x1) / 2), Y(y + sag), X(x1), Y(y));
        ctx.stroke();
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const lx = x0 + (x1 - x0) * t;
          const ly = y + sag * (1 - Math.pow(2 * t - 1, 2));
          p.circle(lx, ly + 0.008, 0.006, i % 2 ? '#ffe08a' : '#ffb35c');
        }
      },
      emoji(ch, x, y, size) {
        ctx.font = (size * w) + 'px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ch, X(x), Y(y));
      },
      text(str, x, y, size, c, bold) {
        ctx.font = (bold ? 'bold ' : '') + (size * w) + 'px "Comic Sans MS", sans-serif';
        ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, X(x), Y(y));
      },
      vignette() {
        const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,20,5,.18)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      },
    };
    return p;
  },

  painters: null, // filled below

  /* ---------------------------------------------------------
     Characters — generated SVG "paper doll" placeholders.
     --------------------------------------------------------- */
  charSVG(spec, mood = 'happy', hPx = 150) {
    if (spec.animal) return this._animalSVG(spec, mood, hPx);
    const s = spec.colors || {};
    const skin = s.skin || '#ffd9b3', hair = s.hair || '#5a3b2e';
    const top = s.top || '#4aa3df', bottom = s.bottom || '#6b7f96';
    let parts = '';

    // legs + shoes
    parts += `<rect x="38" y="98" width="9" height="22" rx="4" fill="${bottom}"/>
              <rect x="53" y="98" width="9" height="22" rx="4" fill="${bottom}"/>
              <ellipse cx="42" cy="122" rx="8" ry="4.5" fill="#7a5a44"/>
              <ellipse cx="58" cy="122" rx="8" ry="4.5" fill="#7a5a44"/>`;
    // body + arms
    parts += `<rect x="26" y="56" width="48" height="48" rx="17" fill="${top}"/>
              <line x1="30" y1="70" x2="18" y2="90" stroke="${top}" stroke-width="9" stroke-linecap="round"/>
              <line x1="70" y1="70" x2="82" y2="90" stroke="${top}" stroke-width="9" stroke-linecap="round"/>
              <circle cx="18" cy="92" r="4.6" fill="${skin}"/><circle cx="82" cy="92" r="4.6" fill="${skin}"/>`;
    if (spec.apron) parts += `<path d="M36 60 L64 60 L68 100 L32 100 Z" fill="#fff4dd" opacity=".92"/>
                              <rect x="40" y="64" width="20" height="14" rx="3" fill="#fff4dd"/>`;
    // hair behind + head
    parts += `<circle cx="50" cy="31" r="25" fill="${hair}"/>`;
    if (spec.hairStyle === 'bun') parts += `<circle cx="72" cy="14" r="9" fill="${hair}"/>`;
    if (spec.hairStyle === 'pigtails') parts += `<circle cx="24" cy="34" r="9" fill="${hair}"/><circle cx="76" cy="34" r="9" fill="${hair}"/>`;
    if (spec.hairStyle === 'long') parts += `<rect x="26" y="30" width="12" height="30" rx="6" fill="${hair}"/><rect x="62" y="30" width="12" height="30" rx="6" fill="${hair}"/>`;
    parts += `<circle cx="50" cy="37" r="22" fill="${skin}"/>`;
    // face
    const blush = `<circle cx="37" cy="44" r="4" fill="#ff9d7a" opacity=".55"/><circle cx="63" cy="44" r="4" fill="#ff9d7a" opacity=".55"/>`;
    if (mood === 'wow') {
      parts += `<circle cx="42" cy="36" r="4" fill="#332621"/><circle cx="58" cy="36" r="4" fill="#332621"/>
                <circle cx="43.4" cy="34.6" r="1.4" fill="#fff"/><circle cx="59.4" cy="34.6" r="1.4" fill="#fff"/>
                <ellipse cx="50" cy="47" rx="5" ry="6.4" fill="#69423a"/>` + blush;
    } else if (mood === 'sad') {
      parts += `<circle cx="42" cy="37" r="2.6" fill="#332621"/><circle cx="58" cy="37" r="2.6" fill="#332621"/>
                <path d="M44 50 Q50 45 56 50" stroke="#69423a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    } else { // happy / neutral
      parts += `<circle cx="42" cy="36" r="2.8" fill="#332621"/><circle cx="58" cy="36" r="2.8" fill="#332621"/>
                <path d="M43 45 Q50 52 57 45" stroke="#69423a" stroke-width="2.6" fill="none" stroke-linecap="round"/>` + blush;
    }
    if (spec.glasses) parts += `<circle cx="42" cy="36" r="7.4" fill="none" stroke="#7c6753" stroke-width="2"/>
                                <circle cx="58" cy="36" r="7.4" fill="none" stroke="#7c6753" stroke-width="2"/>
                                <line x1="49" y1="36" x2="51" y2="36" stroke="#7c6753" stroke-width="2"/>`;
    // hats
    const hatC = s.hat || '#e35f4f';
    if (spec.hat === 'cap')    parts += `<path d="M28 24 A22 20 0 0 1 72 24 L72 27 L28 27 Z" fill="${hatC}"/><rect x="60" y="23" width="24" height="6" rx="3" fill="${hatC}"/>`;
    if (spec.hat === 'sunhat') parts += `<ellipse cx="50" cy="21" rx="30" ry="7" fill="${hatC}"/><path d="M32 21 A18 16 0 0 1 68 21 Z" fill="${hatC}"/>`;
    if (spec.hat === 'ranger') parts += `<ellipse cx="50" cy="20" rx="27" ry="6" fill="#a8814f"/><path d="M34 20 A16 15 0 0 1 66 20 Z" fill="#a8814f"/><rect x="34" y="16" width="32" height="4" fill="#7a5a34"/>`;
    if (spec.hat === 'chef')   parts += `<path d="M32 22 L68 22 L68 12 A9 9 0 0 0 56 6 A10 10 0 0 0 44 6 A9 9 0 0 0 32 12 Z" fill="#fff"/>`;
    if (spec.hat === 'beret')  parts += `<ellipse cx="46" cy="16" rx="20" ry="8" fill="${hatC}" transform="rotate(-8 46 16)"/><circle cx="46" cy="9" r="2.6" fill="${hatC}"/>`;
    if (spec.hat === 'scarf')  parts += `<path d="M26 30 A25 22 0 0 1 74 30 L74 40 A25 25 0 0 0 26 40 Z" fill="${hatC}" opacity=".95"/>`;

    const wPx = hPx * (100 / 130);
    return `<svg width="${wPx}" height="${hPx}" viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg">${parts}</svg>`;
  },

  _animalSVG(spec, mood, hPx) {
    let inner = '';
    if (spec.animal === 'kangaroo') {
      inner = `
        <path d="M104 118 Q140 112 146 84 Q132 96 102 100 Z" fill="#9c6f42"/>
        <ellipse cx="78" cy="92" rx="34" ry="40" fill="#b5875a"/>
        <ellipse cx="78" cy="102" rx="20" ry="26" fill="#e3c39a"/>
        <ellipse cx="52" cy="126" rx="17" ry="7" fill="#9c6f42"/>
        <ellipse cx="98" cy="126" rx="17" ry="7" fill="#9c6f42"/>
        <line x1="62" y1="74" x2="54" y2="88" stroke="#b5875a" stroke-width="8" stroke-linecap="round"/>
        <line x1="92" y1="74" x2="99" y2="88" stroke="#b5875a" stroke-width="8" stroke-linecap="round"/>
        <ellipse cx="56" cy="16" rx="6.5" ry="15" fill="#b5875a" transform="rotate(-14 56 16)"/>
        <ellipse cx="76" cy="14" rx="6.5" ry="15" fill="#b5875a" transform="rotate(10 76 14)"/>
        <ellipse cx="56" cy="19" rx="3" ry="9" fill="#e3c39a" transform="rotate(-14 56 16)"/>
        <circle cx="66" cy="40" r="19" fill="#b5875a"/>
        <ellipse cx="56" cy="47" rx="12" ry="8" fill="#c99e6f"/>
        <circle cx="49" cy="46" r="3.4" fill="#4a3225"/>
        <circle cx="66" cy="36" r="3" fill="#332621"/>
        <path d="M60 52 Q64 55 68 52" stroke="#69423a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    } else if (spec.animal === 'camel') {
      inner = `
        <rect x="30" y="98" width="8" height="28" rx="3.5" fill="#b3804a"/>
        <rect x="52" y="100" width="8" height="26" rx="3.5" fill="#b3804a"/>
        <rect x="76" y="100" width="8" height="26" rx="3.5" fill="#b3804a"/>
        <rect x="94" y="98" width="8" height="28" rx="3.5" fill="#b3804a"/>
        <circle cx="56" cy="58" r="17" fill="#c9995f"/>
        <circle cx="86" cy="58" r="15" fill="#c9995f"/>
        <ellipse cx="70" cy="84" rx="42" ry="26" fill="#c9995f"/>
        <rect x="52" y="66" width="38" height="20" rx="6" fill="#c25b4e"/>
        <rect x="52" y="72" width="38" height="4" fill="#ffd166"/>
        <path d="M104 84 Q120 78 122 52" stroke="#c9995f" stroke-width="10" fill="none" stroke-linecap="round"/>
        <circle cx="124" cy="44" r="12" fill="#c9995f"/>
        <ellipse cx="132" cy="48" rx="8" ry="6" fill="#dbb27c"/>
        <ellipse cx="118" cy="32" rx="3" ry="5" fill="#c9995f"/>
        <circle cx="122" cy="41" r="2.6" fill="#332621"/>
        <path d="M128 52 Q131 54 134 52" stroke="#69423a" stroke-width="2" fill="none"/>`;
    } else if (spec.animal === 'pigeon') {
      inner = `
        <ellipse cx="70" cy="90" rx="30" ry="24" fill="#9aa7b8"/>
        <circle cx="46" cy="70" r="14" fill="#8493a6"/>
        <circle cx="41" cy="67" r="2.4" fill="#332621"/>
        <path d="M32 71 L22 74 L32 77 Z" fill="#e8a23c"/>
        <path d="M92 84 Q112 78 116 66 Q104 72 88 74 Z" fill="#7c8b9e"/>
        <line x1="62" y1="112" x2="62" y2="122" stroke="#c76" stroke-width="3"/>
        <line x1="76" y1="112" x2="76" y2="122" stroke="#c76" stroke-width="3"/>`;
    }
    const wPx = hPx * (150 / 130);
    return `<svg width="${wPx}" height="${hPx}" viewBox="0 0 150 130" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  },

  /* an actor standing on a scene */
  actorEl(charId, opts = {}) {
    const c = VA.Data.CHARS[charId];
    const { x = 480, y = 470, scale = 1, mood = 'happy', flip = false, tag = true, bob = false, playerVisual = null } = opts;
    const a = VA.el('div', 'actor' + (flip ? ' flip' : '') + (bob ? ' bob' : ''));
    a.dataset.char = charId;
    a.dataset.scale = scale; // read back by VA.Art.polaroid() to redraw this actor at the same size
    a.style.left = x + 'px'; a.style.top = y + 'px';
    // Real character PNGs are exported on a padded canvas (headroom/footroom
    // around the figure). The ground-shadow rig anchors to the sprite box's
    // bottom edge, so without this the shadow sits below the actual feet.
    a.style.setProperty('--foot-pad', (c.footPad || 0) + '%');
    // The shadow ellipse is sized/centered from each art file's actual foot
    // stance rather than a single fixed guess — outfits vary a lot in how
    // much of the canvas they fill (a robed guide's feet are much narrower
    // than a wide-stance camel), so one flat width reads wrong on most of them.
    a.style.setProperty('--shadow-footprint-w', (c.shadowWidth != null ? c.shadowWidth : 68) + '%');
    a.style.setProperty('--shadow-footprint-cx', (c.shadowCenterX != null ? c.shadowCenterX : 50) + '%');
    const hPx = 300 * scale * (c.size || 1); // ~50% of stage height at scale 1
    const body = VA.el('div', 'actor-svg-wrap');
    const path = 'assets/characters/' + c.file;
    a.dataset.assetPath = path;
    const cached = this._imgCache[path];
    const alreadyLoaded = !!(cached && cached.state === 'ok');
    const assetFailed = !!(cached && cached.state === 'fail');

    const applyPlayerEffects = () => {
      if (VA.PlayerFX) VA.PlayerFX.attach(a, playerVisual);
    };
    const applyReal = img => {
      a.dataset.real = '1';
      body.innerHTML = '';
      body.appendChild(this.breathingSprite(img, 'actor', hPx));
      const chipEl = a.querySelector('.actor-chip');
      if (chipEl) chipEl.classList.add('real');
      applyPlayerEffects();
    };

    if (alreadyLoaded) applyReal(cached.img);
    else if (assetFailed) { body.innerHTML = this.charSVG(c, mood, hPx); applyPlayerEffects(); }
    else {
      // Use the requested transparent asset immediately instead of briefly
      // drawing the legacy SVG character while it loads and decodes.
      const pending = document.createElement('img');
      pending.className = 'actor-pending-photo';
      pending.src = path;
      pending.alt = c.name === '{player}' ? 'Player' : c.name;
      pending.style.height = hPx + 'px';
      body.appendChild(pending);
    }
    a.appendChild(body);
    if (tag) a.appendChild(VA.el('span', 'actor-tag', c.name === '{player}' ? VA.State.data.name : c.name));
    a.appendChild(VA.el('span', 'actor-chip' + (alreadyLoaded ? ' real' : ''), c.file));
    // The player PNG is intentionally shown immediately while it decodes.
    // Attach the visual rig to that pending image too, so grounding never has
    // to wait for the cache callback.
    applyPlayerEffects();
    if (!alreadyLoaded && !assetFailed) {
      this._loadImage(path, applyReal, () => { body.innerHTML = this.charSVG(c, mood, hPx); applyPlayerEffects(); });
    }
    return a;
  },

  setMood(actorEl, mood) {
    if (actorEl.dataset.real) return; // real art: expressions come with the art
    const c = VA.Data.CHARS[actorEl.dataset.char];
    const wrap = actorEl.querySelector('.actor-svg-wrap');
    const hPx = wrap.querySelector('svg').getAttribute('height');
    wrap.innerHTML = this.charSVG(c, mood, parseFloat(hPx));
  },

  portraitEl(charId, mood = 'happy') {
    // rendered tall and cropped by #dlg-portrait to a head-and-shoulders bust
    const c = VA.Data.CHARS[charId];
    const path = 'assets/characters/' + c.file;
    const cached = this._imgCache[path];
    const alreadyLoaded = !!(cached && cached.state === 'ok');
    const assetFailed = !!(cached && cached.state === 'fail');
    const d = VA.el('div');

    const applyReal = img => {
      d.innerHTML = '';
      d.classList.add('portrait-real', 'portrait-breathing');
      d.appendChild(this.breathingSprite(img, 'portrait'));
    };

    if (alreadyLoaded) applyReal(cached.img);
    else if (assetFailed) d.innerHTML = this.charSVG(c, mood, 200);
    else {
      // Keep the real portrait source on screen while it decodes rather than
      // briefly showing the generated SVG stand-in.
      d.classList.add('portrait-real');
      const pending = document.createElement('img');
      pending.className = 'portrait-photo';
      pending.src = path;
      pending.alt = c.name === '{player}' ? 'Player' : c.name;
      d.appendChild(pending);
      this._loadImage(path, applyReal, () => { d.innerHTML = this.charSVG(c, mood, 200); });
    }
    return d;
  },

  /* full-body preview for the "who are you?" look picker — same real-art
     auto-upgrade as everywhere else, so it just works once the matching
     file lands in assets/characters/, no code changes needed then */
  lookPreviewEl(lookId, hPx = 190) {
    const look = VA.Data.PLAYER_LOOKS[lookId];
    const spec = Object.assign({}, VA.Data.CHARS.player, look);
    const path = 'assets/characters/' + look.file;
    const cached = this._imgCache[path];
    const alreadyLoaded = !!(cached && cached.state === 'ok');
    const assetFailed = !!(cached && cached.state === 'fail');
    const d = VA.el('div', 'look-preview');

    const applyReal = img => {
      d.innerHTML = '';
      const clone = img.cloneNode();
      clone.style.height = hPx + 'px';
      clone.style.display = 'block';
      d.appendChild(clone);
    };

    if (alreadyLoaded) applyReal(cached.img);
    else if (assetFailed) d.innerHTML = this.charSVG(spec, 'happy', hPx);
    else this._loadImage(path, applyReal, () => { d.innerHTML = this.charSVG(spec, 'happy', hPx); });
    return d;
  },

  /*
     The supplied character art is a single, transparent PNG rather than a
     rigged skeleton.  Split it into overlapping visual regions so the legs
     and lower torso remain completely still while the chest and head can
     breathe independently.  The overlap keeps the seams invisible as the
     chest changes size by a fraction of a pixel.
  */
  breathingSprite(img, context, hPx) {
    const sprite = VA.el('div', `${context}-breathe-sprite`);
    if (context === 'actor') {
      const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      sprite.style.width = (hPx * aspect) + 'px';
      sprite.style.height = hPx + 'px';
    }

    // Paint from the fixed lower body upward so moving layers cover their
    // shared edges.  The face is only translated/rotated as a rigid piece;
    // it is never scaled or warped.
    ['lower', 'chest', 'head'].forEach(region => {
      const layer = img.cloneNode();
      layer.className = `${context}-photo breathing-layer breathing-${region}`;
      layer.alt = '';
      sprite.appendChild(layer);
    });
    return sprite;
  },

  /* small emoji prop with its asset filename chip */
  propEl(opts) {
    const { icon, file, x, y, size = 44, hidden = false, anchor = 'center', chip: showChip = true } = opts;
    const pr = VA.el('div', 'prop' + (anchor === 'bottom' ? ' prop-bottom' : ''));
    pr.style.left = x + 'px'; pr.style.top = y + 'px';
    // Keep an anchored prop's ground point stable when its artwork is resized.
    pr.dataset.baseSize = size;
    pr.dataset.renderHeight = file ? size * 1.1 : size;
    pr.dataset.file = file || '';
    if (file) pr.dataset.assetPath = 'assets/objects/' + file;
    pr.dataset.icon = icon || '';
    pr.dataset.anchor = anchor;
    if (hidden) pr.style.visibility = 'hidden';
    const em = VA.el('span', 'prop-emoji', icon);
    em.style.fontSize = size + 'px';
    pr.appendChild(em);
    if (file) {
      const path = 'assets/objects/' + file;
      const cached = this._imgCache[path];
      const alreadyLoaded = !!(cached && cached.state === 'ok');
      const chip = showChip ? VA.el('span', 'asset-chip' + (alreadyLoaded ? ' real' : ''), file) : null;
      if (chip) pr.appendChild(chip);
      const applyReal = img => {
        em.textContent = '';
        const clone = img.cloneNode();
        clone.style.height = (size * 1.1) + 'px';
        em.appendChild(clone);
        if (chip) chip.classList.add('real');
      };
      if (alreadyLoaded) applyReal(cached.img);
      else this._loadImage(path, applyReal);
    }
    return pr;
  },

  /* ---------------------------------------------------------
     Polaroid photo — the game's "camera output".
     --------------------------------------------------------- */
  polaroid(photo, wPx = 210) {
    const hPx = wPx * 1.15;
    const wrap = VA.el('div');
    wrap.style.width = wPx + 'px'; wrap.style.height = hPx + 'px';
    const cv = document.createElement('canvas');
    cv.width = wPx * 2; cv.height = hPx * 2;
    cv.style.width = wPx + 'px'; cv.style.height = hPx + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);

    // white frame with soft shadow
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(30,20,10,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.beginPath();
    const r = 6;
    ctx.roundRect ? ctx.roundRect(2, 2, wPx - 4, hPx - 4, r) : ctx.rect(2, 2, wPx - 4, hPx - 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // mini scene inside — use the real backdrop art once it's loaded, same as
    // the live scene, instead of always falling back to the placeholder painting
    const px = 12, py = 12, pw = wPx - 24, ph = hPx * 0.62;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    ctx.translate(px, py);
    const bgPath = photo.backdrop ? ('assets/backgrounds/' + photo.backdrop) : null;
    const cachedBg = bgPath ? VA.Art._imgCache[bgPath] : null;
    if (cachedBg && cachedBg.state === 'ok') {
      const img = cachedBg.img;
      const scale = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      // matches the live scene's CSS object-position crop for this same asset
      const posY = photo.backdrop === 'event_france_eiffel.png' ? 0.9 : 0.5;
      ctx.drawImage(img, (pw - dw) / 2, (ph - dh) * posY, dw, dh);
    } else {
      const fn = VA.Art.painters[photo.painter];
      if (fn) fn(ctx, pw, ph); else VA.Art.painters._missing(ctx, pw, ph, photo.painter);
    }

    // the characters who were actually in the scene, redrawn at the same
    // relative position/scale they stood at on stage (approximate: the mini
    // frame's aspect ratio differs slightly from the stage's, so the crop
    // window isn't pixel-identical, but it's close — plenty for a keepsake photo)
    let drewActor = false;
    const sx = pw / VA.W, sy = ph / VA.H;
    for (const a of (photo.actors || [])) {
      const c = VA.Data.CHARS[a.char];
      if (!c) continue;
      const cached = VA.Art._imgCache['assets/characters/' + c.file];
      if (!cached || cached.state !== 'ok') continue;
      const img = cached.img;
      const hA = 300 * (a.scale || 1) * (c.size || 1) * sy;
      const wA = hA * (img.naturalWidth / img.naturalHeight);
      const dx = a.x * sx - wA / 2, dy = a.y * sy - hA;

      // ground shadow, matched to this same character's live on-stage
      // footprint (see the --foot-pad/--shadow-footprint-* CSS vars)
      const footPad = (c.footPad || 0) / 100;
      const shadowWPct = (c.shadowWidth != null ? c.shadowWidth : 68) / 100;
      const shadowCxPct = (c.shadowCenterX != null ? c.shadowCenterX : 50) / 100;
      const shW = wA * shadowWPct, shH = 13 * sy;
      const shCx = dx + wA * shadowCxPct;
      const shCy = dy + hA - hA * footPad - 4 * sy;
      ctx.save();
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = '#1d1f23';
      ctx.filter = `blur(${(2 * sy).toFixed(1)}px)`;
      ctx.beginPath();
      ctx.ellipse(shCx, shCy, Math.max(0, shW / 2), Math.max(0, shH / 2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      if (a.flip) { ctx.translate(dx + wA, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, wA, hA); }
      else { ctx.drawImage(img, dx, dy, wA, hA); }
      ctx.restore();
      drewActor = true;
    }

    // Activity objects are part of the memory too: a ball in play, or the
    // finished sand pyramid and flag.  Draw only the explicitly captured props
    // so ordinary scene decorations do not clutter a small keepsake photo.
    for (const p of (photo.props || [])) {
      const cached = p.file && VA.Art._imgCache['assets/objects/' + p.file];
      const hP = (p.height || 44) * (p.scale || 1) * sy;
      const xP = p.x * sx, yP = p.y * sy;
      if (cached && cached.state === 'ok') {
        const img = cached.img;
        const wP = hP * (img.naturalWidth / img.naturalHeight);
        const dx = xP - wP / 2;
        const dy = p.anchor === 'bottom' ? yP - hP : yP - hP / 2;
        ctx.drawImage(img, dx, dy, wP, hP);
      } else if (p.icon) {
        ctx.font = hP + 'px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.icon, xP, yP);
      }
    }

    // subject emoji "in" the photo — only as a fallback when no real
    // character art was available to draw instead
    // The Eiffel Polaroid is a landmark-only photo: use the real tower art
    // without placing an emoji over it (including older saved photos).
    if (!drewActor && photo.event !== 'eiffel' && photo.icon) {
      ctx.font = (pw * 0.3) + 'px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(photo.icon, pw * 0.5, ph * 0.72);
    }
    ctx.restore();

    // handwritten caption
    ctx.fillStyle = '#4a3728';
    ctx.font = 'italic bold ' + (wPx * 0.082) + 'px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(photo.caption, wPx / 2, py + ph + (hPx - py - ph) * 0.42);

    // washi tape
    ctx.fillStyle = 'rgba(126,200,227,.8)';
    ctx.save();
    ctx.translate(wPx / 2, 6); ctx.rotate(-0.06);
    ctx.fillRect(-26, -6, 52, 13);
    ctx.restore();

    wrap.appendChild(cv);
    return wrap;
  },

  /* passport stamp */
  stampEl(destId) {
    const d = VA.Data.DESTS.find(x => x.id === destId);
    const s = VA.el('div', 'stamp');
    s.style.borderColor = d.color; s.style.color = d.color;
    s.innerHTML = `<span class="st-ico">${d.stampIcon}</span><span class="st-name">${d.name.toUpperCase()}</span>`;
    return s;
  },

  /* The traveler's reaction portrait shown mid-flight (see VA.UI.travel).
     Real-art-only: these ship as finished photos, no SVG placeholder. */
  travelPortraitPath(homeward) {
    const lookId = VA.State.data.playerLook === 'girl' ? 'girl' : 'boy';
    const mood = homeward ? 'sleepy' : 'excited';
    return `assets/characters/travel_${lookId}_${mood}.png`;
  },
};

/* ============================================================
   The painters — one per required background asset.
   ============================================================ */
VA.Art.painters = {
  _missing(ctx, w, h, name) {
    ctx.fillStyle = '#d9c9a8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,90,60,.35)'; ctx.lineWidth = w * 0.02;
    for (let i = -h; i < w + h; i += w * 0.08) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
    ctx.fillStyle = '#4a3728';
    ctx.font = 'bold ' + w * 0.035 + 'px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PLACEHOLDER: ' + (name || '?'), w / 2, h / 2);
  },

  title(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#5cb6de'], [0.6, '#a5dcef'], [1, '#ffe9bd']]);
    p.sun(0.8, 0.16, 0.055);
    p.cloud(0.16, 0.2, 0.05); p.cloud(0.48, 0.1, 0.04, 0.7); p.cloud(0.62, 0.3, 0.035, 0.6);
    p.sea(0.72, 0.86, ['#2e93c9', '#3fa9d6', '#66c1e2']);
    p.rect(0, 0.86, 1, 0.14, '#f6dfa8');
    p.ellipse(0.85, 0.87, 0.13, 0.05, '#e8cf92');
    p.palm(0.88, 0.87, 1.3, -1);
    p.palm(0.06, 0.9, 1.1, 1);
    p.vignette();
  },

  home(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#f9ecd0'], [1, '#eed6ab']]);
    p.rect(0, 0.72, 1, 0.28, '#c99e6b');
    for (let i = 0; i < 6; i++) p.line(0, 0.76 + i * 0.045, 1, 0.76 + i * 0.045, 'rgba(120,80,40,.18)', 0.002);
    // window with garden light
    p.rect(0.1, 0.12, 0.28, 0.4, '#fff');
    p.rect(0.115, 0.145, 0.25, 0.35, '#bde4f0');
    p.circle(0.19, 0.24, 0.03, '#fff7d8');
    p.ellipse(0.24, 0.46, 0.11, 0.03, '#9ec97c');
    p.line(0.24, 0.145, 0.24, 0.495, '#fff', 0.008);
    p.line(0.115, 0.32, 0.365, 0.32, '#fff', 0.008);
    p.rect(0.085, 0.1, 0.04, 0.44, '#ff9d7a'); p.rect(0.355, 0.1, 0.04, 0.44, '#ff9d7a');
    // sofa
    p.rect(0.56, 0.52, 0.34, 0.24, '#d96e5a', 0.02);
    p.rect(0.58, 0.45, 0.3, 0.12, '#d96e5a', 0.02);
    p.rect(0.585, 0.55, 0.14, 0.1, '#f2b06b', 0.015);
    p.rect(0.735, 0.55, 0.14, 0.1, '#f2b06b', 0.015);
    // rug
    p.ellipse(0.35, 0.87, 0.2, 0.06, 'rgba(232,176,74,.75)');
    p.ellipse(0.35, 0.87, 0.14, 0.04, 'rgba(255,220,140,.7)');
    // side table + tea
    p.rect(0.43, 0.6, 0.12, 0.02, '#8a6238');
    p.rect(0.445, 0.62, 0.016, 0.12, '#8a6238'); p.rect(0.518, 0.62, 0.016, 0.12, '#8a6238');
    p.emoji('☕', 0.49, 0.582, 0.032);
    // photo frames on the wall
    p.rect(0.55, 0.16, 0.07, 0.1, '#8a6238'); p.rect(0.558, 0.172, 0.054, 0.076, '#ffe9bd');
    p.rect(0.66, 0.13, 0.09, 0.13, '#8a6238'); p.rect(0.669, 0.145, 0.072, 0.1, '#bde4f0');
    p.rect(0.79, 0.17, 0.07, 0.1, '#8a6238'); p.rect(0.798, 0.182, 0.054, 0.076, '#f6dfa8');
    p.vignette();
  },

  map(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#8fd0e8'], [1, '#c3e7f2']]);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 40; i++) p.circle(Math.random(), Math.random(), 0.002, 'rgba(255,255,255,.35)');
    // stylized continents
    p.poly([[0.06, 0.3], [0.16, 0.2], [0.26, 0.24], [0.3, 0.42], [0.22, 0.56], [0.1, 0.5]], '#b7dc8f');           // americas-ish
    p.poly([[0.42, 0.2], [0.52, 0.16], [0.56, 0.28], [0.5, 0.34], [0.44, 0.3]], '#b7dc8f');                        // europe
    p.poly([[0.46, 0.38], [0.58, 0.34], [0.64, 0.52], [0.56, 0.68], [0.48, 0.56]], '#e8cf92');                     // africa
    p.poly([[0.6, 0.2], [0.78, 0.18], [0.84, 0.34], [0.74, 0.44], [0.62, 0.36]], '#b7dc8f');                       // asia
    p.poly([[0.76, 0.62], [0.88, 0.6], [0.9, 0.74], [0.78, 0.76]], '#e8cf92');                                     // australia
    p.circle(0.845, 0.415, 0.012, '#ff9d7a'); // home (Japan) dot
    p.text('🏠', 0.845, 0.375, 0.03, '#4a3728');
    // dotted flight routes
    ctx.setLineDash([w * 0.008, w * 0.012]);
    [[0.83, 0.68], [0.51, 0.26], [0.55, 0.48]].forEach(([x, y]) => {
      ctx.strokeStyle = 'rgba(239,109,61,.75)'; ctx.lineWidth = w * 0.004;
      ctx.beginPath(); ctx.moveTo(0.845 * w, 0.415 * h);
      ctx.quadraticCurveTo(((0.845 + x) / 2) * w, (Math.min(0.415, y) - 0.12) * h, x * w, y * h);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    // compass
    p.circle(0.075, 0.14, 0.045, 'rgba(255,255,255,.85)');
    p.tri(0.075, 0.1, 0.062, 0.14, 0.088, 0.14, '#ef6d3d');
    p.tri(0.075, 0.18, 0.062, 0.14, 0.088, 0.14, '#7ec8e3');
    p.text('N', 0.075, 0.085, 0.02, '#4a3728', true);
    p.vignette();
  },

  travelSky(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#5cb6de'], [0.7, '#a5dcef'], [1, '#dff2f8']]);
    p.sun(0.14, 0.16, 0.05);
    p.cloud(0.2, 0.55, 0.06, 0.9); p.cloud(0.55, 0.7, 0.08, 0.95); p.cloud(0.82, 0.5, 0.05, 0.8);
    p.cloud(0.4, 0.32, 0.04, 0.6); p.cloud(0.7, 0.24, 0.035, 0.5);
    p.ellipse(0.5, 1.04, 0.6, 0.1, 'rgba(255,255,255,.9)');
  },

  /* ---------- destination hubs ---------- */
  australiaBeach(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#59b7e0'], [0.5, '#a5dcef'], [1, '#d8f0f8']], 0.46);
    p.sun(0.84, 0.13, 0.05);
    p.cloud(0.2, 0.14, 0.045); p.cloud(0.52, 0.09, 0.035, 0.75); p.cloud(0.68, 0.2, 0.03, 0.6);
    p.sea(0.42, 0.7, ['#2e93c9', '#3fa9d6', '#66c1e2', '#8ed3ec']);
    // sailboat
    p.tri(0.62, 0.47, 0.62, 0.41, 0.655, 0.47, '#fff');
    p.poly([[0.6, 0.475], [0.68, 0.475], [0.665, 0.5], [0.615, 0.5]], '#e35f4f');
    p.rect(0, 0.7, 1, 0.3, '#f6dfa8');
    p.ellipse(0.5, 0.71, 0.55, 0.02, '#ffeec4');
    // beach umbrella + towel
    p.line(0.75, 0.8, 0.75, 0.66, '#8a6238', 0.006);
    ctx.save(); ctx.beginPath(); ctx.arc(0.75 * w, 0.68 * h, 0.085 * w, Math.PI, 0); ctx.closePath(); ctx.clip();
    p.rect(0.66, 0.6, 0.045, 0.1, '#e35f4f'); p.rect(0.705, 0.6, 0.045, 0.1, '#fff');
    p.rect(0.75, 0.6, 0.045, 0.1, '#e35f4f'); p.rect(0.795, 0.6, 0.045, 0.1, '#fff');
    ctx.restore();
    p.rect(0.64, 0.8, 0.1, 0.05, '#7ec8e3', 0.01);
    // palms
    p.palm(0.07, 0.74, 1.4, 1); p.palm(0.15, 0.72, 1.05, -1);
    // shells
    p.emoji('🐚', 0.36, 0.88, 0.02); p.emoji('⭐', 0.55, 0.93, 0.018);
    p.vignette();
  },

  parisEvening(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#f7a97c'], [0.45, '#d97d96'], [1, '#6d5a96']], 0.72);
    p.sun(0.24, 0.5, 0.055, '#ffd9a0');
    p.cloud(0.55, 0.14, 0.04, 0.35); p.cloud(0.8, 0.24, 0.035, 0.3);
    // skyline
    ctx.fillStyle = '#41355c';
    [[0, 0.52], [0.09, 0.47], [0.17, 0.55], [0.27, 0.5], [0.36, 0.56], [0.72, 0.5], [0.8, 0.55], [0.88, 0.48], [0.95, 0.54]]
      .forEach(([x, y]) => p.rect(x, y, 0.09, 0.72 - y + 0.01, '#41355c'));
    p.windows(0.005, 0.44, 0.5, 0.7, 46); p.windows(0.72, 0.99, 0.5, 0.7, 26);
    // Eiffel tower silhouette
    const tw = 0.135, tx = 0.56, base = 0.72, top = 0.13;
    ctx.fillStyle = '#332a4d';
    p.poly([[tx - tw, base], [tx - 0.02, top], [tx + 0.02, top], [tx + tw, base], [tx + tw - 0.045, base], [tx, base - 0.17], [tx - tw + 0.045, base]], '#332a4d');
    p.rect(tx - 0.1, 0.5, 0.2, 0.02, '#332a4d');
    p.rect(tx - 0.055, 0.33, 0.11, 0.017, '#332a4d');
    p.rect(tx - 0.016, top - 0.045, 0.032, 0.05, '#332a4d');
    for (let i = 0; i < 12; i++) p.circle(tx + VA.rand(-0.08, 0.08), VA.rand(0.2, 0.68), 0.0035, 'rgba(255,224,138,.9)');
    // ground + lights
    p.rect(0, 0.72, 1, 0.28, '#544468');
    p.ellipse(0.5, 0.73, 0.55, 0.015, 'rgba(255,209,138,.25)');
    p.stringLights(0.02, 0.46, 0.78, 0.05, 8);
    p.stringLights(0.6, 0.99, 0.8, 0.045, 7);
    // cafe awning
    p.rect(0.83, 0.62, 0.17, 0.05, '#c94f43');
    for (let i = 0; i < 4; i++) p.rect(0.83 + i * 0.045, 0.62, 0.022, 0.05, '#fff');
    p.rect(0.85, 0.67, 0.13, 0.16, '#5c4a72');
    p.windows(0.86, 0.97, 0.69, 0.8, 6);
    p.vignette();
  },

  egyptDesert(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#ffc46b'], [0.55, '#ff9e58'], [1, '#ffd9a0']], 0.66);
    p.sun(0.3, 0.28, 0.07, '#fff1b8');
    p.pyramid(0.52, 0.66, 0.24, 0.2);
    p.pyramid(0.76, 0.66, 0.4, 0.13, '#cf9a55', '#a8763c');
    p.pyramid(0.24, 0.66, 0.47, 0.1, '#e0b269', '#bd8a48');
    // dunes
    p.ellipse(0.25, 0.78, 0.45, 0.09, '#ecc37e');
    p.ellipse(0.85, 0.8, 0.5, 0.11, '#e0b269');
    p.rect(0, 0.82, 1, 0.18, '#e8b96f');
    // camel silhouette far away
    p.emoji('🐪', 0.38, 0.72, 0.026);
    // market tents
    p.tent(0.82, 0.72, 0.055, '#c94f43', '#ffd166');
    p.tent(0.92, 0.74, 0.05, '#3d8fb8', '#fff');
    p.stringLights(0.76, 0.98, 0.6, 0.03, 6);
    // palms
    p.palm(0.08, 0.84, 1.3, 1); p.palm(0.14, 0.82, 1, -1);
    p.vignette();
  },

  /* ---------- Australia events ---------- */
  ev_au_icecream(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#59b7e0'], [1, '#c8ecf7']], 0.4);
    p.sun(0.12, 0.14, 0.045);
    p.cloud(0.7, 0.12, 0.04, 0.8);
    p.sea(0.36, 0.5, ['#3fa9d6', '#66c1e2']);
    p.rect(0, 0.5, 1, 0.5, '#f6dfa8');
    // ice cream cart
    p.rect(0.3, 0.42, 0.4, 0.34, '#fff6e8', 0.015);
    p.rect(0.3, 0.55, 0.4, 0.05, '#7ec8e3');
    p.circle(0.37, 0.79, 0.032, '#5c4a44'); p.circle(0.63, 0.79, 0.032, '#5c4a44');
    p.circle(0.37, 0.79, 0.013, '#d8d2c8'); p.circle(0.63, 0.79, 0.013, '#d8d2c8');
    p.line(0.32, 0.42, 0.32, 0.3, '#8a6238', 0.008); p.line(0.68, 0.42, 0.68, 0.3, '#8a6238', 0.008);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#e35f4f';
      p.poly([[0.29 + i * 0.07, 0.3], [0.36 + i * 0.07, 0.3], [0.325 + i * 0.07, 0.36]], ctx.fillStyle);
    }
    p.rect(0.29, 0.28, 0.42, 0.025, '#e35f4f');
    p.emoji('🍦', 0.5, 0.49, 0.06);
    p.text('ICE CREAM', 0.5, 0.63, 0.026, '#ef6d3d', true);
    p.palm(0.9, 0.6, 1.3, -1);
    p.vignette();
  },

  ev_au_kangaroo(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#6fc0e4'], [1, '#d8f0f8']], 0.55);
    p.sun(0.85, 0.14, 0.045);
    p.cloud(0.25, 0.16, 0.04, 0.8); p.cloud(0.6, 0.1, 0.03, 0.6);
    p.ellipse(0.2, 0.56, 0.3, 0.06, '#b9d98a'); p.ellipse(0.8, 0.58, 0.35, 0.07, '#a8cf6e');
    p.rect(0, 0.58, 1, 0.42, '#a8cf6e');
    // eucalyptus trees
    [[0.12, 0.6, 1.2], [0.88, 0.62, 1.4]].forEach(([x, y, s]) => {
      p.line(x, y, x - 0.01 * s, y - 0.2 * s, '#c9c2b2', 0.009 * s);
      p.circle(x - 0.015 * s, y - 0.24 * s, 0.05 * s, '#8fb872');
      p.circle(x + 0.02 * s, y - 0.2 * s, 0.04 * s, '#a3c684');
    });
    // wooden fence
    for (let i = 0; i < 8; i++) p.rect(0.03 + i * 0.13, 0.6, 0.012, 0.1, '#b08d5e');
    p.line(0.02, 0.63, 0.98, 0.63, '#b08d5e', 0.008);
    p.line(0.02, 0.67, 0.98, 0.67, '#b08d5e', 0.008);
    // grass tufts
    for (let i = 0; i < 16; i++) p.ellipse(Math.random(), 0.72 + Math.random() * 0.24, 0.014, 0.006, 'rgba(120,160,70,.5)');
    p.vignette();
  },

  ev_au_volleyball(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#59b7e0'], [1, '#c8ecf7']], 0.3);
    p.cloud(0.2, 0.1, 0.035, 0.8);
    p.sea(0.27, 0.4, ['#3fa9d6', '#66c1e2']);
    p.rect(0, 0.4, 1, 0.6, '#f6dfa8');
    p.ellipse(0.5, 0.42, 0.55, 0.02, '#ffeec4');
    // net
    p.line(0.24, 0.78, 0.24, 0.4, '#8a6238', 0.009);
    p.line(0.76, 0.78, 0.76, 0.4, '#8a6238', 0.009);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = w * 0.0022;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0.24 * w, (0.44 + i * 0.035) * h); ctx.lineTo(0.76 * w, (0.44 + i * 0.035) * h); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo((0.26 + i * 0.045) * w, 0.44 * h); ctx.lineTo((0.26 + i * 0.045) * w, 0.58 * h); ctx.stroke(); }
    p.rect(0.23, 0.42, 0.54, 0.014, '#fff');
    // court line
    p.ellipse(0.5, 0.9, 0.4, 0.035, 'rgba(255,255,255,.4)');
    p.palm(0.06, 0.5, 1.2, 1);
    p.vignette();
  },

  /* ---------- France events ---------- */
  ev_fr_crepe(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#f7a97c'], [0.6, '#c97d96'], [1, '#8a6a9e']], 0.55);
    p.windows(0.02, 0.2, 0.3, 0.5, 12); p.windows(0.8, 0.99, 0.3, 0.5, 12);
    p.rect(0, 0.02, 0.22, 0.52, 'rgba(65,53,92,.9)');
    p.rect(0.79, 0.05, 0.23, 0.5, 'rgba(65,53,92,.9)');
    p.windows(0.02, 0.2, 0.1, 0.5, 14); p.windows(0.81, 0.99, 0.1, 0.5, 14);
    // cobbles
    p.rect(0, 0.55, 1, 0.45, '#6b5a7a');
    for (let r = 0; r < 5; r++) for (let i = 0; i < 12; i++)
      p.ellipse(0.04 + i * 0.085 + (r % 2) * 0.04, 0.62 + r * 0.08, 0.032, 0.014, 'rgba(255,255,255,.07)');
    // crepe stand
    p.rect(0.3, 0.36, 0.36, 0.34, '#8a4a3a', 0.012);
    p.rect(0.3, 0.5, 0.36, 0.04, '#5f3328');
    p.circle(0.48, 0.49, 0.055, '#d9a45e');
    p.circle(0.48, 0.49, 0.045, '#e8bd7c');
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#3d8fb8';
      p.poly([[0.28 + i * 0.082, 0.28], [0.362 + i * 0.082, 0.28], [0.321 + i * 0.082, 0.34]], ctx.fillStyle);
    }
    p.rect(0.27, 0.26, 0.42, 0.024, '#3d8fb8');
    p.text('CRÊPES', 0.48, 0.42, 0.03, '#ffd166', true);
    p.stringLights(0.06, 0.94, 0.14, 0.05, 11);
    // lamppost
    p.line(0.88, 0.72, 0.88, 0.3, '#3a2f52', 0.007);
    p.circle(0.88, 0.29, 0.016, '#ffe08a');
    p.sun(0.88, 0.29, 0.013, '#ffe08a');
    p.vignette();
  },

  ev_fr_eiffel(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#4b3d78'], [0.5, '#8a5a8e'], [1, '#d97d96']]);
    for (let i = 0; i < 26; i++) p.circle(Math.random(), Math.random() * 0.5, 0.0016, 'rgba(255,255,255,.8)');
    p.sun(0.18, 0.2, 0.035, '#fff1c4');
    // the tower, big and close
    const tx = 0.5;
    ctx.fillStyle = '#241f38';
    p.poly([[0.14, 0.92], [tx - 0.03, 0.08], [tx + 0.03, 0.08], [0.86, 0.92], [0.72, 0.92], [tx, 0.62], [0.28, 0.92]], '#241f38');
    p.rect(0.22, 0.66, 0.56, 0.03, '#241f38');
    p.rect(0.36, 0.4, 0.28, 0.025, '#241f38');
    p.rect(0.46, 0.2, 0.08, 0.02, '#241f38');
    p.rect(tx - 0.012, 0.03, 0.024, 0.06, '#241f38');
    ctx.strokeStyle = 'rgba(36,31,56,.8)'; ctx.lineWidth = w * 0.004;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((0.2 + i * 0.05) * w, 0.92 * h); ctx.lineTo((0.36 + i * 0.08) * w, 0.68 * h);
      ctx.stroke();
    }
    // warm lamps on the tower
    for (let i = 0; i < 22; i++) p.circle(tx + VA.rand(-0.16, 0.16) * (0.3 + Math.random()), VA.rand(0.14, 0.85), 0.004, 'rgba(255,224,138,.95)');
    // garden hedge
    p.rect(0, 0.9, 1, 0.1, '#2c3a4a');
    p.ellipse(0.15, 0.9, 0.1, 0.03, '#33465a'); p.ellipse(0.85, 0.91, 0.12, 0.035, '#33465a');
    p.vignette();
  },

  ev_fr_park(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#f7b98c'], [1, '#e8d3a8']], 0.5);
    p.sun(0.75, 0.16, 0.05, '#ffe9b8');
    // distant tower tip
    p.poly([[0.08, 0.5], [0.115, 0.16], [0.15, 0.5]], 'rgba(65,53,92,.55)');
    p.rect(0.07, 0.36, 0.09, 0.014, 'rgba(65,53,92,.55)');
    // lawn
    p.rect(0, 0.5, 1, 0.5, '#9cc46e');
    p.ellipse(0.5, 0.52, 0.6, 0.03, '#b3d488');
    // path
    p.poly([[0.4, 1], [0.47, 0.52], [0.53, 0.52], [0.68, 1]], '#e3cfa0');
    // trees
    [[0.25, 0.52, 1.3], [0.86, 0.5, 1.6], [0.62, 0.5, 1]].forEach(([x, y, s]) => {
      p.rect(x - 0.008 * s, y - 0.1 * s, 0.016 * s, 0.11 * s, '#8a6238');
      p.circle(x, y - 0.16 * s, 0.055 * s, '#7cae5a');
      p.circle(x - 0.04 * s, y - 0.12 * s, 0.04 * s, '#8fbf68');
      p.circle(x + 0.04 * s, y - 0.12 * s, 0.04 * s, '#6da04e');
    });
    // bench
    p.rect(0.2, 0.66, 0.13, 0.02, '#8a6238');
    p.rect(0.2, 0.61, 0.13, 0.015, '#8a6238');
    p.rect(0.205, 0.66, 0.012, 0.05, '#6b4b2a'); p.rect(0.315, 0.66, 0.012, 0.05, '#6b4b2a');
    // soccer goal
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.007;
    ctx.beginPath();
    ctx.moveTo(0.7 * w, 0.72 * h); ctx.lineTo(0.7 * w, 0.5 * h); ctx.lineTo(0.94 * w, 0.5 * h); ctx.lineTo(0.94 * w, 0.72 * h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = w * 0.0016;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo((0.7 + i * 0.04) * w, 0.5 * h); ctx.lineTo((0.7 + i * 0.04) * w, 0.72 * h); ctx.stroke(); }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0.7 * w, (0.5 + i * 0.045) * h); ctx.lineTo(0.94 * w, (0.5 + i * 0.045) * h); ctx.stroke(); }
    p.vignette();
  },

  /* ---------- Egypt events ---------- */
  ev_eg_kebab(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#e8894f'], [0.6, '#c46a54'], [1, '#8a5a52']], 0.5);
    p.pyramid(0.12, 0.5, 0.32, 0.1, 'rgba(150,100,60,.55)', 'rgba(120,80,45,.55)');
    // stall canopy
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#ffd166' : '#c94f43';
      p.poly([[0.26 + i * 0.08, 0.22], [0.34 + i * 0.08, 0.22], [0.3 + i * 0.08, 0.3]], ctx.fillStyle);
    }
    p.rect(0.25, 0.2, 0.5, 0.026, '#8a4a3a');
    // hanging lamps
    [[0.32, 0.36], [0.5, 0.38], [0.68, 0.36]].forEach(([x, y]) => {
      p.line(x, 0.23, x, y - 0.03, 'rgba(60,40,30,.8)', 0.003);
      p.circle(x, y, 0.018, '#ffb35c'); p.sun(x, y, 0.012, '#ffd88a');
    });
    // counter + grill
    p.rect(0.28, 0.52, 0.44, 0.22, '#a8683f', 0.012);
    p.rect(0.28, 0.52, 0.44, 0.04, '#8a4a3a');
    p.rect(0.33, 0.42, 0.34, 0.1, '#3d3630', 0.01);
    for (let i = 0; i < 4; i++) p.line(0.35, 0.445 + i * 0.02, 0.65, 0.445 + i * 0.02, '#5c534a', 0.004);
    for (let i = 0; i < 6; i++) p.circle(0.36 + i * 0.055, 0.51, 0.005, '#ff7b3d');
    p.emoji('🍢', 0.5, 0.37, 0.05);
    // rugs on the ground
    p.rect(0, 0.74, 1, 0.26, '#c99e6b');
    p.rect(0.06, 0.8, 0.2, 0.12, '#b3524a'); p.rect(0.08, 0.82, 0.16, 0.08, '#d9a45e');
    p.rect(0.74, 0.82, 0.2, 0.1, '#3d6b8f'); p.rect(0.76, 0.84, 0.16, 0.06, '#7ec8e3');
    p.vignette();
  },

  ev_eg_pyramid(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#ffb35c'], [0.6, '#ff9058'], [1, '#ffd9a0']]);
    p.sun(0.5, 0.16, 0.08, '#fff1b8');
    p.pyramid(0.5, 0.86, 0.1, 0.42);
    ctx.strokeStyle = 'rgba(120,80,40,.25)'; ctx.lineWidth = w * 0.003;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      ctx.beginPath();
      ctx.moveTo((0.5 - 0.42 * t) * w, (0.1 + 0.76 * t) * h);
      ctx.lineTo((0.5 + 0.42 * t) * w, (0.1 + 0.76 * t) * h);
      ctx.stroke();
    }
    p.pyramid(0.09, 0.86, 0.52, 0.12, '#cf9a55', '#a8763c');
    p.rect(0, 0.86, 1, 0.14, '#e8b96f');
    p.ellipse(0.3, 0.88, 0.3, 0.03, '#ecc37e');
    p.vignette();
  },

  ev_eg_sand(ctx, w, h) {
    const p = VA.Art._p(ctx, w, h);
    p.sky([[0, '#ffc46b'], [1, '#ffe3ae']], 0.45);
    p.sun(0.16, 0.16, 0.05, '#fff1b8');
    p.pyramid(0.75, 0.45, 0.2, 0.16, 'rgba(190,140,80,.7)', 'rgba(160,110,60,.7)');
    p.pyramid(0.9, 0.45, 0.3, 0.09, 'rgba(200,150,90,.6)', 'rgba(170,120,70,.6)');
    p.rect(0, 0.45, 1, 0.55, '#f2cd8a');
    p.ellipse(0.5, 0.47, 0.55, 0.02, '#f9dfa8');
    // play mound
    p.ellipse(0.5, 0.85, 0.24, 0.07, '#e8b96f');
    p.emoji('⛱️', 0.28, 0.76, 0.05);
    p.emoji('🥄', 0.7, 0.82, 0.035);
    p.palm(0.08, 0.6, 1.4, 1);
    p.vignette();
  },
};
