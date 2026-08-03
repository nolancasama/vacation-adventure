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
      if (this._lastLine) VA.Voice.speak(this._lastLine, this._lastProf);
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
    VA.Voice.speak(text, c.voice);

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
    const jpOn = VA.State.data.settings.jp;
    return new Promise(res => {
      items.forEach(it => {
        const b = VA.el('button', 'choice-btn');
        b.innerHTML = it.text + (jpOn && it.jp ? `<span class="ch-jp">${it.jp}</span>` : '');
        b.addEventListener('click', async () => {
          VA.Audio.sfx('pop');
          wrap.querySelectorAll('button').forEach(x => x.disabled = true);
          b.style.borderColor = 'var(--leaf)';
          // the player "says" their chosen line out loud
          VA.Voice.speak(it.text, VA.Data.CHARS.player.voice);
          // Do not cut a longer player answer off with the next speaker. The
          // estimate is deliberately a little generous because browser voices
          // vary, and callers can still override it for a special beat.
          const rate = VA.Data.CHARS.player.voice.rate || 0.9;
          const estimatedSpeechMs = Math.max(900, Math.ceil((it.text.length * 82) / rate + 260));
          await VA.wait(opts.speakDelay != null ? opts.speakDelay : estimatedSpeechMs);
          wrap.style.display = 'none';
          wrap.innerHTML = '';
          res(it.value !== undefined ? it.value : it.text);
        });
        wrap.appendChild(b);
      });
    });
  },

  hide() {
    VA.$('#dialogue').style.display = 'none';
    VA.$('#choices').style.display = 'none';
    this._resolveTap = null;
    if (this._typing) { clearInterval(this._typing.timer); this._typing = null; }
    VA.Voice.stop();
  },
};
