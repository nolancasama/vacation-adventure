/* ============================================================
   language.js — local, deterministic writing feedback.

   This module deliberately has no DOM dependencies.  It is used by the
   bedroom phone and PC, and can also be loaded by the plain Node tests.
   ============================================================ */
'use strict';

(function (root) {
  const VA = root.VA = root.VA || {};

  const ADJECTIVES = [
    'delicious', 'yummy', 'tasty', 'good', 'great', 'fun', 'exciting',
    'beautiful', 'big', 'tall', 'old', 'interesting', 'amazing', 'cool',
    'nice', 'cute', 'boring', 'crowded', 'expensive', 'hot', 'cold', 'bad',
    'scary', 'small', 'happy', 'wonderful', 'sweet', 'noisy', 'lovely',
    'fantastic', 'awesome',
  ];
  const FOOD_ONLY = ['delicious', 'yummy', 'tasty', 'sweet'];
  const VERBS = ['went', 'go', 'ate', 'eat', 'saw', 'see', 'played', 'play',
    'liked', 'like', 'loved', 'love'];

  function normalise(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[’]/g, "'")
      .replace(/[^a-z0-9']+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function words(value) {
    const text = normalise(value);
    return text ? text.split(' ') : [];
  }

  function distance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) {
        next[j] = Math.min(
          next[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = next;
    }
    return prev[b.length];
  }

  function wordMatches(actual, expected) {
    if (actual === expected) return true;
    const allowance = expected.length >= 7 ? 2 : expected.length >= 4 ? 1 : 0;
    return allowance > 0 && distance(actual, expected) <= allowance;
  }

  function phraseAt(haystack, needle, at, fuzzy) {
    if (at + needle.length > haystack.length) return false;
    for (let i = 0; i < needle.length; i++) {
      if (fuzzy ? !wordMatches(haystack[at + i], needle[i]) : haystack[at + i] !== needle[i]) return false;
    }
    return true;
  }

  function hasPhrase(haystack, phrase, fuzzy = true) {
    const needle = words(phrase);
    if (!needle.length) return false;
    for (let i = 0; i <= haystack.length - needle.length; i++) {
      if (phraseAt(haystack, needle, i, fuzzy)) return true;
    }
    return false;
  }

  function memoryObject(caption) {
    return String(caption || '')
      .replace(/^I (went to|ate|saw|played|found|bought)\s+/i, '')
      .replace(/[.!?]+$/, '');
  }

  function speechAliases(evt) {
    if (!evt) return [];
    const obj = memoryObject(evt.caption);
    return [obj, obj.replace(/^(in |on |at )?(the |a |an )/i, ''), ...(evt.speechAliases || [])]
      .filter(Boolean);
  }

  function eventNamed(tokens, item) {
    return speechAliases(item.evt).some(alias => hasPhrase(tokens, alias));
  }

  function topicFor(evt) {
    return evt && evt.verb === 'ate' ? 'food' : evt && evt.verb === 'played' ? 'activity' : 'landmark';
  }

  function verbForms(verb) {
    if (verb === 'ate') return ['ate', 'eat'];
    if (verb === 'saw') return ['saw', 'see'];
    if (verb === 'played') return ['played', 'play'];
    return [verb];
  }

  function correctedAdjective(tokens) {
    let best = null;
    tokens.forEach(token => {
      ADJECTIVES.forEach(adj => {
        if (token === adj || !wordMatches(token, adj)) return;
        const d = distance(token, adj);
        if (!best || d < best.distance) best = { word: adj, distance: d };
      });
    });
    return best && best.word;
  }

  function anyAdjective(tokens, list = ADJECTIVES) {
    for (const adj of list) {
      if (hasPhrase(tokens, adj)) return adj;
    }
    return null;
  }

  function stripArticle(value) {
    return String(value || '').replace(/^(in |on |at )?(the |a |an )/i, '');
  }

  /* Punctuation cannot change a result, so clear prose is checked as a
     sequence of known sentence patterns after punctuation is discarded.
     This also accepts two good short sentences when the final full stop (or
     even the stop between them) was omitted. */
  function isClear(textTokens, allEvents) {
    if (!textTokens.length) return false;
    const patterns = [];
    const add = value => {
      const p = words(value);
      if (p.length && !patterns.some(old => old.join(' ') === p.join(' '))) patterns.push(p);
    };

    allEvents.forEach(item => {
      add(item.evt.caption);
      const obj = stripArticle(memoryObject(item.evt.caption));
      add(`I liked the ${obj}`);
      add(`I loved the ${obj}`);
      add(`I liked the food`);
      add(`I loved the food`);
      add(`I went to ${item.dest.name}`);
    });
    ADJECTIVES.forEach(adj => {
      add(`It was ${adj}`);
      add(`It was so ${adj}`);
      add(`It was very ${adj}`);
      add(`It was really ${adj}`);
      add(adj);
      add(`So ${adj}`);
      add(`Very ${adj}`);
    });
    add('I liked it');
    add('I loved it');
    add('Wow');

    const reachable = new Array(textTokens.length + 1).fill(false);
    reachable[0] = true;
    for (let at = 0; at < textTokens.length; at++) {
      if (!reachable[at]) continue;
      patterns.forEach(pattern => {
        if (phraseAt(textTokens, pattern, at, false)) reachable[at + pattern.length] = true;
      });
    }
    return reachable[textTokens.length];
  }

  function modelForMinor(tokens, memory) {
    const spelling = correctedAdjective(tokens);
    if (spelling) return `It was ${spelling}!`;

    const destNamed = hasPhrase(tokens, memory.dest.name);
    if (destNamed && (hasPhrase(tokens, 'went') || hasPhrase(tokens, 'go'))) {
      return `You went to ${memory.dest.name}!`;
    }

    const ownNamed = eventNamed(tokens, memory);
    if (ownNamed && verbForms(memory.evt.verb).some(verb => hasPhrase(tokens, verb))) {
      return String(memory.evt.caption || '').replace(/^I\s+/i, 'You ').replace(/[.!?]*$/, '!');
    }
    return null;
  }

  function evaluatePost(text, memory, allEvents) {
    const tokens = words(text);
    const evt = memory && memory.evt || {};
    const dest = memory && memory.dest || {};
    const events = Array.isArray(allEvents) ? allEvents.filter(item => item && item.evt && item.dest) : [];
    const topic = topicFor(evt);
    const base = { quality: 'unclear', model: null, topic, wrongThing: null };

    const ownNamed = memory && eventNamed(tokens, memory);
    const ownDestNamed = dest.name && hasPhrase(tokens, dest.name);
    const ownVerbNamed = verbForms(evt.verb).some(verb => hasPhrase(tokens, verb));
    const adjective = anyAdjective(tokens);
    const relevant = ownNamed || ownDestNamed || ownVerbNamed || !!adjective;

    /* A destination other than this memory's is always a contradiction,
       whether it is named directly or through one of its event objects. */
    for (const item of events) {
      if (item.dest.id === dest.id) continue;
      if (hasPhrase(tokens, item.dest.name)) {
        return { ...base, quality: 'contradiction', wrongThing: item.dest.name };
      }
      if (eventNamed(tokens, item)) {
        return { ...base, quality: 'contradiction', wrongThing: memoryObject(item.evt.caption) };
      }
    }

    /* Within one destination, another memory is only confusing when the
       selected memory itself was never named. */
    if (!ownNamed) {
      for (const item of events) {
        if (item.dest.id !== dest.id || item.evt.id === evt.id) continue;
        if (eventNamed(tokens, item)) {
          return { ...base, quality: 'contradiction', wrongThing: memoryObject(item.evt.caption) };
        }
      }
    }

    if (evt.verb !== 'ate') {
      const foodWord = anyAdjective(tokens, FOOD_ONLY);
      if (foodWord) return { ...base, quality: 'contradiction', wrongThing: foodWord };
    }
    if (!relevant) return base;
    if (isClear(tokens, events)) return { ...base, quality: 'clear' };
    return { ...base, quality: 'minor', model: modelForMinor(tokens, memory) };
  }

  function reviewLexicon() {
    const values = ADJECTIVES.concat(VERBS, ['food', 'place']);
    const dests = VA.Data && Array.isArray(VA.Data.DESTS) ? VA.Data.DESTS : [];
    dests.forEach(dest => {
      values.push(dest.name);
      (dest.events || []).forEach(evt => values.push(...speechAliases(evt)));
    });
    const ignore = new Set(['i', 'a', 'an', 'the', 'in', 'on', 'at', 'to']);
    const result = [];
    values.forEach(value => words(value).forEach(word => {
      if (!ignore.has(word) && !result.includes(word)) result.push(word);
    }));
    return result;
  }

  function keyboardMash(word) {
    if (!word) return true;
    if (/^(.)\1{2,}$/.test(word)) return true;
    const row = 'qwertyuiop asdfghjkl zxcvbnm';
    if (word.length >= 4 && (row.includes(word) || row.includes(word.split('').reverse().join('')))) return true;
    return word.length >= 5 && !/[aeiouy]/.test(word);
  }

  function reviewModel(tokens) {
    const fixedAdj = correctedAdjective(tokens);
    const adjective = fixedAdj || ADJECTIVES.find(adj => tokens.some(token => token === adj));
    if (!adjective) return null;
    if (tokens.length === 1 && fixedAdj) return `It was ${adjective}.`;
    if (tokens.length === 2 && tokens[0] === 'it' && wordMatches(tokens[1], adjective)) {
      return `It was ${adjective}.`;
    }
    if (tokens.length >= 3 && tokens[0] === 'the' && wordMatches(tokens[tokens.length - 1], adjective)
        && !tokens.includes('was')) {
      const subject = tokens.slice(1, -1).join(' ');
      return `The ${subject} was ${adjective}.`;
    }
    if (tokens.length === 1 && adjective) return fixedAdj ? `It was ${adjective}.` : null;
    return null;
  }

  function evaluateReview(text) {
    const tokens = words(text).filter(word => /[a-z]/.test(word));
    if (!tokens.length) return { ok: false, model: null };
    const lexicon = reviewLexicon();
    const recognised = tokens.some(token => lexicon.some(word => wordMatches(token, word)));
    const realWords = tokens.filter(token => token.length >= 2 && !keyboardMash(token));
    const ok = recognised || realWords.length >= 2;
    return { ok, model: ok ? reviewModel(tokens) : null };
  }

  VA.Lang = {
    evaluatePost,
    evaluateReview,
    memoryObject,
    speechAliases,
  };
})(typeof window !== 'undefined' ? window : globalThis);
