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
    await VA.Screens.show('home', { transition: 'home' });
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
    await VA.Screens.show('home', { transition: 'home' });
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);
    const D = VA.Dialogue;
    const keepsake = VA.Data.FEATURES.grandmaHomeSouvenirs && VA.State.homeSouvenirs().slice(-1)[0];
    if (keepsake) await D.say('grandma', keepsake.grandmaDialogue, { jp: '旅行の思い出は大切ね。' });
    await D.say('grandma', 'Do you want another trip?', { jp: 'また旅行に行きたい？' });
    const again = await D.yesNo({
      yes: { text: 'Yes, please!', jp: 'うん、おねがい！' },
      no: { text: 'No, thank you.', jp: 'ううん、いまはいい。' },
    });
    if (again === 'no') await D.say('grandma', 'Okay! Maybe later!', { jp: 'わかった！またあとでね！' });
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

    this.preloadTravelScreen(false);
  },

  // Warm only the travel direction that is actually next. The other portrait
  // can wait until departure instead of competing on the map.
  preloadTravelScreen(homeward) {
    VA.Art.preloadIdle([
      'assets/backgrounds/background_travel_sky.webp',
      VA.Art.travelPortraitPath(!!homeward),
    ]);
  },

  /* ---------- fly out + passport control ---------- */
  async travelTo(destId) {
    const dest = VA.Data.destById(destId);
    VA.State.startTrip(destId);
    VA.State.checkpoint('explore');

    // Build the incoming scene before takeoff, then let its complete asset set
    // decode while the existing country-flight animation is on screen.
    VA.UI.explore(dest);
    const hsLayer = VA.$('#hotspot-layer');
    hsLayer.style.visibility = 'hidden';
    const arrival = { done: false, promise: null, destinationName: dest.name };
    arrival.promise = VA.Art.waitForScreenAssets(VA.$('#scr-explore')).then(result => {
      arrival.done = true;
      return result;
    });

    await this._flight(`To ${dest.name}! ✈`, false);

    // The destination is now fully preloaded; hotspots remain hidden until
    // passport control finishes so activities are not spoiled mid-interview.
    await VA.Screens.show('explore', { transition: 'travel', ready: arrival.promise });
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

  async _flight(bannerText, homeward, arrival = null) {
    VA.UI.travel(homeward);
    VA.$('#travel-banner').textContent = bannerText;
    await VA.Screens.show('travel', { transition: 'travel' });
    VA.HUD.hide();
    VA.Audio.music('theme_travel');
    VA.Audio.ambient(['wind']);
    VA.Ambient.set([]); // plain sky — the traveler's own portrait carries the scene
    VA.Audio.sfx('plane');
    await VA.wait(1500);
    VA.$('#travel-portrait').classList.add('show');
    await VA.wait(1700);
    if (arrival) {
      const loading = VA.$('#travel-loading');
      if (!arrival.done) {
        VA.$('#travel-loading-text').textContent = `Arriving in ${arrival.destinationName}…`;
        loading.hidden = false;
      }
      await arrival.promise;
      loading.hidden = true;
    }
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
    if (!evt || evt.enabled === false || trip.done.includes(evtId)) return;
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
    await VA.Screens.show('cine', { ready: sceneReady });
    await sceneReady;
    await VA.wait(250);
    await VA.Cine.play(evt.steps);
    VA.Dialogue.hide();

    // back to the hub
    await this.exploreScreen(false);
    const t = VA.State.data.trip;
    const availableEvents = dest.events.filter(e => e.enabled !== false);
    if (t && availableEvents.every(e => t.done.includes(e.id))) {
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
      this.preloadTravelScreen(true);
      VA.Audio.sfx('coins');
      VA.State.addCoins(-3);
      VA.State.setSouvenir(souv);
      await D.say(vendorId, 'Here you are.', { jp: 'はい、どうぞ。' });
      // Use the same full-resolution reward moment as food, rather than a
      // small toast, so the whole souvenir is visible when it is received.
      await VA.Art.preloadAndWait(['assets/objects/' + souv.file]);
      await VA.Cine.showItemReward({
        illustration: souv.file,
        word: souv.label,
        pronunciation: souv.label,
        screen: 'explore',
      });
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
    await VA.Screens.show('home', { transition: 'home' });
    VA.HUD.show();
    VA.Audio.music('theme_home');
    VA.Audio.ambient(['room']);

    const D = VA.Dialogue;
    await D.say('grandma', `Welcome home, ${name}!`, { jp: `おかえり、${name}！` });
    await D.say('grandma', 'Did you have fun?', { jp: '楽しかった？' });
    const fun = await D.yesNo({
      yes: { text: 'Yes, I did!', jp: 'うん、楽しかった！' },
      no: { text: "No, I didn't.", jp: 'ううん、楽しくなかった。' },
    });
    VA.Art.setMood(grandma, fun === 'yes' ? 'happy' : 'wow');
    if (fun === 'yes') await D.say('grandma', 'Great!', { jp: 'よかった！' });
    else await D.say('grandma', 'Oh no!', { jp: 'あらら！' });
    VA.Art.setMood(grandma, 'happy');

    /* the four questions — answered from what the player actually did */
    for (const Q of VA.Data.DEBRIEF_QUESTIONS) {
      // A temporarily disabled activity has no photo to review, so omit its
      // associated grammar question while preserving all of its data.
      if (Q.verb !== 'went' && !dest.events.some(e => e.verb === Q.verb && e.enabled !== false)) continue;
      await D.say('grandma', Q.q, { jp: Q.jp });

      const memories = Q.verb === 'went' ? null : this._memories(dest, Q.verb);
      if (memories && !memories.length) {
        // nothing to remember (declined or skipped): one honest answer, no mic
        await D.choice([{ text: 'Nothing.', jp: 'なにも。', value: 'nothing' }]);
        await panel.fill(Q.verb);
        const R = VA.Data.NOTHING_REACTIONS[Q.verb];
        await D.say('grandma', R.en, { jp: R.jp });
        continue;
      }

      await this._recall(Q, dest, memories, grandma, photos);

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
      // This recorded player line is longer than the normal text-length
      // estimate, so keep the choice beat open until it can finish.
      await D.choice([{ text: 'Grandma, this is for you!', jp: 'おばあちゃん、これどうぞ！' }], { speakDelay: 3600 });
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

  /* completed events for a verb — only what the player really did counts */
  _memories(dest, verb) {
    const t = VA.State.data.trip;
    return dest.events.filter(e => e.verb === verb && e.enabled !== false && t.done.includes(e.id));
  },

  /* "I saw the Eiffel Tower." -> "the Eiffel Tower" */
  _memoryObject(caption) {
    return caption.replace(/^I (went to|ate|saw|played|found|bought)\s+/i, '').replace(/[.!]$/, '');
  },

  /* words that prove the player remembers this event: the caption's object
     with and without its article, plus the event's own speechAliases */
  _speechAliases(evt) {
    const obj = this._memoryObject(evt.caption);
    return [obj, obj.replace(/^(in |on |at )?(the |a |an )/i, ''), ...(evt.speechAliases || [])];
  },

  /* ask for one memory out loud until it is recalled.  Grammar is not
     graded: naming the thing is enough, and the full sentence is modelled
     back.  A recognised-but-wrong answer gets Grandma's gentle correction. */
  _recall(Q, dest, memories, grandma, photos) {
    const D = VA.Dialogue;
    const went = Q.verb === 'went';
    const answer = went ? dest.sentences.went : { en: memories[0].caption, jp: memories[0].captionJP };
    const aliases = went ? [dest.name, ...(dest.sentences.speech || [])]
      : memories.reduce((all, e) => all.concat(this._speechAliases(e)), []);
    const frame = VA.Data.DEBRIEF_FRAMES[Q.verb];
    const cue = went ? dest.name : this._memoryObject(memories[0].caption);
    return D.respond({
      match: t => (VA.Speech.matchesAny(t, aliases) ? 'ok' : null),
      options: [{ value: 'ok', text: answer.en, jp: answer.jp }],
      hints: [frame, `${frame}　👉 ${cue}`],
      onMiss: async () => {
        VA.Audio.sfx('hmm');
        VA.Art.setMood(grandma, 'wow');
        await D.say('grandma', 'Hmm? Really?', { jp: 'あれ？ほんとに？' });
        if (went) {
          await D.say('grandma', 'Look at your passport!', { jp: 'パスポートを見てごらん！' });
          await VA.UI.showHint('stamp', dest);
        } else {
          await D.say('grandma', 'Look at your photo!', { jp: '写真を見てごらん！' });
          await VA.UI.showHint('photo', photos[memories[0].id]);
        }
        VA.Art.setMood(grandma, 'happy');
        await D.say('grandma', Q.q, { jp: Q.jp });
      },
    });
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
    await VA.Screens.show('home', { transition: 'home' });
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
