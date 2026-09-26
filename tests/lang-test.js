/* Language evaluator tests — plain Node, no browser.

   Loads the real js/data.js and js/language.js into a stub VA and checks
   the four broad post classes (clear / minor / contradiction / unclear)
   and the forgiving review check.  This file is the contract for VA.Lang:
   extend it, but do not loosen it.

   Run:  node tests/lang-test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.VA = {};
for (const f of ['js/data.js', 'js/language.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
}

const failures = [];
const check = (ok, msg) => { if (ok) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures.push(msg); } };

const all = [];
VA.Data.DESTS.forEach(dest => dest.events.forEach(evt => all.push({ evt, dest })));
const mem = id => all.find(m => m.evt.id === id);
const post = (id, text) => VA.Lang.evaluatePost(text, mem(id), all);

function expectPost(id, text, quality, extra = {}) {
  const r = post(id, text);
  const qOk = Array.isArray(quality) ? quality.includes(r.quality) : r.quality === quality;
  let ok = qOk;
  if (extra.model !== undefined) ok = ok && r.model === extra.model;
  if (extra.wrong) ok = ok && extra.wrong.test(String(r.wrongThing || ''));
  check(ok, `[${id}] "${text}" → ${JSON.stringify(quality)}${extra.model !== undefined ? ' model ' + JSON.stringify(extra.model) : ''}` +
    (ok ? '' : `  (got ${JSON.stringify(r)})`));
  return r;
}

console.log('\n— posts: clear —');
expectPost('eiffel', 'I saw the Eiffel Tower. It was beautiful.', 'clear');
expectPost('eiffel', 'i saw the eiffel tower', 'clear'); // case + punctuation never matter
expectPost('crepe', 'I ate a crepe.', 'clear');
expectPost('soccer', 'I played soccer. It was fun!', 'clear');
expectPost('kangaroo', 'I went to Australia. I saw a kangaroo.', 'clear');
expectPost('crepe', 'I ate a crepe. I saw the Eiffel Tower.', 'clear'); // same trip, still names this memory

console.log('\n— posts: minor (understood, gently modelled) —');
expectPost('eiffel', 'I see Eiffel Tower.', 'minor', { model: 'You saw the Eiffel Tower!' });
expectPost('crepe', 'It was delisious.', 'minor', { model: 'It was delicious!' });
expectPost('eiffel', 'I went France.', 'minor', { model: 'You went to France!' });
expectPost('kangaroo', 'I see a kangaroo.', 'minor', { model: 'You saw a kangaroo!' });
expectPost('crepe', 'I ate crepe.', 'minor', { model: 'You ate a crepe!' });
expectPost('eiffel', 'I saw the Eifel tower.', 'minor');
expectPost('soccer', 'Very fun!', ['clear', 'minor']);
{
  const r = post('pyramids', 'I see pyramid');
  check(r.quality === 'minor' && r.topic === 'landmark', '[pyramids] singular + present tense is still understood (landmark topic)');
}
check(post('icecream', 'Yummy!').topic === 'food', '[icecream] topic is food');
check(post('volleyball', 'It was fun.').topic === 'activity', '[volleyball] topic is activity');

console.log('\n— posts: contradiction —');
expectPost('eiffel', 'I saw the pyramids.', 'contradiction', { wrong: /pyramid/i });
expectPost('eiffel', 'I saw the Eiffel Tower. I ate a kebab.', 'contradiction', { wrong: /kebab/i });
expectPost('crepe', 'I saw the Eiffel Tower.', 'contradiction', { wrong: /eiffel|tower/i });
expectPost('kangaroo', 'I went to Egypt.', 'contradiction', { wrong: /egypt/i });
expectPost('eiffel', 'It was delicious.', 'contradiction', { wrong: /delicious/i });

console.log('\n— posts: unclear —');
expectPost('eiffel', 'asdf qwer', 'unclear');
expectPost('eiffel', '', 'unclear');
expectPost('eiffel', 'my dog is red', 'unclear');

console.log('\n— models only for minor —');
check(post('eiffel', 'I saw the Eiffel Tower.').model === null, 'clear post has no model');
check(post('eiffel', 'I saw the pyramids.').model === null, 'contradiction has no model');

console.log('\n— reviews (opinions are never graded) —');
const rev = (text, ok, model) => {
  const r = VA.Lang.evaluateReview(text);
  const good = r.ok === ok && (model === undefined || r.model === model);
  check(good, `review "${text}" → ok=${ok}${model !== undefined ? ' model ' + JSON.stringify(model) : ''}` + (good ? '' : `  (got ${JSON.stringify(r)})`));
};
rev('It was beautiful.', true, null);
rev('The food good.', true, 'The food was good.');
rev('It big', true, 'It was big.');
rev('delisious', true, 'It was delicious.');
rev('I like it.', true, null);
rev('It was boring.', true, null);
rev("I didn't like it.", true, null);
rev('It was crowded. It was expensive.', true, null);
rev('Very fun!', true);
rev('Beautiful place.', true);
rev('asdfgh', false);
rev('', false);
rev('   ', false);

console.log('\n— the debrief still uses the same alias logic —');
check(typeof VA.Lang.memoryObject === 'function' && VA.Lang.memoryObject('I saw the Eiffel Tower.') === 'the Eiffel Tower',
  'VA.Lang.memoryObject strips the verb frame');
check(typeof VA.Lang.speechAliases === 'function' && VA.Lang.speechAliases(mem('eiffel').evt).includes('Eiffel Tower'),
  'VA.Lang.speechAliases includes the article-free object');

console.log('\n— broad language detection (never shown to the student) —');
const lang = (text, expected) => {
  const got = VA.Lang.languageOf(text);
  check(got === expected, `"${text}" → ${expected}` + (got === expected ? '' : `  (got ${got})`));
};
lang('It was delicious!', 'english');
lang('I go France. it was fun', 'english');           // minor errors are still English
lang('I see Eiffel Tower.', 'english');
lang('おいしかった！', 'japanese');                     // hiragana
lang('クレープ！', 'japanese');                          // katakana
lang('エッフェル塔を見た。', 'japanese');               // katakana + kanji
lang('楽しい', 'japanese');                              // kanji
lang('It was delicious! おいしかった！', 'mixed');
lang('I went to France! フランス楽しかった！', 'mixed');
lang('😂😂🔥', 'unclear');
lang('!!!', 'unclear');
lang('', 'unclear');
check(VA.Lang.englishPart('It was fun! めっちゃ楽しかった！') === 'It was fun!', 'englishPart keeps only the English words');
check(post('crepe', VA.Lang.englishPart('Crepe was delicious! おいしい！')).quality !== 'unclear',
  'the English part of a mixed post is still assessable');

console.log(failures.length ? `\n✗ ${failures.length} failure(s)` : '\n✓ all language checks passed');
process.exit(failures.length ? 1 : 0);
