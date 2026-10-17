'use strict';

/* =============================================================
   PIXELWAVES — ЭФФЕКТЫ И «СОК»

   Частицы, динамический свет, всплывающие числа, следы на земле,
   тряска камеры, hitstop, вспышки, погода.
   Всё рисуется локально, без внешних ресурсов.
   ============================================================= */

const FX = (function () {

  const parts = [];     // частицы
  const texts = [];     // всплывающие числа
  const decals = [];    // следы на земле
  const rings = [];     // кольца
  const beams = [];     // лучи/следы
  const lights = [];    // источники света
  const weather = [];   // фоновая погода
  const flyers = [];    // кружащие вокруг героя снаряды ультимейтов

  let lightCv = null, lightG = null;
  let vigCv = null;

  let shakeAmt = 0, shakeX = 0, shakeY = 0;
  let hitstop = 0;
  let flashA = 0, flashColor = '#ffffff';
  let zoom = 1, zoomTarget = 1;
  let ambient = 0.55;          // 0 = день, 1 = глубокая ночь
  let ambientTarget = 0.55;
  let weatherKind = 'none';
  let weatherTimer = 0;
  let maxLights = 46;      /* лимит источников в кадре (производительность) */
  let bloomOn = true;      /* блум можно отключить для слабых машин */

  function ensureLightCv() {
    if (!lightCv) {
      lightCv = document.createElement('canvas');
      lightCv.width = 320;
      lightCv.height = 180;
      lightG = lightCv.getContext('2d');
      lightG.imageSmoothingEnabled = false;
    }
    return lightG;
  }

  /* ---------------- Частицы ---------------- */

  function spawnParts(x, y, n, cfg) {
    cfg = cfg || {};
    for (let i = 0; i < n; i++) {
      if (parts.length > 700) break;
      const ang = cfg.ang == null ? Math.random() * Math.PI * 2 : cfg.ang + (Math.random() - 0.5) * (cfg.spread || 1.4);
      const sp = (cfg.speed || 60) * (0.35 + Math.random() * 0.9);
      parts.push({
        x: x + (Math.random() - 0.5) * (cfg.jitter || 4),
        y: y + (Math.random() - 0.5) * (cfg.jitter || 4),
        vx: Math.cos(ang) * sp + (cfg.vx || 0),
        vy: Math.sin(ang) * sp + (cfg.vy || 0),
        life: (cfg.life || 0.4) * (0.6 + Math.random() * 0.8),
        t: 0,
        size: cfg.size || 1,
        color: cfg.colors ? cfg.colors[(Math.random() * cfg.colors.length) | 0] : (cfg.color || '#ffffff'),
        g: cfg.g == null ? 120 : cfg.g,
        drag: cfg.drag == null ? 0.9 : cfg.drag,
        sprite: cfg.sprite || null,
        spin: cfg.spin || 0,
        rot: cfg.rot || 0,
        shrink: cfg.shrink !== false,
        light: cfg.light || 0,
        fade: cfg.fade !== false
      });
    }
  }

  /* удар: короткая вспышка + осколки */
  function hit(x, y, ang, color, power) {
    const p = power || 1;
    spawnParts(x, y, Math.round(4 + p * 4), {
      ang: ang, spread: 1.1, speed: 70 + p * 60, life: 0.24,
      color: color || '#ffffff', g: 60, size: 1, light: 0.35 + p * 0.3
    });
    spawnParts(x, y, 2, {
      ang: ang, spread: 0.8, speed: 30, life: 0.5,
      color: '#ffe9a8', g: -20, size: 2, sprite: 'spark', shrink: true
    });
  }

  /* крит: яркая вспышка + звёзды */
  function crit(x, y, ang) {
    spawnParts(x, y, 14, {
      ang: ang, spread: 2.4, speed: 130, life: 0.34,
      colors: ['#fff9c4', '#ffe27a', '#ff9f43'], g: 90, light: 0.8
    });
    spawnParts(x, y, 4, {
      speed: 40, life: 0.6, color: '#ffffff', g: 30,
      sprite: 'star4', size: 3, shrink: true, spin: 6
    });
    ring(x, y, '#ffd166', 4, 26, 0.28);
  }

  /* смерть врага: облако пикселей */
  function death(x, y, color, size) {
    const s = size || 1;
    spawnParts(x, y, Math.round(12 * s), {
      speed: 55 * s, life: 0.5, color: color, g: 180, drag: 0.86,
      size: s > 1.4 ? 2 : 1, light: 0.3
    });
    spawnParts(x, y, Math.round(5 * s), {
      speed: 30 * s, life: 0.75, color: '#ffffff', g: -30,
      sprite: 'spark', shrink: true
    });
  }

  /* дым/пар */
  function smoke(x, y, color, n) {
    spawnParts(x, y, n || 3, {
      speed: 18, life: 0.9, color: color || 'rgba(200,200,210,0.5)',
      g: -14, size: 3, shrink: true, sprite: 'smokeFx', fade: true
    });
  }

  /* след снаряда */
  function trail(x, y, color, life) {
    spawnParts(x, y, 1, {
      speed: 4, life: life || 0.24, color: color, g: 0,
      size: 1, light: 0.5, drag: 0.8
    });
  }

  /* удар по земле: пыль */
  function dust(x, y, color, n) {
    spawnParts(x, y, n || 6, {
      speed: 42, life: 0.36, color: color || '#8a9a7a', g: 30,
      size: 1, light: 0.12, drag: 0.88
    });
  }

  /* ---------------- Кольца и лучи ---------------- */

  function ring(x, y, color, r0, r1, dur, width) {
    if (rings.length > 90) return;
    rings.push({ x: x, y: y, t: 0, dur: dur || 0.35, r0: r0 || 2, r1: r1 || 30, color: color, w: width || 2 });
  }

  function beam(x, y, ang, len, color, dur, width) {
    if (beams.length > 60) return;
    beams.push({ x: x, y: y, ang: ang, len: len, t: 0, dur: dur || 0.16, color: color, w: width || 4 });
  }

  /* ---------------- Текст ---------------- */

  function text(x, y, str, color, size, vy) {
    if (texts.length > 80) return;
    texts.push({ x: x, y: y, s: String(str), c: color || '#ffffff', size: size || 8, t: 0, dur: 0.85, vy: vy == null ? -26 : vy });
  }

  /* ---------------- Следы на земле ---------------- */

  function decal(x, y, color, size, life) {
    if (decals.length > 160) decals.shift();
    decals.push({ x: x, y: y, c: color, size: size || 3, t: 0, dur: life || 9 });
  }

  /* ---------------- Свет ---------------- */

  function light(x, y, r, color, intensity, noBloom) {
    if (lights.length > 120) return;
    lights.push({ x: x, y: y, r: r, c: color, i: intensity == null ? 1 : intensity, nb: !!noBloom });
  }

  /* статичные источники света на карте */
  function decorLight(x, y, r, color, i) { light(x, y, r, color, i); }

  /* ---------------- Экран ---------------- */

  function shake(a) { shakeAmt = Math.min(14, shakeAmt + a); }
  function stop(ms) { hitstop = Math.max(hitstop, ms); }
  function flash(a, color) { flashA = Math.max(flashA, a); flashColor = color || '#ffffff'; }
  function punch(k) { zoomTarget = k; }
  function setAmbient(v) { ambientTarget = v; }
  function setWeather(kind) { weatherKind = kind; }

  /* ---------------- Погода ---------------- */

  function updateWeather(dt, cam, viewW, viewH) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      weatherTimer = 0.08;
      if (weatherKind === 'fireflies' && weather.length < 46) {
        weather.push({
          k: 'fly', x: cam.x + Math.random() * viewW, y: cam.y + Math.random() * viewH,
          vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6,
          t: 0, dur: 4 + Math.random() * 5, ph: Math.random() * 6
        });
      } else if (weatherKind === 'embers' && weather.length < 60) {
        weather.push({
          k: 'ember', x: cam.x + Math.random() * viewW, y: cam.y + viewH + 4,
          vx: (Math.random() - 0.5) * 10, vy: -14 - Math.random() * 22,
          t: 0, dur: 3.5 + Math.random() * 2.5
        });
      } else if (weatherKind === 'rain' && weather.length < 110) {
        weather.push({
          k: 'rain', x: cam.x + Math.random() * (viewW + 40) - 20, y: cam.y - 6,
          vx: -26, vy: 210, t: 0, dur: 1.6
        });
      } else if (weatherKind === 'leaves' && weather.length < 34) {
        weather.push({
          k: 'leaf', x: cam.x + Math.random() * viewW, y: cam.y - 4,
          vx: -12 + Math.random() * 8, vy: 16 + Math.random() * 12,
          t: 0, dur: 6, ph: Math.random() * 6
        });
      }
    }
    for (let i = weather.length - 1; i >= 0; i--) {
      const w = weather[i];
      w.t += dt;
      if (w.k === 'fly') {
        w.ph += dt * 2.2;
        w.x += w.vx + Math.cos(w.ph) * 8 * dt;
        w.y += w.vy + Math.sin(w.ph * 1.3) * 8 * dt;
      } else if (w.k === 'leaf') {
        w.ph += dt * 3;
        w.x += (w.vx + Math.sin(w.ph) * 16) * dt;
        w.y += w.vy * dt;
      } else {
        w.x += w.vx * dt; w.y += w.vy * dt;
      }
      if (w.t > w.dur) weather.splice(i, 1);
    }
  }

  /* ---------------- Обновление ---------------- */

  function update(dt) {
    /* тряска */
    if (shakeAmt > 0.05) {
      shakeAmt = Math.max(0, shakeAmt - dt * 26);
      shakeX = (Math.random() - 0.5) * shakeAmt;
      shakeY = (Math.random() - 0.5) * shakeAmt;
    } else { shakeAmt = 0; shakeX = 0; shakeY = 0; }

    if (flashA > 0) flashA = Math.max(0, flashA - dt * 3.4);
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 10);
    if (Math.abs(zoom - zoomTarget) < 0.004) zoom = zoomTarget;
    ambient += (ambientTarget - ambient) * Math.min(1, dt * 1.6);

    /* частицы */
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    /* текст */
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      if (t.t >= t.dur) { texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 0.93;
    }

    /* кольца */
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].dur) rings.splice(i, 1);
    }
    /* лучи */
    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].t += dt;
      if (beams[i].t >= beams[i].dur) beams.splice(i, 1);
    }
    /* следы */
    for (let i = decals.length - 1; i >= 0; i--) {
      decals[i].t += dt;
      if (decals[i].t >= decals[i].dur) decals.splice(i, 1);
    }
    /* свет */
    for (let i = lights.length - 1; i >= 0; i--) {
      lights[i].i -= dt * 0.9;
      if (lights[i].i <= 0) lights.splice(i, 1);
    }
  }

  /* ---------------- Отрисовка ---------------- */

  /* следы на земле — под сущностями */
  function drawDecals(g) {
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      const k = 1 - d.t / d.dur;
      g.globalAlpha = k * 0.5;
      g.fillStyle = d.c;
      const s = Math.round(d.size);
      g.fillRect(Math.round(d.x - s / 2), Math.round(d.y - s / 2), s, s);
    }
    g.globalAlpha = 1;
  }

  function drawRingsAndBeams(g) {
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const k = r.t / r.dur;
      const rad = r.r0 + (r.r1 - r.r0) * k;
      g.globalAlpha = (1 - k) * 0.85;
      g.strokeStyle = r.color;
      g.lineWidth = Math.max(1, r.w * (1 - k * 0.7));
      g.beginPath();
      g.ellipse(r.x, r.y, rad, rad * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      const k = b.t / b.dur;
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = b.color;
      g.lineWidth = Math.max(1, b.w * (1 - k * 0.6));
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + Math.cos(b.ang) * b.len, b.y + Math.sin(b.ang) * b.len);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawParts(g) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const k = p.t / p.life;
      g.globalAlpha = p.fade ? (1 - k) : 1;
      g.fillStyle = p.color;
      if (p.sprite && Sprites[p.sprite]) {
        const sp = Sprites[p.sprite];
        const s = p.shrink ? Math.max(1, Math.round(sp.width * (1 - k * 0.5))) : sp.width;
        g.save();
        g.translate(Math.round(p.x), Math.round(p.y));
        if (p.rot) g.rotate(p.rot);
        g.drawImage(sp, -Math.round(s / 2), -Math.round(s / 2), s, s);
        g.restore();
      } else {
        const s = Math.max(1, Math.round(p.size * (p.shrink ? (1 - k * 0.6) : 1)));
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    g.globalAlpha = 1;
  }

  function drawTexts(g) {
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const k = t.t / t.dur;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = 'bold ' + t.size + 'px monospace';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillText(t.s, Math.round(t.x) + 1, Math.round(t.y) + 1);
      g.fillStyle = t.c;
      g.fillText(t.s, Math.round(t.x), Math.round(t.y));
    }
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }

  /* погода — поверх мира, под HUD */
  function drawWeather(g) {
    for (let i = 0; i < weather.length; i++) {
      const w = weather[i];
      const k = w.t / w.dur;
      if (w.k === 'fly') {
        const a = Math.sin(k * Math.PI) * 0.9;
        g.globalAlpha = a;
        g.fillStyle = '#a7f3d0';
        g.fillRect(Math.round(w.x), Math.round(w.y), 1, 1);
      } else if (w.k === 'ember') {
        g.globalAlpha = (1 - k) * 0.85;
        g.fillStyle = k < 0.5 ? '#fbbf24' : '#f87171';
        g.fillRect(Math.round(w.x), Math.round(w.y), 1, 1);
      } else if (w.k === 'rain') {
        g.globalAlpha = 0.4;
        g.fillStyle = '#93c5fd';
        g.fillRect(Math.round(w.x), Math.round(w.y), 1, 3);
      } else if (w.k === 'leaf') {
        g.globalAlpha = (1 - k) * 0.7;
        g.fillStyle = '#65a30d';
        g.fillRect(Math.round(w.x), Math.round(w.y), 2, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /* ---- свет: умножающий проход (через готовую текстуру — быстрее) ---- */
  let lightTex = null;
  function ensureLightTex() {
    if (lightTex) return lightTex;
    const s = 128;
    lightTex = document.createElement('canvas');
    lightTex.width = s; lightTex.height = s;
    const t = lightTex.getContext('2d');
    const grd = t.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = grd;
    t.fillRect(0, 0, s, s);
    return lightTex;
  }

  function drawLightPass(mainG, camX, camY) {
    if (ambient <= 0.02) return;
    const g = ensureLightCv();
    const tex = ensureLightTex();

    g.globalCompositeOperation = 'source-over';
    /* сила темноты = (1 - ambient); умножаем сцену на этот коэффициент */
    const k = 1 - ambient;
    g.fillStyle = 'rgb(' + Math.round(k * 210) + ',' + Math.round(k * 226) + ',' + Math.round(k * 255) + ')';
    g.fillRect(0, 0, 320, 180);

    g.globalCompositeOperation = 'destination-out';
    let used = 0;
    for (let i = 0; i < lights.length && used < maxLights; i++) {
      const l = lights[i];
      const x = l.x - camX, y = l.y - camY;
      const r = l.r;
      if (x < -r || y < -r || x > 320 + r || y > 180 + r) continue;
      g.globalAlpha = Math.min(1, l.i);
      g.drawImage(tex, x - r, y - r, r * 2, r * 2);
      used++;
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    mainG.save();
    mainG.globalCompositeOperation = 'multiply';
    mainG.drawImage(lightCv, 0, 0);
    mainG.restore();
  }

  /* ---- аддитивный блум по светящимся штукам ---- */
  function drawBloom(g, camX, camY) {
    if (!bloomOn) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    let used = 0;
    for (let i = 0; i < lights.length && used < maxLights; i++) {
      const l = lights[i];
      if (l.r < 40 || l.nb) continue;          /* мелкие огоньки и геройский свет не блумим */
      const x = l.x - camX, y = l.y - camY;
      if (x < -l.r || y < -l.r || x > 320 + l.r || y > 180 + l.r) continue;
      const key = l.glow || 'warm';
      const sp = GLOW[key] || GLOW.warm;
      const s = l.r * 1.4;
      g.globalAlpha = Math.min(0.2, l.i * 0.14);
      g.drawImage(sp, x - s / 2, y - s / 2, s, s);
      used++;
    }
    g.globalAlpha = 1;
    g.restore();
  }

  /* ---- виньетка + вспышка ---- */
  function drawPost(mainG) {
    if (!vigCv) vigCv = Sprites.vignette || null;
    if (vigCv) mainG.drawImage(vigCv, 0, 0);
    if (flashA > 0.001) {
      mainG.globalAlpha = Math.min(0.85, flashA);
      mainG.fillStyle = flashColor;
      mainG.fillRect(0, 0, 320, 180);
      mainG.globalAlpha = 1;
    }
  }

  /* ---------------- Служебное ---------------- */

  function clearAll() {
    parts.length = 0; texts.length = 0; decals.length = 0;
    rings.length = 0; beams.length = 0; lights.length = 0; weather.length = 0;
    shakeAmt = 0; shakeX = 0; shakeY = 0; hitstop = 0; flashA = 0; zoom = 1; zoomTarget = 1;
  }

  function consumeHitstop() {
    if (hitstop > 0) { hitstop = Math.max(0, hitstop - 1 / 120); return true; }
    return false;
  }

  return {
    parts: parts, texts: texts, decals: decals, rings: rings, lights: lights,
    spawn: spawnParts, hit: hit, crit: crit, death: death, smoke: smoke, trail: trail, dust: dust,
    ring: ring, beam: beam, text: text, decal: decal, light: light, decorLight: decorLight,
    shake: shake, stop: stop, flash: flash, punch: punch,
    setAmbient: setAmbient, setWeather: setWeather,
    setBloom: function (v) { bloomOn = !!v; },
    setMaxLights: function (v) { maxLights = Math.max(6, v | 0); },
    update: update, updateWeather: updateWeather,
    drawDecals: drawDecals, drawParts: drawParts, drawTexts: drawTexts,
    drawRingsAndBeams: drawRingsAndBeams, drawWeather: drawWeather,
    drawLightPass: drawLightPass, drawBloom: drawBloom, drawPost: drawPost,
    clearAll: clearAll, consumeHitstop: consumeHitstop,
    get shakeX() { return shakeX; },
    get shakeY() { return shakeY; },
    get hitstop() { return hitstop; },
    get zoom() { return zoom; },
    get ambient() { return ambient; },
    resetAmbient: function () { ambient = ambientTarget; zoom = zoomTarget = 1; }
  };
})();