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
    // Ctrl+Shift+D is Chrome/Edge's own "bookmark all tabs" shortcut — the
    // browser swallows it before page JS ever sees the keydown, so it can
    // never be overridden. Ctrl+Alt+D isn't claimed by any mainstream browser.
    window.addEventListener('keydown', e => {
      if (e.ctrlKey && e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        VA.toggleDevLabels();
        VA.Audio.sfx('click');
      }
    });

    // audio can only start after a user gesture
    const kick = () => {
      VA.Audio.init();
      if (VA.Screens.current === 'title') {
        VA.Audio.music('theme_title');
        VA.Audio.ambient(['waves']);
      }
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
    // The long painted sky repeats inside one moving strip.  Its duplicate makes
    // the slow horizontal drift loop without a visible reset.
    const cloudTrack = VA.el('div', 'title-cloud-track');
    const cloudPath = 'assets/backgrounds/intro_cloud_long.png?v=20260805';
    cloudTrack.dataset.assetPath = cloudPath;
    for (let i = 0; i < 2; i++) {
      const cloud = document.createElement('img');
      cloud.src = cloudPath;
      cloud.alt = '';
      cloud.setAttribute('aria-hidden', 'true');
      cloudTrack.appendChild(cloud);
    }
    art.appendChild(cloudTrack);

    // The transparent palm-and-beach painting is the foreground, above the
    // moving sky but below the title controls.
    const foreground = VA.$('#title-foreground');
    foreground.innerHTML = '';
    VA.Art.layer(foreground, { file: 'intro_paradise_1.png?v=20260805', chip: false, fallback: false });

    scr.classList.add('active');
    VA.Screens.current = 'title';
    // Keep the painted sky as the only cloud layer; a few distant birds add
    // life without crossing in front of the beach artwork.
    VA.Ambient.set([
      { type: 'birds', band: [0.1, 0.35], every: [4, 9] },
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
