'use strict';

/* =============================================================
   PIXELWAVES — ЛУННЫЙ ЛЕС
   Волновая пиксельная арена. Полностью локально:
   нет сети, внешних файлов, шрифтов и картинок.

   Механики: рывок, ультимейты, комбо, элиты, боссы с фазами,
   лавка, проклятые волны, 4 локации, 4 сложности, игра на двоих.
   ============================================================= */

/* ---------------- Утилиты ---------------- */

const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
const rnd = function (a, b) { return a + Math.random() * (b - a); };
const lerp = function (a, b, t) { return a + (b - a) * t; };

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ---------------- Константы мира ---------------- */

const VIEW_W = 320;
const VIEW_H = 180;
const TILE = 16;
const MAP_W = 64;
const MAP_H = 36;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;
const MAX_WAVE = 30;

const T_GRASS = 0, T_GRASS2 = 1, T_DIRT = 2, T_WATER = 3, T_TREE = 4, T_ROCK = 5, T_DECOR = 6;

/* атмосфера по эпохам: с каждым этапом темнее и тревожнее */
const ERAS = [
  { upto: 10, ambient: 0.40 },
  { upto: 20, ambient: 0.54 },
  { upto: 30, ambient: 0.64 }
];

/* =============================================================
   ЛОКАЦИИ
   ============================================================= */

const LOCATIONS = {
  forest: {
    key: 'forest', name: 'ЛУННЫЙ ЛЕС', icon: '🌲',
    desc: 'Классика: деревья, озёра, светлячки.',
    pal: {
      gA: '#2d6f4b', gB: '#2a6b48', gL: '#35915a', gD: '#235a3c',
      dirt: '#5c4a33', dirtL: '#6f5b40', dirtD: '#4a3b28',
      water: '#123a6b', waterL: '#2569c4', shore: '#2f7a4a',
      shadow: 'rgba(0,0,0,0.2)'
    },
    treeD: 0.07, rockD: 0.02, lakes: 2,
    amb: 0.46, weather: 'fireflies',
    enemyHp: 1, enemyDmg: 1, coin: 1, xp: 1
  },
  swamp: {
    key: 'swamp', name: 'ЯДОВИТАЯ ТОПЬ', icon: '☣',
    desc: 'Топь и светящиеся грибы. Враги крепче, добычи больше.',
    pal: {
      gA: '#264a3a', gB: '#22422f', gL: '#2f6b4c', gD: '#1a3325',
      dirt: '#3f4230', dirtL: '#4f5340', dirtD: '#2e3124',
      water: '#1c4a3f', waterL: '#2f8f6a', shore: '#2f6b45',
      shadow: 'rgba(0,0,0,0.22)'
    },
    treeD: 0.085, rockD: 0.01, lakes: 4,
    amb: 0.54, weather: 'leaves',
    enemyHp: 1.18, enemyDmg: 1.1, coin: 1.25, xp: 1.15, need: 10
  },
  ruins: {
    key: 'ruins', name: 'ДРЕВНИЕ РУИНЫ', icon: '🏛',
    desc: 'Камень и факелы. Врагов меньше, золота больше.',
    pal: {
      gA: '#4a4a52', gB: '#44444c', gL: '#5a5a63', gD: '#36363e',
      dirt: '#5c5348', dirtL: '#6f665a', dirtD: '#453e35',
      water: '#1e3a4a', waterL: '#2f6a85', shore: '#4a5a5a',
      shadow: 'rgba(0,0,0,0.24)'
    },
    treeD: 0.02, rockD: 0.12, lakes: 1,
    amb: 0.58, weather: 'rain',
    enemyHp: 1.05, enemyDmg: 1.2, coin: 1.5, xp: 1.1, need: 20
  },
  caldera: {
    key: 'caldera', name: 'ОГНЕННАЯ КАЛЬДЕРА', icon: '🔥',
    desc: 'Пепел и угли. Враги бьют больнее, растёт награда.',
    pal: {
      gA: '#4a2f28', gB: '#432b24', gL: '#63403a', gD: '#33201b',
      dirt: '#5a3524', dirtL: '#7a4a2c', dirtD: '#412418',
      water: '#7a2a1a', waterL: '#c2410c', shore: '#8a3a1a',
      shadow: 'rgba(0,0,0,0.24)'
    },
    treeD: 0.012, rockD: 0.09, lakes: 3,
    amb: 0.62, weather: 'embers',
    enemyHp: 1.3, enemyDmg: 1.35, coin: 1.35, xp: 1.25, need: 30
  }
};

const LOC_ORDER = ['forest', 'swamp', 'ruins', 'caldera'];
let LOC = LOCATIONS.forest;

/* все локации и герои доступны сразу */
function locUnlocked() { return true; }

/* =============================================================
   ГЕРОИ
   ============================================================= */

const CHARACTERS = {
  knight: {
    key: 'knight', name: 'РЫЦАРЬ', role: 'Меч · ближний бой',
    desc: 'Щит и широкий замах. Держит удар и рубит всё перед собой.',
    sprite: 'knight', overlay: 'w_sword', weapon: 'melee',
    hp: 150, speed: 74, dmg: 38, cd: 0.46, range: 32, arc: 1.1, knock: 5,
    ultName: 'СОЛНЕЧНЫЙ УДАР', ultColor: '#fbbf24'
  },
  archer: {
    key: 'archer', name: 'ЛУЧОК', role: 'Лук · дальний бой',
    desc: 'Стреляет часто и бегает быстро. Хрупкий, но смертоносный.',
    sprite: 'archer', overlay: 'w_bow', weapon: 'bow',
    hp: 88, speed: 98, dmg: 17, cd: 0.26, projSpeed: 240, pierce: 0, spread: 0.03,
    proj: 'arrowP', ultName: 'ДОЖДЬ СТРЕЛ', ultColor: '#86efac'
  },
  rogue: {
    key: 'rogue', name: 'РАЗБОЙНИК', role: 'Кинжалы · шквал',
    desc: 'Осыпает врагов кинжалами и проскальзывает между ними.',
    sprite: 'rogue', overlay: 'w_dagger', weapon: 'dagger',
    hp: 98, speed: 112, dmg: 11, cd: 0.15, projSpeed: 275, pierce: 0, spread: 0.11,
    proj: 'daggerShot', ultName: 'ТЕНЕВОЙ ВИХРЬ', ultColor: '#a78bfa'
  },
  barbarian: {
    key: 'barbarian', name: 'ВАРВАР', role: 'Топор · тяжёлый удар',
    desc: 'Огромный замах, отбрасывание и очень много здоровья.',
    sprite: 'barbarian', overlay: 'w_axe', weapon: 'melee',
    hp: 195, speed: 66, dmg: 62, cd: 0.78, range: 36, arc: 1.4, knock: 9,
    ultName: 'ЗЕМЛЕТРЯСЕНИЕ', ultColor: '#f97316'
  },
  gunner: {
    key: 'gunner', name: 'АРБАЛЕТЧИК', role: 'Арбалет · пробитие',
    desc: 'Редкие, но чудовищные болты прошивают строй насквозь.',
    sprite: 'gunner', overlay: 'w_crossbow', weapon: 'bolt',
    hp: 112, speed: 80, dmg: 48, cd: 0.86, projSpeed: 290, pierce: 4, spread: 0,
    proj: 'boltP', ultName: 'СНАЙПЕРСКИЙ ВЫСТРЕЛ', ultColor: '#93c5fd'
  },
  spearman: {
    key: 'spearman', name: 'КОПЕЙЩИК', role: 'Копьё · длинный укол',
    desc: 'Точные уколы узким конусом на безопасной дистанции.',
    sprite: 'spearman', overlay: 'w_spear', weapon: 'melee',
    hp: 128, speed: 88, dmg: 34, cd: 0.32, range: 46, arc: 0.42, knock: 4,
    ultName: 'ПРОНЗАЮЩИЙ ВИХРЬ', ultColor: '#5eead4'
  },
  reaper: {
    key: 'reaper', name: 'ЖНЕЦ', role: 'Коса · вампиризм',
    desc: 'Очень широкие взмахи и сильный вампиризм. Высасывает жизни.',
    sprite: 'reaper', overlay: 'w_scythe', weapon: 'melee',
    hp: 120, speed: 82, dmg: 40, cd: 0.5, range: 38, arc: 1.7, knock: 5,
    ultName: 'ЖАТВА', ultColor: '#22d3ee', lifestealBase: 0.04
  },
  pyromant: {
    key: 'pyromant', name: 'ПИРОМАНТ', role: 'Бомбы · взрывы',
    desc: 'Бросает бомбы, которые взрываются и поджигают всё вокруг.',
    sprite: 'pyromant', overlay: 'w_bomb', weapon: 'bomb', splash: 34,
    hp: 118, speed: 84, dmg: 26, cd: 0.62, projSpeed: 210, pierce: 0, spread: 0.06,
    proj: 'bombShot', ultName: 'ОГНЕННЫЙ ЛИВЕНЬ', ultColor: '#fb923c'
  }
};

const HERO_ORDER = ['knight', 'archer', 'rogue', 'barbarian', 'gunner', 'spearman', 'reaper', 'pyromant'];

/* =============================================================
   ВРАГИ
   ============================================================= */

const ENEMY_TYPES = {
  slime: { name: 'Слизень', anim: 'slime', hp: 26, speed: 40, dmg: 9, r: 6, score: 10, coin: 0.4, xp: 4, color: '#3fbf5f' },
  slimeBlue: { name: 'Ледяной слизень', anim: 'slimeBlue', hp: 42, speed: 34, dmg: 12, r: 6, score: 18, coin: 0.45, xp: 7, color: '#4f8fe0' },
  slimeRed: { name: 'Огненный слизень', anim: 'slimeRed', hp: 56, speed: 46, dmg: 15, r: 6, score: 24, coin: 0.5, xp: 9, color: '#e0503f' },
  bat: { name: 'Летучая мышь', anim: 'bat', hp: 18, speed: 92, dmg: 8, r: 6, score: 12, coin: 0.3, xp: 5, color: '#a78bfa', zig: 1, hover: 5, flying: true },
  spider: { name: 'Паук', anim: 'spider', hp: 34, speed: 72, dmg: 12, r: 6, score: 22, coin: 0.4, xp: 8, color: '#7c3aed' },
  crawler: { name: 'Ползун', anim: 'crawler', hp: 74, speed: 30, dmg: 16, r: 7, score: 32, coin: 0.5, xp: 12, color: '#a34d76', spitter: true },
  wolf: { name: 'Лунный волк', anim: 'wolf', hp: 54, speed: 104, dmg: 17, r: 6, score: 26, coin: 0.45, xp: 10, color: '#9aa3b2', charger: true },
  skeleton: { name: 'Скелет', anim: 'skeleton', hp: 46, speed: 56, dmg: 15, r: 6, score: 20, coin: 0.45, xp: 9, color: '#e6edf9' },
  zombie: { name: 'Зомби', anim: 'zombie', hp: 82, speed: 32, dmg: 18, r: 6, score: 28, coin: 0.5, xp: 12, color: '#7fb784' },
  skelArcher: {
    name: 'Скелет-лучник', anim: 'skelArcher', hp: 38, speed: 54, dmg: 11, r: 6, score: 28, coin: 0.5, xp: 12, color: '#cbd5e1',
    ranged: { min: 95, max: 165, cd: 2.2, speed: 150, sprite: 'arrowBone', dmg: 0.9 }
  },
  orc: { name: 'Орк', anim: 'orc', hp: 96, speed: 50, dmg: 24, r: 7, score: 36, coin: 0.6, xp: 15, color: '#6fb356' },
  ogre: { name: 'Огр', anim: 'ogre', hp: 200, speed: 36, dmg: 32, r: 9, score: 76, coin: 0.8, xp: 28, color: '#c29425', knockResist: 0.7, splitter: 'skeleton' },
  goblin: { name: 'Гоблин', anim: 'goblin', hp: 40, speed: 76, dmg: 13, r: 6, score: 24, coin: 0.45, xp: 10, color: '#57b45f' },
  goblinX: {
    name: 'Гоблин-арбалетчик', anim: 'goblinX', hp: 64, speed: 66, dmg: 20, r: 6, score: 46, coin: 0.65, xp: 18, color: '#74c05a',
    ranged: { min: 125, max: 195, cd: 3.0, speed: 200, sprite: 'boltE', dmg: 1.4 }
  },
  thrower: {
    name: 'Орк-метатель', anim: 'thrower', hp: 78, speed: 54, dmg: 16, r: 7, score: 44, coin: 0.65, xp: 18, color: '#a16207',
    ranged: { min: 105, max: 175, cd: 2.6, speed: 125, sprite: 'axeShot', dmg: 1.25, spin: true }
  },
  bomber: { name: 'Бомбардир', anim: 'bomber', hp: 60, speed: 64, dmg: 18, r: 6, score: 48, coin: 0.6, xp: 20, color: '#dc2626', suicide: true },
  wraith: { name: 'Призрак', anim: 'wraith', hp: 92, speed: 60, dmg: 20, r: 6, score: 54, coin: 0.7, xp: 24, color: '#a78bfa', flying: true, hover: 6 },
  brute: { name: 'Громила', anim: 'brute', hp: 170, speed: 44, dmg: 28, r: 8, score: 86, coin: 0.8, xp: 32, color: '#c29425', knockResist: 0.6, charger: true }
};

const ELITES = {
  armored: { name: 'Броневой', color: '#93c5fd', hp: 2.6, dmg: 1.15, spd: 0.9, dr: 0.35 },
  swift: { name: 'Стремительный', color: '#86efac', hp: 1.5, dmg: 1.1, spd: 1.6 },
  volatile: { name: 'Взрывной', color: '#fb923c', hp: 1.6, dmg: 1.2, spd: 1.1, boom: 1 },
  vampiric: { name: 'Вампирский', color: '#f472b6', hp: 2, dmg: 1.2, spd: 1, drain: true },
  cursed: { name: 'Проклятый', color: '#c084fc', hp: 2.2, dmg: 1.35, spd: 1.05 }
};
const ELITE_KEYS = Object.keys(ELITES);

/* =============================================================
   БОССЫ
   ============================================================= */

const BOSSES = {
  husk: { key: 'husk', name: 'ПЕПЕЛЬНЫЙ СТРАЖ', sub: 'мини-босс · волна 5', hp: 620, speed: 34, dmg: 26, r: 12, score: 260, coin: 2, xp: 70, color: '#fdba74', abilities: ['rocks', 'charge'] },
  golem: { key: 'golem', name: 'КАМЕННЫЙ ГОЛЕМ', sub: 'босс · волна 10', hp: 1350, speed: 32, dmg: 30, r: 13, score: 700, coin: 4, xp: 160, color: '#9ca3af', abilities: ['charge', 'rocks'] },
  spiderqueen: { key: 'spiderqueen', name: 'ПАУЧИХА ЛУНЫ', sub: 'мини-босс · волна 15', hp: 1500, speed: 58, dmg: 28, r: 13, score: 800, coin: 4, xp: 190, color: '#9333ea', abilities: ['summon', 'webvolley', 'charge'] },
  skking: { key: 'skking', name: 'КОРОЛЬ СКЕЛЕТОВ', sub: 'босс · волна 20', hp: 2400, speed: 46, dmg: 34, r: 14, score: 1400, coin: 6, xp: 280, color: '#fbbf24', abilities: ['summon', 'volley', 'bones'] },
  huskreign: { key: 'husk', name: 'ПЕПЕЛЬНЫЙ ВЛАДЫКА', sub: 'мини-босс · волна 25', hp: 3000, speed: 40, dmg: 38, r: 13, score: 1600, coin: 6, xp: 320, color: '#f97316', abilities: ['rocks', 'charge', 'firewave'] },
  dragon: { key: 'dragon', name: 'ОГНЕННЫЙ ДРАКОН', sub: 'финальный босс · волна 30', hp: 4600, speed: 52, dmg: 40, r: 15, score: 4000, coin: 10, xp: 600, color: '#f87171', flying: true, hover: 4, abilities: ['fire', 'ring', 'flap', 'summon'] }
};

const BOSS_ORDER = [
  { wave: 5, key: 'husk' }, { wave: 10, key: 'golem' }, { wave: 15, key: 'spiderqueen' },
  { wave: 20, key: 'skking' }, { wave: 25, key: 'huskreign' }, { wave: 30, key: 'dragon' }
];

function bossForWave(n) {
  for (let i = 0; i < BOSS_ORDER.length; i++) if (BOSS_ORDER[i].wave === n) return BOSS_ORDER[i].key;
  /* бесконечный режим: после 30-й волны босс каждые 5 волн */
  if (G.endless && n > MAX_WAVE && n % 5 === 0) {
    const cycle = ['huskreign', 'skking', 'dragon', 'spiderqueen', 'golem'];
    return cycle[(Math.floor(n / 5) - 6) % cycle.length];
  }
  return null;
}

/* последняя волна забега (в бесконечном режиме потолка нет) */
function maxWave() { return G.endless ? Infinity : MAX_WAVE; }

/* =============================================================
   УЛУЧШЕНИЯ
   ============================================================= */

const UPGRADES = [
  { id: 'dmg', tier: 1, name: 'СИЛА', icon: '⚔', color: '#ff8f5a', desc: '+12% к урону', apply: function (p) { p.st.dmg *= 1.12; } },
  { id: 'cd', tier: 1, name: 'ЯРОСТЬ', icon: '⚡', color: '#ffd76a', desc: '−8% перезарядки', apply: function (p) { p.st.cd *= 0.92; } },
  { id: 'spd', tier: 1, name: 'ПРЫТКИЕ САПОГИ', icon: '➤', color: '#7dffa8', desc: '+10% скорости бега', apply: function (p) { p.st.speed *= 1.1; } },
  { id: 'reach', tier: 1, name: 'ДАЛЬНИЙ ЗАМАХ', icon: '✦', color: '#8fd3ff', desc: '+4 к радиусу, +15% к снарядам', apply: function (p) { p.st.range += 4; p.st.projSpeed *= 1.15; } },
  { id: 'pick', tier: 1, name: 'ЖАДНОСТЬ', icon: '◎', color: '#fbbf24', desc: '+50% к радиусу подбора', apply: function (p) { p.st.pickup *= 1.5; } },
  { id: 'hp', tier: 1, name: 'ЖИЗНЕННАЯ СИЛА', icon: '❤', color: '#7dffa8', desc: '+20 к максимуму HP и лечение', apply: function (p) { p.maxHp += 20; p.hp = p.maxHp; } },
  { id: 'xp', tier: 1, name: 'ОПЫТНЫЙ', icon: '★', color: '#c4b5fd', desc: '+20% получаемого опыта', apply: function (p) { p.st.xp *= 1.2; } },

  { id: 'crit', tier: 2, name: 'ТОЧНЫЙ УДАР', icon: '✦', color: '#ffe27a', desc: '+12% шанса крита (x2 урон)', max: 5, apply: function (p) { p.st.crit += 0.12; } },
  { id: 'ls', tier: 2, name: 'КРОВОПИЙЦА', icon: '❤', color: '#ff8080', desc: '+3% лечения от урона', max: 5, apply: function (p) { p.st.lifesteal += 0.03; } },
  { id: 'regen', tier: 2, name: 'ВТОРОЕ ДЫХАНИЕ', icon: '✚', color: '#7dffa8', desc: '+1.5 HP в секунду', max: 4, apply: function (p) { p.st.regen += 1.5; } },
  { id: 'boom', tier: 2, name: 'ВЗРЫВНОЕ УБИЙСТВО', icon: '☄', color: '#ff9f43', desc: 'Убитые враги взрываются', max: 4, apply: function (p) { p.st.explode += 18; } },
  { id: 'wide', tier: 2, only: 'melee', name: 'ШИРОКИЙ РАЗМАХ', icon: '✧', color: '#8fd3ff', desc: '+35% к конусу, +5 к радиусу', max: 4, apply: function (p) { p.st.arcMul *= 1.35; p.st.range += 5; } },
  { id: 'extra', tier: 2, only: 'ranged', name: 'ДУБЛЬ-ВЫСТРЕЛ', icon: '➹', color: '#8fd3ff', desc: '+1 снаряд за выстрел', max: 3, apply: function (p) { p.st.extra += 1; } },
  { id: 'dashcd', tier: 2, name: 'ЛЁГКИЙ РЫВОК', icon: '➹', color: '#5eead4', desc: '−25% перезарядки рывка', max: 3, apply: function (p) { p.st.dashCd *= 0.75; } },
  { id: 'ultcd', tier: 2, name: 'СИЛЬНЫЙ УЛЬТИМЕЙТ', icon: '★', color: '#f0abfc', desc: '−20% времени заряда ультимейта', max: 3, apply: function (p) { p.st.ultMul *= 1.2; } },

  { id: 'bloodrage', tier: 3, name: 'КРОВАВЫЙ ГНЕВ', icon: '☠', color: '#ff6b6b', desc: '+30% урона и +10% крита', apply: function (p) { p.st.dmg *= 1.3; p.st.crit += 0.1; } },
  { id: 'shield', tier: 3, name: 'АМУЛЕТ ЩИТА', icon: '✧', color: '#8fd3ff', desc: 'Щит блокирует удар каждые 8 с', max: 3, apply: function (p) { p.st.shieldMax += 1; p.st.shield = p.st.shieldMax; } },
  { id: 'laststand', tier: 3, name: 'ПОСЛЕДНИЙ ВСПЛЕСК', icon: '✚', color: '#ffe27a', desc: 'Раз в волну смертельный удар оставляет 1 HP', max: 1, apply: function (p) { p.st.lastStandMax = 1; p.st.lastStand = 1; } },
  { id: 'quake', tier: 3, name: 'ЗЕМЛЕТРЯСЕНИЕ', icon: '☄', color: '#ff9f43', desc: 'Каждое убийство бьёт всех вокруг', max: 3, apply: function (p) { p.st.quake += 28; } },
  { id: 'thorns', tier: 3, name: 'ШИПЫ', icon: '✳', color: '#a3e635', desc: 'Враги рядом получают урон', max: 3, apply: function (p) { p.st.thorns += 18; } },
  { id: 'magnet', tier: 3, name: 'МАГНЕТИЗМ', icon: '⊕', color: '#67e8f9', desc: 'Радиус подбора x2.2 и +12% урона', apply: function (p) { p.st.magnet = 1; p.st.dmg *= 1.12; } },

  /* --- уникальные для героев --- */
  { id: 'k_guard', tier: 2, hero: 'knight', name: 'СТЕНА ЩИТА', icon: '🛡', color: '#93c5fd', desc: 'Щит восстанавливается вдвое быстрее', max: 3, apply: function (p) { p.st.shieldRegen = Math.max(2, p.st.shieldRegen - 2.5); p.st.shieldMax += 1; p.st.shield = p.st.shieldMax; } },
  { id: 'a_eye', tier: 2, hero: 'archer', name: 'ОРЛИНЫЙ ГЛАЗ', icon: '👁', color: '#a3e635', desc: '+25% скорости снарядов и +4 к пробитию', max: 3, apply: function (p) { p.st.projSpeed *= 1.25; p.st.pierce += 4; } },
  { id: 'r_dance', tier: 2, hero: 'rogue', name: 'ТАНЕЦ КЛЫКОВ', icon: '❖', color: '#c084fc', desc: '+40% перезарядки и −25% перезарядки рывка', max: 3, apply: function (p) { p.st.cd *= 0.6; p.st.dashCd *= 0.75; } },
  { id: 'b_rage', tier: 2, hero: 'barbarian', name: 'ЯРОСТЬ ТОПОРА', icon: '🪓', color: '#f97316', desc: '+20% урона, +2 к ширине конуса', max: 3, apply: function (p) { p.st.dmg *= 1.2; p.st.arcMul *= 1.3; } },
  { id: 'g_rapid', tier: 2, hero: 'gunner', name: 'СКОРОСТРЕЛЬНОСТЬ', icon: '⚡', color: '#60a5fa', desc: '−35% перезарядки, +2 пробития', max: 3, apply: function (p) { p.st.cd *= 0.65; p.st.pierce += 2; } },
  { id: 's_reach', tier: 2, hero: 'spearman', name: 'ДЛИННЫЙ УКОЛ', icon: '➹', color: '#5eead4', desc: '+8 к радиусу и +15% урона', max: 3, apply: function (p) { p.st.range += 8; p.st.dmg *= 1.15; } },
  { id: 'rp_harvest', tier: 2, hero: 'reaper', name: 'ЖНАТВА ДУШ', icon: '☠', color: '#22d3ee', desc: '+6% вампиризма, +2 к урону', max: 3, apply: function (p) { p.st.lifesteal += 0.06; p.st.dmg *= 1.2; } },
  { id: 'py_fire', tier: 2, hero: 'pyromant', name: 'ЗАЖИГАТЕЛЬ', icon: '🔥', color: '#fb923c', desc: 'Взрывы шире и поджигают врагов', max: 3, apply: function (p) { p.st.splash = (p.st.splash || 34) + 12; p.st.burn = (p.st.burn || 0) + 6; } }
];

const SHOP_ITEMS = [
  { id: 'heal', name: 'ЗЕЛЬЕ', icon: '❤', color: '#7dffa8', price: 12, desc: 'Полностью лечит', once: true, apply: function (p) { p.hp = p.maxHp; } },
  { id: 'maxhp', name: 'КРОВЬ ГЕРОЯ', icon: '✚', color: '#ff8080', price: 26, desc: '+25 к максимуму HP', repeat: 3, apply: function (p) { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'dmgup', name: 'ТОЧНОЕ ОРУЖИЕ', icon: '⚔', color: '#ff8f5a', price: 28, desc: '+15% к урону', repeat: 5, apply: function (p) { p.st.dmg *= 1.15; } },
  { id: 'critup', name: 'ОСТРЫЙ ВЗГЛЯД', icon: '✦', color: '#ffe27a', price: 24, desc: '+10% крита', repeat: 4, apply: function (p) { p.st.crit += 0.1; } },
  { id: 'lsup', name: 'ПИЯВКА', icon: '❤', color: '#ff6b6b', price: 26, desc: '+4% лечения от урона', repeat: 4, apply: function (p) { p.st.lifesteal += 0.04; } },
  { id: 'spdup', name: 'БЫСТРЫЕ НОГИ', icon: '➤', color: '#86efac', price: 22, desc: '+10% скорости', repeat: 4, apply: function (p) { p.st.speed *= 1.1; } },
  { id: 'cdup', name: 'ЛЁГКИЕ РУКИ', icon: '⚡', color: '#ffd76a', price: 26, desc: '−8% перезарядки', repeat: 4, apply: function (p) { p.st.cd *= 0.92; } },
  { id: 'coincharm', name: 'ЖЕМЧУГ', icon: '◎', color: '#fde68a', price: 14, desc: '+15 монет', repeat: 9, apply: function () {} }
];

const CURSES = [
  { id: 'thin', name: 'ИСТОЩЕНИЕ', color: '#ef4444', desc: 'урон −15%, опыт +60%', dmg: 0.85, xp: 1.6 },
  { id: 'frenzy', name: 'БЕШЕНСТВО', color: '#f97316', desc: 'врагов +35%, урон +25%', count: 1.35, dmg: 1.25 },
  { id: 'swarm', name: 'РОЙ', color: '#a855f7', desc: 'толпа слабых врагов, урон −10%', count: 1.5, dmg: 0.9 },
  { id: 'gilded', name: 'ПОЗОЛЯЩЕНИЕ', color: '#fbbf24', desc: 'враги быстрее, монет больше', speed: 1.35, coin: 2.2 }
];

const DIFFICULTIES = {
  easy: { key: 'easy', name: 'ЛЁГКАЯ', color: '#7dffa8', icon: '☺', desc: 'Для первого знакомства с лесом.', hp: 1.3, enemyHp: 0.7, enemyDmg: 0.55, enemyCount: 0.7, coin: 0.8, eliteChance: 0.08 },
  normal: { key: 'normal', name: 'ОБЫЧНАЯ', color: '#ffd76a', icon: '◆', desc: 'Честный баланс: 30 волн, боссы на 5/10/15/20/25/30.', hp: 1, enemyHp: 1, enemyDmg: 1, enemyCount: 1, coin: 1, eliteChance: 0.16 },
  hard: { key: 'hard', name: 'СЛОЖНАЯ', color: '#fb923c', icon: '◆◆', desc: 'Враги крепче и многочисленнее, элиты чаще.', hp: 0.85, enemyHp: 1.45, enemyDmg: 1.4, enemyCount: 1.3, coin: 1.2, eliteChance: 0.3 },
  nightmare: { key: 'nightmare', name: 'КОШМАР', color: '#f87171', icon: '☠', desc: 'Проклятия почти каждую волну. Для мазохистов.', hp: 0.68, enemyHp: 2.2, enemyDmg: 1.95, enemyCount: 1.6, coin: 1.45, eliteChance: 0.45 }
};
const DIFF_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

/* =============================================================
   СОХРАНЕНИЯ
   ============================================================= */

const SAVE_KEY = 'pixelwaves.save.v3';

function defaultSave() {
  return {
    unlocked: { knight: 1, archer: 1, rogue: 1, barbarian: 1, gunner: 1, spearman: 1 },
    bestWave: 0, bestScore: 0, runs: 0, totalCoins: 0,
    bossesKilled: {}, lastChar: 'knight', lastChar2: 'archer', lastLoc: 'forest', lastDiff: 'normal'
  };
}

let SAVE = defaultSave();

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      SAVE = Object.assign(defaultSave(), d);
      if (!SAVE.unlocked || typeof SAVE.unlocked !== 'object') SAVE.unlocked = defaultSave().unlocked;
      if (!SAVE.bossesKilled || typeof SAVE.bossesKilled !== 'object') SAVE.bossesKilled = {};
    }
  } catch (e) { SAVE = defaultSave(); }
  return SAVE;
}

function persist() {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* приватный режим */ }
}

function heroUnlocked() { return true; }

/* =============================================================
   СОСТОЯНИЕ
   ============================================================= */

let canvas = null;
let ctx = null;
let cam = { x: 0, y: 0 };
let mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
const keys = Object.create(null);

let player = null;
let player2 = null;
let twoPlayer = false;
let enemies = [];
let projs = [];
let eprojs = [];
let items = [];
let flyers = [];
let tiles = [];
let decor = [];
let torches = [];
let worldCv = null;
let enemySeq = 1;
let els = {};
let menuPreviews = [];
let lastTs = 0;
let perfAcc = 0, perfFrames = 0, perfTier = 2;

const G = {
  state: 'menu',
  time: 0,
  menuTime: 0,
  wave: 0,
  waveState: 'break',
  breakTimer: 3,
  spawnQueue: [],
  spawnTimer: 0,
  score: 0,
  coins: 0,
  kills: 0,
  charKey: 'knight',
  charKey2: 'archer',
  locKey: 'forest',
  difficulty: 'normal',
  hintT: 0,
  upChoices: [],
  shopOffers: [],
  shopLeft: {},
  curse: null,
  combo: 0,
  comboT: 0,
  bestCombo: 0,
  killsThisWave: 0,
  elapsed: 0,
  endless: false,
  rerolls: 0,
  fxOn: true,
  showFps: false
};

function diff() { return DIFFICULTIES[G.difficulty] || DIFFICULTIES.normal; }
function activePlayers() { return player2 ? [player, player2] : [player]; }

function nearestPlayer(x, y) {
  if (!player2) return player;
  const d1 = Math.hypot(player.x - x, player.y - y);
  const d2 = Math.hypot(player2.x - x, player2.y - y);
  return d1 <= d2 ? player : player2;
}

function curseDmgMult() { return G.curse ? (G.curse.dmg || 1) : 1; }
function curseXpMult() { return G.curse ? (G.curse.xp || 1) : 1; }
function curseCountMult() { return G.curse ? (G.curse.count || 1) : 1; }

/* =============================================================
   ГЕНЕРАЦИЯ МИРА
   ============================================================= */

function buildWorld(seed) {
  const rng = mulberry32(seed);
  tiles = [];
  decor = [];
  torches = [];

  for (let y = 0; y < MAP_H; y++) {
    const row = new Array(MAP_W);
    for (let x = 0; x < MAP_W; x++) row[x] = rng() < 0.32 ? T_GRASS2 : T_GRASS;
    tiles.push(row);
  }

  for (let i = 0; i < LOC.lakes; i++) {
    const cx = 6 + Math.floor(rng() * (MAP_W - 12));
    const cy = 5 + Math.floor(rng() * (MAP_H - 10));
    const rad = 3 + rng() * 3.5;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
        if (d < rad + (rng() - 0.5) * 1.8) tiles[y][x] = T_WATER;
      }
    }
  }

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dC = Math.hypot(x - MAP_W / 2, y - MAP_H / 2);
      if (dC < 7) {
        if (tiles[y][x] === T_WATER) tiles[y][x] = T_GRASS;
        continue;
      }
      if (tiles[y][x] === T_WATER) continue;
      const r = rng();
      if (r < LOC.treeD) tiles[y][x] = T_TREE;
      else if (r < LOC.treeD + LOC.rockD) tiles[y][x] = T_ROCK;
      else if (r < LOC.treeD + LOC.rockD + 0.025) tiles[y][x] = T_DIRT;
      else if (r < LOC.treeD + LOC.rockD + 0.08) tiles[y][x] = T_DECOR;
    }
  }

  /* поляна в центре */
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const d = Math.hypot(x - MAP_W / 2, y - MAP_H / 2);
      if (d < 4.4 && tiles[y][x] !== T_TREE) tiles[y][x] = d < 3 ? T_DIRT : T_GRASS2;
    }
  }

  /* декор */
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      if (t !== T_GRASS && t !== T_GRASS2) continue;
      if (Math.hypot(x - MAP_W / 2, y - MAP_H / 2) < 3.6) continue;
      const r = rng();
      const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
      if (LOC.key === 'ruins') {
        if (r < 0.05) decor.push({ x: px + rnd(-5, 5), y: py + rnd(-2, 4), kind: 'rubble' });
        else if (r < 0.085) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-3, 5), kind: 'column' });
        else if (r < 0.11) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-3, 5), kind: 'brazier', light: true });
      } else if (LOC.key === 'caldera') {
        if (r < 0.05) decor.push({ x: px + rnd(-5, 5), y: py + rnd(-2, 4), kind: 'ash' });
        else if (r < 0.085) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-3, 5), kind: 'emberrock', light: true });
      } else {
        if (r < 0.035) decor.push({ x: px + rnd(-5, 5), y: py + rnd(-3, 5), kind: 'flower', sway: 1 });
        else if (r < 0.07) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-3, 5), kind: 'mushroom' });
        else if (r < 0.09) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-3, 4), kind: 'mushroomLit', light: true });
        else if (r < 0.14) decor.push({ x: px + rnd(-6, 6), y: py + rnd(-2, 4), kind: 'stump' });
      }
    }
  }

  /* факелы по краю поляны */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng();
    const r = 6.5 + rng() * 0.8;
    const x = Math.round(MAP_W / 2 + Math.cos(a) * r);
    const y = Math.round(MAP_H / 2 + Math.sin(a) * r * 0.85);
    if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
    if (solidTile(x, y)) continue;
    tiles[y][x] = T_DECOR;
    torches.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE + 2, ph: rng() * 6 });
  }

  paintWorld();
}

function paintWorld() {
  worldCv = document.createElement('canvas');
  worldCv.width = WORLD_W;
  worldCv.height = WORLD_H;
  const g = worldCv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) paintTile(g, x, y);
}

function paintTile(g, tx, ty) {
  const id = tiles[ty][tx];
  const px = tx * TILE, py = ty * TILE;
  const h = mulberry32((tx * 7919) ^ (ty * 104729) ^ 0x9e3779b9);
  const P = LOC.pal;

  if (id === T_WATER) {
    g.fillStyle = P.water;
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = h() < 0.5 ? P.waterL : P.water;
      g.fillRect(px + Math.floor(h() * TILE), py + Math.floor(h() * TILE), 2, 1);
    }
    if (ty > 0 && tiles[ty - 1][tx] !== T_WATER) {
      g.fillStyle = P.shore; g.fillRect(px, py, TILE, 2);
      g.fillStyle = P.gL; g.fillRect(px, py, TILE, 1);
    }
    if (ty < MAP_H - 1 && tiles[ty + 1][tx] !== T_WATER) { g.fillStyle = P.gD; g.fillRect(px, py + TILE - 2, TILE, 2); }
    if (tx > 0 && tiles[ty][tx - 1] !== T_WATER) { g.fillStyle = P.shore; g.fillRect(px, py, 2, TILE); }
    if (tx < MAP_W - 1 && tiles[ty][tx + 1] !== T_WATER) { g.fillStyle = P.shore; g.fillRect(px + TILE - 2, py, 2, TILE); }
    return;
  }

  if (id === T_DIRT) {
    g.fillStyle = P.dirt;
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = h() < 0.5 ? P.dirtD : P.dirtL;
      g.fillRect(px + Math.floor(h() * TILE), py + Math.floor(h() * TILE), 1, 1);
    }
    return;
  }

  if (id === T_DECOR) {
    g.fillStyle = P.gB;
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = h() < 0.5 ? P.gD : P.gA;
      g.fillRect(px + Math.floor(h() * TILE), py + Math.floor(h() * TILE), 1, 1);
    }
    return;
  }

  const alt = (tx + ty) & 1;
  g.fillStyle = id === T_GRASS2 ? P.gB : (alt ? P.gA : P.gB);
  g.fillRect(px, py, TILE, TILE);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = h() < 0.45 ? P.gD : (h() < 0.75 ? P.gL : P.gA);
    g.fillRect(px + Math.floor(h() * TILE), py + Math.floor(h() * TILE), 1, 1);
  }
  if (h() < 0.1) {
    g.fillStyle = h() < 0.5 ? '#f9e27d' : '#f472b6';
    g.fillRect(px + 2 + Math.floor(h() * 10), py + 2 + Math.floor(h() * 10), 1, 1);
  }

  if (id === T_TREE) { g.fillStyle = P.shadow; g.fillRect(px + 1, py + 3, TILE - 2, TILE - 2); }
  else if (id === T_ROCK) { g.fillStyle = P.shadow; g.fillRect(px + 2, py + 5, 12, 9); }
}

/* ---------------- Столкновения ---------------- */

function solidTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  const t = tiles[ty][tx];
  return t === T_WATER || t === T_TREE || t === T_ROCK;
}

function solidAt(px, py) { return solidTile(Math.floor(px / TILE), Math.floor(py / TILE)); }

function boxBlocked(x, y, r) {
  return solidAt(x - r, y - r) || solidAt(x + r, y - r) ||
         solidAt(x - r, y + r) || solidAt(x + r, y + r) ||
         solidAt(x, y - r) || solidAt(x, y + r) ||
         solidAt(x - r, y) || solidAt(x + r, y);
}

function moveEntity(e, dx, dy, r) {
  if (dx !== 0 && !boxBlocked(e.x + dx, e.y, r)) e.x += dx;
  if (dy !== 0 && !boxBlocked(e.x, e.y + dy, r)) e.y += dy;
  e.x = clamp(e.x, r, WORLD_W - r);
  e.y = clamp(e.y, r, WORLD_H - r);
}

function lineOfSight(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.min(40, Math.ceil(d / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/* =============================================================
   ИГРОКИ
   ============================================================= */

const CTRL = {
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], attack: ['Space'], dash: ['ShiftLeft'], ult: ['KeyQ'] },
  p2: { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], attack: ['Numpad0', 'Period', 'Slash'], dash: ['ShiftRight'], ult: ['Comma', 'Numpad2'] }
};

function makePlayerData(key, index) {
  const c = CHARACTERS[key];
  return {
    charKey: key, index: index, ctrl: index === 0 ? CTRL.p1 : CTRL.p2,
    x: 0, y: 0, r: 5,
    hp: c.hp, maxHp: c.hp, speed: c.speed,
    level: 1, xp: 0, xpNext: 34,
    atkCd: 0, iframes: 0, aim: 0, moving: false, swing: 0, attackAnim: 0,
    taken: {}, dashCd: 0, dashT: 0, dashDirX: 0, dashDirY: 0,
    ult: 0, ultMax: 100, ultActive: 0, regenAcc: 0,
    isMelee: c.weapon === 'melee',
    st: {
      dmg: 1, cd: 1, speed: 1, crit: 0.05, lifesteal: c.lifestealBase || 0,
      pickup: 16, regen: 0, explode: 0, quake: 0, thorns: 0,
      shield: 0, shieldMax: 0, shieldTimer: 0, shieldRegen: 8,
      lastStand: 0, lastStandMax: 0, range: 0, arcMul: 1,
      extra: 0, projSpeed: 1, pierce: 0, xp: 1, greed: 1,
      dashCd: 1.7, ultMul: 1, magnet: 0
    }
  };
}

function startGame(opts) {
  opts = opts || {};
  twoPlayer = !!opts.twoPlayer;
  G.charKey = opts.char1 || G.charKey;
  G.charKey2 = opts.char2 || G.charKey2;
  G.locKey = opts.loc || G.locKey;
  G.difficulty = opts.diff || G.difficulty;
  LOC = LOCATIONS[G.locKey] || LOCATIONS.forest;

  const d = diff();
  const cx = Math.round(WORLD_W / 2);
  const cy = Math.round(WORLD_H / 2);

  G.state = 'playing';
  G.time = 0;
  G.wave = 0;
  G.waveState = 'break';
  G.breakTimer = 3.2;
  G.spawnQueue = [];
  G.spawnTimer = 0;
  G.score = 0;
  G.coins = 0;
  G.kills = 0;
  G.combo = 0;
  G.comboT = 0;
  G.bestCombo = 0;
  G.curse = null;
  G.shopLeft = {};
  G.killsThisWave = 0;
  G.elapsed = 0;
  G.hintT = 11;

  enemies = []; projs = []; eprojs = []; items = []; flyers = [];
  FX.clearAll();

  buildWorld((Math.random() * 1e9) | 0);
  FX.setAmbient(LOC.amb);
  FX.setWeather(LOC.weather);
  FX.resetAmbient();

  player = makePlayerData(G.charKey, 0);
  player.x = cx - (twoPlayer ? 16 : 0);
  player.y = cy;
  player.maxHp = Math.round(CHARACTERS[G.charKey].hp * d.hp);
  player.hp = player.maxHp;

  player2 = null;
  if (twoPlayer) {
    player2 = makePlayerData(G.charKey2, 1);
    player2.x = cx + 16;
    player2.y = cy;
    player2.maxHp = Math.round(CHARACTERS[G.charKey2].hp * d.hp);
    player2.hp = player2.maxHp;
  }

  cam.x = clamp(cx - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  cam.y = clamp(cy - VIEW_H / 2, 0, WORLD_H - VIEW_H);

  ['menu', 'pause', 'end', 'upgrade', 'shop'].forEach(function (k) { els[k].classList.add('hidden'); });
  els.hud.classList.remove('hidden');
  els.p2wrap.classList.toggle('hidden', !twoPlayer);

  drawPortrait(0);
  if (twoPlayer) drawPortrait(1);

  Sfx.unlock();
  Sfx.setMood('battle');
  banner(CHARACTERS[G.charKey].name + (twoPlayer ? ' + ' + CHARACTERS[G.charKey2].name : '') + ' · ' + LOC.name, 2.6);

  SAVE.lastChar = G.charKey;
  SAVE.lastChar2 = G.charKey2;
  SAVE.lastLoc = G.locKey;
  SAVE.lastDiff = G.difficulty;
  persist();
  updateHud();
}

function toMenu() {
  G.state = 'menu';
  G.wave = 0;
  G.spawnQueue.length = 0;
  mouse.down = false;
  ['pause', 'end', 'upgrade', 'shop'].forEach(function (k) { els[k].classList.add('hidden'); });
  els.menu.classList.remove('hidden');
  els.hud.classList.add('hidden');
  hideBanner();
  buildCharCards();
  buildLocCards();
  buildDiffCards();
  updateMenuMeta();
  Sfx.setMood('menu');
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    mouse.down = false;
    syncSettingButtons();
    els.pause.classList.remove('hidden');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    lastTs = 0;
    els.pause.classList.add('hidden');
  }
}

function gameOver() {
  if (G.state !== 'playing') return;
  G.state = 'over';
  mouse.down = false;
  finishRun(false);
  els.endTitle.textContent = 'ПОРАЖЕНИЕ';
  els.endTitle.style.color = '#ff8a8a';
  els.end.classList.remove('hidden');
  els.upgrade.classList.add('hidden');
  els.shop.classList.add('hidden');
  hideBanner();
  Sfx.lose();
  Sfx.setMood('menu');
}

function winGame() {
  if (G.state !== 'playing') return;
  G.state = 'win';
  mouse.down = false;
  finishRun(true);
  els.endTitle.textContent = 'ЛЕС ОЧИЩЕН!';
  els.endTitle.style.color = '#ffe27a';
  els.end.classList.remove('hidden');
  els.upgrade.classList.add('hidden');
  els.shop.classList.add('hidden');
  hideBanner();
  Sfx.win();
  Sfx.setMood('menu');
}

function finishRun(won) {
  SAVE.bestWave = Math.max(SAVE.bestWave || 0, G.wave);
  SAVE.bestScore = Math.max(SAVE.bestScore || 0, G.score);
  SAVE.runs = (SAVE.runs || 0) + 1;
  SAVE.totalCoins = (SAVE.totalCoins || 0) + G.coins;
  persist();

  const ps = activePlayers();
  let rows = '';
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    rows += '<b>' + CHARACTERS[p.charKey].name + '</b> ур. ' + p.level +
      ' · HP ' + Math.ceil(Math.max(0, p.hp)) + '/' + Math.round(p.maxHp) + '<br>';
  }
  els.endText.innerHTML =
    rows + '<span style="color:#8f97c9">' + LOC.name + ' · сложность ' + diff().name + '</span><br>' +
    'Волна <b>' + Math.max(1, G.wave) + '</b>/' + MAX_WAVE +
    ' · время <b>' + fmtTime(G.elapsed) + '</b> · лучшее комбо <b>×' + G.bestCombo + '</b><br>' +
    'Очки <b>' + G.score + '</b> · монеты <b>' + G.coins + '</b> · убито <b>' + G.kills + '</b><br>' +
    '<span style="color:#6c74a8">Рекорд: волна ' + (SAVE.bestWave || 0) + ' · ' + (SAVE.bestScore || 0) + ' очков</span>';
}

/* ---------------- Обновление игроков ---------------- */

function anyKey(list) { for (let i = 0; i < list.length; i++) if (keys[list[i]]) return true; return false; }

function updatePlayer(p, dt, useMouse) {
  const c = CHARACTERS[p.charKey];
  const ctrl = p.ctrl;

  let mx = 0, my = 0;
  if (anyKey(ctrl.up)) my -= 1;
  if (anyKey(ctrl.down)) my += 1;
  if (anyKey(ctrl.left)) mx -= 1;
  if (anyKey(ctrl.right)) mx += 1;
  if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }

  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.dashT > 0) {
    p.dashT -= dt;
    moveEntity(p, p.dashDirX * 430 * dt, p.dashDirY * 430 * dt, p.r);
    FX.trail(p.x, p.y, c.ultColor, 0.22);
    if (Math.random() < 0.6) FX.spawn(p.x, p.y, 1, { color: c.ultColor, speed: 20, life: 0.3, size: 2, light: 0.4 });
  } else {
    p.moving = (mx !== 0 || my !== 0);
    const sp = c.speed * p.st.speed;
    moveEntity(p, mx * sp * dt, my * sp * dt, p.r);
  }

  const aimX = useMouse ? mouse.x + cam.x : p.x + Math.cos(p.lastMoveAng || 0) * 40;
  const aimY = useMouse ? mouse.y + cam.y : p.y + Math.sin(p.lastMoveAng || 0) * 40;
  p.aim = Math.atan2(aimY - p.y, aimX - p.x);
  if (mx !== 0 || my !== 0) p.lastMoveAng = Math.atan2(my, mx);

  if (p.atkCd > 0) p.atkCd -= dt;
  if (p.iframes > 0) p.iframes -= dt;
  if (p.swing > 0) p.swing -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;
  if (p.ultActive > 0) p.ultActive -= dt;

  if (p.st.regen > 0 && p.hp < p.maxHp) {
    p.regenAcc += p.st.regen * dt;
    if (p.regenAcc >= 1) {
      const h = Math.floor(p.regenAcc);
      p.regenAcc -= h;
      p.hp = Math.min(p.maxHp, p.hp + h);
    }
  }

  if (p.st.shieldMax > 0 && p.st.shield < p.st.shieldMax) {
    p.st.shieldTimer += dt;
    if (p.st.shieldTimer >= p.st.shieldRegen) {
      p.st.shieldTimer = 0;
      p.st.shield++;
      FX.ring(p.x, p.y, '#8fd3ff', 6, 18, 0.4);
      Sfx.ui();
    }
  }

  if (p.dashLatch) { /* ждём отпускания */ }
  if (anyKey(ctrl.dash) && !p.dashLatch && p.dashCd <= 0) doDash(p, mx, my);
  if (anyKey(ctrl.ult) && !p.ultLatch && p.ult >= p.ultMax) doUltimate(p);

  const atkPressed = useMouse ? mouse.down : anyKey(ctrl.attack);
  if (atkPressed && p.atkCd <= 0 && p.dashT <= 0) playerAttack(p);

  if (p.st.thorns > 0) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 20 && (!e.thornCd || e.thornCd <= 0)) {
        e.thornCd = 0.6;
        hitEnemy(p, e, p.st.thorns, Math.atan2(e.y - p.y, e.x - p.x), 0, false);
      }
    }
  }
}

function doDash(p, mx, my) {
  p.dashLatch = true;
  let dx = mx, dy = my;
  if (dx === 0 && dy === 0) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
  const l = Math.hypot(dx, dy) || 1;
  p.dashDirX = dx / l;
  p.dashDirY = dy / l;
  p.dashT = 0.17;
  p.dashCd = p.st.dashCd;
  p.iframes = Math.max(p.iframes, 0.26);
  const c = CHARACTERS[p.charKey];
  FX.spawn(p.x, p.y, 10, { color: c.ultColor, speed: 90, life: 0.35, size: 2, light: 0.6 });
  FX.ring(p.x, p.y, c.ultColor, 4, 20, 0.25);
  Sfx.dash();
}

function doUltimate(p) {
  p.ultLatch = true;
  const c = CHARACTERS[p.charKey];
  p.ult = 0;
  p.ultActive = 1.2;
  p.iframes = Math.max(p.iframes, 0.5);
  Sfx.ultimate();
  FX.flash(0.32, c.ultColor);
  FX.shake(6);
  banner(c.ultName, 1.6);
  const k = p.st.ultMul * curseDmgMult();

  if (c.weapon === 'melee' && p.charKey === 'knight') {
    FX.ring(p.x, p.y, c.ultColor, 8, 120, 0.5, 5);
    FX.spawn(p.x, p.y, 40, { color: c.ultColor, speed: 220, life: 0.5, size: 2, light: 0.8 });
    hitAllInRange(p, 120, 200 * k, 16);
  } else if (p.charKey === 'archer') {
    FX.ring(p.x, p.y, c.ultColor, 10, 150, 0.6, 3);
    const list = enemies.slice();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > 160) continue;
      for (let j = 0; j < 7; j++) {
        const a = Math.atan2(e.y - p.y, e.x - p.x) + rnd(-0.35, 0.35);
        pushProj(p, p.x, p.y - 6, a, 340 * p.st.projSpeed, 30 * k, 'arrowP', 'arrow', 1, 2);
      }
    }
  } else if (p.charKey === 'rogue') {
    for (let i = 0; i < 10; i++) flyers.push({ a: (i / 10) * Math.PI * 2, r: 26, spin: 1, dmg: 34 * k, t: 3, hit: {}, owner: p });
    FX.ring(p.x, p.y, c.ultColor, 6, 46, 0.5);
  } else if (p.charKey === 'barbarian') {
    FX.ring(p.x, p.y, c.ultColor, 10, 150, 0.6, 6);
    FX.decal(p.x, p.y, LOC.pal.dirtD, 40, 12);
    FX.spawn(p.x, p.y, 36, { color: '#c29425', speed: 200, life: 0.55, g: 90, size: 2, light: 0.4 });
    hitAllInRange(p, 150, 170 * k, 20);
    FX.shake(9);
  } else if (p.charKey === 'gunner') {
    FX.flash(0.45, '#93c5fd');
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pushProj(p, p.x, p.y - 4, a, 420, 45 * k, 'boltP', 'bolt', 8, 3);
    }
    FX.ring(p.x, p.y, c.ultColor, 6, 60, 0.4);
  } else if (p.charKey === 'spearman') {
    const a = p.aim;
    for (let i = 0; i < 5; i++) pushProj(p, p.x, p.y - 4, a + (i - 2) * 0.12, 400, 52 * k, 'spearShot', 'spear', 4, 3);
    FX.beam(p.x, p.y - 4, a, 120, c.ultColor, 0.35, 8);
    p.dashDirX = Math.cos(a); p.dashDirY = Math.sin(a);
    p.dashT = 0.2;
  } else if (p.charKey === 'reaper') {
    FX.ring(p.x, p.y, c.ultColor, 8, 130, 0.6, 5);
    const list = enemies.slice();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > 130) continue;
      hitEnemy(p, e, 210 * k, Math.atan2(e.y - p.y, e.x - p.x), 10, true);
      p.hp = Math.min(p.maxHp, p.hp + 6);
    }
  } else if (p.charKey === 'pyromant') {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rnd(10, 120);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      FX.ring(x, y, '#fb923c', 2, 26, 0.35);
      FX.spawn(x, y, 8, { color: '#f97316', speed: 60, life: 0.4, g: 60, light: 0.6 });
      const list = enemies.slice();
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (e.dead || Math.hypot(e.x - x, e.y - y) >= 26) continue;
        hitEnemy(p, e, 60 * k, 0, 4, true);
      }
    }
    FX.flash(0.4, '#fb923c');
  }
}

function hitAllInRange(p, rad, dmg, knock) {
  const list = enemies.slice();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) < rad) {
      hitEnemy(p, e, dmg, Math.atan2(e.y - p.y, e.x - p.x), knock, true);
    }
  }
}

function pushProj(owner, x, y, ang, speed, dmg, sprite, kind, pierce, size) {
  const pr = {
    owner: owner, x: x, y: y,
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg: dmg, life: kind === 'bomb' ? 1.3 : 1.9, pierce: pierce,
    kind: kind, sprite: sprite, size: size || 1, hit: {}, trail: kind !== 'bolt'
  };
  projs.push(pr);
  return pr;
}

function playerAttack(p) {
  const c = CHARACTERS[p.charKey];
  p.atkCd = c.cd * p.st.cd;
  p.swing = 0.18;
  p.attackAnim = 0.22;
  const dmg = c.dmg * p.st.dmg * curseDmgMult();

  if (c.weapon === 'melee') {
    const reach = c.range + p.st.range;
    const arc = c.arc * p.st.arcMul;
    const list = enemies.slice();
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.hypot(dx, dy) > reach + e.r) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), p.aim)) < arc) {
        hitEnemy(p, e, dmg, Math.atan2(dy, dx), c.knock || 3, true);
        any = true;
      }
    }
    FX.ring(p.x, p.y - 2, c.ultColor, reach * 0.35, reach, 0.18, 3);
    if (any) FX.shake(1.2);
    Sfx.swing(c.dmg > 50);
    return;
  }

  const shots = 1 + p.st.extra;
  const spread = c.spread || 0.03;
  for (let i = 0; i < shots; i++) {
    const a = p.aim + (shots > 1 ? (i - (shots - 1) / 2) * 0.13 : rnd(-spread, spread));
    pushProj(p, p.x, p.y - 4, a, c.projSpeed * p.st.projSpeed, dmg * (shots > 1 ? 0.82 : 1),
      c.proj, c.weapon, (c.pierce || 0) + p.st.pierce, 1);
  }
  FX.spawn(p.x + Math.cos(p.aim) * 8, p.y - 4, 2, { color: '#ffe9a8', speed: 40, life: 0.16, ang: p.aim, spread: 0.6, light: 0.5 });
  Sfx.shoot(c.weapon);
}

/* =============================================================
   ВРАГИ
   ============================================================= */

function spawnEnemy(type, x, y, opts) {
  const def = ENEMY_TYPES[type];
  if (!def) return null;
  opts = opts || {};

  const wave = Math.max(1, G.wave);
  const d = diff();
  /* мягкое насыщение роста, чтобы бесконечный режим оставался честным */
  const grow = Math.pow(wave - 1, 1.12) * 0.13;
  const hpScale = (def.boss ? 1 + (wave - 1) * 0.035 : 1 + grow) * d.enemyHp * LOC.enemyHp * (opts.hpMul || 1);
  const dmgScale = (1 + Math.pow(wave - 1, 1.08) * 0.045) * d.enemyDmg * LOC.enemyDmg;
  const spdScale = (1 + Math.min(0.55, (wave - 1) * 0.012)) * (G.curse && G.curse.speed ? G.curse.speed : 1);

  let px = x, py = y;
  if (px === undefined) { const s = findSpawnPoint(); px = s.x; py = s.y; }

  const elite = opts.elite ? (ELITES[opts.elite] || null) : null;
  const hp = Math.max(1, Math.round(def.hp * hpScale * (elite ? elite.hp : 1)));

  const e = {
    id: enemySeq++, type: type, def: def,
    x: px, y: py, r: def.r,
    hp: hp, maxHp: hp,
    dmg: def.dmg * dmgScale * (elite ? elite.dmg : 1),
    speed: def.speed * spdScale * (elite ? elite.spd : 1),
    hitCd: 0, hurt: 0, shootCd: rnd(0.7, 2), thornCd: 0,
    aimT: 0, cdirX: 0, cdirY: 0, castT: 0, castA: 0, stuckT: 0, detourT: 0,
    t: 0, phase: Math.random() * 10, facing: 1,
    flying: !!def.flying, hover: def.hover || 0, dead: false,
    elite: elite, dr: elite ? (elite.dr || 0) : 0,
    special: 2.4, special2: 3.4, chargeT: 0, alpha: 1
  };

  enemies.push(e);
  FX.dust(px, py, LOC.pal.gL, 5);
  if (elite) { FX.ring(px, py, elite.color, 4, 30, 0.4); Sfx.elite(); }
  return e;
}

function findSpawnPoint() {
  for (let i = 0; i < 140 && player; i++) {
    const tx = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const ty = 1 + Math.floor(Math.random() * (MAP_H - 2));
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 150 || d > 330) continue;
    if (solidTile(tx, ty)) continue;
    return { x: x, y: y };
  }
  for (let i = 0; i < 110 && player; i++) {
    const ang = rnd(0, Math.PI * 2);
    const dist = rnd(160, 250);
    const x = clamp(player.x + Math.cos(ang) * dist, TILE, WORLD_W - TILE);
    const y = clamp(player.y + Math.sin(ang) * dist, TILE, WORLD_H - TILE);
    if (!solidAt(x, y)) return { x: x, y: y };
  }
  return { x: player ? player.x + 70 : WORLD_W / 2, y: player ? player.y : WORLD_H / 2 };
}

function enemyShoot(e, sprite, ang, speed, dmg, spin, size) {
  eprojs.push({
    x: e.x + Math.cos(ang) * (e.r + 2), y: e.y - 4 + Math.sin(ang) * (e.r + 2),
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg: dmg, r: 3, life: 4, sprite: sprite, spin: !!spin, size: size || 1
  });
}

function fanShot(e, sprite, count, spread, speed, dmgMult, spin) {
  const t = nearestPlayer(e.x, e.y);
  const base = Math.atan2(t.y - e.y, t.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = base + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
    enemyShoot(e, sprite, a, speed, e.dmg * dmgMult, spin);
  }
  Sfx.enemyShoot();
}

function summonMinions(e, type, n) {
  let made = 0;
  const t = nearestPlayer(e.x, e.y);
  for (let i = 0; i < 40 && made < n; i++) {
    const ang = rnd(0, Math.PI * 2);
    const dist = rnd(50, 120);
    const x = clamp(t.x + Math.cos(ang) * dist, TILE, WORLD_W - TILE);
    const y = clamp(t.y + Math.sin(ang) * dist, TILE, WORLD_H - TILE);
    if (solidAt(x, y)) continue;
    spawnEnemy(type, x, y);
    made++;
  }
  if (made) Sfx.summon();
  e.special = 6;
}

function updateEnemy(e, dt) {
  e.t += dt;
  if (e.hitCd > 0) e.hitCd -= dt;
  if (e.hurt > 0) e.hurt -= dt;
  if (e.shootCd > 0) e.shootCd -= dt;
  if (e.thornCd > 0) e.thornCd -= dt;
  if (e.aimT > 0) e.aimT -= dt;

  const t = nearestPlayer(e.x, e.y);
  const dx = t.x - e.x, dy = t.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let dirX = dx / d, dirY = dy / d;
  let sp = e.speed;

  if (e.def.zig) {
    const z = Math.sin(e.t * 7 + e.phase) * 0.9;
    dirX += -dy / d * z; dirY += dx / d * z;
    const l = Math.hypot(dirX, dirY) || 1;
    dirX /= l; dirY /= l;
  }

  if (e.def.charger) {
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      sp *= 2.6;
      dirX = e.cdirX; dirY = e.cdirY;
      if (Math.random() < 0.4) FX.dust(e.x, e.y, LOC.pal.gL, 1);
    } else if (e.aimT > 0) {
      /* телеграф: подсветка перед рывком — игрок успевает уйти */
      e.aimT -= dt;
      e.cdirX = dirX; e.cdirY = dirY;
      sp *= 0.25;
    } else {
      e.special -= dt;
      if (e.special <= 0 && d < 200) {
        e.special = rnd(3.4, 5.5);
        e.aimT = 0.55;
        e.chargeT = 0.85;
        e.cdirX = dirX; e.cdirY = dirY;
        FX.dust(e.x, e.y, LOC.pal.gL, 6);
        Sfx.enemyShoot();
      }
    }
  }

  if (e.def.spitter && e.shootCd <= 0 && d < 210 && lineOfSight(e.x, e.y, t.x, t.y)) {
    e.shootCd = 3.4;
    fanShot(e, 'shardShot', 3, 0.3, 130, 0.9);
  }

  const rg = e.def.ranged;
  if (rg) {
    if (d < rg.min) { dirX = -dirX; dirY = -dirY; sp *= 0.9; }
    else if (d > rg.max) sp *= 1.05;
    else sp *= 0.15;

    if (e.shootCd <= 0 && d < rg.max + 50 && lineOfSight(e.x, e.y, t.x, t.y)) {
      e.shootCd = rg.cd * rnd(0.85, 1.2);
      /* короткая замах-вспышка перед выстрелом */
      e.castT = 0.22;
      e.castA = Math.atan2(dy, dx);
      Sfx.enemyShoot();
    }
    if (e.castT > 0) {
      e.castT -= dt;
      if (e.castT <= 0) {
        const a = (e.castA || 0) + rnd(-0.06, 0.06);
        enemyShoot(e, rg.sprite, a, rg.speed, e.dmg * rg.dmg, rg.spin);
        FX.spawn(e.x + Math.cos(a) * 8, e.y - 4, 2, { color: '#ffd7a8', speed: 40, life: 0.14, ang: a, spread: 0.7, light: 0.4 });
      }
    }
  }

  if (e.def.suicide && d < 22) { killEnemy(e, t); return; }

  if (e.flying) {
    e.x = clamp(e.x + dirX * sp * dt, e.r, WORLD_W - e.r);
    e.y = clamp(e.y + dirY * sp * dt, e.r, WORLD_H - e.r);
  } else {
    const bx = e.x, by = e.y;
    moveEntity(e, dirX * sp * dt, dirY * sp * dt, e.r);
    /* детектор застревания: почти не двигались — обходим вбок */
    const moved = Math.hypot(e.x - bx, e.y - by);
    e.stuckT = (moved < sp * dt * 0.3) ? (e.stuckT || 0) + dt : 0;
    if (e.stuckT > 0.7) {
      if (!e.detourT || e.detourT <= 0) { e.detourT = 0.9; e.detourSide = (Math.random() < 0.5 ? -1 : 1); }
      e.detourT -= dt;
      moveEntity(e, -dirY * e.detourSide * sp * dt, dirX * e.detourSide * sp * dt, e.r);
    } else if (e.detourT > 0) {
      e.detourT -= dt;
    }
    /* совсем застряли — переносим ближе к игроку */
    if (e.stuckT > 4) {
      e.stuckT = 0;
      const a2 = rnd(0, Math.PI * 2);
      const x = clamp(t.x + Math.cos(a2) * 90, TILE, WORLD_W - TILE);
      const y = clamp(t.y + Math.sin(a2) * 90, TILE, WORLD_H - TILE);
      if (!solidAt(x, y)) { e.x = x; e.y = y; FX.dust(e.x, e.y, LOC.pal.gL, 4); }
    }
  }
  if (dirX > 0.15) e.facing = 1; else if (dirX < -0.15) e.facing = -1;

  if (d < e.r + t.r + 1 && e.hitCd <= 0) {
    e.hitCd = 0.8;
    damagePlayer(t, e.dmg);
  }
}

function separateEnemies() {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.r + b.r) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0.0001 || d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = (dx / d) * push, ny = (dy / d) * push;
      if (a.flying) { a.x -= nx; a.y -= ny; b.x += nx; b.y += ny; }
      else {
        const ax = a.x, ay = a.y;
        a.x -= nx; a.y -= ny;
        if (boxBlocked(a.x, a.y, a.r)) { a.x = ax; a.y = ay; }
        const bx = b.x, by = b.y;
        b.x += nx; b.y += ny;
        if (boxBlocked(b.x, b.y, b.r)) { b.x = bx; b.y = by; }
      }
    }
  }
}

/* =============================================================
   БОССЫ
   ============================================================= */

function spawnBoss(key) {
  const def = BOSSES[key];
  if (!def) return null;
  const d = diff();
  const hp = Math.round(def.hp * (0.85 + d.enemyHp * 0.3) * LOC.enemyHp);

  const e = {
    id: enemySeq++, type: 'boss', isBoss: true, bossDef: def,
    def: { r: def.r, color: def.color, score: def.score, coin: def.coin, xp: def.xp, name: def.name, boss: true, anim: def.key },
    x: clamp(player.x + rnd(-70, 70), 60, WORLD_W - 60),
    y: clamp(player.y - 110, 60, WORLD_H - 60),
    r: def.r, hp: hp, maxHp: hp,
    dmg: def.dmg * d.enemyDmg * LOC.enemyDmg, speed: def.speed,
    hitCd: 0, hurt: 0, t: 0, phase: 0, facing: 1,
    flying: !!def.flying, hover: def.hover || 0, dead: false, elite: null,
    special: 2.6, special2: 3.6, special3: 5, chargeT: 0, phaseIdx: 0, rage: false, abilities: def.abilities
  };

  enemies.push(e);
  FX.shake(10);
  FX.flash(0.45, def.color);
  FX.ring(e.x, e.y, def.color, 10, 140, 0.7, 5);
  Sfx.boss();
  Sfx.setMood('boss');
  return e;
}

function updateBoss(e, dt) {
  e.t += dt;
  if (e.hitCd > 0) e.hitCd -= dt;
  if (e.hurt > 0) e.hurt -= dt;

  const frac = e.hp / e.maxHp;
  const newPhase = frac < 0.35 ? 2 : (frac < 0.7 ? 1 : 0);
  if (newPhase > e.phaseIdx) {
    e.phaseIdx = newPhase;
    e.rage = true;
    e.speed *= 1.18;
    FX.ring(e.x, e.y, '#ff5470', 10, 90, 0.5, 4);
    FX.shake(7);
    FX.flash(0.3, '#ff3355');
    FX.text(e.x, e.y - e.r - 10, 'ЯРОСТЬ!', '#ff5470', 9);
    Sfx.elite();
  }

  const t = nearestPlayer(e.x, e.y);
  const dx = t.x - e.x, dy = t.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let dirX = dx / d, dirY = dy / d;
  let sp = e.speed * (1 + e.phaseIdx * 0.12);
  const ab = e.abilities || [];

  if (ab.indexOf('charge') >= 0) {
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      sp *= 2.8;
      dirX = e.cdirX; dirY = e.cdirY;
      if (Math.random() < 0.7) FX.spawn(e.x + rnd(-6, 6), e.y, 1, { color: '#8b95a5', speed: 20, life: 0.4, g: 120, light: 0.2 });
    } else {
      e.special -= dt;
      if (e.special <= 0) {
        e.special = 4.2 - e.phaseIdx * 0.7;
        e.chargeT = 1.1;
        e.cdirX = dirX; e.cdirY = dirY;
        Sfx.boss();
        FX.dust(e.x, e.y, '#8b95a5', 12);
      }
    }
  }

  if (ab.indexOf('rocks') >= 0) {
    e.special2 -= dt;
    if (e.special2 <= 0) { e.special2 = 4 - e.phaseIdx * 0.6; fanShot(e, 'rockShot', 5, 0.34, 120, 1.1); }
  }

  if (ab.indexOf('fire') >= 0) {
    e.special -= dt;
    if (e.special <= 0) {
      e.special = 2.8 - e.phaseIdx * 0.5;
      fanShot(e, 'fireball', 3, 0.22, 115, 0.9);
      FX.spawn(e.x, e.y - 6, 10, { color: '#f97316', speed: 60, life: 0.5, g: -30, light: 0.8 });
      Sfx.enemyShoot();
    }
  }

  if (ab.indexOf('ring') >= 0) {
    e.special2 -= dt;
    if (e.special2 <= 0) {
      e.special2 = 6 - e.phaseIdx;
      for (let i = 0; i < 12; i++) enemyShoot(e, 'fireball', (Math.PI * 2 * i) / 12, 95, e.dmg * 0.6, false, 1.2);
      FX.ring(e.x, e.y, '#f87171', 10, 120, 0.5, 3);
      Sfx.enemyShoot();
    }
  }

  if (ab.indexOf('flap') >= 0) {
    e.special2 -= dt;
    if (e.special2 <= 0) {
      e.special2 = 5.5 - e.phaseIdx * 0.8;
      FX.ring(e.x, e.y, '#fbbf24', 10, 150, 0.55, 4);
      FX.spawn(e.x, e.y, 26, { color: '#f59e0b', speed: 190, life: 0.6, g: 40, light: 0.7 });
      FX.shake(7);
      Sfx.boss();
      if (d < 150) damagePlayer(t, e.dmg * 0.6);
    }
  }

  if (ab.indexOf('summon') >= 0) {
    e.special -= dt;
    if (e.special <= 0) summonMinions(e, 'skeleton', 3 + e.phaseIdx);
  }

  if (ab.indexOf('volley') >= 0 || ab.indexOf('webvolley') >= 0) {
    e.special2 -= dt;
    if (e.special2 <= 0) {
      e.special2 = 4.5 - e.phaseIdx * 0.6;
      fanShot(e, ab.indexOf('webvolley') >= 0 ? 'shardShot' : 'arrowBone', 7, 0.4, 140, 0.85);
    }
  }

  if (ab.indexOf('firewave') >= 0) {
    e.special2 -= dt;
    if (e.special2 <= 0) {
      e.special2 = 5 - e.phaseIdx * 0.6;
      for (let i = 0; i < 9; i++) enemyShoot(e, 'fireball', (Math.PI * 2 * i) / 9, 105, e.dmg * 0.7, false, 1.3);
      FX.ring(e.x, e.y, '#fb923c', 10, 140, 0.55, 4);
      Sfx.explode();
    }
  }

  if (ab.indexOf('bones') >= 0) {
    e.special3 -= dt;
    if (e.special3 <= 0) {
      e.special3 = 6 - e.phaseIdx;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const x = e.x + Math.cos(a) * 40, y = e.y + Math.sin(a) * 40;
        if (solidAt(x, y)) continue;
        FX.ring(x, y, '#fbbf24', 2, 22, 0.35);
        FX.spawn(x, y, 6, { color: '#e6edf9', speed: 50, life: 0.4, g: 40 });
        if (Math.hypot(x - t.x, y - t.y) < 26) damagePlayer(t, e.dmg * 0.8);
      }
      Sfx.explode();
    }
  }

  if (e.flying) {
    e.x = clamp(e.x + dirX * sp * dt, e.r, WORLD_W - e.r);
    e.y = clamp(e.y + dirY * sp * dt, e.r, WORLD_H - e.r);
  } else {
    moveEntity(e, dirX * sp * dt, dirY * sp * dt, e.r);
  }
  if (dirX > 0.15) e.facing = 1; else if (dirX < -0.15) e.facing = -1;

  if (d < e.r + t.r + 2 && e.hitCd <= 0) {
    e.hitCd = 0.9;
    damagePlayer(t, e.dmg);
  }
}

/* =============================================================
   БОЙ
   ============================================================= */

function hitEnemy(src, e, dmg, ang, knock, canCrit) {
  if (!e || e.dead || !src) return;

  let crit = false;
  if (canCrit !== false && Math.random() < src.st.crit) { dmg *= 2; crit = true; }
  if (e.dr) dmg *= 1 - e.dr;

  const dealt = Math.max(1, dmg);
  e.hp -= dealt;
  e.hurt = 0.12;

  FX.hit(e.x, e.y - 4, ang, crit ? '#ffd166' : '#fff2c0', crit ? 1.6 : 0.8);
  FX.text(e.x + rnd(-3, 3), e.y - e.r - 7, Math.round(dealt), crit ? '#ff9f43' : '#ffffff', crit ? 9 : 7);
  if (crit) { FX.crit(e.x, e.y - 4, ang); FX.shake(3); FX.stop(0.04); Sfx.crit(); }
  else Sfx.hit();

  if (ang !== undefined && e.hp > 0 && knock) {
    const k = knock * (1 - (e.def.knockResist || 0));
    const nx = e.x + Math.cos(ang) * k;
    const ny = e.y + Math.sin(ang) * k;
    if (e.flying) { e.x = clamp(nx, e.r, WORLD_W - e.r); e.y = clamp(ny, e.r, WORLD_H - e.r); }
    else if (!boxBlocked(nx, ny, e.r)) { e.x = nx; e.y = ny; }
  }

  if (src.st.lifesteal > 0 && src.hp < src.maxHp) {
    const heal = dealt * src.st.lifesteal;
    if (heal > 0.4) {
      src.hp = Math.min(src.maxHp, src.hp + heal);
      if (Math.random() < 0.3) FX.text(src.x + rnd(-5, 5), src.y - 12, '+' + heal.toFixed(0), '#7dffa8', 7);
    }
  }

  if (e.elite && e.elite.drain) e.hp = Math.min(e.maxHp, e.hp + dealt * 0.12);
  gainUlt(src, dealt * 0.05);

  if (e.hp <= 0) killEnemy(e, src);
}

function killEnemy(e, src) {
  if (!e || e.dead) return;
  e.dead = true;
  G.kills++;
  G.killsThisWave++;
  addCombo(src || player);
  G.score += Math.round(e.def.score * comboMult());

  const isBoss = !!e.isBoss;
  FX.death(e.x, e.y, e.def.color || '#ffffff', isBoss ? 3 : (e.elite ? 2 : 1));
  if (isBoss) {
    FX.ring(e.x, e.y, e.def.color, 10, 180, 0.8, 6);
    FX.flash(0.45, e.def.color);
    FX.shake(12);
    FX.stop(0.1);
    FX.punch(0.94);
    Sfx.bigKill();
    Sfx.setMood('battle');
  } else Sfx.kill();

  const coinMult = diff().coin * LOC.coin * (G.curse && G.curse.coin ? G.curse.coin : 1);
  if (isBoss) {
    for (let i = 0; i < 4; i++) dropItem(e.x + rnd(-20, 20), e.y + rnd(-20, 20), 'coin', Math.round(e.def.coin * coinMult));
    dropItem(e.x, e.y, 'heart');
    dropItem(e.x + 8, e.y + 4, 'gem', Math.round(e.def.xp * LOC.xp));
  } else {
    dropItem(e.x, e.y, 'gem', Math.round(e.def.xp * LOC.xp));
    if (Math.random() < e.def.coin) dropItem(e.x + rnd(-7, 7), e.y + rnd(-7, 7), 'coin', Math.round(coinMult));
    if (Math.random() < 0.05) dropItem(e.x + rnd(-4, 4), e.y + rnd(-4, 4), 'heart');
  }

  const ps = activePlayers();
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    if (p.st.explode > 0) {
      const rad = 24 + p.st.explode * 0.4;
      FX.ring(e.x, e.y, '#ff9f43', 4, rad, 0.35);
      FX.spawn(e.x, e.y, 12, { color: '#ff9f43', speed: 90, life: 0.4, light: 0.6 });
      const list = enemies.slice();
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.dead || o === e) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < rad) hitEnemy(p, o, p.st.explode, undefined, 0, false);
      }
    }
    if (p.st.quake > 0) {
      FX.ring(p.x, p.y, '#ffd166', 6, 48, 0.4);
      const list = enemies.slice();
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.dead) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) < 50) hitEnemy(p, o, p.st.quake, undefined, 0, false);
      }
    }
  }

  if (e.elite && e.elite.boom) {
    FX.ring(e.x, e.y, '#fb923c', 4, 40, 0.4);
    FX.spawn(e.x, e.y, 16, { color: '#f97316', speed: 130, life: 0.45, light: 0.7 });
    Sfx.explode();
    const near = nearestPlayer(e.x, e.y);
    if (Math.hypot(e.x - near.x, e.y - near.y) < 40) damagePlayer(near, 16);
    const list = enemies.slice();
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.dead || o === e) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) < 40) hitEnemy(near, o, 22, undefined, 0, false);
    }
  }

  if (e.def.splitter && !isBoss) {
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, Math.PI * 2);
      const x = e.x + Math.cos(a) * 14, y = e.y + Math.sin(a) * 14;
      if (!solidAt(x, y)) spawnEnemy(e.def.splitter, x, y);
    }
  }

  if (isBoss) {
    SAVE.bossesKilled[e.bossDef.key] = (SAVE.bossesKilled[e.bossDef.key] || 0) + 1;
    persist();
    openUpgrades(3);
  }
}

function addCombo(src) {
  G.combo++;
  G.comboT = 3.2;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) gainUlt(ps[i], 6);
  if (G.combo >= 10 && G.combo % 10 === 0) {
    FX.text((src || player).x, (src || player).y - 28, 'КОМБО ×' + G.combo, '#ffd76a', 10);
    Sfx.combo(G.combo);
  }
}

function comboMult() { return 1 + Math.floor(G.combo / 10) * 0.25; }

function damagePlayer(p, dmg) {
  if (!p || G.state !== 'playing' || p.iframes > 0 || p.dashT > 0) return;

  if (p.st.shield > 0) {
    p.st.shield--;
    p.iframes = 0.5;
    FX.ring(p.x, p.y, '#8fd3ff', 8, 22, 0.35);
    FX.text(p.x, p.y - 18, 'ЩИТ', '#8fd3ff', 8);
    Sfx.block();
    return;
  }

  p.hp -= dmg;
  p.iframes = 0.7;
  FX.shake(4);
  FX.flash(0.22, '#ff3355');
  FX.text(p.x + rnd(-3, 3), p.y - 16, '-' + Math.round(dmg), '#ff8a8a', 8);
  FX.hit(p.x, p.y - 4, rnd(0, 6), '#ff8a8a', 1);
  Sfx.hurt();

  if (p.hp > 0) return;

  if (p.st.lastStand > 0) {
    p.st.lastStand = 0;
    p.hp = 1;
    p.iframes = 1.4;
    FX.ring(p.x, p.y, '#ffe27a', 6, 34, 0.6);
    banner('ПОСЛЕДНИЙ ВСПЛЕСК!', 1.4);
    Sfx.levelUp();
    return;
  }

  p.hp = 0;
  const others = activePlayers().filter(function (x) { return x !== p; });
  const anyAlive = others.length ? others.some(function (x) { return x.hp > 0; }) : false;
  if (!anyAlive) { gameOver(); return; }

  banner('ГЕРОЙ ПАЛ — ОСТАЁТСЯ ДО КОНЦА!', 2.2);
  p.x = clamp(p.x + rnd(-40, 40), 20, WORLD_W - 20);
  p.y = clamp(p.y + rnd(-40, 40), 20, WORLD_H - 20);
  p.hp = Math.round(p.maxHp * 0.25);
  p.iframes = 2.5;
  Sfx.elite();
}

function gainUlt(p, amount) {
  if (!p || p.ult >= p.ultMax) return;
  const before = p.ult;
  p.ult = Math.min(p.ultMax, p.ult + amount);
  if (before < p.ultMax && p.ult >= p.ultMax) {
    FX.ring(p.x, p.y, '#f0abfc', 6, 32, 0.45);
    FX.text(p.x, p.y - 22, 'УЛЬТИМЕЙТ!', '#f0abfc', 8);
    Sfx.levelUp();
  }
}

function gainXp(p, n, x, y) {
  if (!p) return;
  p.xp += n * p.st.xp * curseXpMult();
  FX.text(x, y, '+' + Math.round(n) + ' XP', '#7dd3fc', 7);
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = Math.round(24 + p.level * 16);
    p.maxHp += 7;
    p.hp = Math.min(p.maxHp, p.hp + 12);
    FX.ring(p.x, p.y, '#7dd3fc', 5, 26, 0.4);
    Sfx.levelUp();
  }
}

/* ---------------- Предметы ---------------- */

function dropItem(x, y, kind, amount) {
  if (items.length > 240) items.shift();
  items.push({ x: x, y: y, kind: kind, amt: amount || 5, t: 0, dead: false, vx: rnd(-24, 24), vy: rnd(-24, 24), z: rnd(0, 6) });
}

function updateItems(dt) {
  const ps = activePlayers();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    it.t += dt;
    if (it.t > 18) { it.dead = true; continue; }
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.vx *= 0.92; it.vy *= 0.92;
    it.z += dt * 4;

    let best = null, bd = 1e9, pull = 0;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      const dd = Math.hypot(p.x - it.x, p.y - it.y);
      const pr = p.st.pickup * (p.st.magnet ? 2.2 : 1);
      if (dd < pr) pull = Math.max(pull, pr);
      if (dd < bd) { bd = dd; best = p; }
    }
    if (pull > 0 && best) {
      const dd = Math.hypot(best.x - it.x, best.y - it.y) || 1;
      const sp = 150 * (1 - dd / pull) + 40;
      it.x += ((best.x - it.x) / dd) * sp * dt;
      it.y += ((best.y - it.y) / dd) * sp * dt;
    }

    if (best && bd < 11) {
      it.dead = true;
      if (it.kind === 'heart') {
        best.hp = Math.min(best.maxHp, best.hp + 28);
        FX.text(it.x, it.y - 6, '+28 HP', '#7dffa8', 8);
        Sfx.pickup();
      } else if (it.kind === 'coin') {
        G.coins += it.amt || 1;
        G.score += 25;
        FX.text(it.x, it.y - 6, '+' + (it.amt || 1) + ' ◎', '#ffd76a', 7);
        Sfx.coin();
      } else {
        gainXp(best, it.amt, it.x, it.y - 6);
        if (Math.random() < 0.3) Sfx.pickup();
      }
    }
  }
  items = items.filter(function (i) { return !i.dead; });
}

/* ---------------- Снаряды ---------------- */

function updateProjs(dt) {
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.rot = (p.rot || 0) + dt * (p.spin ? 14 : 0);

    if (p.trail && Math.random() < 0.8) FX.trail(p.x, p.y, p.kind === 'bomb' ? '#fb923c' : '#ffe9a8', 0.18);
    if (p.life <= 0) {
      if (p.kind === 'bomb') explode(p); else FX.spawn(p.x, p.y, 3, { color: '#ffe9a8', speed: 30, life: 0.2 });
      p.dead = true;
      continue;
    }
    if (solidAt(p.x, p.y)) {
      if (p.kind === 'bomb') explode(p); else FX.spawn(p.x, p.y, 2, { color: '#c8b89a', speed: 26, life: 0.2 });
      p.dead = true;
      continue;
    }
    if (p.kind === 'bomb') {
      p.vx *= 0.985; p.vy *= 0.985;
      if (Math.random() < 0.6) FX.spawn(p.x, p.y, 1, { color: '#fb923c', speed: 8, life: 0.3, g: -30, light: 0.4 });
      /* бомба взрывается при столкновении с врагом */
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead) continue;
        if (Math.hypot(p.x - e.x, p.y - (e.y - 4)) < e.r + 4) { explode(p); p.dead = true; break; }
      }
      continue;
    }

    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (e.dead || p.hit[e.id]) continue;
      if (Math.hypot(p.x - e.x, p.y - (e.y - 4)) < e.r + 3) {
        p.hit[e.id] = true;
        hitEnemy(p.owner || player, e, p.dmg, Math.atan2(p.vy, p.vx), p.kind === 'spear' ? 3 : 2, true);
        FX.hit(p.x, p.y, Math.atan2(p.vy, p.vx), '#fff2c0', 0.7);
        if (p.pierce > 0) p.pierce--;
        else { p.dead = true; break; }
      }
    }
  }
  projs = projs.filter(function (p) { return !p.dead; });
}

function explode(p) {
  const owner = p.owner || player;
  const rad = (owner && CHARACTERS[owner.charKey] && CHARACTERS[owner.charKey].splash) || 26;
  FX.ring(p.x, p.y, '#fb923c', 3, rad + 12, 0.35, 3);
  FX.spawn(p.x, p.y, 20, { color: '#f97316', speed: 120, life: 0.5, g: 40, light: 0.8 });
  FX.spawn(p.x, p.y, 10, { color: '#fef08a', speed: 60, life: 0.35, light: 0.9 });
  FX.decal(p.x, p.y, '#3a2418', 6, 6);
  FX.shake(3);
  Sfx.explode();
  const burn = (owner && owner.st.burn) || 0;
  const list = enemies.slice();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) < rad) {
      hitEnemy(owner, e, p.dmg * 1.4, Math.atan2(e.y - p.y, e.x - p.x), 6, true);
      if (burn > 0 && !e.burnT) { e.burnT = 3.5; e.burnDmg = burn; }
    }
  }
}

function updateEprojs(dt) {
  const ps = activePlayers();
  for (let i = 0; i < eprojs.length; i++) {
    const p = eprojs[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.spin) p.rot = (p.rot || 0) + dt * 12;
    if (Math.random() < 0.3) FX.trail(p.x, p.y, '#f87171', 0.2);
    if (p.life <= 0 || solidAt(p.x, p.y)) { p.dead = true; continue; }
    for (let j = 0; j < ps.length; j++) {
      const pl = ps[j];
      if (pl.iframes > 0) continue;
      if (Math.hypot(p.x - pl.x, p.y - (pl.y - 4)) < p.r + pl.r) {
        damagePlayer(pl, p.dmg);
        FX.hit(p.x, p.y, Math.atan2(p.vy, p.vx), '#ff8a8a', 0.8);
        p.dead = true;
        break;
      }
    }
  }
  eprojs = eprojs.filter(function (p) { return !p.dead; });
}

function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t -= dt;
    if (f.t <= 0 || !f.owner) { flyers.splice(i, 1); continue; }
    f.a += f.spin * dt * 2.4;
    const x = f.owner.x + Math.cos(f.a) * f.r;
    const y = f.owner.y + Math.sin(f.a) * f.r * 0.7;
    f.x = x; f.y = y;
    FX.trail(x, y, '#a78bfa', 0.2);
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (e.dead || f.hit[e.id]) continue;
      if (Math.hypot(x - e.x, y - e.y) < e.r + 4) {
        f.hit[e.id] = true;
        hitEnemy(f.owner, e, f.dmg, f.a, 2, true);
      }
    }
  }
}

/* =============================================================
   ВОЛНЫ
   ============================================================= */

function startEndless() {
  els.end.classList.add('hidden');
  els.upgrade.classList.add('hidden');
  els.shop.classList.add('hidden');
  G.endless = true;
  G.waveState = 'break';
  G.breakTimer = 2;
  G.spawnQueue = [];
  G.curse = null;
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) {
    ps[i].hp = ps[i].maxHp;
    ps[i].st.dmg *= 1.1;
  }
  banner('БЕСКОНЕЧНЫЙ РЕЖИМ · ВОЛНА ' + (MAX_WAVE + 1) + ' И ДАЛЬШЕ', 3);
  Sfx.ultimate();
  Sfx.setMood('boss');
  G.state = 'playing';
  lastTs = 0;
}

function applyEra(wave) {
  const e = ERAS.find(function (x) { return wave <= x.upto; }) || ERAS[ERAS.length - 1];
  FX.setAmbient(Math.min(0.85, Math.max(LOC.amb, e.ambient)));
  FX.setWeather(LOC.key === 'caldera' ? 'embers' : LOC.weather);
}

function applyCurse() {
  G.curse = null;
  if (G.wave < 3) return;
  const every = G.difficulty === 'nightmare' ? 3 : 7;
  if (G.wave % every === 0) {
    G.curse = CURSES[(Math.random() * CURSES.length) | 0];
    banner('ПРОКЛЯТИЕ: ' + G.curse.name, 3);
    FX.flash(0.5, '#7c1d1a');
    Sfx.elite();
  }
}

function updateWaves(dt) {
  if (G.waveState === 'break') {
    G.breakTimer -= dt;
    if (G.breakTimer <= 0) startWave(G.wave + 1);
    return;
  }

  G.spawnTimer -= dt;
  if (G.spawnQueue.length > 0 && G.spawnTimer <= 0 && enemies.length < (twoPlayer ? 24 : 16)) {
    const entry = G.spawnQueue.shift();
    const parts = entry.split(':');
    if (parts[0] === '@boss') {
      const bk = bossForWave(G.wave);
      if (bk) spawnBoss(bk);
    } else if (parts[0] === '@elite') {
      spawnEnemy(parts[1], undefined, undefined, { elite: parts[2] });
    } else {
      spawnEnemy(parts[0]);
    }
    G.spawnTimer = Math.max(0.2, 0.65 - G.wave * 0.011);
  }

  if (G.spawnQueue.length === 0 && enemies.length === 0) endWave();

  /* страховка от softlock: слишком долгая волна — стягиваем врагов к игроку */
  G.waveT = (G.waveT || 0) + dt;
  if (G.waveT > 18 && enemies.length <= 8) {
    G.waveT = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.isBoss) continue;
      const t = nearestPlayer(e.x, e.y);
      /* ищем свободную точку рядом с игроком, а не наугад */
      for (let k = 0; k < 14; k++) {
        const a = rnd(0, Math.PI * 2);
        const d = 70 + k * 12;
        const x = clamp(t.x + Math.cos(a) * d, TILE, WORLD_W - TILE);
        const y = clamp(t.y + Math.sin(a) * d, TILE, WORLD_H - TILE);
        if (solidAt(x, y) || boxBlocked(x, y, e.r)) continue;
        e.x = x; e.y = y; e.stuckT = 0; e.detourT = 0;
        FX.dust(x, y, LOC.pal.gL, 5);
        break;
      }
    }
  }
}

function startWave(n) {
  G.wave = n;
  G.waveState = 'active';
  G.killsThisWave = 0;
  G.waveT = 0;
  G.spawnQueue = buildQueue(n);
  G.spawnTimer = 0.4;
  applyEra(n);
  applyCurse();

  const bk = bossForWave(n);
  if (bk) { banner('ВОЛНА ' + n + ' — ' + BOSSES[bk].name + '!', 3); Sfx.boss(); }
  else if (G.curse) { banner('ВОЛНА ' + n + ' · ' + G.curse.name, 2.2); Sfx.elite(); }
  else if (n % 5 === 0) { banner('ВОЛНА ' + n + ' · ЭЛИТЫ', 1.9); Sfx.waveStart(); }
  else { banner('ВОЛНА ' + n, 1.6); Sfx.waveStart(); }
}

function endWave() {
  if (!G.endless && G.wave >= MAX_WAVE) { winGame(); return; }

  G.waveState = 'break';
  G.breakTimer = 3.4;
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) {
    ps[i].maxHp += 5;
    ps[i].hp = Math.min(ps[i].maxHp, ps[i].hp + 20);
    ps[i].st.dmg *= 1.05;
    if (ps[i].st.lastStandMax) ps[i].st.lastStand = 1;
  }
  banner('ВОЛНА ' + G.wave + ' ОЧИЩЕНА · +20 HP', 2.2);
  Sfx.waveClear();
  if (G.wave % 5 === 0) openShop();
  else openUpgrades(1);
}

function waveEnemyCount(n) {
  let base = 6 + Math.round(n * 1.7);
  base = Math.round(base * diff().enemyCount * curseCountMult());
  return clamp(base, 4, 46);
}

function buildQueue(n) {
  const queue = [];
  const bk = bossForWave(n);
  if (bk) queue.push('@boss');

  const total = waveEnemyCount(n);

  const eliteChance = (n % 5 === 0 || n % 7 === 0 ? 0.22 : 0.05) + diff().eliteChance;

  const pool = [];
  const add = function (t, c) { for (let i = 0; i < c; i++) pool.push(t); };

  add('slime', Math.max(2, 8 - Math.floor(n / 3)));
  if (n >= 2) add('goblin', 1 + Math.floor(n / 4));
  if (n >= 3) add('bat', 2 + Math.floor(n / 5));
  if (n >= 4) add('skelArcher', 1 + Math.floor((n - 3) / 3));
  if (n >= 5) add('wolf', 1 + Math.floor((n - 4) / 4));
  if (n >= 6) add('slimeBlue', 1 + Math.floor((n - 5) / 4));
  if (n >= 7) add('spider', 1 + Math.floor((n - 6) / 5));
  if (n >= 8) add('skeleton', 1 + Math.floor((n - 7) / 3));
  if (n >= 9) add('thrower', 1 + Math.floor((n - 8) / 4));
  if (n >= 10) add('crawler', 1 + Math.floor((n - 9) / 5));
  if (n >= 11) add('goblinX', 1 + Math.floor((n - 10) / 4));
  if (n >= 12) add('zombie', 1 + Math.floor((n - 11) / 4));
  if (n >= 14) add('slimeRed', 1 + Math.floor((n - 13) / 5));
  if (n >= 15) add('wraith', 1 + Math.floor((n - 14) / 5));
  if (n >= 17) add('bomber', 1 + Math.floor((n - 16) / 6));
  if (n >= 19) add('brute', 1 + Math.floor((n - 18) / 5));
  if (n >= 21) add('ogre', 1 + Math.floor((n - 20) / 6));

  let guard = 0;
  while (queue.length < total && guard++ < 500) {
    const t = pool[(Math.random() * pool.length) | 0];
    if (Math.random() < eliteChance) queue.push('@elite:' + t + ':' + ELITE_KEYS[(Math.random() * ELITE_KEYS.length) | 0]);
    else queue.push(t);
  }

  const head = queue.shift();
  shuffleArr(queue);
  if (head) queue.unshift(head);
  return queue;
}

/* =============================================================
   УЛУЧШЕНИЯ И ЛАВКА
   ============================================================= */

function openUpgrades(tier) {
  if (!player) return;
  G.state = 'upgrade';
  mouse.down = false;
  G.rerolls = (tier === 3) ? 0 : 1;
  G.upChoices = pickUpgrades(tier);
  renderUpgradeCards(tier);
  els.upgrade.classList.remove('hidden');
  hideBanner();
  Sfx.setMood('menu');
}

function pickUpgrades(tier) {
  const ps = activePlayers().filter(Boolean);
  let anyMelee = false, anyRanged = false;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].isMelee) anyMelee = true; else anyRanged = true;
  }
  if (!ps.length) { anyMelee = true; anyRanged = true; }

  let pool = UPGRADES.filter(function (u) { return tier === 3 ? u.tier === 3 : u.tier <= 2; });
  pool = pool.filter(function (u) {
    if (u.hero) {
      /* уникальные показываем только если такой герой в игре */
      let has = false;
      for (let i = 0; i < ps.length; i++) if (ps[i].charKey === u.hero) has = true;
      return has;
    }
    if (u.only === 'melee') return anyMelee;
    if (u.only === 'ranged') return anyRanged;
    return true;
  });
  pool = pool.filter(function (u) {
    for (let i = 0; i < ps.length; i++) {
      if (u.max && (ps[i].taken[u.id] || 0) >= u.max) return false;
    }
    return true;
  });
  pool = pool.slice();
  shuffleArr(pool);

  const out = [];
  const used = {};
  for (let i = 0; i < pool.length && out.length < 3; i++) {
    if (used[pool[i].id]) continue;
    used[pool[i].id] = true;
    out.push(pool[i]);
  }
  if (out.length < 3) {
    const rest = UPGRADES.filter(function (u) { return !used[u.id]; });
    shuffleArr(rest);
    for (let i = 0; i < rest.length && out.length < 3; i++) out.push(rest[i]);
  }
  return out;
}

function rerollUpgrades() {
  if (G.state !== 'upgrade' || !G.rerolls) return;
  G.rerolls--;
  G.upChoices = pickUpgrades(G.upTier || 1);
  renderUpgradeCards(G.upTier || 1);
  Sfx.ui();
  updateHud();
}

function renderUpgradeCards(tier) {
  G.upTier = tier;
  els.upgradeTitle.textContent = tier === 3 ? 'НАГРАДА ЗА БОССА' : 'ВЫБЕРИ УЛУЧШЕНИЕ';
  els.upgradeSub.textContent = twoPlayer
    ? 'Улучшение получают оба героя · реролл: ' + G.rerolls
    : 'Кликни по карточке или нажми 1 / 2 / 3 · реролл: ' + G.rerolls;
  els.upgradeList.innerHTML = '';
  G.upChoices.forEach(function (u, i) {
    const card = document.createElement('div');
    card.className = 'up-card tier' + u.tier;
    card.innerHTML =
      '<div class="up-key">' + (i + 1) + '</div>' +
      '<div class="up-icon" style="background:' + u.color + '">' + u.icon + '</div>' +
      '<div class="up-name">' + u.name + '</div>' +
      '<div class="up-desc">' + u.desc + '</div>';
    card.addEventListener('click', function () { chooseUpgrade(i); });
    els.upgradeList.appendChild(card);
  });
}

function chooseUpgrade(i) {
  if (G.state !== 'upgrade') return;
  const u = G.upChoices[i];
  if (!u) return;
  const ps = activePlayers();
  for (let k = 0; k < ps.length; k++) {
    u.apply(ps[k]);
    ps[k].taken[u.id] = (ps[k].taken[u.id] || 0) + 1;
  }
  els.upgrade.classList.add('hidden');
  G.state = 'playing';
  lastTs = 0;
  drawPortrait(0);
  if (twoPlayer) drawPortrait(1);
  banner(u.name, 1.4);
  Sfx.upgrade();
  Sfx.setMood('battle');
}

function openShop() {
  G.state = 'shop';
  mouse.down = false;
  const pool = SHOP_ITEMS.slice();
  shuffleArr(pool);
  G.shopOffers = pool.slice(0, 3);
  els.shop.classList.remove('hidden');
  renderShop();
  hideBanner();
  Sfx.shop();
  Sfx.setMood('menu');
}

function shopLeftOf(it) { return G.shopLeft[it.id] == null ? (it.once ? 1 : (it.repeat || 1)) : G.shopLeft[it.id]; }

function renderShop() {
  els.shopCoins.textContent = G.coins;
  els.shopList.innerHTML = '';
  G.shopOffers.forEach(function (it) {
    const left = shopLeftOf(it);
    const can = left > 0 && G.coins >= it.price;
    const card = document.createElement('div');
    card.className = 'up-card shop-card' + (can ? '' : ' off');
    card.innerHTML =
      '<div class="up-icon" style="background:' + it.color + '">' + it.icon + '</div>' +
      '<div class="up-name">' + it.name + '</div>' +
      '<div class="up-desc">' + it.desc + '</div>' +
      '<div class="shop-price">◎ ' + it.price + (left > 1 ? ' · осталось ' + left : '') + '</div>';
    if (can) card.addEventListener('click', function () { buyShopItem(it); });
    els.shopList.appendChild(card);
  });
}

function buyShopItem(it) {
  if (G.state !== 'shop' || G.coins < it.price) return;
  const left = shopLeftOf(it);
  if (left <= 0) return;
  G.coins -= it.price;
  G.shopLeft[it.id] = left - 1;
  const ps = activePlayers();
  for (let k = 0; k < ps.length; k++) it.apply(ps[k]);
  if (it.id === 'coincharm') G.coins += 15;
  renderShop();
  Sfx.buy();
  if (player) FX.text(player.x, player.y - 18, it.name, it.color, 8);
}

function closeShop() {
  if (G.state !== 'shop') return;
  els.shop.classList.add('hidden');
  G.state = 'playing';
  lastTs = 0;
  drawPortrait(0);
  if (twoPlayer) drawPortrait(1);
  Sfx.setMood('battle');
  openUpgrades(1);
}

/* =============================================================
   ГЛАВНЫЙ ЦИКЛ
   ============================================================= */

function update(dt) {
  G.time += dt;
  G.elapsed += dt;

  if (G.hintT > 0) {
    G.hintT -= dt;
    if (G.hintT <= 0) els.hint.classList.add('hidden');
  }
  if (G.comboT > 0) {
    G.comboT -= dt;
    if (G.comboT <= 0) G.combo = 0;
  }

  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) {
    /* сброс «залипающих» рывка/ульты требует отпускания клавиши */
    const ctrl = ps[i].ctrl;
    if (!anyKey(ctrl.dash)) ps[i].dashLatch = false;
    if (!anyKey(ctrl.ult)) ps[i].ultLatch = false;
    updatePlayer(ps[i], dt, ps[i].index === 0);
  }

  updateWaves(dt);

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    if (e.isBoss) updateBoss(e, dt);
    else updateEnemy(e, dt);
  }
  separateEnemies();

  let hasDead = false;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].dead) { hasDead = true; break; }
  if (hasDead) enemies = enemies.filter(function (e) { return !e.dead; });

  updateProjs(dt);
  updateEprojs(dt);
  updateFlyers(dt);
  updateItems(dt);

  FX.update(dt);
  FX.updateWeather(dt, cam, VIEW_W, VIEW_H);
  updateCamera(dt);
  collectLights();
  Sfx.tick(dt);
  miniAcc += dt;
  if (miniAcc > 0.1) { miniAcc = 0; drawMinimap(); }
  updateHud();
}

function updateCamera(dt) {
  const t = player ? (twoPlayer ? { x: (player.x + player2.x) / 2, y: (player.y + player2.y) / 2 } : player) : { x: WORLD_W / 2, y: WORLD_H / 2 };
  const k = Math.min(1, dt * 6);
  cam.x = lerp(cam.x, clamp(t.x - VIEW_W / 2, 0, WORLD_W - VIEW_W), k);
  cam.y = lerp(cam.y, clamp(t.y - VIEW_H / 2, 0, WORLD_H - VIEW_H), k);
}

/* источники света для тёмного прохода */
function collectLights() {
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p) continue;
    FX.light(p.x, p.y - 2, 112, '#ffffff', 0.9, true);
    if (p.ult >= p.ultMax) FX.light(p.x, p.y - 2, 46, '#f0abfc', 0.45 + Math.sin(G.time * 6) * 0.15, true);
  }
  for (let i = 0; i < torches.length; i++) {
    const t = torches[i];
    const fl = 0.8 + Math.sin(G.time * 7 + t.ph) * 0.14 + Math.sin(G.time * 13 + t.ph) * 0.06;
    FX.light(t.x, t.y - 6, 66 * fl, '#ffb347', 0.8);
  }
  for (let i = 0; i < decor.length; i++) {
    const d = decor[i];
    if (!d.light) continue;
    if (d.x < cam.x - 40 || d.x > cam.x + VIEW_W + 40 || d.y < cam.y - 40 || d.y > cam.y + VIEW_H + 40) continue;
    FX.light(d.x, d.y - 3, 22, LOC.key === 'caldera' ? '#fb923c' : '#67e8f9', 0.5 + Math.sin(G.time * 3 + d.x) * 0.12);
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.x < cam.x - 40 || e.x > cam.x + VIEW_W + 40) continue;
    if (e.isBoss) FX.light(e.x, e.y - e.r, 70 + (e.rage ? 30 : 0), e.def.color, 0.55);
    else if (e.elite) FX.light(e.x, e.y - 4, 26, e.elite.color, 0.5);
    else if (e.burnT > 0) FX.light(e.x, e.y - 4, 24, '#fb923c', 0.6);
  }
  for (let i = 0; i < projs.length; i++) {
    const pr = projs[i];
    if (pr.kind === 'bomb') FX.light(pr.x, pr.y, 22, '#fb923c', 0.6);
  }
  for (let i = 0; i < eprojs.length; i++) {
    const pr = eprojs[i];
    if (pr.sprite === 'fireball') FX.light(pr.x, pr.y, 20, '#f97316', 0.55);
  }
  for (let i = 0; i < FX.rings.length; i++) {
    const r = FX.rings[i];
    if (r.t < r.dur * 0.45 && r.r1 > 40) FX.light(r.x, r.y, r.r0 + (r.r1 - r.r0) * (r.t / r.dur), r.color, 0.22);
  }
}

/* =============================================================
   ОТРИСОВКА
   ============================================================= */

function render() {
  ctx.imageSmoothingEnabled = false;
  const shx = FX.shakeX, shy = FX.shakeY;
  const z = FX.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  if (z !== 1) {
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.scale(z, z);
    ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
  }
  ctx.translate(-Math.round(cam.x) + Math.round(shx), -Math.round(cam.y) + Math.round(shy));

  /* тайлы */
  ctx.drawImage(worldCv, 0, 0);

  /* вода (анимация) */
  drawWaterAnim();

  /* декор под сущностями */
  drawDecor(false);

  /* следы на земле */
  FX.drawDecals(ctx);

  /* факелы */
  drawTorches();

  /* предметы */
  for (let i = 0; i < items.length; i++) drawItem(items[i]);

  /* сущности с сортировкой по Y */
  const list = [];
  for (let i = 0; i < enemies.length; i++) list.push({ y: enemies[i].y, e: enemies[i], kind: 'e' });
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) { if (ps[i]) list.push({ y: ps[i].y, e: ps[i], kind: 'p' }); }
  list.sort(function (a, b) { return a.y - b.y; });

  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.kind === 'e') drawEnemy(it.e);
    else drawHero(it.e);
  }

  /* снаряды */
  for (let i = 0; i < projs.length; i++) drawProj(projs[i], false);
  for (let i = 0; i < eprojs.length; i++) drawProj(eprojs[i], true);
  for (let i = 0; i < flyers.length; i++) {
    const f = flyers[i];
    const sp = Sprites.daggerShot;
    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y));
    ctx.rotate(f.a);
    ctx.drawImage(sp, -Math.round(sp.width / 2), -Math.round(sp.height / 2));
    ctx.restore();
  }

  FX.drawRingsAndBeams(ctx);
  FX.drawParts(ctx);
  FX.drawTexts(ctx);

  /* кроны деревьев поверх — дают глубину */
  drawDecor(true);
  drawCanopy();

  ctx.restore();

  /* свет, блум, погода, пост-эффекты */
  FX.drawLightPass(ctx, cam.x, cam.y);
  FX.drawBloom(ctx, cam.x, cam.y);
  FX.drawWeather(ctx);
  FX.drawPost(ctx);

  if (G.state === 'playing' && !twoPlayer) drawCross();
}

function drawWaterAnim() {
  const t = G.time;
  const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + VIEW_W) / TILE);
  const y0 = Math.floor(cam.y / TILE), y1 = Math.ceil((cam.y + VIEW_H) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (tiles[ty][tx] !== T_WATER) continue;
      const px = tx * TILE, py = ty * TILE;
      const ph = Math.sin(t * 1.8 + tx * 1.3 + ty * 2.1);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ph > 0.4 ? LOC.pal.waterL : LOC.pal.water;
      if (ph > 0.4) ctx.fillRect(px + 3, py + 6, 5, 1);
      else if (ph < -0.5) ctx.fillRect(px + 8, py + 11, 4, 1);
      ctx.globalAlpha = 1;
    }
  }
}

function drawDecor(canopy) {
  const t = G.time;
  for (let i = 0; i < decor.length; i++) {
    const d = decor[i];
    if (d.x < cam.x - 24 || d.x > cam.x + VIEW_W + 24 || d.y < cam.y - 24 || d.y > cam.y + VIEW_H + 24) continue;
    const sp = Sprites[d.kind];
    if (!sp) continue;
    const sway = d.sway ? Math.round(Math.sin(t * 2 + d.x * 0.1) * 1) : 0;
    ctx.drawImage(sp, Math.round(d.x - sp.width / 2) + sway, Math.round(d.y - sp.height));
  }
}

function drawTorches() {
  for (let i = 0; i < torches.length; i++) {
    const tr = torches[i];
    if (tr.x < cam.x - 24 || tr.x > cam.x + VIEW_W + 24 || tr.y < cam.y - 24 || tr.y > cam.y + VIEW_H + 24) continue;
    const sp = Sprites.torch;
    ctx.drawImage(sp, Math.round(tr.x - sp.width / 2), Math.round(tr.y - sp.height));
    const fl = Math.sin(G.time * 8 + tr.ph);
    ctx.fillStyle = fl > 0 ? 'rgba(253,230,138,0.85)' : 'rgba(251,191,36,0.7)';
    ctx.fillRect(Math.round(tr.x - 1 + fl), Math.round(tr.y - sp.height - 2), 2, 2);
  }
}

function drawCanopy() {
  const x0 = Math.floor(cam.x / TILE) - 1, x1 = Math.ceil((cam.x + VIEW_W) / TILE);
  const y0 = Math.floor(cam.y / TILE) - 1, y1 = Math.ceil((cam.y + VIEW_H) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (tiles[ty][tx] !== T_TREE) continue;
      const sp = Sprites.treeTop;
      ctx.drawImage(sp, tx * TILE + Math.round(Math.sin(G.time * 1.4 + tx + ty) * 0.6), ty * TILE);
    }
  }
}

function drawShadow(x, y, w) {
  const sp = GLOW.shadow;
  const s = Math.max(8, w * 2.2);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(sp, Math.round(x - s / 2), Math.round(y - s * 0.18), s, s * 0.5);
  ctx.globalAlpha = 1;
}

function drawSpriteAt(sp, x, yb, flip, dy) {
  const sx = Math.round(x - sp.width / 2);
  const sy = Math.round(yb - sp.height) + (dy || 0);
  if (flip) {
    ctx.save();
    ctx.translate(sx + sp.width, sy);
    ctx.scale(-1, 1);
    ctx.drawImage(sp, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sp, sx, sy);
  }
  return { x: sx, y: sy };
}

function drawHero(p) {
  const c = CHARACTERS[p.charKey];
  const t = p.moving ? G.time : 0;
  const mode = p.attackAnim > 0 ? 'atk' : (p.moving ? 'walk' : 'idle');

  drawShadow(p.x, p.y, 9);

  const sp = frameOf(c.sprite, t, mode);
  const inv = p.iframes > 0;
  if (inv) ctx.globalAlpha = (Math.floor(G.time * 20) % 2 === 0) ? 0.45 : 0.75;
  const pos = drawSpriteAt(sp, p.x, p.y + 3, Math.cos(p.aim) < 0, 0);

  /* оружие в стороне прицела */
  const wsp = Sprites[c.overlay];
  if (wsp) {
    const lunge = p.swing > 0 ? 4 : 0;
    const rot = p.aim - Math.PI / 2;
    ctx.save();
    ctx.translate(Math.round(p.x + Math.cos(p.aim) * 3), Math.round(p.y - 5 + Math.sin(p.aim) * 3));
    ctx.rotate(rot);
    const wob = p.swing > 0 ? Math.sin((0.18 - p.swing) / 0.18 * Math.PI) * 0.7 : 0;
    ctx.rotate(wob);
    ctx.drawImage(wsp, -2 + lunge, -Math.round(wsp.height / 2));
    ctx.restore();
  }

  ctx.globalAlpha = 1;

  /* эффекты состояния */
  if (p.dashT > 0) {
    ctx.globalAlpha = 0.35;
    drawSpriteAt(sp, p.x - p.dashDirX * 6, p.y + 3 - p.dashDirY * 6, false, 0);
    ctx.globalAlpha = 1;
  }
  if (p.st.shield > 0) {
    ctx.strokeStyle = 'rgba(143,211,255,' + (0.45 + 0.25 * Math.sin(G.time * 5)) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.ult >= p.ultMax) {
    const a = 0.25 + Math.sin(G.time * 7) * 0.12;
    ctx.strokeStyle = 'rgba(240,171,252,' + a + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 15 + Math.sin(G.time * 5) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  /* метка второго игрока */
  if (p.index === 1) {
    ctx.fillStyle = '#f0abfc';
    ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 20), 2, 2);
  }
  void pos;
}

function drawEnemy(e) {
  const bob = e.flying ? Math.round(Math.sin(e.t * 6 + e.phase) * 2) : 0;
  drawShadow(e.x, e.y, Math.max(8, e.r * 1.6));

  const mode = e.hitCd > 0.7 ? 'walk' : 'walk';
  const sp = frameOf(e.def.anim, e.t, mode);
  if (!sp) return;

  const pos = drawSpriteAt(sp, e.x, e.y + e.r * 0.5 - e.hover, e.facing < 0, -e.hover + bob);

  if (e.elite) {
    ctx.globalAlpha = 0.35 + Math.sin(G.time * 5 + e.phase) * 0.12;
    ctx.strokeStyle = e.elite.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 2, e.r + 3, (e.r + 3) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* телеграф: рывок (красная стрелка) и замах выстрела (вспышка) */
  if (e.aimT > 0) {
    const k = 1 - e.aimT / 0.55;
    ctx.globalAlpha = 0.35 + k * 0.5;
    ctx.strokeStyle = '#ff5470';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - 2);
    ctx.lineTo(e.x + (e.cdirX || 0) * 26, e.y - 2 + (e.cdirY || 0) * 26);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (e.castT > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(G.time * 40) * 0.3;
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(Math.round(e.x - 1), Math.round(e.y - e.r - 4), 2, 2);
    ctx.globalAlpha = 1;
  }
  if (e.rage) {
    ctx.globalAlpha = 0.3 + Math.sin(G.time * 9) * 0.12;
    ctx.strokeStyle = '#ff3355';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - e.r * 0.2, e.r + 7, (e.r + 7) * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (e.hurt > 0) {
    const w = whiteVersion(sp);
    ctx.globalAlpha = clamp(e.hurt / 0.12, 0, 1) * 0.85;
    drawSpriteAt(w, e.x, e.y + e.r * 0.5 - e.hover, e.facing < 0, -e.hover + bob);
    ctx.globalAlpha = 1;
  }

  /* полоска HP */
  if (!e.isBoss && e.hp < e.maxHp) {
    const w = Math.max(12, sp.width - 4);
    const f = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(pos.x + 1, pos.y - 4, w, 3);
    ctx.fillStyle = e.elite ? e.elite.color : (f > 0.4 ? '#6df39a' : (f > 0.2 ? '#ffd76a' : '#ff6b6b'));
    ctx.fillRect(pos.x + 1, pos.y - 4, Math.max(1, Math.round(w * f)), 3);
  }
}

function drawProj(p, enemy) {
  const sp = Sprites[p.sprite] || Sprites.arrowP;
  const ang = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.rotate(ang + (p.rot || 0));
  const s = p.size || 1;
  ctx.drawImage(sp, -Math.round(sp.width * s / 2), -Math.round(sp.height * s / 2),
    Math.round(sp.width * s), Math.round(sp.height * s));
  ctx.restore();
  if (enemy) { /* цвет вражеских снарядов даётся спрайтом */ }
}

function drawItem(it) {
  const sp = Sprites['item_' + it.kind];
  if (!sp) return;
  const bob = Math.round(Math.sin(it.z) * 1.5);
  drawShadow(it.x, it.y, 4);
  ctx.drawImage(sp, Math.round(it.x - sp.width / 2), Math.round(it.y - sp.height + 2 + bob));
}

function drawCross() {
  const x = Math.round(mouse.x), y = Math.round(mouse.y);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - 4, y, 3, 1);
  ctx.fillRect(x + 2, y, 3, 1);
  ctx.fillRect(x, y - 4, 1, 3);
  ctx.fillRect(x, y + 2, 1, 3);
}

/* =============================================================
   ИНТЕРФЕЙС
   ============================================================= */

function banner(text, time) {
  els.banner.textContent = text;
  els.banner.classList.remove('hidden');
  els.banner.classList.remove('pop');
  void els.banner.offsetWidth;
  els.banner.classList.add('pop');
  els.bannerT = time || 2;
}

function hideBanner() {
  els.banner.classList.add('hidden');
  els.bannerT = 0;
}

function drawPortrait(i) {
  const p = i === 0 ? player : player2;
  const cv = i === 0 ? els.portrait : els.portrait2;
  if (!cv || !p) return;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 16, 16);
  const sp = Sprites[CHARACTERS[p.charKey].sprite];
  if (sp) g.drawImage(sp, 0, 0);
}

/* ---------------- Миникарта ---------------- */

let miniCv = null, miniG = null, miniAcc = 0;

function drawMinimap() {
  if (!miniCv) {
    if (!els.minimap) return;
    miniCv = els.minimap;
    miniG = miniCv.getContext('2d');
  }
  if (!miniG) return;
  const W = miniCv.width, H = miniCv.height;
  const sx = W / WORLD_W, sy = H / WORLD_H;

  miniG.clearRect(0, 0, W, H);
  miniG.fillStyle = 'rgba(6,10,20,0.72)';
  miniG.fillRect(0, 0, W, H);

  /* тайлы-препятствия */
  miniG.fillStyle = 'rgba(70,96,130,0.55)';
  const step = 2;
  for (let ty = 0; ty < MAP_H; ty += step) {
    for (let tx = 0; tx < MAP_W; tx += step) {
      const t = tiles[ty][tx];
      if (t === T_TREE || t === T_ROCK) miniG.fillRect(tx * TILE * sx, ty * TILE * sy, TILE * step * sx, TILE * step * sy);
      else if (t === T_WATER) {
        miniG.fillStyle = 'rgba(30,80,140,0.5)';
        miniG.fillRect(tx * TILE * sx, ty * TILE * sy, TILE * step * sx, TILE * step * sy);
        miniG.fillStyle = 'rgba(70,96,130,0.55)';
      }
    }
  }

  /* враги */
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    miniG.fillStyle = e.isBoss ? '#ff5470' : (e.elite ? '#ffd76a' : '#ff8a8a');
    const s = e.isBoss ? 2.5 : 1.2;
    miniG.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
  }
  /* лут */
  for (let i = 0; i < items.length; i++) {
    miniG.fillStyle = items[i].kind === 'heart' ? '#7dffa8' : '#67e8f9';
    miniG.fillRect(items[i].x * sx, items[i].y * sy, 1, 1);
  }
  /* герои */
  const ps = activePlayers();
  for (let i = 0; i < ps.length; i++) {
    if (!ps[i]) continue;
    miniG.fillStyle = i === 0 ? '#ffffff' : '#f0abfc';
    miniG.fillRect(ps[i].x * sx - 1, ps[i].y * sy - 1, 2.5, 2.5);
  }
  /* рамка обзора камеры */
  miniG.strokeStyle = 'rgba(255,255,255,0.25)';
  miniG.strokeRect(cam.x * sx, cam.y * sy, VIEW_W * sx, VIEW_H * sy);
}

function updateHud() {
  if (!player) return;
  const ps = activePlayers();

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const wrap = i === 0 ? els.p1wrap : els.p2wrap;
    const hpFill = i === 0 ? els.hpFill : els.hpFill2;
    const hpText = i === 0 ? els.hpText : els.hpText2;
    const xpFill = i === 0 ? els.xpFill : els.xpFill2;
    const nameEl = i === 0 ? els.heroName : els.heroName2;
    const lvlEl = i === 0 ? els.heroLevel : els.heroLevel2;
    const ultEl = i === 0 ? els.ultFill : els.ultFill2;
    const dashEl = i === 0 ? els.dashPip : els.dashPip2;

    const r = clamp(p.hp / p.maxHp, 0, 1);
    hpFill.style.width = (r * 100).toFixed(1) + '%';
    hpFill.style.background = r > 0.5 ? 'linear-gradient(#6df39a,#1fae54)'
      : (r > 0.25 ? 'linear-gradient(#ffd76a,#e0a12b)' : 'linear-gradient(#ff8f8f,#d33b3b)');
    hpText.textContent = Math.max(0, Math.ceil(p.hp)) + '/' + Math.round(p.maxHp);
    xpFill.style.width = (clamp(p.xp / p.xpNext, 0, 1) * 100).toFixed(1) + '%';
    nameEl.textContent = CHARACTERS[p.charKey].name;
    lvlEl.textContent = p.level;
    ultEl.style.width = (clamp(p.ult / p.ultMax, 0, 1) * 100).toFixed(1) + '%';
    ultEl.style.background = p.ult >= p.ultMax ? 'linear-gradient(#f0abfc,#a855f7)' : 'linear-gradient(#c4b5fd,#6d28d9)';
    dashEl.classList.toggle('ready', p.dashCd <= 0);
  }

  const left = enemies.length + G.spawnQueue.length;
  els.waveText.textContent = 'ВОЛНА ' + Math.max(1, G.wave) + ' / ' + MAX_WAVE;
  els.leftText.textContent = G.waveState === 'break'
    ? 'передышка ' + Math.max(0, G.breakTimer).toFixed(0) + ' с'
    : 'врагов: ' + left;
  els.scoreText.textContent = G.score;
  els.coinText.textContent = G.coins;
  els.timeText.textContent = fmtTime(G.elapsed);

  els.curse.classList.toggle('hidden', !G.curse);
  if (G.curse) {
    els.curse.textContent = '☠ ' + G.curse.name + ' · ' + G.curse.desc;
    els.curse.style.borderColor = G.curse.color;
    els.curse.style.color = G.curse.color;
  }

  els.combo.classList.toggle('hidden', G.combo < 3);
  if (G.combo >= 3) {
    els.combo.textContent = '×' + G.combo;
    els.combo.style.opacity = clamp(G.comboT / 1, 0.25, 1);
    els.combo.style.color = G.combo >= 25 ? '#ff9f43' : '#ffd76a';
  }

  let boss = null;
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].isBoss && !enemies[i].dead) { boss = enemies[i]; break; }
  }
  if (boss) {
    els.bossWrap.classList.remove('hidden');
    els.bossName.textContent = boss.bossDef.name + (boss.rage ? ' · ЯРОСТЬ' : '');
    els.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1) + '%';
    els.bossFill.style.background = boss.rage ? 'linear-gradient(#ff5470,#8b0000)' : 'linear-gradient(#ff9bd2,#a01c66)';
  } else {
    els.bossWrap.classList.add('hidden');
  }
}

/* ---------------- Карточки меню ---------------- */

function buildCharCards() {
  els.charList.innerHTML = '';
  menuPreviews = [];
  HERO_ORDER.forEach(function (key) {
    const c = CHARACTERS[key];
    const unlocked = heroUnlocked(key);
    const card = document.createElement('div');
    card.className = 'char-card' + (key === G.charKey ? ' sel' : '') + (unlocked ? '' : ' locked');

    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16; cv.className = 'char-preview';
    if (unlocked) menuPreviews.push({ g: cv.getContext('2d'), name: c.sprite, i: menuPreviews.length });
    card.appendChild(cv);

    const nm = document.createElement('div');
    nm.className = 'char-name';
    nm.textContent = c.name;
    card.appendChild(nm);

    const rl = document.createElement('div');
    rl.className = 'char-role';
    rl.textContent = c.role;
    card.appendChild(rl);

    const ds = document.createElement('div');
    ds.className = 'char-desc';
    ds.textContent = c.desc + ' · ' + c.ultName;
    card.appendChild(ds);

    const bars = document.createElement('div');
    bars.className = 'char-bars';
    bars.innerHTML =
      statBar('HP', c.hp / 200, '#7dffa8') +
      statBar('УРОН', Math.min(1, (c.dmg / c.cd) / 130), '#ff9f43') +
      statBar('СКОР', c.speed / 115, '#8fd3ff');
    card.appendChild(bars);

    if (unlocked) {
      card.addEventListener('click', function () {
        G.charKey = key;
        refreshSel('charList', 'data-key', key);
        Sfx.ui();
      });
    }
    card.setAttribute('data-key', key);
    els.charList.appendChild(card);
  });
}

function buildChar2Cards() {
  els.charList2.innerHTML = '';
  HERO_ORDER.forEach(function (key) {
    const c = CHARACTERS[key];
    const unlocked = heroUnlocked(key);
    const card = document.createElement('div');
    card.className = 'char-card small' + (key === G.charKey2 ? ' sel' : '') + (unlocked ? '' : ' locked');
    card.setAttribute('data-key', key);

    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16; cv.className = 'char-preview';
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const sp = Sprites[c.sprite];
    if (sp && unlocked) g.drawImage(sp, 0, 0);
    card.appendChild(cv);

    const nm = document.createElement('div');
    nm.className = 'char-name';
    nm.textContent = c.name;
    card.appendChild(nm);

    if (unlocked) {
      card.addEventListener('click', function () {
        G.charKey2 = key;
        refreshSel('charList2', 'data-key', key);
        Sfx.ui();
      });
    }
    els.charList2.appendChild(card);
  });
}

function refreshSel(listId, attr, key) {
  const cards = document.getElementById(listId).querySelectorAll('.char-card');
  for (let i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('sel', cards[i].getAttribute(attr) === key);
  }
}

function buildLocCards() {
  els.locList.innerHTML = '';
  LOC_ORDER.forEach(function (key) {
    const l = LOCATIONS[key];
    const unlocked = locUnlocked(key);
    const card = document.createElement('div');
    card.className = 'loc-card' + (key === G.locKey ? ' sel' : '') + (unlocked ? '' : ' locked');
    card.setAttribute('data-key', key);
    card.innerHTML =
      '<div class="loc-icon">' + l.icon + '</div>' +
      '<div class="loc-name">' + l.name + '</div>' +
      '<div class="loc-desc">' + l.desc + '</div>' +
      '<div class="loc-mods">' +
      '<span class="mod hp">HP врагов ×' + l.enemyHp + '</span>' +
      '<span class="mod dm">урон ×' + l.enemyDmg + '</span>' +
      '<span class="mod co">монеты ×' + l.coin + '</span>' +
      '</div>';
    if (unlocked) {
      card.addEventListener('click', function () {
        G.locKey = key;
        LOC = LOCATIONS[key];
        refreshSel('locList', 'data-key', key);
        Sfx.ui();
      });
    }
    els.locList.appendChild(card);
  });
}

function buildDiffCards() {
  els.diffList.innerHTML = '';
  DIFF_ORDER.forEach(function (key) {
    const d = DIFFICULTIES[key];
    const card = document.createElement('div');
    card.className = 'diff-card' + (key === G.difficulty ? ' sel' : '');
    card.setAttribute('data-key', key);
    card.style.setProperty('--dc', d.color);
    card.innerHTML =
      '<div class="diff-name">' + d.icon + ' ' + d.name + '</div>' +
      '<div class="diff-desc">' + d.desc + '</div>' +
      '<div class="diff-mods">HP ×' + d.hp + ' · враги ×' + d.enemyHp + ' · урон ×' + d.enemyDmg + '</div>';
    card.addEventListener('click', function () {
      G.difficulty = key;
      refreshSel('diffList', 'data-key', key);
      Sfx.ui();
    });
    els.diffList.appendChild(card);
  });
}

function updateMenuMeta() {
  els.metaText.textContent = SAVE.runs
    ? 'Забегов: ' + SAVE.runs + ' · рекорд: волна ' + (SAVE.bestWave || 0) + ' · ' + (SAVE.bestScore || 0) + ' очков · монет собрано: ' + (SAVE.totalCoins || 0)
    : 'Первый забег. Удачи в лесу!';
}

function statBar(label, k, color) {
  return '<div class="sbar"><span>' + label + '</span><i><b style="width:' +
    Math.round(clamp(k, 0.06, 1) * 100) + '%;background:' + color + '"></b></i></div>';
}

function animateMenuPreviews() {
  for (let i = 0; i < menuPreviews.length; i++) {
    const p = menuPreviews[i];
    const g = p.g;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 16, 16);
    const sp = frameOf(p.name, G.menuTime + i * 0.35, 'walk');
    if (sp) g.drawImage(sp, 0, 0);
  }
}

/* =============================================================
   ВВОД
   ============================================================= */

function toCanvasCoords(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) / rect.width * VIEW_W,
    y: (ev.clientY - rect.top) / rect.height * VIEW_H
  };
}

const HOLD_KEYS = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'Period', 'Slash', 'Comma', 'Numpad0', 'Numpad2'];

function bindInput() {
  window.addEventListener('keydown', function (e) {
    if (HOLD_KEYS.indexOf(e.code) >= 0) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') {
      const on = Sfx.toggle();
      if (G.state === 'playing') banner(on ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ', 1.2);
    }
    if (e.code === 'KeyN') {
      const on = Sfx.toggleMusic();
      if (G.state === 'playing') banner(on ? 'МУЗЫКА ВКЛ' : 'МУЗЫКА ВЫКЛ', 1.2);
    }
    if (G.state === 'upgrade') {
      if (e.code === 'Digit1') chooseUpgrade(0);
      if (e.code === 'Digit2') chooseUpgrade(1);
      if (e.code === 'Digit3') chooseUpgrade(2);
      if (e.code === 'KeyR') rerollUpgrades();
    }
    if (G.state === 'shop' && e.code === 'Space') { e.preventDefault(); closeShop(); }
  });

  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    if (G.state === 'playing') togglePause();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.state === 'playing') togglePause();
  });

  canvas.addEventListener('mousemove', function (ev) {
    const p = toCanvasCoords(ev);
    mouse.x = clamp(p.x, 0, VIEW_W);
    mouse.y = clamp(p.y, 0, VIEW_H);
  });

  canvas.addEventListener('mousedown', function (ev) {
    Sfx.unlock();
    if (ev.button === 0) {
      const p = toCanvasCoords(ev);
      mouse.x = clamp(p.x, 0, VIEW_W);
      mouse.y = clamp(p.y, 0, VIEW_H);
      mouse.down = (G.state === 'playing' && !twoPlayer);
    } else if (ev.button === 2) {
      if (player && player.dashCd <= 0 && G.state === 'playing') doDash(player, 0, 0);
    }
  });

  window.addEventListener('mouseup', function (ev) { if (ev.button === 0) mouse.down = false; });
  canvas.addEventListener('mouseleave', function () { mouse.down = false; });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  els.startBtn.addEventListener('click', function () {
    Sfx.unlock();
    els.startBtn.blur();
    startGame({ twoPlayer: twoPlayer, char1: G.charKey, char2: G.charKey2, loc: G.locKey, diff: G.difficulty });
  });
  els.againBtn.addEventListener('click', function () {
    Sfx.unlock();
    els.againBtn.blur();
    startGame({ twoPlayer: twoPlayer, char1: G.charKey, char2: G.charKey2, loc: G.locKey, diff: G.difficulty });
  });
  els.menuBtn.addEventListener('click', function () { els.menuBtn.blur(); toMenu(); });
  els.shopCloseBtn.addEventListener('click', function () { els.shopCloseBtn.blur(); closeShop(); });

  els.mode1.addEventListener('click', function () {
    twoPlayer = false;
    els.mode1.classList.add('sel'); els.mode2.classList.remove('sel');
    els.p2section.classList.add('hidden');
    Sfx.ui();
  });
  els.mode2.addEventListener('click', function () {
    twoPlayer = true;
    els.mode2.classList.add('sel'); els.mode1.classList.remove('sel');
    els.p2section.classList.remove('hidden');
    buildChar2Cards();
    Sfx.ui();
  });

  els.soundBtn.addEventListener('click', function () {
    const on = Sfx.toggle();
    els.soundBtn.textContent = 'Звук: ' + (on ? 'вкл' : 'выкл');
  });
  els.musicBtn.addEventListener('click', function () {
    const on = Sfx.toggleMusic();
    els.musicBtn.textContent = 'Музыка: ' + (on ? 'вкл' : 'выкл');
  });

  els.rerollBtn.addEventListener('click', function () { els.rerollBtn.blur(); rerollUpgrades(); });

  els.endlessBtn.addEventListener('click', function () { els.endlessBtn.blur(); startEndless(); });
  els.endMenuBtn.addEventListener('click', function () { els.endMenuBtn.blur(); toMenu(); });

  els.pSfxBtn.addEventListener('click', function () {
    const on = Sfx.toggle();
    els.pSfxBtn.textContent = 'Звук: ' + (on ? 'вкл' : 'выкл');
    Sfx.ui();
  });
  els.pMusicBtn.addEventListener('click', function () {
    const on = Sfx.toggleMusic();
    els.pMusicBtn.textContent = 'Музыка: ' + (on ? 'вкл' : 'выкл');
  });
  els.pFxBtn.addEventListener('click', function () {
    G.fxOn = !G.fxOn;
    FX.setBloom(!!G.fxOn);
    els.pFxBtn.textContent = 'Эффекты: ' + (G.fxOn ? 'вкл' : 'выкл');
  });
  els.pFpsBtn.addEventListener('click', function () {
    G.showFps = !G.showFps;
    els.fps.classList.toggle('hidden', !G.showFps);
    els.pFpsBtn.textContent = 'FPS: ' + (G.showFps ? 'вкл' : 'выкл');
  });

  syncSettingButtons();
}

function syncSettingButtons() {
  if (!els.pSfxBtn) return;
  els.pSfxBtn.textContent = 'Звук: ' + (Sfx.isEnabled() ? 'вкл' : 'выкл');
  els.pMusicBtn.textContent = 'Музыка: ' + (Sfx.isMusic() ? 'вкл' : 'выкл');
  els.pFxBtn.textContent = 'Эффекты: ' + (G.fxOn !== false ? 'вкл' : 'выкл');
  els.pFpsBtn.textContent = 'FPS: ' + (G.showFps ? 'вкл' : 'выкл');
}

/* =============================================================
   ЦИКЛ И СТАРТ
   ============================================================= */

function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
  lastTs = ts;

  /* адаптивное качество: если стабильно тормозит — упрощаем эффекты */
  if (dt > 0) {
    perfAcc += dt; perfFrames++;
    if (perfAcc >= 1) {
      const avg = perfAcc / perfFrames;
      if (G.showFps && els.fps) els.fps.textContent = Math.round(1 / avg);
      if (G.fxOn === false) {
        FX.setBloom(false);
      } else if (avg > 0.026 && perfTier === 2) { perfTier = 1; FX.setBloom(false); }
      else if (avg > 0.038 && perfTier >= 1) { perfTier = 0; FX.setMaxLights(16); FX.setAmbient(LOC.amb * 0.8); }
      else if (avg < 0.019 && perfTier < 2) { perfTier = 2; FX.setBloom(true); FX.setMaxLights(46); }
      perfAcc = 0; perfFrames = 0;
    }
  }

  if (G.state === 'playing') {
    if (!FX.consumeHitstop()) update(dt);
  } else if (G.state === 'menu') {
    G.menuTime += dt;
    FX.update(dt);
    Sfx.tick(dt);
    animateMenuPreviews();
  }

  if (els.banner && els.bannerT > 0) {
    els.bannerT -= dt;
    if (els.bannerT <= 0) hideBanner();
  }

  if (G.state !== 'paused') render();
  requestAnimationFrame(loop);
}

function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const map = {
    menu: 'menu', pause: 'pauseScreen', end: 'endScreen', upgrade: 'upgradeScreen',
    shop: 'shop', hud: 'hud', banner: 'banner', hint: 'hint',
    charList: 'charList', charList2: 'charList2', locList: 'locList', diffList: 'diffList',
    startBtn: 'startBtn', againBtn: 'againBtn', menuBtn: 'menuBtn',
    shopCloseBtn: 'shopCloseBtn', shopList: 'shopList', shopCoins: 'shopCoins',
    mode1: 'mode1', mode2: 'mode2', p2section: 'p2section',
    portrait: 'portrait', portrait2: 'portrait2',
    heroName: 'heroName', heroName2: 'heroName2', heroLevel: 'heroLevel', heroLevel2: 'heroLevel2',
    hpFill: 'hpFill', hpText: 'hpText', hpFill2: 'hpFill2', hpText2: 'hpText2',
    xpFill: 'xpFill', xpFill2: 'xpFill2', ultFill: 'ultFill', ultFill2: 'ultFill2',
    dashPip: 'dashPip', dashPip2: 'dashPip2',
    p1wrap: 'p1wrap', p2wrap: 'p2wrap',
    waveText: 'waveText', leftText: 'leftText', scoreText: 'scoreText',
    coinText: 'coinText', timeText: 'timeText',
    bossWrap: 'bossWrap', bossName: 'bossName', bossFill: 'bossFill',
    curse: 'curse', combo: 'combo', minimap: 'minimap', fps: 'fps',
    upgradeTitle: 'upgradeTitle', upgradeSub: 'upgradeSub', upgradeList: 'upgradeList',
    endTitle: 'endTitle', endText: 'endText', metaText: 'metaText',
    rerollBtn: 'rerollBtn', endlessBtn: 'endlessBtn', endMenuBtn: 'endMenuBtn',
    pSfxBtn: 'pSfxBtn', pMusicBtn: 'pMusicBtn', pFxBtn: 'pFxBtn', pFpsBtn: 'pFpsBtn',
    soundBtn: 'soundBtn', musicBtn: 'musicBtn'
  };
  Object.keys(map).forEach(function (k) {
    const el = document.getElementById(map[k]);
    if (!el) console.warn('missing element: #' + map[k]);
    els[k] = el;
  });

  loadSave();
  G.charKey = heroUnlocked(SAVE.lastChar) ? SAVE.lastChar : 'knight';
  G.charKey2 = heroUnlocked(SAVE.lastChar2) ? SAVE.lastChar2 : 'archer';
  G.locKey = locUnlocked(SAVE.lastLoc) ? SAVE.lastLoc : 'forest';
  G.difficulty = SAVE.lastDiff || 'normal';

  buildSprites();
  buildWorld((Math.random() * 1e9) | 0);
  FX.setAmbient(LOC.amb);
  FX.setWeather(LOC.weather);
  FX.resetAmbient();
  bindInput();
  toMenu();
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}