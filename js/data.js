/* ============================================================
   data.js — ALL game content lives here.

   Characters, destinations, activities (with their cinematic
   event scripts), souvenirs, and the debrief answers.
   Adding a new destination = adding one more object to DESTS.

   English style rules (Japanese Grade 6, beginner):
     · one idea per sentence
     · simple present + simple past only
     · target patterns: I went to… / I ate… / I saw… / I played…
   ============================================================ */
'use strict';

VA.Data = {};

/* ------------------------------------------------------------
   CHARACTERS — each is a placeholder spec + the real art file
   it stands in for (assets/characters/<file>).
   ------------------------------------------------------------ */
VA.Data.CHARS = {
  player: {
    name: '{player}', file: 'player-alpha.png', color: '#ef6d3d',
    colors: { skin: '#ffd9b3', hair: '#5a3b2e', top: '#ff8a5c', bottom: '#4a6b8a' },
    voice: { rate: 0.95, pitch: 1.35 },
  },
  grandma: {
    name: 'Grandma', file: 'grandma.png', color: '#b06ab8',
    colors: { skin: '#ffe3c4', hair: '#e8e6e3', top: '#c47ab8', bottom: '#8a7f96' },
    hairStyle: 'bun', glasses: true,
    voice: { rate: 0.82, pitch: 1.02 },
  },
  officer: {
    name: 'Officer', file: 'officer.png', color: '#3d6b8f',
    colors: { skin: '#e8c49c', hair: '#3a3a3a', top: '#3d5f8f', bottom: '#2c4668', hat: '#2c4668' },
    hat: 'cap',
    voice: { rate: 0.88, pitch: 0.9 },
  },
  sign: { name: 'Guide Book', file: 'ui_guidebook.png', color: '#8a705c', noPortrait: true, voice: { rate: 0.9, pitch: 1 } },

  /* --- Australia --- */
  au_vendor: {
    name: 'Ice Cream Man', file: 'vendor_icecream-alpha.png', color: '#3fa9d6',
    colors: { skin: '#f2c9a0', hair: '#7a4a2c', top: '#67bde0', hat: '#e35f4f' },
    hat: 'cap', apron: true,
    voice: { rate: 0.92, pitch: 1.15 },
  },
  au_ranger: {
    name: 'Ranger', file: 'ranger_australia-alpha.png', color: '#79b851',
    colors: { skin: '#e8b988', hair: '#4a3220', top: '#a8925c', bottom: '#6b5a3c' },
    hat: 'ranger',
    voice: { rate: 0.9, pitch: 1.0 },
  },
  au_kid: {
    name: 'Beach Kid', file: 'kids_australia-alpha.png', color: '#ffb35c',
    colors: { skin: '#ffd9b3', hair: '#f2d16b', top: '#ffd166', bottom: '#e35f4f' },
    hairStyle: 'pigtails',
    voice: { rate: 1.0, pitch: 1.4 },
  },
  kangaroo: { name: 'Kangaroo', file: 'kangaroo.png', color: '#b5875a', animal: 'kangaroo', voice: { rate: 1, pitch: 1.6 } },

  /* --- France --- */
  fr_vendor: {
    name: 'Crêpe Chef', file: 'vendor_crepe.png', color: '#3d8fb8',
    colors: { skin: '#f2c9a0', hair: '#2c2c2c', top: '#5c7fa8', hat: '#c94f43' },
    hat: 'beret', apron: true,
    voice: { rate: 0.88, pitch: 1.05 },
  },
  fr_guide: {
    name: 'Marie', file: 'guide_paris.png', color: '#c47ab8',
    colors: { skin: '#ffe3c4', hair: '#8a5a34', top: '#b088c9', bottom: '#6d5a96' },
    hairStyle: 'long',
    voice: { rate: 0.9, pitch: 1.25 },
  },
  fr_kid: {
    name: 'Louis', file: 'kids_paris.png', color: '#79b851',
    colors: { skin: '#f2c9a0', hair: '#3a2c1e', top: '#79b851', bottom: '#4a6b8a', hat: '#3d5f8f' },
    hat: 'cap',
    voice: { rate: 1.0, pitch: 1.4 },
  },
  pigeon: { name: 'Pigeon', file: 'pigeon.png', color: '#8493a6', animal: 'pigeon', size: 0.45, voice: { rate: 1, pitch: 1.8 } },

  /* --- Egypt --- */
  eg_vendor: {
    name: 'Kebab Man', file: 'vendor_kebab.png', color: '#c94f43',
    colors: { skin: '#d9a06b', hair: '#2c2c2c', top: '#c9704a', hat: '#e8b96f' },
    hat: 'scarf', apron: true,
    voice: { rate: 0.9, pitch: 1.0 },
  },
  eg_guide: {
    name: 'Amira', file: 'guide_egypt.png', color: '#c9913c',
    colors: { skin: '#d9a06b', hair: '#1e1e1e', top: '#e8d3a8', bottom: '#a8763c', hat: '#fff' },
    hat: 'scarf',
    voice: { rate: 0.88, pitch: 0.95 },
  },
  eg_kid: {
    name: 'Layla', file: 'kids_egypt.png', color: '#3fa9a0',
    colors: { skin: '#e0ab77', hair: '#1e1e1e', top: '#3fa9a0', bottom: '#e8d3a8' },
    hairStyle: 'long',
    voice: { rate: 1.0, pitch: 1.45 },
  },
  camel: { name: 'Coco', file: 'camel.png', color: '#c9995f', animal: 'camel', voice: { rate: 0.8, pitch: 0.8 } },
};

/* random name suggestions for the 🎲 button */
VA.Data.NAMES = ['Yuki', 'Hana', 'Ken', 'Mio', 'Sora', 'Riku', 'Emi', 'Taiga', 'Aoi', 'Ren'];

/* ------------------------------------------------------------
   DESTINATIONS
   ------------------------------------------------------------ */
VA.Data.DESTS = [

  /* ==================== AUSTRALIA ==================== */
  {
    id: 'australia',
    name: 'Australia', jp: 'オーストラリア',
    flag: '🇦🇺', stampIcon: '🦘', color: '#e8873c',
    bg: 'background_australia_beach.png', painter: 'australiaBeach',
    music: 'theme_australia',
    ambient: [
      { type: 'birds', band: [0.06, 0.3], every: [8, 16] },
      { type: 'shimmer', rect: [0, 0.44, 1, 0.24], n: 14 },
    ],
    ambientFiles: ['waves', 'seagulls', 'wind'],
    sentences: {
      went: { en: 'I went to Australia.', jp: 'オーストラリアに行ったよ。' },
    },
    // the big tree-covered coastal island, bottom-left of the map
    mapPin: { x: 166, y: 353 },
    welcome: { en: 'Welcome to Australia!', jp: 'オーストラリアへようこそ！' },

    events: [
      {
        id: 'icecream', verb: 'ate',
        title: 'Ice Cream', titleJP: 'アイスクリーム', icon: '🍦', price: 3,
        hotspot: { x: 350, y: 430 },
        backdrop: 'event_australia_icecream.png', painter: 'ev_au_icecream',
        photoFile: 'photo_australia_icecream.png', photoIcon: '🍦',
        caption: 'I ate ice cream.', captionJP: 'アイスクリームを食べたよ。',
        photoPlayerPose: { x: 110, y: 600 },
        actors: [
          { id: 'player', char: 'player', x: 235, y: 600, scale: 1.05 },
          {
            id: 'au_vendor', char: 'au_vendor', x: 500, y: 625, scale: 1.3,
            // Beside the cart while talking; snapPhoto restores the legacy
            // player-left / seller-right arrangement for the memory photo.
            conversation: { x: 235, y: 625, scale: 1.2 },
          },
        ],
        props: [
          { id: 'ice', icon: '🍦', file: 'icecream.png', x: 520, y: 415, size: 84, hidden: true },
        ],
        amb: [],
        steps: [
          { cam: { x: 480, y: 340, s: 1.12, dur: 1700 } },
          { say: ['au_vendor', 'Hello!', 'こんにちは！'] },
          { say: ['au_vendor', 'One ice cream?', 'アイスクリーム、ひとついかが？'] },
          { choice: { items: [{ text: 'Yes, please!', jp: 'はい、ください！' }] } },
          { coins: -3 },
          { show: 'ice' }, { sfx: 'pop' },
          { say: ['au_vendor', 'Here you are.', 'はい、どうぞ。'] },
          { auto: ['player', 'Thank you!', 'ありがとう！'] },
          { move: { id: 'ice', towardScreen: true, dur: 760, scale: 2.15 } },
          { fx: ['sparkles', 480, 300] },
          { sfx: 'bite' },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Yummy!', 'おいしい！'] },
          { wait: 350 },
          { photo: true },
        ],
      },
      {
        id: 'kangaroo', verb: 'saw',
        title: 'Kangaroo Park', titleJP: 'カンガルーパーク', icon: '🦘', price: 3,
        hotspot: { x: 600, y: 300 },
        backdrop: 'event_australia_kangaroo.png', painter: 'ev_au_kangaroo',
        photoFile: 'photo_australia_kangaroo.png', photoIcon: '🦘',
        caption: 'I saw a kangaroo.', captionJP: 'カンガルーを見たよ。',
        photoPlayerPose: { x: 270, y: 555 },
        actors: [
          { id: 'au_ranger', char: 'au_ranger', x: 170, y: 545, scale: 1.3, conversation: { x: 480, y: 545, scale: 1.12 } },
          { id: 'player', char: 'player', x: 300, y: 555, scale: 1.05 },
          { id: 'roo', char: 'kangaroo', x: 1090, y: 545, scale: 1.1 },
        ],
        amb: [{ type: 'particles', kind: 'leaf', n: 6 }],
        steps: [
          { cam: { x: 480, y: 330, s: 1.06, dur: 1500 } },
          { say: ['au_ranger', 'Hello! Welcome!', 'こんにちは！ようこそ！'] },
          { say: ['au_ranger', 'Ticket, please.', 'チケットをください。'] },
          { choice: { items: [{ text: 'Here you are.', jp: 'はい、どうぞ。' }] } },
          { coins: -3 },
          { say: ['au_ranger', 'Thank you!', 'ありがとう！'] },
          { say: ['au_ranger', 'Look over there!', 'あそこを見て！'] },
          { cam: { x: 630, y: 400, s: 1.16, dur: 1900 } },
          { move: { id: 'roo', x: 660, y: 545, dur: 1000 } },
          { sfx: 'boing' }, { anim: { id: 'roo', name: 'hop' } },
          { sfx: 'boing' }, { anim: { id: 'roo', name: 'hop' } },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Wow!', 'わあ！'] },
          { say: ['player', 'A kangaroo!', 'カンガルーだ！'] },
          { say: ['au_ranger', 'It jumps very high!', 'とても高くジャンプするんだよ！'] },
          { sfx: 'boing' }, { anim: { id: 'roo', name: 'hop' } },
          { fx: ['sparkles', 660, 430] },
          { photo: true },
        ],
      },
      {
        id: 'volleyball', verb: 'played',
        title: 'Beach Volleyball', titleJP: 'ビーチバレー', icon: '🏐', price: 0,
        // The two players stay in their photo composition for the whole game.
        keepCastOnStage: true,
        hotspot: { x: 820, y: 430 },
        backdrop: 'event_australia_volleyball.png', painter: 'ev_au_volleyball',
        photoFile: 'photo_australia_volleyball.png', photoIcon: '🏐',
        caption: 'I played volleyball.', captionJP: 'バレーボールをしたよ。',
        actors: [
          { id: 'au_kid', char: 'au_kid', x: 700, y: 520, scale: 1 },
          { id: 'player', char: 'player', x: 250, y: 555, scale: 1.05 },
        ],
        props: [
          { id: 'ball', icon: '🏐', file: 'volleyball.png', x: 480, y: 400, size: 96 },
        ],
        amb: [{ type: 'birds', band: [0.04, 0.18], every: [6, 12] }],
        steps: [
          { cam: { x: 480, y: 340, s: 1.08, dur: 1400 } },
          { say: ['au_kid', 'Hi!', 'ハーイ！'] },
          { say: ['au_kid', "Let's play!", 'いっしょに遊ぼう！'] },
          { choice: { items: [{ text: 'OK!', jp: 'オッケー！' }, { text: "Yes! Let's play!", jp: 'うん、遊ぼう！' }] } },
          { caption: 'TAP the ball!' },
          { game: { n: 3, label: 'TAP! 🏐', propId: 'ball', anim: 'volley', fromId: 'player', toId: 'au_kid', sfx: 'bounce' } },
          { caption: 'Nice!' },
          { anim: { id: 'au_kid', name: 'cheer', wait: false } },
          { say: ['au_kid', 'You are good!', 'じょうずだね！'] },
          { auto: ['player', 'Thank you!', 'ありがとう！'] },
          { photo: true },
        ],
      },
    ],

    souvenirs: [
      { id: 'koala', label: 'Koala Toy', icon: '🐨', file: 'souvenir_koala.png', line: 'The koala, please.', jp: 'コアラをください。', reactJP: 'コアラ！', home: { slot: 'Sofa', x: 500, y: 250, size: 54 }, memory: { event: 'australia-memory', answer: 'I saw a koala.', answerJP: 'コアラを見たよ。' }, grandmaLine: 'I like my little koala.' },
      { id: 'shell', label: 'Seashell', icon: '🐚', file: 'souvenir_shell.png', line: 'The seashell, please.', jp: '貝がらをください。', reactJP: '貝がら！', home: { slot: 'Bookshelf middle', x: 142, y: 332, size: 42 }, memory: { event: 'australia-memory', answer: 'I found a seashell.', answerJP: '貝がらを見つけたよ。' }, grandmaLine: 'This seashell makes me happy.' },
    ],
  },

  /* ==================== FRANCE ==================== */
  {
    id: 'france',
    name: 'France', jp: 'フランス',
    flag: '🇫🇷', stampIcon: '🗼', color: '#7a6aa8',
    bg: 'background_paris_evening.png', painter: 'parisEvening',
    music: 'theme_paris',
    ambient: [
      { type: 'twinkle', rect: [0.44, 0.16, 0.24, 0.5], n: 8 },
      { type: 'fireflies', band: [0.6, 0.85], n: 5 },
      { type: 'birds', band: [0.2, 0.4], every: [10, 18], size: 0.8 },
    ],
    ambientFiles: ['city_evening', 'pigeons', 'crickets'],
    sentences: {
      went: { en: 'I went to France.', jp: 'フランスに行ったよ。' },
    },
    // the elegant blue-spired central castle — reads as romantic France
    mapPin: { x: 444, y: 232 },
    welcome: { en: 'Welcome to France!', jp: 'フランスへようこそ！' },

    events: [
      {
        id: 'crepe', verb: 'ate',
        title: 'Crêpe Stand', titleJP: 'クレープやさん', icon: '🥞', price: 3,
        hotspot: { x: 350, y: 430 },
        backdrop: 'event_france_crepe.png', painter: 'ev_fr_crepe',
        photoFile: 'photo_france_crepe.png', photoIcon: '🥞',
        caption: 'I ate a crepe.', captionJP: 'クレープを食べたよ。',
        photoPlayerPose: { x: 260, y: 555 },
        actors: [
          { id: 'player', char: 'player', x: 250, y: 555, scale: 1.05 },
          { id: 'fr_vendor', char: 'fr_vendor', x: 470, y: 558, scale: 1.3, conversation: { x: 480, y: 558, scale: 1.12 } },
        ],
        props: [
          { id: 'crepe', icon: '🥞', file: 'crepe.png', x: 470, y: 400, size: 80, hidden: true },
        ],
        amb: [{ type: 'fireflies', band: [0.55, 0.8], n: 4 }],
        steps: [
          { cam: { x: 470, y: 330, s: 1.12, dur: 1700 } },
          { say: ['fr_vendor', 'Bonjour!', 'ボンジュール！'] },
          { say: ['fr_vendor', 'It means "hello"!', 'フランス語で「こんにちは」！'] },
          { say: ['fr_vendor', 'One crepe?', 'クレープはいかが？'] },
          { choice: { items: [{ text: 'Yes, please!', jp: 'はい、ください！' }] } },
          { coins: -3 },
          { fx: ['steam', 460, 285] },
          { sfx: 'sizzle' },
          { wait: 1000 },
          { show: 'crepe' }, { sfx: 'pop' },
          { say: ['fr_vendor', 'Here you are.', 'はい、どうぞ。'] },
          { auto: ['player', 'Thank you!', 'ありがとう！'] },
          { move: { id: 'crepe', towardScreen: true, dur: 760, scale: 2.15 } },
          { fx: ['sparkles', 480, 300] },
          { sfx: 'bite' },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Yummy!', 'おいしい！'] },
          { photo: true },
        ],
      },
      {
        id: 'eiffel', verb: 'saw',
        title: 'Eiffel Tower', titleJP: 'エッフェル塔', icon: '🗼', price: 3,
        hotspot: { x: 600, y: 300 },
        backdrop: 'event_france_eiffel.png', painter: 'ev_fr_eiffel',
        photoFile: 'photo_france_eiffel.png', photoIcon: '🗼',
        caption: 'I saw the Eiffel Tower.', captionJP: 'エッフェル塔を見たよ。',
        // Keep the foreground clear: this tall landmark shot starts at the
        // Eiffel Tower's base, then pans all the way up to its tip.
        actors: [],
        amb: [{ type: 'twinkle', rect: [0.3, 0.1, 0.4, 0.6], n: 10 }],
        steps: [
          { cam: { x: 480, y: 520, s: 1, dur: 900 } },
          { say: ['fr_guide', 'Good evening!', 'こんばんは！'] },
          { say: ['fr_guide', 'Ticket, please.', 'チケットをください。'] },
          { choice: { items: [{ text: 'Here you are.', jp: 'はい、どうぞ。' }] } },
          { coins: -3 },
          { say: ['fr_guide', 'Thank you!', 'ありがとう！'] },
          { say: ['fr_guide', 'Look up!', '上を見て！'] },
          { towerPan: { from: 100, to: 0, dur: 4200 } },
          { wait: 300 },
          { sfx: 'chime' },
          { fx: ['sparkles', 480, 180, { n: 14, chars: ['✨', '💛', '⭐'] }] },
          { fx: ['sparkles', 430, 300, { n: 8 }] },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Wow!', 'わあ！'] },
          { say: ['player', 'So beautiful!', 'とてもきれい！'] },
          { say: ['fr_guide', 'It sparkles at night!', '夜はキラキラ光るのよ！'] },
          { fx: ['sparkles', 520, 240, { n: 10 }] },
          { cam: { x: 480, y: 300, s: 1.08, dur: 1800 } },
          { photo: true },
        ],
      },
      {
        id: 'soccer', verb: 'played',
        title: 'Park Soccer', titleJP: '公園でサッカー', icon: '⚽', price: 0,
        // The two players stay in their photo composition for the whole game.
        keepCastOnStage: true,
        hotspot: { x: 820, y: 430 },
        backdrop: 'event_france_park.png', painter: 'ev_fr_park',
        photoFile: 'photo_france_soccer.png', photoIcon: '⚽',
        caption: 'I played soccer.', captionJP: 'サッカーをしたよ。',
        actors: [
          { id: 'fr_kid', char: 'fr_kid', x: 700, y: 530, scale: 1 },
          { id: 'player', char: 'player', x: 280, y: 555, scale: 1.05 },
          { id: 'pige', char: 'pigeon', x: 130, y: 570, scale: 1 },
        ],
        props: [
          { id: 'ball', icon: '⚽', file: 'soccerball.png', x: 480, y: 520, size: 68 },
        ],
        amb: [{ type: 'particles', kind: 'leaf', n: 7 }],
        steps: [
          { cam: { x: 480, y: 360, s: 1.06, dur: 1400 } },
          { say: ['fr_kid', 'Bonjour!', 'ボンジュール！'] },
          { say: ['fr_kid', "Let's play soccer!", 'サッカーしよう！'] },
          { choice: { items: [{ text: 'OK!', jp: 'オッケー！' }, { text: "Yes! Let's play!", jp: 'うん、遊ぼう！' }] } },
          { caption: 'TAP to kick!' },
          { game: { n: 3, label: 'KICK! ⚽', propId: 'ball', anim: 'volley', fromId: 'player', toId: 'fr_kid', goal: { x: 790, y: 370, scale: 0.7 }, sfx: 'kick' } },
          { caption: 'GOAL!' },
          { anim: { id: 'fr_kid', name: 'cheer', wait: false } },
          { anim: { id: 'pige', name: 'wiggle', wait: false } },
          { fx: ['sparkles', 790, 370] },
          { say: ['fr_kid', 'Goal! Great!', 'ゴール！すごい！'] },
          { auto: ['player', 'Yay!', 'やったー！'] },
          { photo: true },
        ],
      },
    ],

    souvenirs: [
      { id: 'tower', label: 'Little Tower', icon: '🗼', file: 'souvenir_eiffel.png', line: 'The little tower, please.', jp: 'ミニエッフェル塔をください。', reactJP: 'エッフェル塔！', home: { slot: 'Bookshelf top', x: 150, y: 260, size: 48 }, memory: { event: 'france-memory', answer: 'I saw the Eiffel Tower.', answerJP: 'エッフェル塔を見たよ。' }, grandmaLine: 'Your little tower is beautiful.' },
      { id: 'beret', label: 'Beret', icon: '👒', file: 'souvenir_beret.png', line: 'The beret, please.', jp: 'ベレーぼうをください。', reactJP: 'ベレーぼう！', home: { slot: 'Coffee table', x: 488, y: 344, size: 44 }, memory: { event: 'france-memory', answer: 'I bought a beret.', answerJP: 'ベレーぼうを買ったよ。' }, grandmaLine: 'This beret reminds me of Paris.' },
    ],
  },

  /* ==================== EGYPT ==================== */
  {
    id: 'egypt',
    name: 'Egypt', jp: 'エジプト',
    flag: '🇪🇬', stampIcon: '🐪', color: '#c9913c',
    bg: 'background_egypt_desert.png', painter: 'egyptDesert',
    music: 'theme_egypt',
    ambient: [
      { type: 'particles', kind: 'sand', n: 8 },
      { type: 'birds', band: [0.06, 0.2], every: [10, 20], size: 1.1, color: 'rgba(90,60,40,.8)' },
    ],
    ambientFiles: ['desert_wind', 'market', 'hawk'],
    sentences: {
      went: { en: 'I went to Egypt.', jp: 'エジプトに行ったよ。' },
    },
    // the sandy dunes + red rock spires + domed building — the actual desert region
    mapPin: { x: 716, y: 353 },
    welcome: { en: 'Welcome to Egypt!', jp: 'エジプトへようこそ！' },

    events: [
      {
        id: 'kebab', verb: 'ate',
        title: 'Kebab Stall', titleJP: 'ケバブやさん', icon: '🍢', price: 3,
        hotspot: { x: 350, y: 430 },
        backdrop: 'event_egypt_kebab.png', painter: 'ev_eg_kebab',
        photoFile: 'photo_egypt_kebab.png', photoIcon: '🍢',
        caption: 'I ate a kebab.', captionJP: 'ケバブを食べたよ。',
        photoPlayerPose: { x: 260, y: 555 },
        actors: [
          { id: 'player', char: 'player', x: 265, y: 555, scale: 1.05 },
          { id: 'eg_vendor', char: 'eg_vendor', x: 500, y: 558, scale: 1.3, conversation: { x: 480, y: 558, scale: 1.12 } },
        ],
        props: [
          { id: 'keb', icon: '🍢', file: 'kebab.png', x: 500, y: 400, size: 80, hidden: true },
        ],
        amb: [{ type: 'particles', kind: 'sand', n: 6 }],
        steps: [
          { cam: { x: 490, y: 330, s: 1.12, dur: 1700 } },
          { say: ['eg_vendor', 'Hello, hello!', 'こんにちは、こんにちは！'] },
          { say: ['eg_vendor', 'Try this kebab!', 'ケバブを食べてみて！'] },
          { choice: { items: [{ text: 'Yes, please!', jp: 'はい、ください！' }] } },
          { coins: -3 },
          { sfx: 'sizzle' },
          { fx: ['steam', 480, 265] },
          { wait: 1000 },
          { show: 'keb' }, { sfx: 'pop' },
          { say: ['eg_vendor', 'Here you are.', 'はい、どうぞ。'] },
          { auto: ['player', 'Thank you!', 'ありがとう！'] },
          { move: { id: 'keb', towardScreen: true, dur: 760, scale: 2.15 } },
          { fx: ['sparkles', 480, 300] },
          { sfx: 'bite' },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Yummy!', 'おいしい！'] },
          { photo: true },
        ],
      },
      {
        id: 'pyramids', verb: 'saw',
        title: 'The Pyramids', titleJP: 'ピラミッド', icon: '🔺', price: 3,
        hotspot: { x: 600, y: 300 },
        backdrop: 'event_egypt_pyramid.png', painter: 'ev_eg_pyramid',
        photoFile: 'photo_egypt_pyramids.png', photoIcon: '🐪',
        caption: 'I saw the pyramids.', captionJP: 'ピラミッドを見たよ。',
        photoPlayerPose: { x: 300, y: 610 },
        actors: [
          { id: 'eg_guide', char: 'eg_guide', x: 250, y: 595, scale: 1.12, conversation: { x: 480, y: 595, scale: 1.15 } },
          { id: 'player', char: 'player', x: 365, y: 610, scale: 1.05 },
          { id: 'coco', char: 'camel', x: 700, y: 610, scale: 1.05 },
        ],
        amb: [{ type: 'birds', band: [0.08, 0.2], every: [7, 14], size: 1.1, color: 'rgba(90,60,40,.8)' }],
        steps: [
          { cam: { x: 480, y: 380, s: 1.05, dur: 1400 } },
          { say: ['eg_guide', 'Hello! Welcome!', 'こんにちは！ようこそ！'] },
          { say: ['eg_guide', 'Ticket, please.', 'チケットをください。'] },
          { choice: { items: [{ text: 'Here you are.', jp: 'はい、どうぞ。' }] } },
          { coins: -3 },
          { say: ['eg_guide', 'Thank you!', 'ありがとう！'] },
          { say: ['eg_guide', 'Look! The pyramids!', '見て！ピラミッドだよ！'] },
          { cam: { x: 480, y: 165, s: 1.18, dur: 2700 } },
          { fx: ['sparkles', 480, 130, { n: 8 }] },
          { mood: ['player', 'wow'] },
          { auto: ['player', 'Wow!', 'わあ！'] },
          { say: ['player', 'So big!', '大きい！'] },
          { say: ['eg_guide', 'It is 4,500 years old!', '4500年前のものだよ！'] },
          { cam: { x: 620, y: 400, s: 1.12, dur: 1800 } },
          { sfx: 'camel' },
          { anim: { id: 'coco', name: 'wiggle' } },
          { say: ['eg_guide', 'This is my camel, Coco!', 'ラクダのココだよ！'] },
          { auto: ['player', 'Hello, Coco!', 'こんにちは、ココ！'] },
          { photo: true },
        ],
      },
      {
        id: 'sand', verb: 'played',
        title: 'Sand Play', titleJP: 'すなあそび', icon: '🏖️', price: 0,
        // This shared activity keeps both children in the established layout.
        keepCastOnStage: true,
        hotspot: { x: 820, y: 430 },
        backdrop: 'event_egypt_sand.png', painter: 'ev_eg_sand',
        photoFile: 'photo_egypt_sand.png', photoIcon: '🔺',
        caption: 'I played in the sand.', captionJP: 'すなあそびをしたよ。',
        actors: [
          { id: 'eg_kid', char: 'eg_kid', x: 805, y: 540, scale: 1 },
          { id: 'player', char: 'player', x: 300, y: 555, scale: 1.05 },
        ],
        props: [
          { id: 'pyr', icon: '🔺', file: 'sand_pyramid.png', x: 480, y: 520, size: 52, hidden: true, anchor: 'bottom', chip: false },
          { id: 'flag', icon: '🚩', file: 'flag_small.png', x: 480, y: 415, size: 60, hidden: true, anchor: 'bottom', chip: false },
        ],
        amb: [{ type: 'particles', kind: 'sand', n: 8 }],
        steps: [
          { cam: { x: 480, y: 370, s: 1.08, dur: 1400 } },
          { say: ['eg_kid', 'Hi!', 'ハーイ！'] },
          { say: ['eg_kid', "Let's make a sand pyramid!", 'すなのピラミッドを作ろう！'] },
          { choice: { items: [{ text: 'OK!', jp: 'オッケー！' }, { text: "Yes! Let's play!", jp: 'うん、遊ぼう！' }] } },
          { show: 'pyr' },
          { caption: 'TAP the sand!' },
          { game: { n: 3, label: 'TAP! 🏖️', propId: 'pyr', anim: 'grow', growTo: 2.5, flagId: 'flag', flagEmbed: 54, flagOffsetX: 12, sfx: 'pop' } },
          { show: 'flag' }, { sfx: 'chime' },
          { caption: 'Wow!' },
          { anim: { id: 'eg_kid', name: 'cheer', wait: false } },
          { say: ['eg_kid', 'A great pyramid!', 'すごいピラミッド！'] },
          { auto: ['player', 'Yay!', 'やったー！'] },
          { photo: true },
        ],
      },
    ],

    souvenirs: [
      { id: 'goldpyr', label: 'Gold Pyramid', icon: '🔺', file: 'souvenir_pyramid.png', line: 'The gold pyramid, please.', jp: '金のピラミッドをください。', reactJP: '金のピラミッド！', home: { slot: 'Display cabinet top', x: 735, y: 188, size: 46 }, memory: { event: 'egypt-memory', answer: 'I saw a pyramid.', answerJP: 'ピラミッドを見たよ。' }, grandmaLine: 'I like my little pyramid.' },
      { id: 'camel', label: 'Camel Toy', icon: '🐪', file: 'souvenir_camel.png', line: 'The camel toy, please.', jp: 'ラクダのおもちゃをください。', reactJP: 'ラクダ！', home: { slot: 'Display cabinet middle', x: 738, y: 258, size: 48 }, memory: { event: 'egypt-memory', answer: 'I saw a camel.', answerJP: 'ラクダを見たよ。' }, grandmaLine: 'Your camel toy makes me smile.' },
    ],
  },
];

VA.Data.destById = id => VA.Data.DESTS.find(d => d.id === id);

/* Keep the completed house-gift system in the build without showing it. Set
   this to true later to restore the displays and optional memory reviews. */
VA.Data.FEATURES = {
  grandmaHomeSouvenirs: false,
};

/* verbs asked by Grandma, in order, with her question lines */
VA.Data.DEBRIEF_QUESTIONS = [
  { verb: 'went',   q: 'Where did you go?',  jp: 'どこに行ったの？',  react: ['Wow!', 'すごい！'] },
  { verb: 'ate',    q: 'What did you eat?',  jp: '何を食べたの？',    react: ['Yum!', 'おいしそう！'] },
  { verb: 'saw',    q: 'What did you see?',  jp: '何を見たの？',      react: ['Wow! Really?', 'わあ、ほんとに？'] },
  { verb: 'played', q: 'What did you play?', jp: '何をして遊んだの？', react: ['That sounds fun!', 'たのしそう！'] },
];

/* allowance per trip */
VA.Data.ALLOWANCE = 12;
