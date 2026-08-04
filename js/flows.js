/* ============================================================
   flows.js — the story director.

   Async functions that walk the player around the core loop:

   home (Grandma gives money) → map → travel → passport stamp →
   explore → events (cinematic memories) → souvenir → fly home →
   debrief with Grandma → scrapbook page → next trip / finale
   ============================================================ */
'use strict';

VA.Flows = {

  /* ---------- resume from a saved checkpoint ---------- */
  async resume() {
    const st = VA.State.data;
    const cp = st.checkpoint;
    if (cp === 'explore' && st.trip) return this.exploreScreen(true);
    if (cp === 'depart' && st.trip) return this.departure();
    if (cp === 'debrief' && st.trip) return this.debrief(true);
    if (cp === 'map') return this.toMap();
    return this.homeIntro();
  },

  /* ---------- Grandma's living room: the first send-off ---------- */
  async homeIntro() {
    VA.State.checkpoint('home');
    const name = VA.State.data.name;
    const { grandma } = VA.UI.home();
    await VA.Screens.show('home');
    VA.HUD.show();
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);

    const D = VA.Dialogue;
    await D.say('grandma', `Good morning, ${name}!`, { jp: `おはよう、${name}！` });
    await D.say('grandma', 'Summer vacation is here!', { jp: '夏休みが来たよ！' });
    await D.say('grandma', 'I have a present for you.', { jp: 'プレゼントがあるよ。' });
    VA.Audio.sfx('coins');
    VA.State.addCoins(VA.Data.ALLOWANCE);
    VA.Fx.sparkles(VA.$('#scr-home'), 480, 240);
    await D.say('grandma', 'Here is some money.', { jp: 'はい、おこづかい。' });
    await D.say('grandma', 'Please go on a trip!', { jp: '旅行に行っておいで！' });
    await D.say('grandma', 'And take many photos!', { jp: '写真をたくさん撮ってね！' });
    await D.choice([
      { text: 'Thank you, Grandma!', jp: 'ありがとう、おばあちゃん！' },
      { text: 'Yay! A trip!', jp: 'やったー！旅行だ！' },
    ]);
    VA.Art.setMood(grandma, 'happy');
    VA.Fx.hearts(VA.$('#scr-home'), 480, 225);
    await D.say('grandma', 'Have fun!', { jp: '楽しんでね！' });
    D.hide();
    await this.toMap();
  },

  /* ---------- between trips: a quick new allowance ---------- */
  async newTripIntro() {
    VA.UI.home();
    await VA.Screens.show('home');
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);
    const D = VA.Dialogue;
    const keepsake = VA.Data.FEATURES.grandmaHomeSouvenirs && VA.State.homeSouvenirs().slice(-1)[0];
    if (keepsake) await D.say('grandma', keepsake.grandmaDialogue, { jp: '旅行の思い出は大切ね。' });
    await D.say('grandma', 'Do you want another trip?', { jp: 'また旅行に行きたい？' });
    await D.choice([{ text: 'Yes!', jp: 'うん！' }, { text: 'Yes, please!', jp: 'うん、おねがい！' }]);
    VA.Audio.sfx('coins');
    VA.State.addCoins(VA.Data.ALLOWANCE);
    await D.say('grandma', 'Here is some money.', { jp: 'はい、おこづかい。' });
    await D.say('grandma', 'Have fun!', { jp: '楽しんでね！' });
    D.hide();
    await this.toMap();
  },

  /* ---------- world map ---------- */
  async toMap() {
    VA.State.checkpoint('map');
    VA.UI.map();
    await VA.Screens.show('map');
    VA.HUD.show();
    VA.Audio.music('theme_map');
    VA.Audio.ambient(['wind']);
    VA.Ambient.set([{ type: 'clouds', band: [0.05, 0.85], n: 4 }]);
  },

  /* ---------- fly out + passport control ---------- */
  async travelTo(destId) {
    const dest = VA.Data.destById(destId);
    VA.State.startTrip(destId);
    VA.State.checkpoint('explore');

    await this._flight(`To ${dest.name}! ✈`, false);

    // arrival: build the destination first (hotspots stay hidden until
    // passport control is done — don't spoil the activities mid-interview),
    // then run passport control, then reveal them
    VA.UI.explore(dest);
    const hsLayer = VA.$('#hotspot-layer');
    hsLayer.style.visibility = 'hidden';
    await VA.Screens.show('explore');
    VA.HUD.show();
    VA.Audio.music(dest.music);
    VA.Audio.ambient(dest.ambientFiles);
    VA.Ambient.set(dest.ambient);

    const D = VA.Dialogue;
    await D.say('officer', 'Hello!', { jp: 'こんにちは！' });
    await D.say('officer', 'Passport, please.', { jp: 'パスポートを見せてください。' });
    await D.choice([{ text: 'Here you are.', jp: 'はい、どうぞ。' }]);
    await VA.Fx.stampSlam(destId);
    VA.State.addStamp(destId);
    await D.say('officer', dest.welcome.en, { jp: dest.welcome.jp });
    D.hide();

    hsLayer.style.visibility = 'visible';
    VA.Fx.toast('Tap a place to visit! 　行きたい場所をタップ！', 3200);
  },

  async _flight(bannerText, homeward) {
    VA.UI.travel(homeward);
    VA.$('#travel-banner').textContent = bannerText;
    await VA.Screens.show('travel');
    VA.HUD.hide();
    VA.Audio.music('theme_travel');
    VA.Audio.ambient(['wind']);
    VA.Ambient.set([{ type: 'clouds', band: [0.1, 0.85], n: 7 }, { type: 'birds', band: [0.1, 0.4], every: [2, 5] }]);
    VA.Audio.sfx('plane');
    const plane = VA.$('#travel-plane');
    await VA.wait(80);
    plane.style.left = homeward ? '-260px' : '1040px';
    await VA.wait(3100);
    VA.Ambient.stop();
  },

  /* ---------- destination hub ---------- */
  async exploreScreen(resumed) {
    const dest = VA.Data.destById(VA.State.data.trip.dest);
    VA.UI.explore(dest);
    VA.$('#hotspot-layer').style.visibility = 'visible'; // in case passport control was interrupted mid-hide
    await VA.Screens.show('explore');
    VA.HUD.show();
    VA.Audio.music(dest.music);
    VA.Audio.ambient(dest.ambientFiles);
    VA.Ambient.set(dest.ambient);
    if (resumed) VA.Fx.toast('Welcome back! Tap a place! 　つづきから！', 2600);
  },

  /* ---------- one activity = one cinematic memory ---------- */
  async runEvent(evtId) {
    if (this._eventBusy) return; // one memory at a time
    const trip = VA.State.data.trip;
    const dest = VA.Data.destById(trip.dest);
    const evt = dest.events.find(e => e.id === evtId);
    if (!evt || trip.done.includes(evtId)) return;
    this._eventBusy = true;
    try {
      await this._runEventInner(evt, dest);
    } finally {
      this._eventBusy = false;
    }
  },

  async _runEventInner(evt, dest) {

    VA.HUD.show(); // stays visible: coins + the photo flying into the album
    // Start loading before the screen switch so the cinematic is already
    // covered by its loading overlay when it becomes visible.
    const sceneReady = VA.Cine.setup(evt, dest);
    await VA.Screens.show('cine');
    await sceneReady;
    await VA.wait(250);
    await VA.Cine.play(evt.steps);
    VA.Dialogue.hide();

    // back to the hub
    await this.exploreScreen(false);
    const t = VA.State.data.trip;
    if (t && t.done.length >= dest.events.length) {
      VA.Fx.toast('All photos taken! 　ぜんぶ撮ったね！', 2600);
      VA.Audio.sfx('chime');
    }
  },

  /* ---------- souvenir stand + flight home ---------- */
  async departure() {
    if (this._departBusy) return;
    this._departBusy = true;
    try { await this._departureInner(); } finally { this._departBusy = false; }
  },

  async _departureInner() {
    const trip = VA.State.data.trip;
    if (!trip) return;
    const dest = VA.Data.destById(trip.dest);
    VA.State.checkpoint('depart');
    const D = VA.Dialogue;

    if (!trip.souvenir) {
      const vendorId = dest.events[0].actors.find(a => a.char.includes('vendor')) ?
        dest.events[0].actors.find(a => a.char.includes('vendor')).char : 'au_vendor';
      await D.say(vendorId, 'Wait! One moment!', { jp: 'ちょっと待って！' });
      await D.say(vendorId, 'A gift for Grandma?', { jp: 'おばあちゃんへのおみやげはいかが？' });
      const items = dest.souvenirs.map(s => ({ text: s.line, jp: s.jp, value: s.id }));
      const chosen = await D.choice(items);
      const souv = dest.souvenirs.find(s => s.id === chosen);
      VA.Audio.sfx('coins');
      VA.State.addCoins(-3);
      VA.State.setSouvenir(souv);
      await D.say(vendorId, 'Here you are.', { jp: 'はい、どうぞ。' });
      VA.Fx.toast(souv.icon + ' ' + souv.label + ' — for Grandma!', 2400);
      VA.Audio.sfx('pop');
      await D.say(vendorId, 'Goodbye!', { jp: 'さようなら！' });
      D.hide();
    }

    VA.State.checkpoint('debrief');
    await this._flight('Going home! 🏠', true);
    await this.debrief(false);
  },

  /* ---------- Grandma asks about the trip ---------- */
  async debrief(resumed) {
    const trip = VA.State.data.trip;
    if (!trip) return this.toMap();
    const dest = VA.Data.destById(trip.dest);
    const name = VA.State.data.name;
    const photos = VA.State.tripPhotos();

    const { grandma } = VA.UI.home();
    const panel = VA.UI.debriefPanel(dest);
    await VA.Screens.show('home');
    VA.HUD.show();
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);

    const D = VA.Dialogue;
    await D.say('grandma', `Welcome home, ${name}!`, { jp: `おかえり、${name}！` });
    await D.say('grandma', 'Did you have fun?', { jp: '楽しかった？' });
    await D.choice([{ text: 'Yes!', jp: 'うん！' }, { text: 'Yes, I did!', jp: 'うん、楽しかった！' }]);
    VA.Art.setMood(grandma, 'happy');
    await D.say('grandma', 'Great!', { jp: 'よかった！' });

    /* the four questions */
    for (const Q of VA.Data.DEBRIEF_QUESTIONS) {
      const correctText = Q.verb === 'went'
        ? dest.sentences.went.en
        : (photos[this._eventForVerb(dest, Q.verb)] || {}).caption;

      // build the choice set: this verb's sentence from every destination
      const items = VA.shuffle(VA.Data.DESTS.map(d => {
        if (Q.verb === 'went') return { text: d.sentences.went.en, jp: d.sentences.went.jp, value: d.id };
        const e = d.events.find(x => x.verb === Q.verb);
        return { text: e.caption, jp: e.captionJP, value: d.id };
      }));

      while (true) {
        await D.say('grandma', Q.q, { jp: Q.jp });
        const picked = await D.choice(items);
        if (picked === dest.id) break;

        // gentle correction + a look at the real memory
        VA.Audio.sfx('hmm');
        VA.Art.setMood(grandma, 'wow');
        await D.say('grandma', 'Hmm? Really?', { jp: 'あれ？ほんとに？' });
        if (Q.verb === 'went') {
          await D.say('grandma', 'Look at your passport!', { jp: 'パスポートを見てごらん！' });
          await VA.UI.showHint('stamp', dest);
        } else {
          await D.say('grandma', 'Look at your photo!', { jp: '写真を見てごらん！' });
          await VA.UI.showHint('photo', photos[this._eventForVerb(dest, Q.verb)]);
        }
        VA.Art.setMood(grandma, 'happy');
      }

      // correct! grandma reacts, the scrapbook page fills in
      VA.Audio.sfx('chime');
      VA.Art.setMood(grandma, 'wow');
      await panel.fill(Q.verb);
      await D.say('grandma', Q.verb === 'went' ? `Wow! ${dest.name}!` : Q.react[0],
        { jp: Q.verb === 'went' ? `わあ！${dest.jp}！` : Q.react[1] });
      VA.Art.setMood(grandma, 'happy');
    }

    /* the souvenir */
    if (trip.souvenir) {
      const s = trip.souvenir;
      await D.choice([{ text: 'Grandma, this is for you!', jp: 'おばあちゃん、これどうぞ！' }]);
      VA.Audio.sfx('pop');
      VA.Fx.sparkles(VA.$('#scr-home'), 480, 240);
      await D.say('grandma', `Oh! A ${s.label.toLowerCase()}!`, { jp: `まあ！${s.reactJP}` });
      await D.say('grandma', 'Thank you!', { jp: 'ありがとう！' });
      VA.Fx.hearts(VA.$('#scr-home'), 480, 225);
      VA.Audio.sfx('heart');
      await D.say('grandma', 'I love it!', { jp: 'とっても気に入ったわ！' });
      if (VA.Data.FEATURES.grandmaHomeSouvenirs) {
        VA.State.giftSouvenir(s, dest.id);
        VA.UI.renderHomeSouvenirs();
        VA.Fx.sparkles(VA.$('#scr-home'), s.home.x, s.home.y);
      }
    }

    await D.say('grandma', 'What a wonderful trip!', { jp: 'すてきな旅行だったね！' });
    D.hide();

    VA.State.completeTrip();
    VA.State.checkpoint('map');

    /* scrapbook celebration */
    VA.Audio.sfx('fanfare');
    VA.Ambient.burst('confetti');
    await VA.wait(900);
    VA.UI.modalScrapbookReturn = null; // closing continues the story
    VA.UI.scrapbook(dest.id, true);
    await VA.Screens.show('scrapbook');
    VA.Audio.music('theme_scrapbook');
    VA.Audio.ambient(null);
    VA.Audio.sfx('page');
  },

  _eventForVerb(dest, verb) {
    const e = dest.events.find(x => x.verb === verb);
    return e ? e.id : null;
  },

  /* called by the scrapbook OK button */
  async afterScrapbook() {
    if (VA.State.allDone() && !VA.State.data.finaleDone) return this.finale();
    await this.newTripIntro();
  },

  /* ---------- every page complete! ---------- */
  async finale() {
    VA.State.data.finaleDone = true;
    VA.State.save();
    VA.UI.home();
    await VA.Screens.show('home');
    VA.Audio.music('theme_home');
    const D = VA.Dialogue;
    await D.say('grandma', 'Your scrapbook is full!', { jp: 'スクラップブックがいっぱいになったね！' });
    await D.say('grandma', 'You saw the world!', { jp: '世界を見てきたんだね！' });
    VA.Audio.sfx('fanfare');
    VA.Ambient.burst('confetti');
    VA.Fx.captionBig('🏆 SUPER TRAVELER! 🏆', 2600);
    await D.say('grandma', 'You are a super traveler!', { jp: 'あなたはスーパートラベラーよ！' });
    await D.choice([{ text: 'Thank you, Grandma!', jp: 'ありがとう、おばあちゃん！' }]);
    VA.Fx.hearts(VA.$('#scr-home'), 480, 225);
    await D.say('grandma', 'Where next, I wonder?', { jp: 'つぎはどこに行こうか？' });
    D.hide();
    await this.newTripIntro();
  },
};
