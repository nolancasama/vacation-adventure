/* ============================================================
   cinematic.js — the event-scene engine.

   Every special moment (buying ice cream, seeing the pyramids)
   is a small movie: a list of STEPS played in order on the
   #cine-world stage — camera moves, dialogue, effects, sounds,
   a mini-game, and finally the camera shutter that saves the
   memory photo.

   Step vocabulary (used by data.js):
     {cam:{x,y,s,dur}}       slow pan/zoom to focus point x,y (stage px)
     {towerPan:{from,to,dur}} pan a tall background from its base to its top
     {wait:ms}               hold the moment
     {say:['vendor','One ice cream?','アイスはいかが？']}   tap to continue
     {auto:['player','Yummy!','おいしい！',2200]}           auto-advances (optional hold ms)
     {choice:{items:[...]}}  player speaks by choosing a line
     {mood:['player','wow']} change a face
     {move:{id,x,y,dur}}     walk/slide an actor
     {anim:{id,name,wait}}   hop / wiggle / cheer / arc
     {fx:['sparkles',x,y]}   sparkles / hearts / steam at a point
     {sfx:'bite'}            play a sound effect
     {coins:-3}              spend coins (with animation)
      {caption:'GOAL!'}       big cheer text
      {reaction:{kind:'food-feast'}} quick full-screen story reaction
      {game:{n:3,label:'TAP!',propId:'ball',anim:'volley',fromId:'player',toId:'au_kid',sfx:'bounce'}}
     {photo:true}            flash → polaroid saved → flies to album
   ============================================================ */
'use strict';

VA.Cine = {
  world: null,
  ctx: null, // current run context {event, dest, actors:{}, props:{}}

  init() {
    this.world = VA.$('#cine-world');
  },

  _setLoading(isLoading, dest) {
    const screen = VA.$('#scr-cine');
    const overlay = VA.$('#cine-loading');
    screen.style.setProperty('--scene-loader-bg', (dest && dest.color) || '#6b5a70');
    screen.classList.toggle('is-loading', isLoading);
    overlay.hidden = !isLoading;
  },

  _initialAssets(evt) {
    // Include the art required by the first assembled frame only. Later
    // rewards/photos are intentionally not here, so they can load lazily.
    const dialogueCharacters = (evt.steps || []).flatMap(step => [
      step.say && step.say[0],
      step.auto && step.auto[0],
    ]).filter(charId => VA.Data.CHARS[charId]);
    const stageCharacters = (evt.actors || []).map(actor => actor.char);
    const characterAssets = [...new Set([...stageCharacters, ...dialogueCharacters])]
      .map(charId => VA.Data.CHARS[charId])
      .filter(Boolean)
      .map(char => 'assets/characters/' + char.file);
    return [
      evt.backdrop && ('assets/backgrounds/' + evt.backdrop),
      ...characterAssets,
      ...(evt.props || []).map(prop => prop.file && ('assets/objects/' + prop.file)),
      ...(evt.initialAssets || []), // reserved for a scene's initial UI/animation art
    ].filter(Boolean);
  },

  _afterNextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },

  /* Build the event only after all assets needed for its opening frame have
     loaded or failed. The screen remains covered by the loading overlay until
     that complete DOM tree has been painted at least once. */
  async setup(evt, dest) {
    this._setLoading(true, dest);
    const results = await VA.Art.preloadAndWait(this._initialAssets(evt));
    const failed = results.filter(result => !result.ok);
    if (failed.length) console.warn('[Scene preload using fallbacks]', failed.map(result => result.path));

    this.world.style.transition = 'none';
    this.world.style.transform = 'translate(0px,0px) scale(1)';
    const art = this.world.querySelector('.scene-art');
    const actorsLay = this.world.querySelector('.actor-layer');
    art.innerHTML = ''; actorsLay.innerHTML = '';
    actorsLay.style.transition = 'none';
    actorsLay.style.transform = 'translateY(0)';
    VA.$('#tap-game').style.display = 'none';

    VA.Art.layer(art, { painter: evt.painter, file: evt.backdrop, kind: 'backgrounds' });

    const ctx = { event: evt, dest, actors: {}, props: {} };
    (evt.actors || []).forEach(a => {
      // Some scenes use a closer conversation pose, but keep the base pose
      // saved so the final photo can return to its composed arrangement.
      const conversation = a.conversation;
      const screenPose = conversation ? {
        ...a,
        x: conversation.x == null ? a.x : conversation.x,
        y: conversation.y == null ? a.y : conversation.y,
      } : a;
      const el = VA.Art.actorEl(a.char, { ...screenPose, playerVisual: a.char === 'player' ? dest : null });
      el.style.zIndex = a.z || 2;
      if (conversation) {
        el.dataset.photoPose = 'true';
        el.dataset.photoX = a.x;
        el.dataset.photoY = a.y;
        el.dataset.conversationScale = conversation.scale || 1;
        el.classList.add('conversation-pose');
        el.style.setProperty('--conversation-scale', conversation.scale || 1);
      }
      // The player is represented in the dialogue portrait throughout an
      // activity.  Keep the full body sprite for the final memory moment only.
      if (a.char === 'player' && !evt.keepCastOnStage) {
        el.dataset.photoOnly = 'true';
        el.style.visibility = 'hidden';
      }
      actorsLay.appendChild(el);
      ctx.actors[a.id || a.char] = el;
    });
    (evt.props || []).forEach(pr => {
      const el = VA.Art.propEl(pr);
      el.style.zIndex = pr.z || 3;
      actorsLay.appendChild(el);
      ctx.props[pr.id] = el;
    });
    this.ctx = ctx;
    // These images are shown later in food scenes, but warm them while the
    // player is talking so its smash-cut never waits for a download/decode.
    if ((evt.steps || []).some(step => step.reaction && step.reaction.kind === 'food-feast')) {
      VA.Art.preload([
        'assets/objects/kebab_reaction_boy.png',
        'assets/objects/kebab_reaction_girl.png',
      ]);
    }
    VA.Ambient.set(evt.amb || []);
    await this._afterNextPaint();
    this._setLoading(false, dest);
    return ctx;
  },

  _target(id) {
    return this.ctx.actors[id] || this.ctx.props[id];
  },

  /* camera: focus point (x,y) in stage px at scale s.
     The art fills exactly VA.W x VA.H at scale 1, so once scaled up by s
     the valid translate range is [VA.W - VA.W*s, 0] / [VA.H - VA.H*s, 0] —
     clamping to that keeps the art covering the whole frame and never pans
     past its edges into the black #scr-cine backdrop behind it. */
  cam({ x = 480, y = 300, s = 1, dur = 1400, ease = 'ease-in-out' }) {
    let tx = VA.W / 2 - x * s;
    let ty = VA.H / 2 - y * s;
    tx = VA.clamp(tx, VA.W - VA.W * s, 0);
    ty = VA.clamp(ty, VA.H - VA.H * s, 0);
    this.world.style.transition = `transform ${dur}ms ${ease}`;
    this.world.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    return VA.wait(dur + 60);
  },

  /* Tall portrait scenery (the Eiffel Tower) needs its own source-image pan:
     the normal camera only moves the already-cropped 960×600 scene.  Move the
     crop from tower base to tip, while the people drift below the camera like
     they would when someone naturally looks up. */
  towerPan({ from = 100, to = 0, dur = 3600 }) {
    const image = this.world.querySelector('.art-layer img[src$="event_france_eiffel.png"]');
    const actors = this.world.querySelector('.actor-layer');
    if (!image) return VA.wait(dur);
    image.style.transition = 'none';
    image.style.objectPosition = `50% ${from}%`;
    actors.style.transition = 'none';
    actors.style.transform = 'translateY(0)';
    void image.offsetWidth;
    const ease = 'cubic-bezier(.36,0,.22,1)';
    image.style.transition = `object-position ${dur}ms ${ease}`;
    actors.style.transition = `transform ${dur}ms ${ease}`;
    image.style.objectPosition = `50% ${to}%`;
    actors.style.transform = 'translateY(680px)';
    return VA.wait(dur + 70);
  },

  ANIM_MS: { hop: 580, wiggle: 520, cheer: 1250, arc: 720, 'pop-in': 470 },

  async play(steps) {
    const ctx = this.ctx;
    for (const st of steps) {
      if (st.cam)     { await this.cam(st.cam); continue; }
      if (st.towerPan){ await this.towerPan(st.towerPan); continue; }
      if (st.wait)    { await VA.wait(st.wait); continue; }
      if (st.say)     { await VA.Dialogue.say(st.say[0], st.say[1], { jp: st.say[2], mood: st.say[3] }); continue; }
      if (st.auto)    { await VA.Dialogue.auto(st.auto[0], st.auto[1], { jp: st.auto[2], dur: st.auto[3] }); continue; }
      if (st.choice)  { ctx.choice = await VA.Dialogue.choice(st.choice.items, st.choice); continue; }
      if (st.mood)    { const el = ctx.actors[st.mood[0]]; if (el) VA.Art.setMood(el, st.mood[1]); continue; }
      if (st.sfx)     { VA.Audio.sfx(st.sfx); continue; }
      if (st.caption) { VA.Audio.sfx('cheer'); VA.Fx.captionBig(st.caption); continue; }
      if (st.coins)   { VA.Audio.sfx('coins'); VA.State.addCoins(st.coins); await VA.wait(500); continue; }
      if (st.reaction){ await this.showReaction(st.reaction); continue; }

      if (st.move) {
        const el = this._target(st.move.id);
        if (el) {
          if (el.dataset.char === 'player' && VA.PlayerFX) VA.PlayerFX.setState('walk', { actor: el, levelLighting: ctx.dest });
          if (st.move.towardScreen) {
            await this._moveTowardScreen(el, st.move);
            if (el.dataset.char === 'player' && VA.PlayerFX) VA.PlayerFX.setState('idle', { actor: el, levelLighting: ctx.dest });
            continue;
          }
          el.style.transition = `left ${st.move.dur || 900}ms ease-in-out, top ${st.move.dur || 900}ms ease-in-out`;
          el.style.left = st.move.x + 'px';
          if (st.move.y != null) el.style.top = st.move.y + 'px';
          await VA.wait((st.move.dur || 900) + 40);
          if (el.dataset.char === 'player' && VA.PlayerFX) VA.PlayerFX.setState('idle', { actor: el, levelLighting: ctx.dest });
        }
        continue;
      }

      if (st.anim) {
        const el = this._target(st.anim.id);
        if (el) {
          // Target the sprite content itself, not the .actor-svg-wrap that
          // also holds the ground-shadow rig — otherwise a hop/wiggle/cheer
          // transform drags the shadow along with the character.
          const node = el.classList.contains('prop') ? el : el.querySelector('.actor-svg-wrap > :not(.player-vfx-rig)');
          if (el.dataset.char === 'player' && VA.PlayerFX) {
            const state = st.anim.name === 'hop' ? 'jump' : (st.anim.name === 'cheer' ? 'celebrate' : 'fail');
            VA.PlayerFX.setState(state, { actor: el, height: state === 'jump' ? 80 : 0, levelLighting: ctx.dest });
          }
          node.classList.remove(st.anim.name);
          void node.offsetWidth;
          node.classList.add(st.anim.name);
          const ms = this.ANIM_MS[st.anim.name] || 600;
          setTimeout(() => node.classList.remove(st.anim.name), ms + 60);
          if (el.dataset.char === 'player' && VA.PlayerFX) setTimeout(() => VA.PlayerFX.setState('idle', { actor: el, levelLighting: ctx.dest }), ms + 60);
          if (st.anim.wait !== false) await VA.wait(ms);
        }
        continue;
      }

      if (st.fx) {
        const [type, x, y, opts] = st.fx;
        if (VA.Fx[type]) VA.Fx[type](this.world, x, y, opts);
        continue;
      }

      if (st.reward) { await this.showItemReward(st.reward); continue; }

      if (st.show) {
        const el = this._target(st.show);
        if (el) {
          el.style.visibility = 'visible';
          el.classList.add(el.classList.contains('prop-bottom') ? 'pop-in-bottom' : 'pop-in');
        }
        continue;
      }
      if (st.hide) {
        const el = this._target(st.hide);
        if (el) el.style.visibility = 'hidden';
        continue;
      }
      if (st.game)  { await this._tapGame(st.game); continue; }
      if (st.photo) { await this.snapPhoto(); continue; }
      if (st.fn)    { await st.fn(ctx); continue; }
    }
  },

  /* A received item moves straight toward the viewer: it finishes centered
     and larger, giving a simple, friendly sense of depth without a 3D scene. */
  async _moveTowardScreen(el, cfg = {}) {
    const fromX = parseFloat(el.style.left) || VA.W / 2;
    const fromY = parseFloat(el.style.top) || VA.H / 2;
    const toX = cfg.x == null ? VA.W / 2 : cfg.x;
    const toY = cfg.y == null ? VA.H / 2 : cfg.y;
    const endScale = cfg.scale || 2.15;
    const flight = el.animate([
      { offset: 0, left: fromX + 'px', top: fromY + 'px', transform: 'translate(-50%,-50%) scale(1)' },
      { offset: 1, left: toX + 'px', top: toY + 'px', transform: `translate(-50%,-50%) scale(${endScale})` },
    ], { duration: cfg.dur || 760, easing: 'cubic-bezier(.2,.78,.28,1)', fill: 'forwards' });
    await flight.finished.catch(() => {});
    el.style.left = toX + 'px';
    el.style.top = toY + 'px';
    el.style.transform = `translate(-50%,-50%) scale(${endScale})`;
    flight.cancel();
  },

  /* A reusable JRPG-like vocabulary moment for food and future collectible
     items.  The world prop is only used for a tiny handoff, then hidden; the
     reward overlay renders a separate, full-resolution image instead. */
  async showItemReward(cfg = {}) {
    const item = cfg.itemId ? this._target(cfg.itemId) : null;
    // Food rewards originate in a cinematic, while souvenirs are received on
    // the destination screen. Both use this same full-size presentation.
    const screen = VA.$('#scr-' + (cfg.screen || 'cine'));
    const overlay = VA.$('#item-reward');
    const art = VA.$('#item-reward-art');
    const word = VA.$('#item-reward-word');
    const particles = VA.$('#item-reward-particles');
    if (!overlay || !art || !word) return;

    // Short, deliberate pause: CSS pauses bobbing/idle effects and the overlay
    // captures input while the cinematic engine waits here.
    if (screen) screen.classList.add('item-reward-paused');
    overlay.hidden = false;
    overlay.classList.remove('is-visible');
    await VA.wait(200);

    // Let the tiny world item lean toward the viewer for a beat, then remove it
    // before the crisp reward illustration enters.
    if (item) {
      const x = parseFloat(item.style.left) || VA.W / 2;
      const y = parseFloat(item.style.top) || VA.H / 2;
      const handoff = item.animate([
        { left: x + 'px', top: y + 'px', transform: item.style.transform || 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { left: VA.W / 2 + 'px', top: VA.H / 2 + 'px', transform: 'translate(-50%,-50%) scale(1.25)', opacity: .15 },
      ], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
      await handoff.finished.catch(() => {});
      item.style.visibility = 'hidden';
      handoff.cancel();
    }

    // Only darken and blur once the tiny world sprite is gone, so the clean
    // reward art replaces it rather than looking like an enlarged blurry prop.
    if (screen) screen.classList.add('item-reward-active');
    particles.replaceChildren();
    art.src = 'assets/objects/' + cfg.illustration;
    art.alt = cfg.word || 'Item received';
    word.textContent = cfg.word || '';
    // Restart entry animations on repeat visits.
    overlay.classList.remove('is-visible');
    void overlay.offsetWidth;
    overlay.classList.add('is-visible');
    for (let i = 0; i < 11; i++) {
      const particle = VA.el('span', 'item-reward-particle', VA.pick(['✦', '✧', '•']));
      particle.style.setProperty('--x', VA.rand(-210, 210) + 'px');
      particle.style.setProperty('--y', VA.rand(-145, 130) + 'px');
      particle.style.animationDelay = VA.rand(0, .32) + 's';
      particles.appendChild(particle);
    }
    VA.Audio.sfx('obtain');
    VA.Voice.speak(cfg.pronunciation || cfg.word || '', VA.Data.CHARS.player.voice, 'player');

    await new Promise(resolve => {
      let closed = false;
      let acceptTap = false;
      const close = () => {
        if (closed || !acceptTap) return;
        closed = true;
        clearTimeout(timeout);
        overlay.removeEventListener('pointerdown', close);
        overlay.classList.remove('is-visible');
        setTimeout(() => { overlay.hidden = true; particles.replaceChildren(); resolve(); }, 280);
      };
      // A slight delay avoids treating the dialogue tap that led here as a
      // dismissal, but a deliberate tap can still close the reward early.
      setTimeout(() => { acceptTap = true; }, 300);
      overlay.addEventListener('pointerdown', close);
      const timeout = setTimeout(close, cfg.duration || 1850);
    });
    if (screen) screen.classList.remove('item-reward-active', 'item-reward-paused');
  },

  /* A one-second comic cutaway after receiving food. It deliberately occupies
     the whole stage, then clears before the existing "Yummy!" line. */
  async showReaction(cfg = {}) {
    if (cfg.kind !== 'food-feast') return;
    const overlay = VA.$('#food-feast-reaction');
    const art = VA.$('#food-feast-reaction-art');
    if (!overlay || !art) return;

    const isGirl = VA.State.data && VA.State.data.playerLook === 'girl';
    art.src = 'assets/objects/kebab_reaction_' + (isGirl ? 'girl' : 'boy') + '.png';
    art.alt = 'A joyful food feast';
    overlay.hidden = false;
    overlay.classList.remove('is-visible', 'is-leaving');
    void overlay.offsetWidth; // restart the smash-cut animation on repeat visits
    VA.Audio.sfx('feast');
    overlay.classList.add('is-visible');

    const duration = cfg.duration || 1000;
    const fadeMs = 160;
    await VA.wait(Math.max(0, duration - fadeMs));
    overlay.classList.add('is-leaving');
    await VA.wait(fadeMs);
    overlay.hidden = true;
    overlay.classList.remove('is-visible', 'is-leaving');
  },

  /* --------- the little "TAP!" play mini-game --------- */
  _tapGame(cfg) {
    const wrap = VA.$('#tap-game');
    const btn = VA.$('#tap-btn');
    const stars = VA.$('#tap-stars');
    btn.textContent = cfg.label || 'TAP!';
    stars.textContent = '';
    wrap.style.display = 'block';
    VA.Dialogue.hide();
    let count = 0;
    let inFlight = false;
    let passer = cfg.fromId || 'player';
    let receiver = cfg.toId || 'au_kid';

    // A volleyball starts at the first player's hand instead of hovering in
    // the middle of the court before the first tap.
    if (cfg.anim === 'volley') {
      const ball = this._target(cfg.propId);
      const pos = ball && this._volleyHandPoint(passer, 'right');
      if (pos) { ball.style.left = pos.x + 'px'; ball.style.top = pos.y + 'px'; }
    }
    return new Promise(res => {
      const onTap = async () => {
        if (inFlight) return;
        inFlight = true;
        count++;
        VA.Audio.sfx(cfg.sfx || 'bounce');
        stars.textContent += '⭐';
        const el = this._target(cfg.propId);
        if (el) {
          if (cfg.anim === 'grow') {
            const em = el.querySelector('.prop-emoji');
            const growTo = cfg.growTo || 2.5;
            const scale = 1 + ((growTo - 1) * count / (cfg.n || 3));
            const renderHeight = Number(el.dataset.renderHeight || el.dataset.baseSize || 44);
            const art = em.querySelector('img');
            // Resize the art itself instead of its line box.  Bottom-anchored
            // props therefore build upward from the sand rather than sinking.
            if (art) {
              art.style.transition = 'height .36s cubic-bezier(.22,1.35,.48,1)';
              art.style.height = (renderHeight * scale) + 'px';
            } else {
              em.style.transition = 'font-size .36s cubic-bezier(.22,1.35,.48,1)';
              em.style.fontSize = (Number(el.dataset.baseSize || 44) * scale) + 'px';
            }
            el.classList.remove('grow-pulse'); void el.offsetWidth; el.classList.add('grow-pulse');

            // Position a finishing flag at the current peak of the completed
            // sand pyramid, while leaving its pole planted in the pyramid.
            if (cfg.flagId) {
              const flag = this._target(cfg.flagId);
              if (flag) {
                const groundY = parseFloat(el.style.top);
                const tipY = groundY - (renderHeight * scale);
                // The flag pole is left of the image's canvas centre, so offset
                // the canvas to put the pole precisely on the pyramid peak.
                flag.style.left = (parseFloat(el.style.left) + (cfg.flagOffsetX || 0)) + 'px';
                flag.style.top = (tipY + (cfg.flagEmbed || 14)) + 'px';
              }
            }
          } else if (cfg.anim === 'volley') {
            await this._volleyPass(el, passer, receiver);
            [passer, receiver] = [receiver, passer];
            VA.Audio.sfx(cfg.sfx || 'bounce');
          } else {
            el.classList.remove(cfg.anim); void el.offsetWidth; el.classList.add(cfg.anim);
          }
        }
        if (count >= (cfg.n || 3)) {
          btn.removeEventListener('click', onTap);
          if (cfg.goal && el) await this._goalShot(el, cfg.goal);
          inFlight = false;
          setTimeout(() => { wrap.style.display = 'none'; res(); }, 800);
        } else {
          inFlight = false;
        }
      };
      btn.addEventListener('click', onTap);
    });
  },

  /* --------- camera shutter → memory photo --------- */
  /* The hit point follows the actor's actual sprite height, so the pass still
     lines up with their hands if a scene changes an actor's scale. */
  _volleyHandPoint(actorId, direction) {
    const actor = this.ctx && this.ctx.actors[actorId];
    if (!actor) return null;
    const body = actor.querySelector('.actor-breathe-sprite, .actor-svg-wrap');
    const h = (body && body.offsetHeight) || (300 * (parseFloat(actor.dataset.scale) || 1));
    const x = parseFloat(actor.style.left) || 0;
    const y = parseFloat(actor.style.top) || 0;
    return {
      x: x + (direction === 'right' ? 1 : -1) * h * 0.23,
      y: y - h * 0.48,
    };
  },

  /* Send the ball in one smooth, spinning arc between the two players.  Its
     final coordinates are committed after the flight so the next tap begins
     at the receiver and reverses the pass. */
  async _volleyPass(ball, fromId, toId) {
    const from = this._volleyHandPoint(fromId, fromId === 'player' ? 'right' : 'left');
    const to = this._volleyHandPoint(toId, toId === 'player' ? 'right' : 'left');
    if (!from || !to) return;

    ball.style.left = from.x + 'px';
    ball.style.top = from.y + 'px';
    const apexY = Math.min(from.y, to.y) - Math.min(125, Math.abs(to.x - from.x) * 0.3);
    const spin = to.x > from.x ? 300 : -300;
    const flight = ball.animate([
      { offset: 0, transform: 'translate(-50%,-50%) rotate(0deg) scale(1)' },
      { offset: 0.5, left: ((from.x + to.x) / 2) + 'px', top: apexY + 'px', transform: `translate(-50%,-50%) rotate(${spin / 2}deg) scale(1.08)` },
      { offset: 1, left: to.x + 'px', top: to.y + 'px', transform: `translate(-50%,-50%) rotate(${spin}deg) scale(1)` },
    ], { duration: 780, easing: 'cubic-bezier(.32,.01,.55,1)', fill: 'forwards' });
    await flight.finished.catch(() => {});
    ball.style.left = to.x + 'px';
    ball.style.top = to.y + 'px';
    ball.style.transform = 'translate(-50%,-50%)';
    // A filled Web Animation otherwise keeps control of left/top and can
    // prevent the next pass (or a final shot) from visibly moving the ball.
    flight.cancel();
  },

  /* The soccer finale: carry the last pass in a short, arcing shot into the
     mouth of the goal instead of sliding it there after the tap game ends. */
  async _goalShot(ball, goal) {
    const from = {
      x: parseFloat(ball.style.left) || goal.x,
      y: parseFloat(ball.style.top) || goal.y,
    };
    const to = { x: goal.x, y: goal.y };
    const apexY = Math.min(from.y, to.y) - Math.max(52, Math.abs(to.x - from.x) * 0.23);
    const endScale = goal.scale == null ? 0.7 : goal.scale;
    const midScale = 1 - (1 - endScale) * 0.45;
    const flight = ball.animate([
      { offset: 0, left: from.x + 'px', top: from.y + 'px', transform: 'translate(-50%,-50%) rotate(0deg) scale(1)' },
      { offset: .54, left: ((from.x + to.x) / 2) + 'px', top: apexY + 'px', transform: `translate(-50%,-50%) rotate(260deg) scale(${midScale})` },
      { offset: 1, left: to.x + 'px', top: to.y + 'px', transform: `translate(-50%,-50%) rotate(520deg) scale(${endScale})` },
    ], { duration: 620, easing: 'cubic-bezier(.25,.1,.4,1)', fill: 'forwards' });
    await flight.finished.catch(() => {});
    ball.style.left = to.x + 'px';
    ball.style.top = to.y + 'px';
    ball.style.transform = `translate(-50%,-50%) scale(${endScale})`;
    flight.cancel();
    VA.Audio.sfx('kick');
  },

  async snapPhoto() {
    const evt = this.ctx.event;
    const dest = this.ctx.dest;
    VA.Dialogue.hide();
    // Tower pans temporarily move the actor layer out of frame.  Restore the
    // regular stage position for the final memory pose before the shutter.
    const actorsLay = this.world.querySelector('.actor-layer');
    if (actorsLay) {
      actorsLay.style.transition = 'none';
      actorsLay.style.transform = 'translateY(0)';
    }
    // Standard conversation memories keep the NPC's centered conversation
    // pose.  Activities can opt into their older, on-field composition.
    Object.values(this.ctx.actors).forEach(actor => {
      if (actor.dataset.photoPose !== 'true') return;
      if (evt.restoreConversationBeforePhoto) {
        actor.style.left = actor.dataset.photoX + 'px';
        actor.style.top = actor.dataset.photoY + 'px';
        actor.classList.remove('conversation-pose');
        actor.style.removeProperty('--conversation-scale');
      } else {
        actor.dataset.photoSnapshotScale =
          (parseFloat(actor.dataset.scale) || 1) * (parseFloat(actor.dataset.conversationScale) || 1);
      }
    });
    const player = this.ctx.actors.player;
    if (player && player.dataset.photoOnly === 'true') {
      const pose = evt.photoPlayerPose;
      if (pose) {
        player.style.left = pose.x + 'px';
        player.style.top = pose.y + 'px';
        if (pose.scale && pose.scale !== 1) {
          const body = player.querySelector('.actor-svg-wrap');
          if (body) {
            body.style.transform = `scale(${pose.scale})`;
            body.style.transformOrigin = 'center bottom';
          }
          player.dataset.photoSnapshotScale =
            (parseFloat(player.dataset.scale) || 1) * pose.scale;
        }
      }
      // Give the player a brief, calm return to the scene before the shutter,
      // then retain that same on-stage position in the saved photo.
      player.style.visibility = 'visible';
      player.classList.remove('photo-reveal'); void player.offsetWidth;
      player.classList.add('photo-reveal');
    }
    await VA.wait(450);

    VA.Fx.flash();
    VA.Audio.sfx('camera');
    await VA.wait(550);

    const photo = {
      dest: dest.id,
      event: evt.id,
      verb: evt.verb,
      caption: evt.caption,
      jp: evt.captionJP,
      icon: evt.photoIcon,
      painter: evt.painter,
      backdrop: evt.backdrop, // real background asset, if it's loaded — see VA.Art.polaroid
      // plain (JSON-safe) snapshot of actors' CURRENT on-stage position, not their
      // starting definition — actors that walk/hop into frame mid-scene (e.g. the
      // kangaroo entering from off-stage) must be captured where they ended up
      actors: Object.values(this.ctx.actors).map(el => ({
        char: el.dataset.char,
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
        scale: parseFloat(el.dataset.photoSnapshotScale || el.dataset.scale) || 1,
        flip: el.classList.contains('flip'),
      })),
      props: (evt.photoProps || []).map(id => this.ctx.props[id]).filter(el =>
        el && el.style.visibility !== 'hidden'
      ).map(el => {
        const art = el.querySelector('.prop-emoji img');
        const transform = el.style.transform || '';
        const scaleMatch = transform.match(/scale\(([^)]+)\)/);
        return {
          file: el.dataset.file,
          icon: el.dataset.icon,
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
          height: art ? (parseFloat(art.style.height) || Number(el.dataset.renderHeight)) : Number(el.dataset.renderHeight),
          scale: scaleMatch ? parseFloat(scaleMatch[1]) || 1 : 1,
          anchor: el.dataset.anchor,
        };
      }),
      file: evt.photoFile,
      trip: VA.State.data.trip ? VA.State.data.trip.no : 0,
    };
    VA.State.addPhoto(photo);

    // show the saved polaroid + say the memory sentence
    const toast = VA.$('#photo-toast');
    const holder = VA.$('#pt-polaroid');
    holder.innerHTML = '';
    holder.appendChild(VA.Art.polaroid(photo, 220));
    VA.$('#pt-caption').innerHTML =
      '📷 ' + evt.caption + (VA.State.data.settings.jp && evt.captionJP ? `<span class="jp-inline">${evt.captionJP}</span>` : '');
    toast.style.display = 'flex';
    VA.Audio.sfx('chime');
    VA.Voice.speak(evt.caption, VA.Data.CHARS.player.voice, 'player');
    await VA.wait(2600);
    toast.style.display = 'none';

    await VA.Fx.flyPolaroidToHud(VA.Art.polaroid(photo, 150));
  },
};
