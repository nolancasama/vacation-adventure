/* ============================================================
   speech.js — the player's spoken answers (browser speech
   recognition, no server, no AI).

   One recognizer at a time.  It listens for a single answer,
   checks every interim and final transcript against a matcher,
   and stops the moment one fits — it does not wait for the
   browser to decide the utterance is "final".

   VA.Speech.listen({ match: t => VA.Speech.classifyYesNo(t) })
     -> { status:'match'|'nomatch'|'error'|'cancelled',
          transcript, value, error }
   ============================================================ */
'use strict';

VA.Speech = {
  _active: null, // { finish } of the recognizer currently listening

  _ctor() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; },

  /* speech answers are on unless the browser can't or the class turned them off */
  available() {
    const s = VA.State.data && VA.State.data.settings;
    return !!this._ctor() && !(s && s.mic === false);
  },

  /* ---------- deterministic text matching ---------- */
  normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[-–—]/g, ' ')
      .replace(/[.!?,'"’‘“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /* 'yes' | 'no' | 'unknown'.  Refusal is checked first so
     "no, I don't want to play" never reads as "play". */
  classifyYesNo(raw) {
    const t = this.normalize(raw);
    if (!t) return 'unknown';
    const no = [
      /\bno\b/, /\bnope\b/, /\bnah\b/, /\bnot\b/, /\bnever\b/,
      /\bmaybe later\b/, /\blater\b/,
      /\b(dont|do not|didnt|did not) (want|like)\b/, /\bdidnt\b/, /\bdid not\b/,
      /\bboring\b/,
    ];
    if (no.some(rx => rx.test(t))) return 'no';
    const yes = [
      /\byes\b/, /\byeah\b/, /\byep\b/, /\byup\b/, /\bsure\b/,
      /\bok\b/, /\bokay\b/, /\balright\b/, /\ball right\b/, /\bof course\b/,
      /\bplease\b/, /\blets (play|go|do it)\b/, /\bi did\b/, /\bi do\b/,
      /\bfun\b/, /\bgreat\b/, /\bgood\b/,
    ];
    if (yes.some(rx => rx.test(t))) return 'yes';
    return 'unknown';
  },

  /* whole-word alias match; a trailing plural "s" is forgiven either way */
  matchesAny(raw, aliases) {
    const t = this.normalize(raw);
    if (!t) return false;
    return aliases.some(a => {
      const n = this.normalize(a).replace(/s$/, '');
      if (!n) return false;
      const rx = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?\\b');
      return rx.test(t);
    });
  },

  /* ---------- the recognizer ---------- */
  listen({ match, timeout = 8000, lang = 'en-US' } = {}) {
    this.cancel();
    const Ctor = this._ctor();
    return new Promise(resolve => {
      if (!Ctor) { resolve({ status: 'error', error: 'unsupported', transcript: '' }); return; }
      let rec;
      try { rec = new Ctor(); } catch (e) { resolve({ status: 'error', error: 'unsupported', transcript: '' }); return; }
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;

      let heard = '';
      let lastError = null;
      let settled = false;
      const session = {};
      const finish = r => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this._active === session) this._active = null;
        // detach first so a late event from this recognizer can never
        // answer a later question
        rec.onresult = rec.onerror = rec.onend = null;
        try { rec.abort(); } catch (e) {}
        resolve(Object.assign({ transcript: heard }, r));
      };
      session.finish = finish;
      this._active = session;
      const timer = setTimeout(() => finish(heard ? { status: 'nomatch' } : { status: 'error', error: 'timeout' }), timeout);

      rec.onresult = e => {
        const results = Array.from(e.results || []);
        const whole = results.map(r => (r[0] ? r[0].transcript : '')).join(' ').trim();
        if (whole) heard = whole;
        const candidates = [whole];
        results.forEach(r => { for (let a = 0; a < r.length; a++) candidates.push(r[a].transcript); });
        for (const c of candidates) {
          if (!c) continue;
          const v = match ? match(c) : c;
          if (v != null && v !== false) { finish({ status: 'match', value: v, transcript: c }); return; }
        }
      };
      rec.onerror = e => { lastError = (e && e.error) || 'error'; };
      rec.onend = () => finish(heard ? { status: 'nomatch' } : { status: 'error', error: lastError || 'no-speech' });

      try { rec.start(); } catch (e) { finish({ status: 'error', error: 'start-failed' }); }
    });
  },

  /* stop listening now; the pending listen() resolves as 'cancelled' */
  cancel() {
    if (this._active) this._active.finish({ status: 'cancelled' });
  },

  /* errors that retrying will not fix: go straight to the buttons */
  isHardError(err) {
    return ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'unsupported', 'start-failed', 'language-not-supported'].includes(err);
  },
};
