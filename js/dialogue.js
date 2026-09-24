/* ============================================================
   dialogue.js — visual-novel style dialogue box.

   One short line at a time, big friendly text, typewriter
   reveal, portrait, optional Japanese hint, and spoken aloud
   with the browser's text-to-speech (tap 🔊 to hear again).

   VA.Dialogue.say('grandma', 'Welcome home!', {jp:'おかえり！'})
   VA.Dialogue.choice([{text:'Yes!', jp:'うん！', value:'y'}, ...])
   ============================================================ */
'use strict';

VA.Dialogue = {
  _typing: null,     // active typewriter interval
  _resolveTap: null, // pending "advance" resolver
  _lastLine: null,
  _lastProf: null,
  _lastWho: null,
  _lastVoiceKey: null,

  init() {
    const dlg = VA.$('#dialogue');
    dlg.addEventListener('click', e => {
      if (e.target.id === 'btn-say-again') return;
      this._tap();
    });
    window.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && dlg.style.display !== 'none') {
        e.preventDefault();
        this._tap();
      }
    });
    VA.$('#btn-say-again').addEventListener('click', e => {
      e.stopPropagation();
      VA.Audio.sfx('click');
      if (this._lastLine) VA.Voice.speak(this._lastLine, this._lastProf, this._lastWho, this._lastVoiceKey);
    });
  },

  _tap() {
    if (this._typing) {           // first tap: finish the line instantly
      clearInterval(this._typing.timer);
      VA.$('#dlg-text').textContent = this._typing.text;
      this._typing = null;
      VA.$('#dlg-next').style.visibility = 'visible';
      return;
    }
    if (this._resolveTap) {       // second tap: advance
      const r = this._resolveTap;
      this._resolveTap = null;
      VA.Audio.sfx('tap');
      r();
    }
  },

  /* show one line and wait for the player's tap */
  say(whoId, text, opts = {}) {
    const c = VA.Data.CHARS[whoId] || VA.Data.CHARS.sign;
    const dlg = VA.$('#dialogue');
    dlg.style.display = 'block';

    const nameEl = VA.$('#dlg-name');
    nameEl.textContent = c.name === '{player}' ? VA.State.data.name : c.name;
    nameEl.style.background = c.color || 'var(--coral)';

    const port = VA.$('#dlg-portrait');
    port.innerHTML = '';
    if (!c.noPortrait) port.appendChild(VA.Art.portraitEl(whoId, opts.mood || 'happy'));

    const jpEl = VA.$('#dlg-jp');
    jpEl.textContent = (VA.State.data.settings.jp && opts.jp) ? opts.jp : '';

    this._lastLine = text;
    this._lastProf = c.voice;
    this._lastWho = whoId;
    this._lastVoiceKey = opts.voiceKey || '';
    VA.Voice.speak(text, c.voice, whoId, opts.voiceKey || '');

    // typewriter reveal
    const txtEl = VA.$('#dlg-text');
    txtEl.textContent = '';
    VA.$('#dlg-next').style.visibility = 'hidden';
    clearInterval(this._typing && this._typing.timer);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      txtEl.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(timer);
        this._typing = null;
        VA.$('#dlg-next').style.visibility = 'visible';
      }
    }, 24);
    this._typing = { timer, text };

    return new Promise(res => { this._resolveTap = res; });
  },

  /* a line that advances by itself (for cinematic pacing) */
  async auto(whoId, text, opts = {}) {
    const holdFor = opts.dur || Math.max(1300, 350 + text.length * 65);
    const p = this.say(whoId, text, opts);
    const mine = this._resolveTap; // resolver belonging to THIS line
    await VA.wait(holdFor);
    // only auto-advance if the player hasn't already tapped past it
    if (this._resolveTap === mine && mine) { this._resolveTap = null; mine(); }
    await p;
  },

  /* big friendly choice buttons; returns the chosen value */
  choice(items, opts = {}) {
    const wrap = VA.$('#choices');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';
    return new Promise(res => {
      items.forEach(it => wrap.appendChild(this._choiceBtn(it, async b => {
        wrap.querySelectorAll('button').forEach(x => x.disabled = true);
        b.style.borderColor = 'var(--leaf)';
        await this._playerSays(it, opts.speakDelay);
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        res(it.value !== undefined ? it.value : it.text);
      })));
    });
  },

  _choiceBtn(it, onPick) {
    const b = VA.el('button', 'choice-btn');
    b.innerHTML = it.text + (VA.State.data.settings.jp && it.jp ? `<span class="ch-jp">${it.jp}</span>` : '');
    b.addEventListener('click', () => { VA.Audio.sfx('pop'); onPick(b); });
    return b;
  },

  /* the player "says" a line out loud, then waits so the next speaker does
     not cut a longer answer off.  The estimate is deliberately a little
     generous because browser voices vary; callers can override it. */
  _playerSays(it, speakDelay) {
    VA.Voice.speak(it.text, VA.Data.CHARS.player.voice, 'player', it.voiceKey || '');
    const rate = VA.Data.CHARS.player.voice.rate || 0.9;
    const estimatedSpeechMs = Math.max(900, Math.ceil((it.text.length * 82) / rate + 260));
    return VA.wait(speakDelay != null ? speakDelay : estimatedSpeechMs);
  },

  /* ---------- spoken answers ----------
     The player answers a real question out loud.  `options` are the model
     lines ({value, text, jp}); the matched one is spoken back as the polished
     sentence, and they double as the buttons when speech is off or keeps
     failing.  Resolves to the chosen option's value.

     spec: { match(transcript) -> value|null,
             options: [{value, text, jp, voiceKey}],
             hints: ['after 1 miss', 'after 2 misses'],
             onMiss(transcript) -> async (recognized but wrong),
             maxMisses: 3 } */
  async respond(spec) {
    const options = spec.options;
    const pick = v => options.find(o => o.value === v) || options[0];
    if (!VA.Speech.available()) return this.choice(options);

    const token = this._respondToken = (this._respondToken || 0) + 1;
    const maxMisses = spec.maxMisses || 3;
    let misses = 0;
    let status = '';
    let hard = false;
    while (true) {
      const hints = spec.hints || [];
      const hint = misses ? hints[Math.min(misses, hints.length) - 1] || '' : '';
      const r = await this._micRound({
        match: spec.match, hint, status,
        fallback: hard || misses >= maxMisses ? options : null,
      });
      if (token !== this._respondToken) return new Promise(() => {}); // scene left
      if (r.via === 'button') return r.value;
      if (r.status === 'match') {
        const it = pick(r.value);
        await this._playerSays(it);
        this._clearChoices();
        return it.value;
      }
      if (r.status === 'cancelled') { status = ''; continue; }
      misses++;
      if (r.status === 'nomatch' && spec.onMiss) {
        this._clearChoices();
        await spec.onMiss(r.transcript);
        if (token !== this._respondToken) return new Promise(() => {});
        status = '';
      } else {
        hard = hard || VA.Speech.isHardError(r.error);
        status = hard ? 'The microphone is not working. Tap an answer!'
          : r.transcript ? `Try again. <small>(“${VA.escape(r.transcript)}”)</small>` : 'Try again.';
      }
    }
  },

  /* a yes/no question: yes and no are both real answers */
  yesNo({ yes, no }) {
    return this.respond({
      match: t => { const c = VA.Speech.classifyYesNo(t); return c === 'unknown' ? null : c; },
      options: [Object.assign({}, yes, { value: 'yes' }), Object.assign({}, no, { value: 'no' })],
      hints: [`${yes.text}　/　${no.text}`],
    });
  },

  /* one press-to-talk round.  Resolves with the listen() result, or
     {via:'button', value} if a fallback button was tapped instead. */
  _micRound({ match, hint, status, fallback }) {
    const wrap = VA.$('#choices');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';
    const jpOn = VA.State.data.settings.jp;
    const panel = VA.el('div', 'speak-panel');
    if (hint) panel.appendChild(VA.el('div', 'speak-hint', VA.escape(hint)));
    const mic = VA.el('button', 'choice-btn mic-btn');
    const idleLabel = '🎤 Speak' + (jpOn ? '<span class="ch-jp">おして話してね</span>' : '');
    mic.innerHTML = idleLabel;
    panel.appendChild(mic);
    const statusEl = VA.el('div', 'speak-status', status || '');
    panel.appendChild(statusEl);
    wrap.appendChild(panel);

    return new Promise(res => {
      let listening = false;
      let done = false;
      const end = r => {
        if (done) return;
        done = true;
        wrap.querySelectorAll('button').forEach(x => x.disabled = true);
        res(r);
      };
      mic.addEventListener('click', async e => {
        e.stopPropagation();
        if (listening) { VA.Speech.cancel(); return; } // tap again = stop
        VA.Audio.sfx('pop');
        VA.Voice.stop(); // never let the game's own voice answer the question
        listening = true;
        mic.classList.add('listening');
        mic.innerHTML = '👂 Listening…' + (jpOn ? '<span class="ch-jp">タップでやめる</span>' : '');
        statusEl.innerHTML = '';
        const r = await VA.Speech.listen({ match });
        listening = false;
        mic.classList.remove('listening');
        mic.innerHTML = idleLabel;
        if (r.status === 'match') {
          VA.Audio.sfx('chime');
          statusEl.innerHTML = `✓ <small>“${VA.escape(r.transcript)}”</small>`;
          mic.disabled = true;
        }
        end(r);
      });
      if (fallback) {
        const row = VA.el('div', 'speak-fallback');
        fallback.forEach(it => row.appendChild(this._choiceBtn(it, async b => {
          if (done) return;
          done = true; // wins over the 'cancelled' the mic is about to report
          wrap.querySelectorAll('button').forEach(x => x.disabled = true);
          VA.Speech.cancel();
          b.style.borderColor = 'var(--leaf)';
          await this._playerSays(it);
          this._clearChoices();
          res({ via: 'button', value: it.value });
        })));
        panel.appendChild(row);
      }
    });
  },

  _clearChoices() {
    const wrap = VA.$('#choices');
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  },

  hide() {
    VA.$('#dialogue').style.display = 'none';
    this._clearChoices();
    VA.Speech.cancel();
    this._respondToken = (this._respondToken || 0) + 1; // orphan any open answer
    this._resolveTap = null;
    if (this._typing) { clearInterval(this._typing.timer); this._typing = null; }
    VA.Voice.stop();
  },
};
