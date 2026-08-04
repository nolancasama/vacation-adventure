/* ============================================================
   player-effects.js — lightweight visual grounding for the player PNG.

   Effects stay in reusable DOM/CSS layers: the source sprite is never edited,
   no animation loop is required, and each scene can supply a small lighting
   profile.  The public updatePlayerVisualEffects() method is the single place
   that maps gameplay state to shadows and lighting.
   ============================================================ */
'use strict';

VA.PlayerFX = {
  DEV_PANEL_ENABLED: false,
  defaults: {
    shadowOpacity: 0.46,
    shadowBlur: 1,
    shadowWidth: 1,
    brightness: 1,
    saturation: 1,
    tintStrength: 1,
    rimStrength: 1,
    environmentOpacity: 1,
    environmentSpeed: 1,
  },
  tuning: null,

  init() {
    this.tuning = { ...this.defaults };
    if (this.DEV_PANEL_ENABLED) this._createPanel();
  },

  /* Attach one stable visual rig to the current player's transparent sprite.
     Calling this again is intentional: it updates the level profile when a
     reused actor enters a new scene without creating duplicate DOM. */
  attach(actor, level = {}) {
    if (!actor) return;
    actor._playerFXLevel = level || {};
    const sprite = actor.querySelector('.actor-breathe-sprite, .actor-svg-wrap');
    if (!sprite) return; // actorEl calls us again after a pending PNG resolves

    let rig = sprite.querySelector('.player-vfx-rig');
    if (!rig) {
      rig = VA.el('span', 'player-vfx-rig');
      rig.innerHTML =
        '<span class="player-ground-shadow"></span>' +
        '<span class="player-contact-shadow"></span>' +
        '<span class="player-rim-light"></span>' +
        '<span class="player-tint-overlay"></span>' +
        '<span class="player-direction-overlay"></span>';
      sprite.prepend(rig);
    }

    const source = actor.querySelector('.actor-photo, .actor-pending-photo');
    if (source && source.src) rig.style.setProperty('--player-mask', `url("${source.src}")`);
    actor.classList.add('player-effects-ready');
    // Calls from actorEl initialise immediately; calls from update() are
    // marked so they can create a missing rig without recursing.
    if (actor.dataset.playerFxUpdating !== 'true') {
      this.updatePlayerVisualEffects({ actor, state: actor.dataset.playerState || 'idle', levelLighting: level });
    }
  },

  updatePlayerVisualEffects({ actor = null, state = 'idle', height = 0, levelLighting = null } = {}) {
    const actors = actor ? [actor] : VA.$$('.actor[data-char="player"]');
    const profile = this._stateProfile(state, height);
    actors.forEach(el => {
      const level = levelLighting || el._playerFXLevel || {};
      el.dataset.playerFxUpdating = 'true';
      this.attach(el, level);
      delete el.dataset.playerFxUpdating;
      if (!el.classList.contains('player-effects-ready')) return;
      el.dataset.playerState = state;
      el.classList.remove(...this._stateNames().map(name => 'player-state-' + name));
      el.classList.add('player-state-' + state);
      const rig = el.querySelector('.player-vfx-rig');
      if (!rig) return;
      const lighting = this._lighting(level);
      const tune = this.tuning || this.defaults;
      rig.style.setProperty('--shadow-opacity', (profile.shadowOpacity * tune.shadowOpacity).toFixed(3));
      rig.style.setProperty('--shadow-scale', profile.shadowScale.toFixed(3));
      rig.style.setProperty('--shadow-width', tune.shadowWidth.toFixed(3));
      rig.style.setProperty('--shadow-blur', (6 * profile.shadowBlur * tune.shadowBlur).toFixed(1) + 'px');
      rig.style.setProperty('--contact-opacity', profile.contactOpacity.toFixed(3));
      rig.style.setProperty('--sprite-brightness', (lighting.brightness * tune.brightness).toFixed(3));
      rig.style.setProperty('--sprite-saturation', (lighting.saturation * tune.saturation).toFixed(3));
      rig.style.setProperty('--tint-color', lighting.tintColor);
      rig.style.setProperty('--tint-opacity', (lighting.tintOpacity * tune.tintStrength).toFixed(3));
      rig.style.setProperty('--direction-gradient', this._directionGradient(lighting.lightDirection));
      rig.style.setProperty('--rim-color', lighting.rim.color);
      rig.style.setProperty('--rim-offset', this._rimOffset(lighting.rim.direction || lighting.lightDirection));
      rig.style.setProperty('--rim-opacity', (lighting.rim.enabled ? lighting.rim.strength * tune.rimStrength : 0).toFixed(3));
      this._applyEnvironment(el, lighting.environmentEffect);
    });
  },

  setState(state, options = {}) { this.updatePlayerVisualEffects({ ...options, state }); },

  _stateNames() { return ['idle', 'walk', 'jump', 'climb', 'swim', 'fly', 'push', 'fail', 'celebrate']; },

  _stateProfile(state, height) {
    const lift = Math.max(0, Math.min(1, (Number(height) || 0) / 160));
    const grounded = { shadowOpacity: 1, shadowScale: 1, shadowBlur: 1, contactOpacity: 1 };
    if (state === 'walk') return { ...grounded, shadowScale: 1.04, shadowBlur: .95 };
    if (state === 'push') return { ...grounded, shadowScale: 1.12, shadowBlur: 1.05 };
    if (state === 'fail') return { ...grounded, shadowOpacity: .82, shadowScale: 1.08, shadowBlur: 1.2, contactOpacity: .65 };
    if (state === 'celebrate') return { ...grounded, shadowOpacity: .78, shadowScale: .9, shadowBlur: 1.18, contactOpacity: .5 };
    if (state === 'swim') return { shadowOpacity: .18, shadowScale: .82, shadowBlur: 1.7, contactOpacity: 0 };
    if (state === 'climb') return { shadowOpacity: 0, shadowScale: .5, shadowBlur: 2, contactOpacity: 0 };
    if (state === 'fly') return { shadowOpacity: .12, shadowScale: .48, shadowBlur: 2.2, contactOpacity: 0 };
    if (state === 'jump') return {
      shadowOpacity: .55 * (1 - lift), shadowScale: .82 - lift * .34,
      shadowBlur: 1.25 + lift * 1.2, contactOpacity: Math.max(0, .65 * (1 - lift * 2)),
    };
    return grounded;
  },

  _lighting(level) {
    const base = level.lighting || level || {};
    const rim = level.rimLight || {};
    return {
      brightness: base.brightness == null ? 1 : base.brightness,
      saturation: base.saturation == null ? 1 : base.saturation,
      tintColor: base.tintColor || 'rgba(255,255,255,0)',
      tintOpacity: base.tintStrength == null ? 1 : base.tintStrength,
      lightDirection: level.lightDirection || base.lightDirection || 'none',
      rim: {
        enabled: !!rim.enabled,
        direction: rim.direction || level.lightDirection || 'none',
        color: rim.color || 'rgba(255,235,180,.35)',
        strength: rim.strength == null ? .25 : rim.strength,
      },
      environmentEffect: level.environmentEffect || { type: 'none', enabled: false },
    };
  },

  _directionGradient(direction) {
    if (direction === 'left') return 'linear-gradient(90deg, rgba(255,255,255,.15), rgba(255,255,255,0) 42%, rgba(20,30,48,.12))';
    if (direction === 'right') return 'linear-gradient(270deg, rgba(255,255,255,.15), rgba(255,255,255,0) 42%, rgba(20,30,48,.12))';
    if (direction === 'above') return 'linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 52%, rgba(20,30,48,.09))';
    return 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0))';
  },

  _rimOffset(direction) {
    if (direction === 'left') return '-1.25px, 0';
    if (direction === 'right') return '1.25px, 0';
    if (direction === 'above') return '0, -1.25px';
    return '0, 0';
  },

  _applyEnvironment(actor, effect = {}) {
    const world = actor.closest('#cine-world') || actor.closest('.screen');
    if (!world) return;
    let overlay = world.querySelector(':scope > .environment-light');
    if (!overlay) {
      overlay = VA.el('div', 'environment-light');
      const hotspotLayer = world.querySelector('#hotspot-layer');
      if (hotspotLayer) world.insertBefore(overlay, hotspotLayer); else world.appendChild(overlay);
    }
    const tune = this.tuning || this.defaults;
    const enabled = effect && effect.enabled && effect.type && effect.type !== 'none';
    overlay.className = 'environment-light' + (enabled ? ' environment-' + effect.type : '');
    overlay.style.setProperty('--environment-opacity', ((effect.opacity || 0) * tune.environmentOpacity).toFixed(3));
    overlay.style.setProperty('--environment-speed', Math.max(1, (effect.speed || 14) / tune.environmentSpeed).toFixed(2) + 's');
  },

  /* Development-only panel. Enable before VA.Main.init() with
     VA.PlayerFX.DEV_PANEL_ENABLED = true. It is not added in normal builds. */
  _createPanel() {
    if (VA.$('#player-fx-dev')) return;
    const panel = VA.el('aside', 'player-fx-dev');
    panel.id = 'player-fx-dev';
    panel.innerHTML = '<strong>Player lighting (dev)</strong>';
    const fields = [
      ['shadowOpacity', 'Shadow opacity', .05, 1, .01], ['shadowBlur', 'Shadow blur', .25, 2.5, .05],
      ['shadowWidth', 'Shadow width', .55, 1.7, .01], ['brightness', 'Brightness', .7, 1.3, .01],
      ['saturation', 'Saturation', .65, 1.35, .01], ['tintStrength', 'Tint strength', 0, 2, .01],
      ['rimStrength', 'Rim strength', 0, 2, .01], ['environmentOpacity', 'Effect opacity', 0, 2, .01],
      ['environmentSpeed', 'Effect speed', .35, 2.5, .05], ['height', 'Jump height', 0, 160, 1],
    ];
    fields.forEach(([key, label, min, max, step]) => {
      const row = VA.el('label', 'player-fx-dev-row');
      row.textContent = label;
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.value = key === 'height' ? 0 : this.tuning[key]; input.dataset.fx = key;
      const value = VA.el('output', '', input.value);
      input.addEventListener('input', () => {
        value.textContent = input.value;
        if (key === 'height') this._devHeight = Number(input.value); else this.tuning[key] = Number(input.value);
        this.updatePlayerVisualEffects({ state: this._devState || 'idle', height: this._devHeight || 0 });
      });
      row.append(input, value); panel.appendChild(row);
    });
    const state = document.createElement('select');
    this._stateNames().forEach(name => state.appendChild(new Option(name, name)));
    state.addEventListener('change', () => { this._devState = state.value; this.updatePlayerVisualEffects({ state: state.value, height: this._devHeight || 0 }); });
    panel.append(VA.el('label', 'player-fx-dev-row', 'State'), state);
    const copy = VA.el('button', '', 'Copy settings');
    copy.type = 'button'; copy.addEventListener('click', () => {
      const value = JSON.stringify({ state: this._devState || 'idle', height: this._devHeight || 0, lightingTuning: this.tuning }, null, 2);
      navigator.clipboard?.writeText(value); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy settings'; }, 900);
    });
    const reset = VA.el('button', '', 'Reset');
    reset.type = 'button'; reset.addEventListener('click', () => { this.tuning = { ...this.defaults }; this._devHeight = 0; panel.remove(); this._createPanel(); this.updatePlayerVisualEffects(); });
    panel.append(copy, reset);
    VA.$('#stage').appendChild(panel);
  },
};
