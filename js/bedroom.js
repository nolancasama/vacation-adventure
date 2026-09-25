/* ============================================================
   bedroom.js — home base and the single source of real memories.
   ============================================================ */
'use strict';

VA.Memories = {
  list() {
    const out = [];
    VA.Data.DESTS.forEach(dest => {
      const page = VA.State.data.book[dest.id];
      if (!page || !page.done) return;
      dest.events.forEach(evt => {
        if (evt.enabled === false) return;
        const photo = page.photos && page.photos[evt.id];
        if (!photo) return;
        out.push({ tripNo: page.trip || photo.trip || 0, destId: dest.id, eventId: evt.id, photo, evt, dest });
      });
    });
    return out.sort((a, b) => b.tripNo - a.tripNo ||
      VA.Data.DESTS.indexOf(b.dest) - VA.Data.DESTS.indexOf(a.dest) ||
      b.dest.events.indexOf(b.evt) - a.dest.events.indexOf(a.evt));
  },
};

VA.Bedroom = {
  // Stage-pixel geometry is intentionally centralized here. A future painted
  // background should need only this table adjusted, not the interaction code.
  hotspots: [
    // Measured on background_bedroom.webp (1586x992 source, x0.6053 to stage).
    // The phone lies at an angle, so its screen overlay is clipped to the
    // painted screen's quadrilateral.
    { id: 'phone', rect: { x: 142, y: 346, w: 66, h: 66 }, screen: { x: 156, y: 368, w: 38, h: 22, clip: 'polygon(37% 2%, 99% 9%, 69% 98%, 0% 84%)' }, label: 'Phone', hint: ['After your trip, share your favorite photos here!', '旅行のあと、ここでお気に入りの写真をシェアしよう！'] },
    { id: 'pc', rect: { x: 688, y: 184, w: 194, h: 156 }, screen: { x: 700, y: 197, w: 168, h: 94 }, label: 'Computer', hint: ['After your trip, write reviews of the places you visited!', '旅行のあと、行った場所のレビューを書こう！'] },
    { id: 'scrapbook', rect: { x: 330, y: 300, w: 118, h: 66 }, label: 'Scrapbook', hint: ['Your vacation memories will appear here!', '旅行の思い出がここに入るよ！'] },
    { id: 'trip', rect: { x: 532, y: 308, w: 116, h: 200 }, label: 'Trip!', hint: ['', ''] },
    { id: 'shelf', rect: { x: 622, y: 64, w: 314, h: 72 }, label: 'Travel shelf', hint: ['Flags from your trips will stand here!', '旅行した国の旗がここに並ぶよ！'] },
    { id: 'corkboard', rect: { x: 321, y: 76, w: 278, h: 205 }, label: 'Photos', hint: ['Your trip photos will go here!', '旅行の写真がここにはられるよ！'] },
  ],
  hintTimer: 0,

  guideStage(data) {
    const d = data || {};
    const hasMemories = VA.Data.DESTS.some(dest => {
      const page = (d.book || {})[dest.id];
      return !!(page && page.done && dest.events.some(evt => evt.enabled !== false && page.photos?.[evt.id]));
    });
    if (!hasMemories) return 'none';
    const guide = d.bedroomGuide || {};
    if (!guide.phoneDone) return guide.phoneSeen ? 'phone-pending' : 'phone-new';
    if (!guide.pcDone) return guide.pcSeen ? 'pc-pending' : 'pc-new';
    return 'done';
  },

  async show() {
    VA.State.checkpoint('bedroom');
    this.render();
    await VA.Screens.show('bedroom', { transition: 'home' });
    VA.HUD.show();
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);
    VA.Ambient.set([{ type: 'motes', rect: [0.08, 0.08, 0.84, 0.7], n: 7 }]);
  },

  render() {
    const scr = VA.$('#scr-bedroom');
    const art = scr.querySelector('.scene-art');
    art.innerHTML = '';
    // Painted room; the procedural painter remains the load-failure fallback.
    VA.Art.layer(art, { painter: 'bedroom', file: 'background_bedroom.webp' });

    const flags = scr.querySelector('.bedroom-pennants');
    flags.innerHTML = '';
    VA.Data.DESTS.forEach(dest => {
      const page = VA.State.data.book[dest.id];
      if (!page || !page.done) return;
      const pennant = VA.el('span', 'bedroom-pennant', dest.flag);
      pennant.style.setProperty('--pennant-color', dest.color);
      pennant.title = dest.name;
      flags.appendChild(pennant);
    });

    const board = scr.querySelector('.bedroom-corkboard');
    board.innerHTML = '';
    VA.Memories.list().slice(0, 6).forEach((memory, i) => {
      const photo = VA.el('div', 'bedroom-polaroid');
      photo.style.setProperty('--tilt', (i % 2 ? 3 : -3) + 'deg');
      photo.appendChild(VA.Art.polaroid(memory.photo, 70)); // 3x2 fits the painted cork
      board.appendChild(photo);
    });

    const layer = scr.querySelector('.bedroom-hotspots');
    layer.innerHTML = '';
    this.hotspots.forEach((item, i) => {
      const btn = VA.el('button', 'bedroom-hotspot' +
        (item.id === 'trip' && VA.State.data.tripCount === 0 ? ' first-trip' : ''));
      btn.type = 'button';
      btn.dataset.action = item.id;
      btn.setAttribute('aria-label', item.label);
      Object.assign(btn.style, {
        left: item.rect.x + 'px', top: item.rect.y + 'px', width: item.rect.w + 'px',
        height: item.rect.h + 'px', '--sparkle-delay': (i * 180) + 'ms',
      });
      btn.appendChild(VA.el('span', 'bedroom-hotspot-label', item.label));
      btn.addEventListener('click', () => this.use(item.id));
      layer.appendChild(btn);
    });
    if (!VA.reducedMotion) {
      layer.classList.remove('discovering');
      requestAnimationFrame(() => layer.classList.add('discovering'));
      setTimeout(() => layer.classList.remove('discovering'), 1250);
    }
    this.renderGuide();
  },

  renderGuide(handoff) {
    const scr = VA.$('#scr-bedroom');
    scr.querySelector('.bedroom-guide-layer')?.remove();
    const stage = this.guideStage(VA.State.data);
    if (!/^(phone|pc)-/.test(stage)) return;
    const id = stage.startsWith('phone') ? 'phone' : 'pc';
    const item = this.hotspots.find(entry => entry.id === id);
    const layer = VA.el('div', `bedroom-guide-layer guide-${stage}`);
    layer.dataset.guideFor = id;
    const screen = VA.el('div', `bedroom-guide-screen ${id}-guide-screen`);
    Object.assign(screen.style, { left: item.screen.x + 'px', top: item.screen.y + 'px', width: item.screen.w + 'px', height: item.screen.h + 'px' });
    if (item.screen.clip) screen.style.clipPath = item.screen.clip;
    if (id === 'pc' && stage === 'pc-new') screen.appendChild(VA.el('span', 'bedroom-guide-star', '★'));
    const dot = VA.el('span', `bedroom-guide-dot ${id}-guide-dot`, stage.endsWith('-new') ? '1' : '');
    dot.style.left = (item.screen.x + item.screen.w - 5) + 'px';
    dot.style.top = (item.screen.y - 7) + 'px';
    if (stage !== 'pc-pending') layer.appendChild(screen);
    layer.appendChild(dot);
    if (handoff && id === 'pc' && !VA.reducedMotion) {
      const sparkle = VA.el('span', 'bedroom-guide-handoff', '✦');
      sparkle.style.left = (item.screen.x + item.screen.w / 2) + 'px';
      sparkle.style.top = (item.screen.y + item.screen.h / 2) + 'px';
      layer.appendChild(sparkle);
    }
    scr.appendChild(layer);
  },

  hint(id, en, jp) {
    const scr = VA.$('#scr-bedroom');
    scr.querySelector('.bedroom-hint')?.remove();
    clearTimeout(this.hintTimer);
    const item = this.hotspots.find(entry => entry.id === id);
    const bubble = VA.el('div', 'bedroom-hint');
    bubble.dataset.for = id;
    bubble.style.left = (item.rect.x + item.rect.w / 2) + 'px';
    // Objects near the top of the room get the bubble underneath instead,
    // so it is never pushed off the stage.
    const below = item.rect.y < 120;
    bubble.classList.toggle('below', below);
    bubble.style.top = (below ? item.rect.y + item.rect.h + 12 : item.rect.y - 10) + 'px';
    bubble.appendChild(VA.el('div', 'bedroom-hint-en', VA.escape(en)));
    if (VA.State.data.settings.jp && jp) {
      const reveal = VA.el('button', 'bedroom-hint-jp-toggle', '? 日本語');
      const japanese = VA.el('div', 'bedroom-hint-jp', VA.escape(jp));
      japanese.hidden = true;
      reveal.addEventListener('pointerdown', event => event.stopPropagation());
      reveal.addEventListener('click', event => { event.stopPropagation(); japanese.hidden = false; reveal.hidden = true; });
      bubble.append(reveal, japanese);
    }
    scr.appendChild(bubble);
    const dismiss = () => { bubble.remove(); clearTimeout(this.hintTimer); };
    setTimeout(() => document.addEventListener('pointerdown', dismiss, { once: true }), 0);
    this.hintTimer = setTimeout(dismiss, 4500);
  },

  use(id) {
    VA.Audio.sfx('click');
    const memories = VA.Memories.list();
    const item = this.hotspots.find(entry => entry.id === id);
    if (['phone', 'pc', 'scrapbook'].includes(id) && !memories.length) return this.hint(id, item.hint[0], item.hint[1]);
    if (id === 'phone') return VA.Phone.open();
    if (id === 'pc') return VA.Reviews.open();
    if (id === 'scrapbook') {
      VA.UI.scrapbook(memories[0].destId, false);
      VA.UI.modalScrapbookReturn = 'bedroom';
      return VA.Screens.show('scrapbook');
    }
    if (id === 'trip') return VA.State.data.tripCount === 0 ? VA.Flows.toMap() : VA.Flows.newTripIntro();
    if (id === 'shelf') {
      const places = VA.Data.DESTS.filter(dest => VA.State.data.book[dest.id]?.done).map(dest => dest.name);
      if (!places.length) return this.hint(id, item.hint[0], item.hint[1]);
      const names = places.length === 1 ? places[0] : `${places.slice(0, -1).join(', ')} and ${places.at(-1)}`;
      return this.hint(id, `You went to ${names}!`, '旅行した場所の旗だよ！');
    }
    if (id === 'corkboard') {
      if (!memories.length) return this.hint(id, item.hint[0], item.hint[1]);
      return VA.UI.openAlbum();
    }
  },
};
