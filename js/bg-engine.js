/* =========================================================
   js/bg-engine.js · 共享背景刺激引擎（游戏无关）
   4 模式 / 15s 切换 / 1s 交叉淡化 / 5-8s 配色 / 1.2·2·3.2Hz 闪烁
   暴露全局 window.BgEngine（Node 下 window=globalThis 可无头自测）
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var GRID_UNUSED = 21; // 背景引擎不再依赖网格，仅为兼容保留
  var MODE_IDS = ['red_flicker', 'cam_grating', 'checkerboard', 'stripes']; // 4 种，已删 dots/fun_shapes
  var FLICKER_LEVELS = [1.2, 2, 3.2];      // 慢/中/快 Hz（v2.0 加快）
  var BG_FLICKER_JITTER = 0.2;             // 闪烁频率 ±20% 抖动
  var BG_ROTATE_MS = 15000;                // 形状 15s 切换
  var BG_CROSSFADE_MS = 1000;              // 形状 1s 淡入淡出
  var BG_COLOR_MIN_MS = 5000;              // 配色 5-8s 独立轮换
  var BG_COLOR_MAX_MS = 8000;
  var BG_COLOR_CROSSFADE_MS = 1000;        // 配色 1s 平滑过渡
  var BG_DRIFT_PX = 60;                    // 图案整体平移速度（约 1px/tick @60fps）
  var ACCENT_MAX = 16;                     // 混合模式点缀数量上限
  var BG_ACCENT_MIN_MS = 5000;             // 混合模式点缀 5-8s
  var BG_ACCENT_MAX_MS = 8000;

  // 高对比配色组：{fg 图案前景, bg 背景}
  var COLOR_PALETTES = [
    { bg: '#000000', fg: '#ffffff' },
    { bg: '#ffffff', fg: '#000000' },
    { bg: '#0000a8', fg: '#ffffff' },
    { bg: '#003300', fg: '#ffff00' }
  ];
  // 混合模式（colorMode='mixed'）的彩色点缀颜色池
  var ACCENT_COLORS = ['#ff2d2d', '#ffd400', '#00e5ff', '#ff66ff', '#7cff00', '#ff9d00'];

  var DEFAULT_SETTINGS = {
    flickerLevel: 1,                  // 0/1/2 → 1.2/2/3.2 Hz
    modes: [true, true, true, true],  // 4 种模式是否参与轮换
    colorMode: 'contrast',            // 'contrast' 高对比 | 'mixed' 混合（带彩色点缀）
    startSpeed: 2,                    // 起始速度档 1-5（游戏逻辑使用，引擎保留字段）
    soundOn: true,                    // 音效开关（游戏逻辑使用，引擎保留字段）
    colorChange: true,                // 颜色变化开关
    shapeChange: true,                // 形状（模式）变化开关
    flickerChange: true               // 闪烁开关
  };

  /* ---------- 纯函数（Node 可测） ---------- */

  // 闪烁频率档位映射：0/1/2 → 1.2/2/3.2 Hz，越界时回退到最快档
  function flickerHzForLevel(level) {
    if (level < 0 || level >= FLICKER_LEVELS.length) return FLICKER_LEVELS[FLICKER_LEVELS.length - 1];
    return FLICKER_LEVELS[level];
  }

  // 闪烁频率抖动：baseHz × (0.8~1.2)，每次进入新模式重新取值
  function jitterHz(baseHz) {
    return baseHz * (1 + (Math.random() * 2 - 1) * BG_FLICKER_JITTER);
  }

  // 从启用模式集合（enabledModes[i]===true）随机选下一个模式索引，
  // 不连续两次相同（previousIndex）；无任何启用模式时返回 -1。
  function pickNextMode(previousIndex, enabledModes) {
    var enabled = [];
    for (var i = 0; i < enabledModes.length; i++) if (enabledModes[i]) enabled.push(i);
    if (enabled.length === 0) return -1;
    if (enabled.length === 1) return enabled[0];
    var next = previousIndex;
    while (next === previousIndex) next = enabled[Math.floor(Math.random() * enabled.length)];
    return next;
  }

  // "下一步应显示的模式索引"纯函数（全关判定/轮换）：全关 → -1（纯背景色路径）
  function nextBgModeIndex(previousIndex, enabledModes) {
    if (enabledModes.indexOf(true) === -1) return -1;
    return pickNextMode(previousIndex, enabledModes);
  }

  // 从高对比配色组随机选一组索引，不连续两次相同
  function pickColorPalette(previousIndex) {
    if (COLOR_PALETTES.length <= 1) return 0;
    var next = previousIndex;
    while (next === previousIndex) next = Math.floor(Math.random() * COLOR_PALETTES.length);
    return next;
  }

  // 确定性伪随机数生成器（mulberry32）：同一种子生成同一组图案几何，避免逐帧随机抖动
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 依据模式索引与种子预生成图案几何（条纹方向/粗细、棋盘格大小）
  function buildBgGeom(modeIndex, seed, w, h) {
    var rnd = mulberry32(seed);
    if (modeIndex === 1) {
      // cam_grating：方向横/竖/斜随机，条宽 40-80px
      return { direction: ['horizontal', 'vertical', 'diagonal'][Math.floor(rnd() * 3)], width: 40 + Math.floor(rnd() * 41) };
    }
    if (modeIndex === 2) {
      // checkerboard：按 21 等分网格的棋盘格大小
      return { cell: Math.max(8, Math.round(Math.min(w, h) / 21)) };
    }
    if (modeIndex === 3) {
      // stripes：方向随机 + 条宽 40-100px
      return { direction: ['horizontal', 'vertical', 'diagonal'][Math.floor(rnd() * 3)], width: 40 + Math.floor(rnd() * 61) };
    }
    return { none: true }; // red_flicker 无几何
  }

  // 过渡系数：切换瞬间(now=switchAt)新图案=0，crossfadeMs 内线性过渡到新=1；
  // 稳态（未到切换时刻）为 0，由调用方按"prev 淡出 + cur 淡入"语义使用。
  function transitionAlpha(now, switchAt, rotateMs, crossfadeMs) {
    var el = now - switchAt;
    if (el <= 0) return 0;
    if (el >= crossfadeMs) return 1;
    return el / crossfadeMs;
  }

  /* ---------- 模式绘制器（4 种） ---------- */

  // 统一分派：modeIndex → 具体绘制器（时间单位：秒，与 v1.0 一致）
  function drawOne(ctx, modeIndex, now, geom, palette, flickerHz) {
    var cfg = {
      w: ctx.canvas.width,
      h: ctx.canvas.height,
      geom: geom,
      palette: palette,
      flickerHz: flickerHz
    };
    var t = now / 1000;
    switch (modeIndex) {
      case 0: drawRedFlicker(ctx, t, cfg); break;
      case 1: drawCamGrating(ctx, t, cfg); break;
      case 2: drawCheckerboard(ctx, t, cfg); break;
      case 3: drawStripes(ctx, t, cfg); break;
    }
  }

  // 全屏红/黑：按 flickerHz 的方波占空交替；闪烁关闭时整屏红色静止。
  // 该模式固定使用红/黑高对比色，忽略配色组（配色轮换在此模式下不可见，属合理取舍）。
  function drawRedFlicker(ctx, t, cfg) {
    var w = cfg.w, h = cfg.h;
    var period = 1000 / cfg.flickerHz / 1000; // 周期（秒）
    var phase = (t % period) / period;
    if (!cfg.flicker) {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.fillStyle = phase < 0.5 ? '#ff0000' : '#000000';
    ctx.fillRect(0, 0, w, h);
  }

  // 黑白方波条纹（CAM 光栅）：方向随机，条宽 40-80px，整体缓慢平移
  function drawCamGrating(ctx, t, cfg) {
    var w = cfg.w, h = cfg.h;
    var geom = cfg.geom;
    var width = geom.width;
    var period = width * 2;
    var offset = (t * BG_DRIFT_PX) % period;
    var len = Math.hypot(w, h);
    ctx.fillStyle = cfg.palette.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cfg.palette.fg;
    ctx.save();
    if (geom.direction === 'diagonal') { ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4); }
    var limit = geom.direction === 'vertical' ? w : (geom.direction === 'horizontal' ? h : len);
    var pos = -period + offset;
    while (pos < limit) {
      if (geom.direction === 'vertical') ctx.fillRect(pos, 0, width, h);
      else if (geom.direction === 'horizontal') ctx.fillRect(0, pos, w, width);
      else ctx.fillRect(-len, pos, len * 2, width);
      pos += period;
    }
    ctx.restore();
  }

  // 棋盘格：黑白交替，整体缓慢跳动
  function drawCheckerboard(ctx, t, cfg) {
    var w = cfg.w, h = cfg.h;
    var cell = cfg.geom.cell;
    var offset = (t * BG_DRIFT_PX) % cell;
    ctx.fillStyle = cfg.palette.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cfg.palette.fg;
    for (var gy = -1; gy * cell < h + cell; gy++) {
      for (var gx = -1; gx * cell < w + cell; gx++) {
        if (((gx + gy) & 1) === 0) ctx.fillRect(gx * cell + offset, gy * cell + offset, cell, cell);
      }
    }
  }

  // 对比条纹：方向随机 + 均匀条宽 40-100px，隔条填充，缓慢平移
  function drawStripes(ctx, t, cfg) {
    var w = cfg.w, h = cfg.h;
    var geom = cfg.geom;
    var width = geom.width;
    var period = width * 2;
    var offset = (t * BG_DRIFT_PX) % period;
    var len = Math.hypot(w, h);
    ctx.fillStyle = cfg.palette.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cfg.palette.fg;
    ctx.save();
    if (geom.direction === 'diagonal') { ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4); }
    var limit = geom.direction === 'vertical' ? w : (geom.direction === 'horizontal' ? h : len);
    var pos = -period + offset;
    while (pos < limit) {
      if (geom.direction === 'vertical') ctx.fillRect(pos, 0, width, h);
      else if (geom.direction === 'horizontal') ctx.fillRect(0, pos, w, width);
      else ctx.fillRect(-len, pos, len * 2, width);
      pos += period;
    }
    ctx.restore();
  }

  /* ---------- 引擎对象与公开 API ---------- */

  function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
  }

  // [min, max] 区间随机数
  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function createEngine(canvas, settings) {
    var st = {
      canvas: canvas,
      settings: settings,
      modeIndex: -1, prevModeIndex: -1,
      seed: 0, prevSeed: 0, geom: null, prevGeom: null,
      switchAt: 0, colorSwitchAt: 0,
      flickerHz: jitterHz(flickerHzForLevel(settings.flickerLevel)),
      paletteIndex: 0, prevPaletteIndex: -1,
      colorCrossfadeAt: 0,
      accents: [], accentAt: 0,
      geomSize: null,                // 几何生成时的画布尺寸（尺寸变化需重建）
      running: false, paused: false, pauseStart: null
    };

    function paletteOf(index) { return COLOR_PALETTES[index % COLOR_PALETTES.length]; }
    function currentPalette() { return paletteOf(st.paletteIndex); }
    function previousPalette() { return st.prevPaletteIndex >= 0 ? paletteOf(st.prevPaletteIndex) : currentPalette(); }

    // 进入新模式：换种子、重建几何、重置闪烁频率与点缀
    function newPattern(now) {
      st.modeIndex = nextBgModeIndex(st.modeIndex, st.settings.modes);
      if (st.modeIndex >= 0) {
        st.seed = (Math.random() * 1e9) >>> 0;
        st.geom = buildBgGeom(st.modeIndex, st.seed, canvas.width, canvas.height);
        st.geomSize = { w: canvas.width, h: canvas.height };
      }
      st.flickerHz = jitterHz(flickerHzForLevel(st.settings.flickerLevel));
      st.accents = [];
      st.accentAt = now + randRange(BG_ACCENT_MIN_MS, BG_ACCENT_MAX_MS);
    }

    // 混合模式彩色点缀：每 5-8s 穿插 1-2 个彩色圆点（上限 ACCENT_MAX，超出淘汰最旧）
    function addAccent() {
      var w = canvas.width, h = canvas.height;
      var count = Math.random() < 0.5 ? 1 : 2;
      for (var i = 0; i < count; i++) {
        st.accents.push({
          x: 20 + Math.random() * Math.max(1, w - 40),
          y: 20 + Math.random() * Math.max(1, h - 40),
          r: 10 + Math.random() * 14,
          color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]
        });
        if (st.accents.length > ACCENT_MAX) st.accents.shift();
      }
    }

    // 每帧推进计划：形状切换（15s）、配色轮换（5-8s）、混合模式点缀
    function advance(now) {
      if (now >= st.switchAt) {
        st.switchAt = now + BG_ROTATE_MS;
        if (st.settings.shapeChange || st.modeIndex < 0) {
          st.prevModeIndex = st.modeIndex;
          st.prevSeed = st.seed;
          st.prevGeom = st.geom;
          newPattern(now);
        }
      }
      if (now >= st.colorSwitchAt) {
        st.colorSwitchAt = now + BG_COLOR_MIN_MS + Math.random() * (BG_COLOR_MAX_MS - BG_COLOR_MIN_MS);
        if (st.settings.colorChange) {
          st.prevPaletteIndex = st.paletteIndex;
          st.paletteIndex = pickColorPalette(st.paletteIndex);
          st.colorCrossfadeAt = now;
        }
      }
      if (st.settings.colorMode === 'mixed' && now >= st.accentAt) {
        addAccent();
        st.accentAt = now + randRange(BG_ACCENT_MIN_MS, BG_ACCENT_MAX_MS);
      }
    }

    // 绘制单层图案（含形状交叉淡化：prev 淡出 + cur 淡入）
    function drawShapeLayer(ctx, now, state, palette, a) {
      var prev = state.prevModeIndex, cur = state.modeIndex;
      var w = state.canvas.width, h = state.canvas.height;
      if (cur < 0) { // 全部模式未勾选：纯背景色填充
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      if (prev >= 0 && prev !== cur && a > 0 && a < 1) {
        ctx.save(); ctx.globalAlpha *= (1 - a); drawOne(ctx, prev, now, state.prevGeom, palette, state.flickerHz); ctx.restore();
        ctx.save(); ctx.globalAlpha *= a; drawOne(ctx, cur, now, state.geom, palette, state.flickerHz); ctx.restore();
      } else {
        // 稳态：显示当前图案（覆盖初始 prev===cur 与过渡完成 a=1 两种情形）
        drawOne(ctx, cur, now, state.geom, palette, state.flickerHz);
      }
    }

    // 混合模式点缀绘制
    function drawAccents(ctx) {
      if (st.settings.colorMode !== 'mixed') return;
      for (var i = 0; i < st.accents.length; i++) {
        var it = st.accents[i];
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 全局闪烁叠加：方波明暗交替（比 v1.0 更明显）；red_flicker 自带闪烁，不叠加
    function drawFlickerOverlay(ctx, now) {
      if (!st.settings.flickerChange) return;
      if (st.modeIndex === 0) return;
      var period = 1000 / st.flickerHz;
      var phase = (now % period) / period; // 0..1
      ctx.save();
      ctx.globalAlpha = phase < 0.5 ? 0.55 : 0;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }

    // 合成一帧：黑底 → 配色交叉淡化（旧配色帧 + 新配色帧）→ 形状层 → 点缀 → 闪烁层
    function drawBgFrame(ctx, now) {
      var w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      var a = transitionAlpha(now, st.switchAt, BG_ROTATE_MS, BG_CROSSFADE_MS);
      var ca = transitionAlpha(now, st.colorCrossfadeAt, 1, BG_COLOR_CROSSFADE_MS);
      var blending = st.prevPaletteIndex >= 0 && ca > 0 && ca < 1;
      if (blending) {
        ctx.save(); ctx.globalAlpha = 1 - ca; drawShapeLayer(ctx, now, st, previousPalette(), a); ctx.restore();
        ctx.save(); ctx.globalAlpha = ca; drawShapeLayer(ctx, now, st, currentPalette(), a); ctx.restore();
      } else {
        drawShapeLayer(ctx, now, st, currentPalette(), a);
      }
      drawAccents(ctx);
      drawFlickerOverlay(ctx, now);
    }

    return {
      start: function () {
        if (!st.running) {
          var now = nowMs();
          st.running = true;
          st.paused = false;
          st.switchAt = now + BG_ROTATE_MS;
          st.colorSwitchAt = now + BG_COLOR_MIN_MS;
          newPattern(now);
          // 初始稳态：prev 即当前显示图案（a=0 时 prev 全显）
          st.prevModeIndex = st.modeIndex;
          st.prevSeed = st.seed;
          st.prevGeom = st.geom;
        }
      },
      stop: function () { st.running = false; st.paused = false; },
      pause: function () {
        if (st.running && !st.paused) {
          st.paused = true;
          st.pauseStart = nowMs();
        }
      },
      resume: function () {
        if (st.running && st.paused) {
          var d = nowMs() - st.pauseStart;
          st.switchAt += d;
          st.colorSwitchAt += d;
          st.accentAt += d;
          st.paused = false;
          st.pauseStart = null;
        }
      },
      draw: function (now) {
        if (!st.running || st.paused) return;
        advance(now);
        drawBgFrame(canvas.getContext('2d'), now);
      },
      applySettings: function (next) {
        st.settings = next;
        if (st.running) {
          var cur = st.modeIndex;
          var stillEnabled = cur >= 0 && cur < st.settings.modes.length && st.settings.modes[cur] === true;
          var sizeChanged = !st.geomSize || st.geomSize.w !== canvas.width || st.geomSize.h !== canvas.height;
          if (!stillEnabled) {
            st.prevModeIndex = cur;
            newPattern(nowMs());
          } else if (sizeChanged && cur >= 0) {
            // 画布尺寸变化：按同一种子重建几何（保持图案，避免跳变）
            st.geom = buildBgGeom(cur, st.seed, canvas.width, canvas.height);
            st.geomSize = { w: canvas.width, h: canvas.height };
          } else {
            st.flickerHz = jitterHz(flickerHzForLevel(st.settings.flickerLevel));
          }
        }
      },
      dispose: function () { st.running = false; st.paused = false; }
    };
  }

  /* ---------- 无头自测（Node 与 ?test=1 使用） ---------- */
  function runBgSelfTests() {
    var r = [];
    var check = function (name, ok) { r.push({ name: name, pass: !!ok }); };
    check('MODE_IDS 为 4 项', MODE_IDS.join(',') === 'red_flicker,cam_grating,checkerboard,stripes');
    check('FLICKER_LEVELS 为 1.2/2/3.2', FLICKER_LEVELS.join(',') === '1.2,2,3.2');
    check('flickerHzForLevel 映射', flickerHzForLevel(0) === 1.2 && flickerHzForLevel(1) === 2 && flickerHzForLevel(2) === 3.2);
    check('flickerHzForLevel 越界回退', flickerHzForLevel(9) === 3.2);
    var j = 0;
    for (var i = 0; i < 200; i++) { var v = jitterHz(2); if (v >= 1.6 && v <= 2.4) j++; }
    check('jitterHz 200 次均在 ±20%', j === 200);
    check('pickNextMode 无启用返回-1', pickNextMode(0, [false, false, false, false]) === -1);
    check('pickNextMode 单模式', pickNextMode(0, [false, true, false, false]) === 1);
    var noRepeat = true;
    var p = 0;
    for (var k = 0; k < 200; k++) { var n = pickNextMode(p, [true, true, true, true]); if (n === p || n < 0 || n > 3) noRepeat = false; p = n; }
    check('pickNextMode 200 次不重复且在范围内', noRepeat);
    check('nextBgModeIndex 全关-1', nextBgModeIndex(0, [false, false, false, false]) === -1);
    check('transitionAlpha 过渡边界', transitionAlpha(100, 100, 15000, 1000) === 0 && transitionAlpha(1100, 100, 15000, 1000) === 1 && Math.abs(transitionAlpha(600, 100, 15000, 1000) - 0.5) < 1e-9);
    check('buildBgGeom cam_grating 条宽范围', (function () { var g = buildBgGeom(1, 12345, 600, 600); return g.width >= 40 && g.width <= 80; })());
    check('COLOR_PALETTES 4 组', COLOR_PALETTES.length === 4);
    return r;
  }

  window.BgEngine = {
    create: createEngine,
    MODE_IDS: MODE_IDS,
    FLICKER_LEVELS: FLICKER_LEVELS,
    flickerHzForLevel: flickerHzForLevel,
    jitterHz: jitterHz,
    pickNextMode: pickNextMode,
    nextBgModeIndex: nextBgModeIndex,
    pickColorPalette: pickColorPalette,
    transitionAlpha: transitionAlpha,
    buildBgGeom: buildBgGeom,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    runSelfTests: runBgSelfTests
  };
})();
