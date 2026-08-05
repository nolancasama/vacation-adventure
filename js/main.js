/* ============================================================
   main.js — boot, title screen, name entry, HUD wiring.
   ============================================================ */
'use strict';

VA.Main = {

  async boot() {
    VA.State.load();
    VA.applyPlayerLook(VA.State.data.playerLook);
    VA.Stage.init();
    VA.Ambient.init();
    VA.Cine.init();
    VA.PlayerFX.init();
    VA.Dialogue.init();
    VA.Voice.init();

    VA.$('#stage').classList.toggle('no-labels', !VA.State.data.settings.labels);
    window.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        VA.toggleDevLabels();
        VA.Audio.sfx('click');
      }
    });

    // audio can only start after a user gesture
    const kick = () => {
      VA.Audio.init();
      if (VA.Screens.current === 'title') VA.Audio.music('theme_title');
    };
    window.addEventListener('pointerdown', kick, { once: true });

    this.buildTitle();
    this.wireHud();

    // On a hard refresh, title UI, foreground, and background images can each
    // finish on different frames. Keep the scene behind the warm boot cover
    // until its complete initial asset set has decoded and painted once.
    await VA.Art.waitForScreenAssets(VA.$('#scr-title'));
    await VA.Fx.afterNextPaint();
    VA.$('#stage').classList.remove('is-booting');

    // This is used later, so warm it only after the title has been revealed.
    VA.Art.preload(['assets/backgrounds/background_map_world.png']);

    console.log('%c🏝 Vacation Adventure v' + VA.VERSION + ' — placeholder build',
      'font-size:14px;color:#ef6d3d;font-weight:bold');
  },

  buildTitle() {
    const scr = VA.$('#scr-title');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    // The title screen has the real artwork as its CSS background from the
    // first paint.  Do not cover it with the procedural fallback while the
    // image layer finishes decoding.
    VA.Art.layer(art, { painter: 'title', file: 'background_title.png?v=20260802', fallback: false });

    // This layer sits above the global clouds and birds but below title controls.
    const foreground = VA.$('#title-foreground');
    foreground.innerHTML = '';
    VA.Art.layer(foreground, { file: 'foreground_title.png?v=20260803', chip: false, fallback: false });

    scr.classList.add('active');
    VA.Screens.current = 'title';
    VA.Ambient.set([
      { type: 'clouds', band: [0.06, 0.3], n: 5 },
      { type: 'birds', band: [0.1, 0.35], every: [4, 9] },
      { type: 'shimmer', rect: [0, 0.73, 1, 0.12], n: 18 },
    ]);

    const hasSave = VA.State.hasSave();
    VA.$('#btn-continue').style.display = hasSave ? 'inline-block' : 'none';
    VA.$('#btn-start').textContent = hasSave ? '✈ New Game' : '✈ Start';

    VA.$('#btn-start').onclick = () => {
      VA.Audio.init();
      VA.Audio.sfx('click');
      if (hasSave) VA.State.reset();
      this.pickLook();
    };
    VA.$('#btn-continue').onclick = () => {
      VA.Audio.init();
      VA.Audio.sfx('click');
      VA.Audio.music('theme_title');
      VA.Flows.resume();
    };
  },

  async pickLook() {
    const modal = VA.$('#look-modal');
    const lookIds = ['boy', 'girl'];
    await VA.Art.preloadAndWait(lookIds.map(lookId =>
      'assets/characters/' + VA.Data.PLAYER_LOOKS[lookId].file,
    ));

    lookIds.forEach(lookId => {
      const btn = VA.$('#look-' + lookId);
      btn.classList.remove('picked');
      const slot = btn.querySelector('.look-portrait-slot');
      slot.innerHTML = '';
      slot.appendChild(VA.Art.lookPreviewEl(lookId, 150));
      btn.onclick = () => {
        VA.Audio.sfx('pop');
        VA.State.data.playerLook = lookId;
        VA.State.save();
        VA.applyPlayerLook(lookId);
        modal.style.display = 'none';
        this.askName();
      };
    });
    modal.style.display = 'flex';
  },

  askName() {
    const modal = VA.$('#name-modal');
    const input = VA.$('#name-input');
    modal.style.display = 'flex';
    input.value = '';
    setTimeout(() => input.focus(), 100);

    const suggestedName = () => {
      const pools = VA.Data.NAMES;
      const selected = pools[VA.State.data.playerLook] || pools.boy;
      return VA.pick([...selected, ...pools.shared]);
    };

    VA.$('#btn-name-dice').onclick = () => {
      VA.Audio.sfx('pop');
      input.value = suggestedName();
    };
    const go = () => {
      const name = (input.value || '').trim() || suggestedName();
      VA.State.data.name = name.slice(0, 10);
      VA.State.save();
      VA.Audio.sfx('chime');
      modal.style.display = 'none';
      VA.Flows.homeIntro();
    };
    VA.$('#btn-name-ok').onclick = go;
    input.onkeydown = e => { if (e.key === 'Enter') go(); };
  },

  wireHud() {
    // modals are fine any time; switching screens is only safe while
    // nothing is being said (no dialogue box on screen)
    const uiFree = () => VA.$('#dialogue').style.display === 'none';

    VA.$('#btn-album').addEventListener('click', () => { VA.Audio.sfx('click'); VA.UI.openAlbum(); });
    VA.$('#btn-passport').addEventListener('click', () => { VA.Audio.sfx('click'); VA.UI.openPassport(); });
    VA.$('#btn-settings').addEventListener('click', () => { VA.Audio.sfx('click'); VA.UI.openSettings(); });
    VA.$('#btn-book').addEventListener('click', () => {
      if (!uiFree() || VA.Screens.current === 'cine' || VA.Screens.current === 'scrapbook') return;
      VA.Audio.sfx('page');
      const trip = VA.State.data.trip;
      VA.UI.scrapbook(trip ? trip.dest : VA.Data.DESTS[0].id, false);
      VA.UI.modalScrapbookReturn = VA.Screens.current;
      VA.Screens.show('scrapbook');
    });

    let closingBook = false;
    VA.$('#btn-book-close').addEventListener('click', async () => {
      if (closingBook) return;
      closingBook = true;
      setTimeout(() => { closingBook = false; }, 2500);
      VA.Audio.sfx('click');
      // if the scrapbook was opened as a celebration, continue the story;
      // if it was opened from the HUD, just go back
      const ret = VA.UI.modalScrapbookReturn;
      VA.UI.modalScrapbookReturn = null;
      if (ret && ret !== 'scrapbook') {
        if (ret === 'home') { VA.UI.home(); }
        if (ret === 'explore' && VA.State.data.trip) { return VA.Flows.exploreScreen(true); }
        if (ret === 'map') { return VA.Flows.toMap(); }
        await VA.Screens.show(ret, ret === 'home' ? { transition: 'home' } : undefined);
      } else {
        await VA.Flows.afterScrapbook();
      }
    });

    VA.$('#btn-depart').addEventListener('click', () => {
      VA.Audio.sfx('click');
      VA.$('#btn-depart').style.display = 'none';
      VA.Flows.departure();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => VA.Main.boot());
