/* ============================================================
   screens.js — screen/UI builders (the parts you can touch).

   VA.UI.*  builds each screen's contents from data
   VA.HUD   coins pill + album/passport/scrapbook/settings
   ============================================================ */
'use strict';

VA.HUD = {
  show() { VA.$('#hud').style.display = 'flex'; this.refresh(); },
  hide() { VA.$('#hud').style.display = 'none'; },
  refresh(bump) {
    const pill = VA.$('#hud-coins');
    pill.querySelector('.val').textContent = VA.State.data.coins;
    if (bump) {
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    }
  },
};

VA.UI = {

  /* ---------- Grandma's living room ---------- */
  home() {
    const scr = VA.$('#scr-home');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    VA.Art.layer(art, { painter: 'home', file: 'background_home_livingroom.png' });

    const lay = scr.querySelector('.actor-layer');
    lay.innerHTML = '';
    this.renderHomeSouvenirs();
    // Stand Grandma on the open rug in front of the table rather than beside
    // it, so she reads as centered without covering the shelf/table gifts.
    const grandma = VA.Art.actorEl('grandma', { x: 480, y: 600, scale: 1.3, bob: true });
    lay.appendChild(grandma);

    VA.$('#debrief-page').classList.remove('show');
    VA.Ambient.set([{ type: 'motes', rect: [0.11, 0.15, 0.26, 0.36], n: 8 }]);
    return { grandma };
  },

  /* ---------- Grandma's persistent travel display ---------- */
  renderHomeSouvenirs() {
    const layer = VA.$('#home-souvenirs');
    layer.innerHTML = '';
    if (!VA.Data.FEATURES.grandmaHomeSouvenirs) return;
    const gifts = VA.State.data.settings.labels ? VA.State.allHomeSouvenirsPreview() : VA.State.homeSouvenirs();

    gifts.forEach(gift => {
      const item = VA.el('button', 'home-souvenir');
      item.type = 'button';
      item.style.left = gift.displayPosition.x + 'px';
      item.style.top = gift.displayPosition.y + 'px';
      item.style.setProperty('--gift-size', gift.displayPosition.size + 'px');
      item.style.setProperty('--gift-rot', (gift.displayPosition.rot || 0) + 'deg');
      item.title = `${gift.label} — tap to remember ${gift.destinationName}`;
      item.setAttribute('aria-label', `${gift.label} from ${gift.destinationName}. Review this memory.`);

      const art = document.createElement('img');
      art.src = 'assets/objects/' + gift.file;
      art.alt = gift.label;
      art.onerror = () => art.replaceWith(VA.el('span', 'home-souvenir-fallback', gift.icon));
      item.appendChild(art);
      item.appendChild(VA.el('span', 'home-souvenir-label', gift.label));
      item.addEventListener('click', () => this.reviewHomeSouvenir(gift));
      layer.appendChild(item);
    });

  },

  async reviewHomeSouvenir(gift) {
    if (!VA.Data.FEATURES.grandmaHomeSouvenirs || this._reviewing || VA.$('#dialogue').style.display !== 'none') return;
    this._reviewing = true;
    const D = VA.Dialogue;
    try {
      await D.say('grandma', `You gave me this ${gift.label.toLowerCase()}.`, { jp: 'これをくれたのね。' });
      await D.say('grandma', `You went to ${gift.destinationName}.`, { jp: `${gift.destinationName}に行ったのね。` });
      await D.say('grandma', 'What did you see?', { jp: '何を見たの？' });
      const answer = gift.relatedGrammarAnswer || `I saw ${gift.label.toLowerCase()}.`;
      const picked = await D.choice([
        { text: answer, jp: gift.relatedGrammarJP || '' },
        { text: 'I saw the moon.', jp: '月を見たよ。' },
      ]);
      if (picked !== answer) {
        await D.say('grandma', `Look at your ${gift.label.toLowerCase()}.`, { jp: 'プレゼントを見てごらん。' });
      }
      await D.say('player', answer, { jp: gift.relatedGrammarJP || '' });
      await D.say('grandma', gift.grandmaDialogue, { jp: '旅行の思い出は大切ね。' });
    } finally {
      D.hide();
      this._reviewing = false;
    }
  },

  /* ---------- world map ---------- */
  map() {
    const scr = VA.$('#scr-map');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    VA.Art.layer(art, { painter: 'map', file: 'background_map_world.png' });

    // bouncing pins on the map itself — hovering a pin highlights its card
    // below (and vice versa), so the connection between the two is obvious
    const pinsByDest = {};
    VA.Data.DESTS.forEach(d => {
      const pin = VA.el('button', 'map-pin', '📍');
      pin.type = 'button';
      pin.setAttribute('aria-label', `Travel to ${d.name}`);
      pin.dataset.dest = d.id;
      pin.style.left = d.mapPin.x + 'px';
      pin.style.top = d.mapPin.y + 'px';
      art.appendChild(pin);
      pinsByDest[d.id] = pin;
    });

    // big destination cards
    const cards = VA.$('#dest-cards');
    cards.innerHTML = '';
    const cardsByDest = {};
    VA.Data.DESTS.forEach(d => {
      const page = VA.State.data.book[d.id];
      const card = VA.el('button', 'dest-card');
      card.dataset.dest = d.id;
      const artBox = VA.el('div', 'dc-art');
      VA.Art.layer(artBox, { painter: d.painter, file: 'card_' + d.id + '.png', kind: 'backgrounds', w: 460, h: 184, chip: false });
      card.appendChild(artBox);
      card.appendChild(VA.el('div', 'dc-name', d.name));
      card.appendChild(VA.el('div', 'dc-jp', d.jp));
      card.appendChild(VA.el('div', 'dc-flag', d.stampIcon)); // (flag emoji don't render on Windows)
      if (page && page.done) card.appendChild(VA.el('div', 'dc-done', '✓ Visited!'));
      card.addEventListener('click', () => {
        if (VA.$('#dialogue').style.display !== 'none') return;
        cards.querySelectorAll('button').forEach(b => b.disabled = true); // no double-boarding
        VA.Audio.sfx('click');
        VA.Flows.travelTo(d.id);
      });
      cards.appendChild(card);
      cardsByDest[d.id] = card;
    });

    // link pin <-> card hover in both directions
    VA.Data.DESTS.forEach(d => {
      const pin = pinsByDest[d.id], card = cardsByDest[d.id];
      const on = () => { pin.classList.add('pin-hover'); card.classList.add('card-hover'); };
      const off = () => { pin.classList.remove('pin-hover'); card.classList.remove('card-hover'); };
      pin.addEventListener('pointerenter', on); pin.addEventListener('pointerleave', off);
      card.addEventListener('pointerenter', on); card.addEventListener('pointerleave', off);
      // A map pin is another, more direct way to choose its matching card.
      // Calling the card keeps clicks and taps on either control on one path.
      pin.addEventListener('click', () => card.click());
    });
  },

  /* ---------- travel sky ---------- */
  travel(homeward) {
    const scr = VA.$('#scr-travel');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    VA.Art.layer(art, { painter: 'travelSky', file: 'background_travel_sky.png' });

    const plane = VA.$('#travel-plane');
    VA.$('#travel-loading').hidden = true;
    plane.innerHTML = '';
    // Outbound flight travels left-to-right; the return flight goes right-to-left.
    plane.appendChild(VA.Art.planeEl(190, true, !homeward));
    plane.classList.remove('flip');
    plane.style.transition = 'none';
    plane.style.left = homeward ? '1040px' : '-260px';
    plane.style.top = (220 + VA.rand(-30, 40)) + 'px';
    void plane.offsetWidth;
    plane.style.transition = 'left 3s cubic-bezier(.45,.1,.55,.9)';
  },

  /* ---------- destination hub with activity hotspots ---------- */
  explore(dest) {
    const scr = VA.$('#scr-explore');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    VA.Art.layer(art, { painter: dest.painter, file: dest.bg });

    const lay = scr.querySelector('.actor-layer');
    lay.innerHTML = '';
    lay.appendChild(VA.Art.actorEl('player', { x: 110, y: 565, scale: 0.95, bob: true, playerVisual: dest }));

    const trip = VA.State.data.trip || { done: [] };
    const hsLayer = VA.$('#hotspot-layer');
    hsLayer.innerHTML = '';
    dest.events.forEach(evt => {
      const done = trip.done.includes(evt.id);
      const b = VA.el('button', 'hotspot' + (done ? ' done' : ''));
      b.id = 'hs-' + evt.id;
      b.style.left = evt.hotspot.x + 'px';
      b.style.top = evt.hotspot.y + 'px';
      b.innerHTML =
        `<span class="hs-ico">${evt.icon}</span>` +
        `<span class="hs-label">${evt.title}</span>` +
        `<span class="hs-price">${done ? '📷 Done!' : (evt.price ? evt.price + ' 💰' : 'Free!')}</span>` +
        (done ? '<span class="hs-check">✅</span>' : '');
      if (!done) b.addEventListener('click', () => {
        // ignore taps while someone is talking (e.g. passport control)
        if (VA.$('#dialogue').style.display !== 'none' || VA.$('#choices').style.display !== 'none') return;
        VA.Audio.sfx('click');
        VA.Flows.runEvent(evt.id);
      });
      hsLayer.appendChild(b);
    });

    const allDone = dest.events.every(e => trip.done.includes(e.id));
    VA.$('#btn-depart').style.display = allDone ? 'block' : 'none';
    VA.$('#explore-hint').textContent = allDone ? '' : '';
  },

  /* ---------- the live scrapbook page beside Grandma ---------- */
  debriefPanel(dest) {
    const panel = VA.$('#debrief-page');
    panel.innerHTML = `<h3>📖 My Trip</h3>`;
    const slots = {};
    for (const Q of VA.Data.DEBRIEF_QUESTIONS) {
      const s = VA.el('div', 'dp-slot');
      s.dataset.verb = Q.verb;
      s.innerHTML = '<span>?</span>';
      panel.appendChild(s);
      slots[Q.verb] = s;
    }
    panel.classList.add('show');

    const photos = VA.State.tripPhotos();
    return {
      async fill(verb) {
        const s = slots[verb];
        if (verb === 'went') {
          s.innerHTML = `<span class="dp-ico">${dest.stampIcon}</span><span>${dest.name}</span>`;
        } else {
          const evtId = VA.Flows._eventForVerb(dest, verb);
          const ph = photos[evtId];
          if (ph) s.innerHTML = `<span class="dp-ico">${ph.icon}</span><span>${ph.caption.replace('I ', '')}</span>`;
        }
        s.classList.add('filled');
        VA.Audio.sfx('pop');
        await VA.wait(420);
      },
    };
  },

  /* ---------- big memory hint (wrong answer / album viewer) ---------- */
  showHint(type, data) {
    const box = VA.$('#hint-photo');
    box.innerHTML = '';
    const inner = VA.el('div');
    if (type === 'photo' && data) {
      inner.appendChild(VA.Art.polaroid(data, 240));
      VA.Voice.speak(data.caption, VA.Data.CHARS.player.voice);
    } else if (type === 'stamp' && data) {
      const wrap = VA.el('div');
      wrap.style.cssText = 'background:#fff;padding:26px 34px;border-radius:18px;text-align:center;';
      wrap.appendChild(VA.Art.stampEl(data.id));
      wrap.appendChild(VA.el('div', '', `<b style="color:#4a3728;font-size:20px">${data.name}</b>`));
      inner.appendChild(wrap);
    }
    box.appendChild(inner);
    box.style.display = 'flex';
    VA.Audio.sfx('page');
    return new Promise(res => {
      const close = () => { box.style.display = 'none'; box.removeEventListener('click', close); res(); };
      box.addEventListener('click', close);
      setTimeout(close, 4500);
    });
  },

  /* ---------- scrapbook screen ---------- */
  scrapbook(activeId, celebrate) {
    const tabs = VA.$('#book-tabs');
    tabs.innerHTML = '';
    VA.Data.DESTS.forEach(d => {
      const t = VA.el('button', 'book-tab' + (d.id === activeId ? ' active' : ''), d.stampIcon + ' ' + d.name);
      t.dataset.dest = d.id;
      t.addEventListener('click', () => {
        VA.Audio.sfx('page');
        this.scrapbook(d.id, false);
      });
      tabs.appendChild(t);
    });

    const pageEl = VA.$('#book-page');
    pageEl.innerHTML = '';
    const dest = VA.Data.destById(activeId);
    const page = VA.State.data.book[activeId];

    if (!page || !Object.keys(page.photos).length) {
      pageEl.appendChild(VA.el('div', 'page-empty',
        `${dest.stampIcon} No trip yet!<br><span class="jp-inline">まだ行っていないよ！</span>`));
      return;
    }

    if (page.done) {
      const ribbon = VA.el('div', 'page-ribbon', `🎉 Trip #${page.trip} Complete!`);
      pageEl.appendChild(ribbon);
    }
    const stampBox = VA.el('div', 'page-stamp');
    const st = VA.Art.stampEl(activeId);
    st.style.width = '86px'; st.style.height = '86px';
    stampBox.appendChild(st);
    pageEl.appendChild(stampBox);

    ['ate', 'saw', 'played'].forEach(verb => {
      const evt = dest.events.find(e => e.verb === verb);
      const ph = page.photos[evt.id];
      const slot = VA.el('div', 'page-slot' + (ph ? ' filled' : ''));
      const frame = VA.el('div', 'slot-frame');
      if (ph) frame.appendChild(VA.Art.polaroid(ph, 164));
      else frame.textContent = '?';
      slot.appendChild(frame);
      slot.appendChild(VA.el('div', 'slot-cap',
        ph && VA.State.data.settings.jp ? (ph.jp || '') : ''));
      pageEl.appendChild(slot);
    });

    if (page.souvenir) {
      const sv = VA.el('div', 'page-souvenir');
      const art = document.createElement('img');
      art.className = 'sv-art';
      art.src = 'assets/objects/' + page.souvenir.file;
      art.alt = page.souvenir.label;
      art.onerror = () => {
        art.replaceWith(VA.el('span', 'sv-ico', page.souvenir.icon));
      };
      sv.appendChild(art);
      sv.appendChild(VA.el('span', 'sv-tag', page.souvenir.label + ' for Grandma 💕'));
      pageEl.appendChild(sv);
    }

    if (celebrate) setTimeout(() => VA.Ambient.burst('confetti'), 500);
  },

  /* ---------- shared modal helper ---------- */
  modal(title, contentEl) {
    const m = VA.$('#modal');
    const card = VA.$('#modal-card');
    card.innerHTML = '';
    const close = VA.el('button', 'modal-close', '✖');
    close.addEventListener('click', () => { VA.Audio.sfx('click'); m.style.display = 'none'; });
    card.appendChild(close);
    if (title) card.appendChild(VA.el('h2', '', title));
    card.appendChild(contentEl);
    m.style.display = 'flex';
    m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
  },

  /* ---------- photo album ---------- */
  openAlbum() {
    const photos = VA.State.albumPhotos();
    const grid = VA.el('div', 'album-grid');
    if (!photos.length) {
      grid.appendChild(VA.el('div', 'album-empty', 'No photos yet!<br>Go on a trip! 📷<br><span class="jp-inline">まだ写真がないよ。旅行に行こう！</span>'));
    } else {
      photos.forEach(ph => {
        const item = VA.el('div', 'album-item');
        item.appendChild(VA.Art.polaroid(ph, 132));
        item.addEventListener('click', () => this.showHint('photo', ph));
        grid.appendChild(item);
      });
    }
    this.modal('📷 Photo Album', grid);
  },

  /* ---------- passport ---------- */
  openPassport() {
    const wrap = VA.el('div', 'passport-book');
    const idCard = VA.el('div', 'passport-id');
    idCard.innerHTML = `<div class="pp-title">✈ PASSPORT ✈</div>`;
    const face = VA.el('div', 'pp-face');
    face.innerHTML = VA.Art.charSVG(VA.Data.CHARS.player, 'happy', 84);
    idCard.appendChild(face);
    idCard.appendChild(VA.el('div', 'pp-name', VA.State.data.name || '—'));
    idCard.appendChild(VA.el('div', '', `<small style="opacity:.75">Trips: ${VA.State.data.tripCount}</small>`));
    wrap.appendChild(idCard);

    const stamps = VA.el('div', 'passport-stamps');
    VA.Data.DESTS.forEach(d => {
      if (VA.State.data.stamps.includes(d.id)) stamps.appendChild(VA.Art.stampEl(d.id));
      else stamps.appendChild(VA.el('div', 'stamp empty', '?'));
    });
    wrap.appendChild(stamps);
    this.modal('🛂 My Passport', wrap);
  },

  /* ---------- settings ---------- */
  openSettings() {
    const s = VA.State.data.settings;
    const list = VA.el('div', 'settings-list');
    const rows = [
      ['music', '🎵 Music', 'おんがく'],
      ['sfx', '🔔 Sounds', 'こうかおん'],
      ['voice', '🗣 Voice (English)', 'えいごの声で読む'],
      ['jp', '🇯🇵 Japanese hints', 'にほんごのヒント'],
      ['labels', '🏷 Asset labels', 'アセット名を表示（開発用）'],
    ];
    rows.forEach(([key, label, jp]) => {
      const row = VA.el('div', 'setting-row');
      row.innerHTML = `<span>${label}<small>${jp}</small></span>`;
      const t = VA.el('button', 'toggle' + (s[key] ? ' on' : ''));
      t.addEventListener('click', () => {
        s[key] = !s[key];
        t.classList.toggle('on', s[key]);
        VA.State.save();
        VA.Audio.sfx('click');
        if (key === 'labels') VA.$('#stage').classList.toggle('no-labels', !s.labels);
        if (key === 'music' || key === 'sfx') VA.Audio.applySettings();
        if (key === 'voice' && !s.voice) VA.Voice.stop();
      });
      row.appendChild(t);
      list.appendChild(row);
    });

    const reset = VA.el('button', 'danger-btn', 'Reset save data　セーブデータをけす');
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed) { armed = true; reset.textContent = 'Tap again to reset!　もういちどタップでけすよ！'; return; }
      VA.State.reset();
      location.reload();
    });
    list.appendChild(reset);
    list.appendChild(VA.el('p', '', `<small style="color:var(--ink-soft)">Placeholder build v${VA.VERSION} — real art &amp; audio load automatically from the assets folder (see ASSETS.md).</small>`));
    this.modal('⚙️ Settings', list);
  },
};
