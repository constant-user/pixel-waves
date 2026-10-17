'use strict';

/* =============================================================
   PIXELWAVES — АТЛАС СПРАЙТОВ (процедурный)

   Все спрайты рисуются кодом примитивами (прямоугольники,
   круги, градиенты). Никаких внешних изображений и карт,
   поэтому ничего не может «сломаться» из-за выравнивания.

   canvas: 320x180, тайл 16px, спрайты 16..32px
   ============================================================= */

/* ---------------- Примитивы ---------------- */

function mkCv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

function ctx2d(cv) { return cv.getContext('2d'); }

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const gg = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')';
}

/* прямоугольник с альфой */
function P(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/* тёмный пиксель-контур: обводит непрозрачные пиксели */
function autoOutline(src, color, alpha) {
  const w = src.width, h = src.height;
  const sil = mkCv(w, h);
  const sg = ctx2d(sil);
  sg.drawImage(src, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = color || '#05070f';
  sg.fillRect(0, 0, w, h);

  const out = mkCv(w + 2, h + 2);
  const g = ctx2d(out);
  g.globalAlpha = alpha == null ? 0.75 : alpha;
  g.drawImage(sil, 0, 1); g.drawImage(sil, 2, 1);
  g.drawImage(sil, 1, 0); g.drawImage(sil, 1, 2);
  g.globalAlpha = 1;
  g.drawImage(src, 1, 1);
  return out;
}

/* сдвиг нижней половины (шаг/приседание) */
function shiftBand(src, y0, y1, dx) {
  const c = mkCv(src.width, src.height);
  const g = ctx2d(c);
  g.drawImage(src, 0, y0, src.width, y1 - y0, dx, y0, src.width, y1 - y0);
  return c;
}

/* мягкое радиальное свечение */
function makeGlow(size, color, power) {
  const c = mkCv(size, size);
  const g = ctx2d(c);
  const r = size / 2;
  const p = power == null ? 0.55 : power;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, hexA(color, 0.95));
  grd.addColorStop(p * 0.5, hexA(color, 0.45));
  grd.addColorStop(p, hexA(color, 0.12));
  grd.addColorStop(1, hexA(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

function makeShadowBlob() {
  const c = mkCv(48, 24);
  const g = ctx2d(c);
  const grd = g.createRadialGradient(24, 12, 0, 24, 12, 24);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.24)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(24, 12, 24, 12, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

function shade(hex, amt) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let gg = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  if (amt > 0) { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt; }
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(gg) + c(b);
}

function mix(a, b, t) {
  const pa = a.replace('#', ''), pb = b.replace('#', '');
  const c = v => Math.round(v).toString(16).padStart(2, '0');
  const lerp = (x, y) => parseInt(x, 16) + (parseInt(y, 16) - parseInt(x, 16)) * t;
  return '#' + c(lerp(pa.slice(0, 2), pb.slice(0, 2))) + c(lerp(pa.slice(2, 4), pb.slice(3 - 1))) + c(lerp(pa.slice(4, 6), pb.slice(4, 6)));
}

/* =============================================================
   ГЕРОИ — параметризованный гуманоид 16x16
   ============================================================= */

function makeHero(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const skin = cfg.skin || '#f0c193';
  const skinD = shade(skin, -0.28);
  const main = cfg.main;
  const mainD = shade(main, -0.32);
  const mainL = shade(main, 0.22);
  const trim = cfg.trim || '#fbbf24';

  /* ноги */
  P(g, 5, 12, 3, 3, mainD);
  P(g, 8, 12, 3, 3, mainD);
  P(g, 5, 14, 3, 1, shade(mainD, -0.4));
  P(g, 8, 14, 3, 1, shade(mainD, -0.4));

  /* торс */
  P(g, 4, 7, 8, 5, main);
  P(g, 4, 7, 8, 1, mainL);
  P(g, 3, 8, 1, 3, mainD);
  P(g, 12, 8, 1, 3, mainD);
  P(g, 4, 11, 8, 1, mainD);

  /* ремень / акцент */
  if (cfg.belt !== false) P(g, 4, 10, 8, 1, trim);

  /* плащ/накидка */
  if (cfg.cape) {
    P(g, 3, 7, 10, 1, cfg.cape);
    P(g, 2, 8, 1, 4, shade(cfg.cape, -0.25));
    P(g, 13, 8, 1, 4, shade(cfg.cape, -0.25));
  }

  /* руки */
  const arm = cfg.armor ? main : skin;
  P(g, 3, 8, 1, 3, arm);
  P(g, 12, 8, 1, 3, arm);
  if (cfg.armor) { P(g, 3, 8, 1, 1, mainL); P(g, 12, 8, 1, 1, mainL); }

  /* шея + голова */
  P(g, 6, 6, 4, 1, skinD);
  P(g, 5, 2, 6, 4, skin);
  P(g, 5, 5, 6, 1, skinD);

  /* глаза */
  if (cfg.eyes !== false) {
    P(g, 6, 4, 1, 1, cfg.eye || '#1a2436');
    P(g, 9, 4, 1, 1, cfg.eye || '#1a2436');
  }

  /* шлем / головной убор */
  const helm = cfg.helm;
  if (helm === 'knight') {
    P(g, 4, 1, 8, 3, '#9fb0cc');
    P(g, 4, 1, 8, 1, '#cdd8ea');
    P(g, 4, 3, 8, 1, '#5b6a8a');
    P(g, 5, 4, 6, 1, '#2b3245');
    P(g, 6, 2, 4, 1, '#ffd166');
    P(g, 7, 0, 2, 1, '#ffd166');
  } else if (helm === 'hood') {
    P(g, 4, 1, 8, 4, cfg.hoodColor || shade(main, -0.1));
    P(g, 4, 1, 8, 1, shade(cfg.hoodColor || main, 0.18));
    P(g, 5, 4, 6, 2, '#0a0e18');
    P(g, 6, 4, 1, 1, cfg.eye || '#7dd3fc');
    P(g, 9, 4, 1, 1, cfg.eye || '#7dd3fc');
    P(g, 3, 5, 10, 1, shade(cfg.hoodColor || main, -0.3));
  } else if (helm === 'bandana') {
    P(g, 5, 1, 6, 2, cfg.trim);
    P(g, 4, 2, 8, 1, shade(cfg.trim, -0.25));
    P(g, 2, 2, 2, 1, shade(cfg.trim, -0.35));
  } else if (helm === 'helm') {
    P(g, 4, 1, 8, 3, '#8f9db3');
    P(g, 4, 1, 8, 1, '#c7d2e0');
    P(g, 4, 3, 8, 1, '#4b5563');
    P(g, 5, 2, 6, 1, '#5f6b7d');
  } else if (helm === 'horns') {
    P(g, 4, 1, 8, 3, mainD);
    P(g, 4, 1, 8, 1, mainL);
    P(g, 2, 0, 2, 2, trim);
    P(g, 12, 0, 2, 2, trim);
    P(g, 2, 0, 1, 1, shade(trim, 0.3));
    P(g, 13, 0, 1, 1, shade(trim, 0.3));
  } else if (helm === 'crown') {
    P(g, 5, 1, 6, 2, trim);
    P(g, 5, 0, 1, 2, shade(trim, 0.35));
    P(g, 8, 0, 1, 2, shade(trim, 0.35));
    P(g, 11, 0, 1, 2, shade(trim, 0.35));
  }

  /* дополнительные детали */
  if (cfg.quiver) {
    P(g, 11, 5, 2, 5, '#4a3524');
    P(g, 11, 4, 2, 1, '#8a5a2b');
    P(g, 12, 3, 1, 2, '#e8edf5');
  }
  if (cfg.shield) {
    P(g, 1, 7, 3, 5, '#d4a72c');
    P(g, 1, 7, 3, 1, '#f2d16b');
    P(g, 2, 8, 1, 3, '#8a6a12');
  }
  if (cfg.pauldron) {
    P(g, 3, 7, 2, 2, shade(main, 0.3));
    P(g, 11, 7, 2, 2, shade(main, 0.3));
  }
  if (cfg.emissive) {
    P(g, 6, 4, 1, 1, cfg.emissive);
    P(g, 9, 4, 1, 1, cfg.emissive);
  }

  return cv;
}

/* =============================================================
   ВРАГИ
   ============================================================= */

function makeSlime(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const base = cfg.color;
  const dark = shade(base, -0.35);
  const light = shade(base, 0.4);
  P(g, 4, 6, 8, 7, base);
  P(g, 3, 9, 10, 4, base);
  P(g, 2, 11, 12, 2, base);
  P(g, 4, 5, 8, 1, light);
  P(g, 3, 8, 10, 1, light);
  P(g, 2, 12, 12, 1, dark);
  P(g, 6, 9, 1, 2, '#0b1b10');
  P(g, 9, 9, 1, 2, '#0b1b10');
  P(g, 5, 5, 2, 2, 'rgba(255,255,255,0.45)');
  return cv;
}

function makeBat(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const body = cfg.color;
  const wing = shade(body, -0.3);
  /* крылья */
  P(g, 0, 5, 5, 1, wing);
  P(g, 0, 6, 4, 2, wing);
  P(g, 1, 8, 3, 1, shade(wing, -0.2));
  P(g, 11, 5, 5, 1, wing);
  P(g, 12, 6, 4, 2, wing);
  P(g, 12, 8, 3, 1, shade(wing, -0.2));
  /* тело */
  P(g, 6, 5, 4, 6, body);
  P(g, 6, 5, 4, 1, shade(body, 0.3));
  P(g, 7, 4, 2, 2, body);
  P(g, 7, 7, 1, 1, '#fde68a');
  P(g, 9, 7, 1, 1, '#fde68a');
  P(g, 5, 10, 2, 1, shade(body, -0.2));
  P(g, 9, 10, 2, 1, shade(body, -0.2));
  return cv;
}

function makeSpider(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const body = cfg.color;
  const dark = shade(body, -0.3);
  /* лапы */
  P(g, 1, 3, 2, 1, dark); P(g, 0, 4, 2, 1, dark);
  P(g, 13, 3, 2, 1, dark); P(g, 14, 4, 2, 1, dark);
  P(g, 1, 11, 2, 1, dark); P(g, 0, 10, 2, 1, dark);
  P(g, 13, 11, 2, 1, dark); P(g, 14, 10, 2, 1, dark);
  /* брюшко */
  P(g, 5, 6, 6, 7, body);
  P(g, 6, 5, 4, 1, shade(body, 0.25));
  P(g, 5, 11, 6, 2, dark);
  /* узор */
  P(g, 7, 8, 2, 3, cfg.mark || '#f43f5e');
  /* голова + глаза */
  P(g, 6, 3, 4, 3, dark);
  P(g, 6, 4, 1, 1, '#f87171');
  P(g, 9, 4, 1, 1, '#f87171');
  return cv;
}

function makeWolf(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const f = cfg.color;
  const dark = shade(f, -0.35);
  const light = shade(f, 0.3);
  P(g, 3, 6, 9, 6, f);
  P(g, 3, 6, 9, 1, light);
  P(g, 3, 11, 9, 1, dark);
  /* голова */
  P(g, 11, 4, 4, 4, f);
  P(g, 12, 3, 2, 1, dark);
  P(g, 14, 5, 2, 2, dark);
  P(g, 12, 5, 1, 1, cfg.eye || '#fbbf24');
  /* хвост */
  P(g, 1, 5, 2, 2, dark);
  P(g, 0, 4, 1, 2, dark);
  /* ноги */
  P(g, 4, 12, 2, 2, dark);
  P(g, 9, 12, 2, 2, dark);
  return cv;
}

function makeHumanoid(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const skin = cfg.skin;
  const skinD = shade(skin, -0.3);
  const main = cfg.main;
  const mainD = shade(main, -0.32);

  P(g, 5, 12, 3, 3, mainD);
  P(g, 8, 12, 3, 3, mainD);
  P(g, 4, 7, 8, 5, main);
  P(g, 4, 7, 8, 1, shade(main, 0.2));
  P(g, 4, 11, 8, 1, mainD);
  P(g, 3, 8, 1, 3, skin);
  P(g, 12, 8, 1, 3, skin);
  P(g, 6, 6, 4, 1, skinD);
  P(g, 5, 2, 6, 4, skin);
  P(g, 5, 5, 6, 1, skinD);

  if (cfg.eyeGlow) {
    P(g, 6, 4, 1, 1, cfg.eyeGlow);
    P(g, 9, 4, 1, 1, cfg.eyeGlow);
  } else {
    P(g, 6, 4, 1, 1, '#1a2436');
    P(g, 9, 4, 1, 1, '#1a2436');
  }

  /* рёбра / кости */
  if (cfg.bones) {
    for (let i = 0; i < 3; i++) P(g, 5, 8 + i * 1.4, 6, 1, shade(skin, 0.25));
    P(g, 7, 7, 2, 5, shade(skin, -0.15));
  }
  /* рога/гребень */
  if (cfg.horn) {
    P(g, 4, 0, 2, 2, cfg.horn);
    P(g, 10, 0, 2, 2, cfg.horn);
  }
  if (cfg.crest) P(g, 6, 0, 4, 2, cfg.crest);
  if (cfg.helmet) {
    P(g, 4, 1, 8, 3, cfg.helmet);
    P(g, 4, 1, 8, 1, shade(cfg.helmet, 0.3));
    P(g, 4, 3, 8, 1, shade(cfg.helmet, -0.35));
  }
  if (cfg.glowMark) {
    P(g, 7, 8, 2, 2, cfg.glowMark);
  }
  if (cfg.pauldron) {
    P(g, 2, 7, 2, 2, shade(main, 0.25));
    P(g, 12, 7, 2, 2, shade(main, 0.25));
  }
  return cv;
}

function makeWraith(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const body = cfg.color;
  const light = shade(body, 0.35);
  /* призрачный «шлейф» снизу */
  for (let i = 0; i < 16; i++) {
    const w = 8 - Math.abs(8 - i) * 0.6;
    if (w <= 0) continue;
    const h = 2 + (i % 3);
    g.globalAlpha = 0.5 - Math.abs(7.5 - i) * 0.04;
    P(g, 8 - w / 2, 15 - h, w, h, body);
  }
  g.globalAlpha = 1;
  /* капюшон */
  P(g, 4, 2, 8, 6, body);
  P(g, 4, 2, 8, 1, light);
  P(g, 3, 4, 10, 5, body);
  P(g, 5, 5, 6, 3, '#07070f');
  P(g, 6, 6, 1, 1, cfg.eye);
  P(g, 9, 6, 1, 1, cfg.eye);
  /* руки-когти */
  P(g, 1, 8, 2, 3, light);
  P(g, 13, 8, 2, 3, light);
  return cv;
}

function makeCrawler(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const body = cfg.color;
  const dark = shade(body, -0.3);
  /* щупальца */
  P(g, 2, 3, 2, 2, dark);
  P(g, 12, 3, 2, 2, dark);
  P(g, 4, 1, 1, 3, dark);
  P(g, 11, 1, 1, 3, dark);
  /* тело */
  P(g, 4, 5, 8, 7, body);
  P(g, 5, 4, 6, 1, shade(body, 0.25));
  P(g, 4, 11, 8, 2, dark);
  /* пасть */
  P(g, 6, 9, 4, 3, '#2a0a18');
  for (let i = 0; i < 4; i++) P(g, 6 + i, 9, 1, 1, cfg.eye);
  P(g, 6, 5, 1, 1, cfg.eye);
  P(g, 9, 5, 1, 1, cfg.eye);
  return cv;
}

function makeBomber(cfg) {
  const cv = mkCv(16, 16);
  const g = ctx2d(cv);
  const body = cfg.main;
  const dark = shade(body, -0.3);
  P(g, 5, 12, 3, 3, dark);
  P(g, 8, 12, 3, 3, dark);
  P(g, 4, 7, 8, 5, body);
  P(g, 4, 7, 8, 1, shade(body, 0.2));
  P(g, 3, 8, 1, 3, body);
  P(g, 12, 8, 1, 3, body);
  P(g, 5, 2, 6, 4, '#7f9c6a');
  P(g, 6, 4, 1, 1, cfg.eye);
  P(g, 9, 4, 1, 1, cfg.eye);
  /* взрывчатка на голове */
  P(g, 6, 0, 4, 2, cfg.charge);
  P(g, 7, 0, 2, 1, shade(cfg.charge, 0.4));
  P(g, 6, 7, 4, 1, cfg.charge);
  return cv;
}

/* =============================================================
   БОССЫ (крупные, 24..32 px)
   ============================================================= */

function makeGolem() {
  const cv = mkCv(28, 28);
  const g = ctx2d(cv);
  const stone = '#6b7280';
  const light = '#9ca3af';
  const dark = '#4b5563';
  const deep = '#374151';
  P(g, 4, 18, 9, 9, dark);
  P(g, 15, 18, 9, 9, dark);
  P(g, 4, 25, 9, 2, deep);
  P(g, 15, 25, 9, 2, deep);
  P(g, 3, 8, 22, 12, stone);
  P(g, 3, 8, 22, 1, light);
  P(g, 3, 19, 22, 1, deep);
  P(g, 1, 10, 3, 8, dark);
  P(g, 24, 10, 3, 8, dark);
  P(g, 1, 10, 3, 1, light);
  P(g, 24, 10, 3, 1, light);
  /* кристаллы */
  P(g, 7, 11, 4, 4, '#7c3aed');
  P(g, 8, 12, 2, 2, '#a78bfa');
  P(g, 17, 11, 4, 4, '#7c3aed');
  P(g, 18, 12, 2, 2, '#a78bfa');
  /* голова */
  P(g, 8, 1, 12, 8, stone);
  P(g, 8, 1, 12, 1, light);
  P(g, 8, 8, 12, 1, deep);
  P(g, 10, 4, 3, 2, '#22d3ee');
  P(g, 15, 4, 3, 2, '#22d3ee');
  P(g, 11, 4, 1, 2, '#e0f2fe');
  P(g, 16, 4, 1, 2, '#e0f2fe');
  P(g, 12, 7, 4, 1, '#facc15');
  return cv;
}

function makeSkKing() {
  const cv = mkCv(26, 28);
  const g = ctx2d(cv);
  const bone = '#e6edf9';
  const boneD = '#c3cddb';
  const gold = '#fbbf24';
  /* мантия */
  P(g, 4, 12, 18, 13, '#1e1b4b');
  P(g, 4, 12, 18, 1, '#312e81');
  P(g, 2, 16, 2, 9, '#1e1b4b');
  P(g, 22, 16, 2, 9, '#1e1b4b');
  P(g, 6, 24, 14, 2, '#0f0f23');
  /* рёбра */
  for (let i = 0; i < 4; i++) P(g, 8, 14 + i * 2, 10, 1, boneD);
  P(g, 12, 12, 2, 11, bone);
  /* череп */
  P(g, 8, 3, 10, 9, bone);
  P(g, 8, 3, 10, 1, '#ffffff');
  P(g, 8, 11, 10, 1, boneD);
  P(g, 9, 6, 3, 3, '#111827');
  P(g, 14, 6, 3, 3, '#111827');
  P(g, 10, 7, 1, 1, '#22d3ee');
  P(g, 15, 7, 1, 1, '#22d3ee');
  P(g, 12, 10, 2, 1, boneD);
  /* корона */
  P(g, 7, 1, 12, 2, gold);
  P(g, 7, 0, 1, 2, '#fde68a');
  P(g, 12, 0, 1, 2, '#fde68a');
  P(g, 17, 0, 1, 2, '#fde68a');
  P(g, 7, 2, 12, 1, '#b45309');
  return cv;
}

function makeDragon() {
  const cv = mkCv(34, 30);
  const g = ctx2d(cv);
  const red = '#dc2626';
  const dark = '#991b1b';
  const light = '#f87171';
  const belly = '#fb923c';
  /* крылья */
  P(g, 0, 2, 14, 3, dark);
  P(g, 0, 5, 11, 3, shade(dark, -0.2));
  P(g, 0, 8, 8, 2, shade(dark, -0.35));
  P(g, 20, 2, 14, 3, dark);
  P(g, 23, 5, 11, 3, shade(dark, -0.2));
  P(g, 26, 8, 8, 2, shade(dark, -0.35));
  /* хво */
  P(g, 14, 24, 6, 3, dark);
  P(g, 18, 26, 6, 2, shade(dark, -0.2));
  /* тело */
  P(g, 9, 10, 16, 15, red);
  P(g, 9, 10, 16, 1, light);
  P(g, 9, 24, 16, 1, dark);
  /* брюхо */
  P(g, 13, 13, 8, 11, belly);
  for (let i = 0; i < 4; i++) P(g, 13, 15 + i * 2, 8, 1, shade(belly, -0.3));
  /* лапы */
  P(g, 7, 22, 4, 4, dark);
  P(g, 23, 22, 4, 4, dark);
  /* шея + голова */
  P(g, 12, 4, 9, 7, red);
  P(g, 12, 4, 9, 1, light);
  P(g, 17, 1, 10, 7, red);
  P(g, 17, 1, 10, 1, light);
  P(g, 25, 4, 8, 3, shade(red, -0.15));
  P(g, 21, 4, 2, 2, '#facc15');
  P(g, 22, 5, 1, 1, '#fef08a');
  P(g, 24, 7, 2, 1, '#fde68a');
  /* рог */
  P(g, 18, 0, 3, 2, '#fde68a');
  /* дым */
  g.globalAlpha = 0.25;
  P(g, 26, 8, 3, 3, '#9ca3af');
  g.globalAlpha = 1;
  return cv;
}

function makeSpiderQueen() {
  const cv = mkCv(30, 24);
  const g = ctx2d(cv);
  const body = '#6b21a8';
  const light = '#9333ea';
  const dark = '#3b0f63';
  /* лапы */
  for (let i = 0; i < 3; i++) {
    P(g, 2 - i, 4 + i * 4, 8, 2, dark);
    P(g, 28 + i, 4 + i * 4, 8 - i, 2, dark);
  }
  /* брюшко */
  P(g, 9, 10, 12, 11, body);
  P(g, 9, 10, 12, 1, light);
  P(g, 11, 14, 8, 5, '#f43f5e');
  P(g, 13, 16, 4, 2, shade('#f43f5e', 0.4));
  /* голова */
  P(g, 11, 3, 8, 8, dark);
  P(g, 11, 3, 8, 1, body);
  P(g, 12, 6, 2, 2, '#fde047');
  P(g, 16, 6, 2, 2, '#fde047');
  P(g, 13, 9, 4, 2, '#0b0b16');
  return cv;
}

function makeHusk() {
  const cv = mkCv(24, 26);
  const g = ctx2d(cv);
  const fire = '#ea580c';
  const dark = '#431407';
  const hot = '#fdba74';
  P(g, 5, 20, 5, 5, dark);
  P(g, 14, 20, 5, 5, dark);
  P(g, 4, 9, 16, 12, fire);
  P(g, 4, 9, 16, 1, hot);
  P(g, 2, 11, 2, 8, fire);
  P(g, 20, 11, 2, 8, fire);
  /* трещины-угли */
  P(g, 9, 13, 6, 1, '#fde047');
  P(g, 11, 16, 4, 1, '#fde047');
  P(g, 7, 18, 3, 1, '#fde047');
  /* голова */
  P(g, 7, 2, 10, 8, fire);
  P(g, 7, 2, 10, 1, hot);
  P(g, 9, 5, 2, 2, '#fef08a');
  P(g, 13, 5, 2, 2, '#fef08a');
  P(g, 10, 8, 4, 2, dark);
  return cv;
}

/* =============================================================
   ОРУЖИЕ (рисуется в сторону прицела)
   ============================================================= */

function makeSword() {
  const cv = mkCv(6, 14);
  const g = ctx2d(cv);
  P(g, 2, 0, 2, 9, '#e2e8f0');
  P(g, 2, 0, 1, 9, '#ffffff');
  P(g, 1, 9, 4, 1, '#fbbf24');
  P(g, 1, 10, 4, 1, '#b45309');
  P(g, 2, 11, 2, 3, '#5b4326');
  P(g, 1, 13, 4, 1, '#2a1a0d');
  return cv;
}

function makeAxe() {
  const cv = mkCv(12, 14);
  const g = ctx2d(cv);
  P(g, 5, 2, 2, 11, '#5b4326');
  P(g, 0, 1, 6, 6, '#d1d5db');
  P(g, 0, 1, 6, 1, '#f3f4f6');
  P(g, 0, 6, 5, 1, '#9ca3af');
  P(g, 5, 12, 2, 1, '#3d2a18');
  return cv;
}

function makeDagger() {
  const cv = mkCv(5, 9);
  const g = ctx2d(cv);
  P(g, 1, 0, 2, 5, '#dbe4f0');
  P(g, 1, 0, 1, 5, '#ffffff');
  P(g, 0, 5, 4, 1, '#8b5cf6');
  P(g, 1, 6, 2, 2, '#4a3524');
  return cv;
}

function makeSpear() {
  const cv = mkCv(5, 18);
  const g = ctx2d(cv);
  P(g, 1, 3, 2, 14, '#7dd3c0');
  P(g, 1, 3, 1, 14, '#cfeee6');
  P(g, 2, 0, 1, 4, '#e0fdfa');
  P(g, 1, 0, 1, 3, '#0f172a');
  P(g, 1, 17, 3, 1, '#0f172a');
  return cv;
}

function makeBow() {
  const cv = mkCv(7, 13);
  const g = ctx2d(cv);
  for (let y = 0; y < 13; y++) {
    const t = Math.abs(y - 6) / 6;
    const x = 1 + Math.round(t * 3);
    P(g, x, y, 1, 1, '#8a5a2b');
  }
  P(g, 0, 6, 1, 1, '#e7e5e4');
  return cv;
}

function makeCrossbow() {
  const cv = mkCv(13, 9);
  const g = ctx2d(cv);
  P(g, 0, 0, 13, 1, '#9ca3af');
  P(g, 0, 8, 13, 1, '#6b7280');
  P(g, 5, 1, 3, 7, '#5b4326');
  P(g, 6, 2, 1, 5, '#8b5a2b');
  P(g, 2, 4, 9, 1, '#e7e5e4');
  return cv;
}

function makeScythe() {
  const cv = mkCv(13, 13);
  const g = ctx2d(cv);
  for (let x = 0; x < 11; x++) {
    const t = x / 10;
    P(g, x, 0 + Math.round(t * t * 5), 1, 2, shade('#7de0d0', 0.2 - t * 0.4));
  }
  P(g, 3, 5, 2, 8, '#2a1b4d');
  P(g, 10, 0, 3, 1, '#b8f2e6');
  return cv;
}

function makeBomb() {
  const cv = mkCv(9, 9);
  const g = ctx2d(cv);
  P(g, 2, 2, 6, 6, '#3f3f46');
  P(g, 2, 2, 6, 1, '#52525b');
  P(g, 3, 3, 2, 2, '#71717a');
  P(g, 3, 0, 2, 2, '#fb923c');
  P(g, 3, 0, 1, 1, '#fde047');
  return cv;
}

/* =============================================================
   ПРЕДМЕТЫ И СНАРЯДЫ
   ============================================================= */

function makeHeart() {
  const cv = mkCv(9, 8);
  const g = ctx2d(cv);
  P(g, 0, 1, 3, 2, '#f43f5e');
  P(g, 6, 1, 3, 2, '#f43f5e');
  P(g, 0, 2, 9, 3, '#f43f5e');
  P(g, 1, 4, 7, 2, '#fb7185');
  P(g, 2, 5, 5, 2, '#f43f5e');
  P(g, 3, 6, 3, 1, '#be123c');
  P(g, 1, 2, 2, 1, '#fda4af');
  return cv;
}

function makeCoin() {
  const cv = mkCv(8, 8);
  const g = ctx2d(cv);
  P(g, 1, 0, 6, 8, '#b45309');
  P(g, 1, 1, 6, 6, '#fbbf24');
  P(g, 2, 2, 4, 4, '#fde68a');
  P(g, 3, 3, 2, 2, '#b45309');
  return cv;
}

function makeGem() {
  const cv = mkCv(9, 9);
  const g = ctx2d(cv);
  P(g, 3, 0, 3, 1, '#cffafe');
  P(g, 2, 1, 5, 2, '#67e8f9');
  P(g, 1, 2, 7, 3, '#22d3ee');
  P(g, 0, 4, 9, 1, '#22d3ee');
  P(g, 2, 5, 5, 2, '#0891b2');
  P(g, 3, 7, 3, 1, '#0891b2');
  P(g, 3, 2, 2, 2, '#cffafe');
  return cv;
}

function makeChest() {
  const cv = mkCv(11, 9);
  const g = ctx2d(cv);
  P(g, 1, 3, 9, 5, '#a16207');
  P(g, 1, 3, 9, 1, '#d97706');
  P(g, 0, 1, 11, 3, '#8b5a2b');
  P(g, 1, 0, 9, 2, '#a16207');
  P(g, 4, 1, 3, 6, '#fbbf24');
  P(g, 5, 3, 1, 2, '#7c2d12');
  return cv;
}

function makeArrow(head, shaft) {
  const cv = mkCv(9, 5);
  const g = ctx2d(cv);
  P(g, 0, 1, 6, 1, shaft);
  P(g, 0, 3, 6, 1, shaft);
  P(g, 6, 0, 3, 5, head);
  P(g, 7, 1, 1, 3, '#ffffff');
  return cv;
}

function makeBolt(head, shaft) {
  const cv = mkCv(9, 5);
  const g = ctx2d(cv);
  P(g, 0, 2, 8, 1, shaft);
  P(g, 3, 0, 4, 5, head);
  P(g, 4, 1, 2, 3, '#ffffff');
  P(g, 0, 0, 2, 1, head);
  P(g, 0, 4, 2, 1, head);
  return cv;
}

function makeRockShot() {
  const cv = mkCv(8, 8);
  const g = ctx2d(cv);
  P(g, 1, 1, 6, 6, '#4b5563');
  P(g, 1, 1, 6, 1, '#9ca3af');
  P(g, 2, 2, 2, 2, '#7c7f86');
  P(g, 1, 6, 6, 1, '#374151');
  return cv;
}

function makeFireball() {
  const cv = mkCv(9, 9);
  const g = ctx2d(cv);
  P(g, 3, 0, 3, 2, '#fef08a');
  P(g, 2, 2, 5, 4, '#fb923c');
  P(g, 1, 3, 7, 3, '#f97316');
  P(g, 2, 6, 5, 2, '#dc2626');
  P(g, 3, 1, 2, 2, '#fef9c3');
  return cv;
}

function makeShard(a, b) {
  const cv = mkCv(7, 7);
  const g = ctx2d(cv);
  P(g, 2, 0, 3, 2, a);
  P(g, 1, 2, 5, 2, b);
  P(g, 0, 3, 7, 2, a);
  P(g, 1, 5, 5, 1, b);
  P(g, 2, 6, 3, 1, shade(a, -0.3));
  P(g, 2, 1, 2, 2, '#ffffff');
  return cv;
}

function makeSpark() {
  const cv = mkCv(5, 5);
  const g = ctx2d(cv);
  P(g, 2, 0, 1, 5, '#ffe9a8');
  P(g, 0, 2, 5, 1, '#ffe9a8');
  P(g, 1, 1, 3, 3, '#ffffff');
  return cv;
}

function makeStar() {
  const cv = mkCv(7, 7);
  const g = ctx2d(cv);
  P(g, 3, 0, 1, 7, '#ffe27a');
  P(g, 0, 3, 7, 1, '#ffe27a');
  P(g, 1, 1, 5, 5, '#fff9c4');
  P(g, 2, 2, 3, 3, '#ffffff');
  return cv;
}

function makeSmoke() {
  const c = mkCv(16, 16);
  const g = ctx2d(c);
  const grd = g.createRadialGradient(8, 8, 1, 8, 8, 8);
  grd.addColorStop(0, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.6, 'rgba(190,190,210,0.18)');
  grd.addColorStop(1, 'rgba(170,170,190,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 16);
  return c;
}

/* =============================================================
   МИР
   ============================================================= */

function makeTree() {
  const cv = mkCv(16, 20);
  const g = ctx2d(cv);
  const leaf = '#2f7a4a';
  const leafL = '#3f9a5f';
  const leafD = '#1f5136';
  const bark = '#3f2d1a';
  /* ствол */
  P(g, 6, 9, 4, 10, bark);
  P(g, 6, 9, 1, 10, '#5b4326');
  P(g, 7, 12, 1, 2, '#2a1c10');
  /* крона */
  P(g, 2, 2, 12, 8, leafD);
  P(g, 1, 4, 14, 5, leaf);
  P(g, 3, 1, 10, 9, leaf);
  P(g, 3, 1, 10, 1, leafL);
  P(g, 4, 2, 4, 2, leafL);
  P(g, 1, 7, 14, 1, leafD);
  P(g, 5, 9, 6, 1, leafD);
  return cv;
}

function makeTreeTop() {
  const cv = mkCv(16, 12);
  const g = ctx2d(cv);
  const leaf = '#276b41';
  const leafL = '#358a54';
  const leafD = '#1a4630';
  P(g, 2, 2, 12, 8, leafD);
  P(g, 1, 4, 14, 5, leaf);
  P(g, 3, 1, 10, 9, leaf);
  P(g, 3, 1, 10, 1, leafL);
  P(g, 5, 2, 3, 2, leafL);
  P(g, 1, 7, 14, 1, leafD);
  return cv;
}

function makeBush() {
  const cv = mkCv(12, 10);
  const g = ctx2d(cv);
  const leaf = '#2f6b45';
  const leafL = '#43935a';
  P(g, 2, 2, 8, 7, leaf);
  P(g, 0, 5, 12, 4, leaf);
  P(g, 2, 2, 8, 1, leafL);
  P(g, 1, 4, 4, 2, leafL);
  P(g, 8, 6, 3, 2, '#1d4a2e');
  return cv;
}

function makeRock() {
  const cv = mkCv(12, 10);
  const g = ctx2d(cv);
  const stone = '#56795e';
  const light = '#6f9273';
  const dark = '#3d5a45';
  P(g, 1, 3, 10, 6, stone);
  P(g, 0, 5, 12, 4, stone);
  P(g, 2, 1, 7, 3, light);
  P(g, 0, 8, 12, 2, dark);
  return cv;
}

function makeMushroom(cap, bright) {
  const cv = mkCv(10, 10);
  const g = ctx2d(cv);
  P(g, 4, 5, 2, 4, '#e8e0c8');
  P(g, 1, 2, 8, 4, cap);
  P(g, 0, 4, 10, 2, cap);
  P(g, 2, 3, 3, 2, bright);
  P(g, 6, 5, 2, 1, bright);
  return cv;
}

function makeFlower() {
  const cv = mkCv(8, 8);
  const g = ctx2d(cv);
  P(g, 3, 4, 1, 4, '#3f7a3f');
  P(g, 1, 0, 2, 2, '#f9e27d');
  P(g, 5, 1, 2, 2, '#f472b6');
  P(g, 2, 2, 2, 1, '#fde68a');
  return cv;
}

function makeTorch() {
  const cv = mkCv(8, 14);
  const g = ctx2d(cv);
  P(g, 3, 8, 2, 6, '#3f2d1a');
  P(g, 2, 4, 4, 5, '#dc2626');
  P(g, 2, 5, 4, 3, '#fbbf24');
  P(g, 3, 3, 2, 2, '#fde68a');
  P(g, 3, 2, 2, 1, '#fef9c3');
  return cv;
}

function makeStump() {
  const cv = mkCv(12, 8);
  const g = ctx2d(cv);
  P(g, 1, 2, 10, 5, '#5b3a1a');
  P(g, 0, 4, 12, 4, '#3d2a18');
  P(g, 2, 1, 8, 2, '#a16207');
  P(g, 4, 1, 4, 1, '#7c4a1e');
  return cv;
}

function makeVignette() {
  const cv = mkCv(320, 180);
  const g = ctx2d(cv);
  const grd = g.createRadialGradient(160, 90, 40, 160, 90, 190);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.65, 'rgba(0,0,0,0.18)');
  grd.addColorStop(1, 'rgba(2,4,12,0.72)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 320, 180);
  return cv;
}

/* =============================================================
   СБОРКА АТЛАСА
   ============================================================= */

const Sprites = {};
const ANIM = {};
const GLOW = {};

function animEntity(name, base, opts) {
  opts = opts || {};
  const col = opts.outlineColor || '#05070f';
  const alpha = opts.outlineAlpha == null ? 0.72 : opts.outlineAlpha;
  const breathe = opts.breathe == null ? 1 : opts.breathe;

  const pre = autoOutline(base, col, alpha);
  const half = Math.floor(pre.height / 2);
  const legs = Math.floor(pre.height * 0.58);

  const idleA = pre;
  const idleB = breathe ? autoOutline(shiftBand(pre, 0, half, breathe), col, alpha) : pre;
  const w1 = autoOutline(shiftBand(pre, legs, pre.height, 1), col, alpha);
  const w2 = autoOutline(shiftBand(pre, legs, pre.height, -1), col, alpha);
  const atk1 = autoOutline(shiftBand(pre, 0, legs, 2), col, alpha);
  const atk2 = autoOutline(shiftBand(pre, 0, legs, -2), col, alpha);

  ANIM[name] = { idle: [idleA, idleB], walk: [pre, w1, pre, w2], atk: [atk1, atk2], base: pre, raw: base };
  Sprites[name] = pre;
}

function buildSprites() {
  /* ---------- герои ---------- */
  animEntity('knight', makeHero({
    main: '#3b6fd4', trim: '#d4a72c', helm: 'knight', armor: true, pauldron: true, shield: true, cape: '#2f6ae0', skin: '#f0c193'
  }));
  animEntity('archer', makeHero({
    main: '#3f8f4a', trim: '#8b5a2b', helm: 'hood', hoodColor: '#2f7a3f', quiver: true, cape: '#2f6b45', skin: '#f0c193'
  }));
  animEntity('rogue', makeHero({
    main: '#3b4459', trim: '#8b5cf6', helm: 'hood', hoodColor: '#222a3b', eye: '#c4b5fd', cape: '#1f2a3d', skin: '#e8d0b0'
  }));
  animEntity('barbarian', makeHero({
    main: '#b45309', trim: '#7c3aed', helm: 'horn', horn: '#7c3aed', pauldron: true, cape: '#8a5a2b', skin: '#f0c193', belt: false
  }));
  animEntity('gunner', makeHero({
    main: '#4d7c0f', trim: '#8b5a2b', helm: 'helm', quiver: true, armor: false, skin: '#f0c193'
  }));
  animEntity('spearman', makeHero({
    main: '#2f6f6a', trim: '#ffe08a', helm: 'crown', armor: true, pauldron: true, cape: '#1f4d4a', skin: '#e8c8a0'
  }));
  animEntity('reaper', makeHero({
    main: '#1b2333', trim: '#22d3ee', helm: 'hood', hoodColor: '#0c1120', eye: '#67e8f9', cape: '#0c1120', emissive: '#22d3ee', skin: '#8fa3b8'
  }));
  animEntity('pyromant', makeHero({
    main: '#4a2c17', trim: '#dc2626', helm: 'bandana', armor: false, skin: '#f0c193'
  }));

  /* ---------- враги ---------- */
  animEntity('slime', makeSlime({ color: '#3fbf5f' }), { breathe: 0 });
  animEntity('slimeBlue', makeSlime({ color: '#4f8fe0' }), { breathe: 0 });
  animEntity('slimeRed', makeSlime({ color: '#e0503f' }), { breathe: 0 });
  animEntity('bat', makeBat({ color: '#7c3aed' }), { breathe: 0 });
  animEntity('spider', makeSpider({ color: '#4c1d95', mark: '#f43f5e' }));
  animEntity('wolf', makeWolf({ color: '#6b7280', eye: '#fbbf24' }));
  animEntity('skeleton', makeHumanoid({ main: '#c3cddb', skin: '#e6edf9', bones: true, eyeGlow: '#22d3ee' }));
  animEntity('zombie', makeHumanoid({ main: '#4a6b4e', skin: '#7fb784', eyeGlow: '#f87171' }));
  animEntity('orc', makeHumanoid({ main: '#4d8c3f', skin: '#6fb356', crest: '#2f5c26', eye: '#fde68a' }), { breathe: 0 });
  animEntity('ogre', makeHumanoid({ main: '#8a6a12', skin: '#c29425', crest: '#5b4326', pauldron: true, eye: '#fde047' }), { breathe: 0 });
  animEntity('goblin', makeHumanoid({ main: '#3f8f4a', skin: '#57b45f', crest: '#265c2f', eye: '#fde68a', horn: '#265c2f' }), { breathe: 0 });
  animEntity('wraith', makeWraith({ color: '#4c3a8f', eye: '#f0abfc' }), { breathe: 0 });
  animEntity('crawler', makeCrawler({ color: '#a34d76', eye: '#fde047' }));
  animEntity('bomber', makeBomber({ main: '#7c4a1e', eye: '#fde047', charge: '#dc2626' }), { breathe: 0 });

  /* производные: то же тело + оружие в руке */
  animEntity('skelArcher', makeHumanoid({ main: '#c3cddb', skin: '#e6edf9', bones: true, eyeGlow: '#22d3ee' }));
  Sprites.w_skelArcherBow = makeBow();
  animEntity('thrower', makeHumanoid({ main: '#4d8c3f', skin: '#6fb356', crest: '#2f5c26', eye: '#fde68a' }), { breathe: 0 });
  animEntity('goblinX', makeHumanoid({ main: '#3f8f4a', skin: '#57b45f', crest: '#265c2f', eye: '#fde68a', horn: '#265c2f' }), { breathe: 0 });
  animEntity('brute', makeHumanoid({ main: '#8a5a2b', skin: '#c29425', pauldron: true, crest: '#5b4326', eye: '#f87171' }), { breathe: 0 });

  /* ---------- боссы ---------- */
  animEntity('golem', makeGolem(), { outlineAlpha: 0.9, breathe: 0 });
  animEntity('skking', makeSkKing(), { outlineAlpha: 0.9, breathe: 0 });
  animEntity('dragon', makeDragon(), { outlineAlpha: 0.9, breathe: 0 });
  animEntity('spiderqueen', makeSpiderQueen(), { outlineAlpha: 0.9, breathe: 0 });
  animEntity('husk', makeHusk(), { outlineAlpha: 0.9, breathe: 0 });

  /* ---------- оружие ---------- */
  Sprites.w_sword = makeSword();
  Sprites.w_axe = makeAxe();
  Sprites.w_dagger = makeDagger();
  Sprites.w_spear = makeSpear();
  Sprites.w_bow = makeBow();
  Sprites.w_crossbow = makeCrossbow();
  Sprites.w_scythe = makeScythe();
  Sprites.w_bomb = makeBomb();

  /* ---------- предметы ---------- */
  Sprites.item_heart = autoOutline(makeHeart(), '#05070f', 0.7);
  Sprites.item_coin = autoOutline(makeCoin(), '#05070f', 0.7);
  Sprites.item_gem = autoOutline(makeGem(), '#05070f', 0.7);
  Sprites.item_chest = autoOutline(makeChest(), '#05070f', 0.75);
  Sprites.item_magnet = autoOutline(makeGem(), '#05070f', 0.7);

  /* ---------- снаряды ---------- */
  Sprites.arrowP = makeArrow('#f3e5ab', '#8b5e34');
  Sprites.arrowBone = makeArrow('#e8edf5', '#94a3b8');
  Sprites.boltP = makeBolt('#e5e7eb', '#5b4326');
  Sprites.boltE = makeBolt('#9ca3af', '#111827');
  Sprites.rockShot = makeRockShot();
  Sprites.fireball = makeFireball();
  Sprites.bombShot = makeBomb();
  Sprites.shardShot = makeShard('#e9d5ff', '#a78bfa');
  Sprites.spikeShot = makeShard('#fecaca', '#ef4444');
  Sprites.scytheOrb = makeShard('#b8f2e6', '#22d3ee');
  Sprites.axeShot = makeAxe();
  Sprites.daggerShot = makeDagger();
  Sprites.spearShot = makeSpear();

  /* ---------- эффекты ---------- */
  Sprites.spark = makeSpark();
  Sprites.star4 = makeStar();
  Sprites.smokeFx = makeSmoke();
  Sprites.ringFx = makeGlow(64, '#ffffff', 0.72);
  Sprites.slashFx = makeGlow(96, '#ffffff', 0.62);
  Sprites.vortex = makeGlow(64, '#a78bfa', 0.6);
  Sprites.muzzle = makeGlow(32, '#fde68a', 0.55);
  Sprites.vignette = makeVignette();

  /* ---------- мир ---------- */
  Sprites.tree = makeTree();
  Sprites.treeTop = makeTreeTop();
  Sprites.bush = makeBush();
  Sprites.rock = makeRock();
  Sprites.mushroom = makeMushroom('#ef4444', '#fca5a5');
  Sprites.mushroomLit = makeMushroom('#22d3ee', '#a5f3fc');
  Sprites.flower = makeFlower();
  Sprites.torch = makeTorch();
  Sprites.stump = makeStump();

  /* ---------- свечения ---------- */
  GLOW.warm = makeGlow(160, '#ffb347', 0.55);
  GLOW.cool = makeGlow(160, '#67e8f9', 0.55);
  GLOW.violet = makeGlow(160, '#a78bfa', 0.55);
  GLOW.green = makeGlow(160, '#86efac', 0.55);
  GLOW.red = makeGlow(160, '#f87171', 0.55);
  GLOW.white = makeGlow(160, '#ffffff', 0.5);
  GLOW.blue = makeGlow(96, '#60a5fa', 0.6);
  GLOW.fire = makeGlow(96, '#fb923c', 0.6);
  GLOW.small = makeGlow(48, '#ffffff', 0.6);
  GLOW.shadow = makeShadowBlob();

  const bad = checkSpriteRows();
  if (bad.length) console.warn('Atlas problem:', bad);
}

/* ---------------- Кадры ---------------- */

function frameOf(name, t, mode) {
  const a = ANIM[name];
  if (!a) return Sprites[name] || null;
  if (mode === 'atk') return a.atk[Math.floor(t * 14) % a.atk.length];
  if (mode === 'walk') return a.walk[Math.floor(t * 9) % a.walk.length];
  return a.idle[Math.floor(t * 2) % a.idle.length];
}

const whiteCache = new WeakMap();
function whiteVersion(cv) {
  if (!cv) return null;
  let w = whiteCache.get(cv);
  if (w) return w;
  w = mkCv(cv.width, cv.height);
  const g = ctx2d(w);
  g.drawImage(cv, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  whiteCache.set(cv, w);
  return w;
}
function whiteOf(name, t, mode) { return whiteVersion(frameOf(name, t, mode)); }

/* карт больше нет — проверять нечего, но оставляем API для тестов */
function checkSpriteRows() { return []; }