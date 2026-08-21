# Amblyopia v2.0 多游戏架构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v1.0 单文件贪吃蛇重构为多文件多游戏架构：游戏挑选菜单 + 共享背景引擎 + 贪吃蛇 v2（G 画风、Esc 菜单、更快闪烁/配色、4 种平滑过渡背景），本地文件夹与 GitHub 均为 `Amblyopia_treatment_game`。

**Architecture:** 普通 `<script>` 顺序加载（非 ES Module），`file://` 双击即玩。`index.html` 承担菜单/路由/家长设置/自测入口；`js/bg-engine.js` 暴露 `window.BgEngine`（背景引擎，游戏无关）；`js/snake.js` 暴露 `window.SnakeGame`（贪吃蛇：纯逻辑 + DOM 接线）。核心逻辑保持纯函数、Node 无头可测，`?test=1` 与两个 Node 验证脚本继续作为质量闸门。

**Tech Stack:** 原生 HTML/CSS/JavaScript（零依赖、无构建）、Canvas 2D、Web Audio、localStorage。验证用 Node.js vm（无 jsdom）。

**基线:** 仓库 `D:\1000length\project\Amblyopia_treatment_game`，HEAD = `ec6a1f2`。v1.0 代码在 git 历史 `0c8353c:snake_game.html`，大量纯函数从此处迁移。

---

## 文件结构（本次计划创建/修改）

| 文件 | 职责 |
| --- | --- |
| `index.html` | 菜单页 + 路由 + 家长设置抽屉 + 自测入口 + 内联 App 层 |
| `css/style.css` | 全部样式（菜单卡片、抽屉、HUD、游戏屏、主题变量） |
| `js/bg-engine.js` | 共享背景引擎（4 模式、15s 切换、1s 过渡、5–8s 配色、闪烁） |
| `js/snake.js` | 贪吃蛇：纯逻辑 + G 画风渲染 + Esc 菜单 + 输入/音效/持久化 |
| `verify_snake.js` | Node 无头自测（读取 js 文件 + index.html 内联脚本合并运行） |
| `acceptance_check.js` | 静态检查 + DOM 桩冒烟验收 |
| `docs/superpowers/plans/2026-08-21-amblyopia-v2-plan.md` | 本计划 |
| `snake_game.html` | 最后删除（v1.0 单文件，内容已迁移，历史保留） |

**关键约定（所有 Task 遵守）：**
- 注释全中文；全局命名空间 `window.BgEngine` / `window.SnakeGame` / `window.App`。
- 纯函数与 DOM 初始化分离：`if (typeof window !== 'undefined' && typeof document !== 'undefined')` 守卫 DOM 接线。
- 每 Task 完成后跑 `node verify_snake.js` 与 `node acceptance_check.js`（最终 Task 前允许 verify 的用例数随实现增长，但必须全绿）。
- localStorage 键沿用：`amblyopia_snake_settings_v1`、`amblyopia_snake_highscore_v1`。
- settings.modes 由 v1.0 的 6 项变为 **4 项**：`[red_flicker, cam_grating, checkerboard, stripes]`；旧 6 项数据加载时映射为新 4 项（取旧索引 0,1,2,4），未知/越界回退默认。

---

### Task 1: 项目骨架与菜单页（index.html + css/style.css + js 桩）

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/bg-engine.js`（空桩：`window.BgEngine = { create: function(){ return null; } };`）
- Create: `js/snake.js`（空桩：`window.SnakeGame = { name: 'snake' };`）

- [ ] **Step 1: 创建 `js/bg-engine.js` 与 `js/snake.js` 空桩**（避免 file:// 下 script 404 报错）

```js
// js/bg-engine.js 空桩：Task 2 填充
window.BgEngine = { create: function () { return null; } };
```

```js
// js/snake.js 空桩：Task 3-4 填充
window.SnakeGame = { name: 'snake' };
```

- [ ] **Step 2: 创建 `index.html`**

要点（完整实现）：
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- 加载顺序：`css/style.css` → `js/bg-engine.js` → `js/snake.js` → 内联 `<script>`（Task 5 填充 App 层，本 Task 先放最小占位内联脚本：`console.log('app init');`）
- 结构：
  - `<div id="testBanner" class="hidden"></div>`（自测横幅）
  - `<div id="menuScreen" class="screen">`：标题、游戏卡片区（贪吃蛇卡片 `#card-snake` 含"开始"按钮 `#btnStartSnake`；两张占位卡片 `.card.card-soon` 文案"敬请期待"）、右上齿轮 `#btnOpenSettings`、底部遮眼提醒 `.eye-reminder`（`role="note"`，文字"请先遮盖好眼，只用弱视眼看"）
  - `<div id="gameScreen" class="screen hidden">`：HUD（分数/最高/速度/遮眼提示/暂停/静音）、`.board-wrap` 内 `#bgCanvas` + `#gameCanvas`
  - `<div id="gameMenuOverlay" class="overlay hidden">`：Esc 菜单（继续 `#btnResume` / 设置 `#btnMenuSettings` / 重新开始 `#btnRestart` / 返回游戏列表 `#btnBackMenu`）
  - `<div id="endOverlay" class="overlay hidden">`：本次分数/最高分/再玩一次
  - `<div id="drawerMask" class="mask hidden"></div>` + `<aside id="settingsDrawer" class="drawer hidden" role="dialog" aria-label="家长设置">`：闪烁档位单选（`name="flickerLevel"` value 0/1/2 对应 1.2/2/3.2Hz）、模式勾选（`name="mode"` value 与 MODE_IDS 一致 4 项）、配色模式单选（`name="colorMode"` contrast/mixed）、起始速度单选（`name="startSpeed"` 1–5）、音效开关 `#soundOn`、背景三开关 `#colorChange` `#shapeChange` `#flickerChange`、建议文案（"建议每次 10–15 分钟、每天 1–2 次；请遵医嘱；训练时遮盖好眼"）

- [ ] **Step 3: 创建 `css/style.css`**

要点（完整实现）：
- CSS 变量主题：`--color-accent`（默认黄 `#ffd400`）、深色/浅色背景、高对比配色组
- `.screen` 显隐：`.hidden { display: none !important; }`
- 菜单页：卡片网格（`flex`/`grid`），`.card`（圆角大色块、阴影），`.card-soon`（灰色、disabled 态），标题大字，`.eye-reminder`（大图标 + 大字）
- `.board-wrap`：`aspect-ratio: 1/1`、黑底、边框；`#bgCanvas`/`#gameCanvas` absolute 铺满
- `.hud`：flex 空间分布、遮眼提示、按钮样式
- `.overlay`/`.mask`：半透明遮罩、居中卡片
- `.drawer`：右侧滑出抽屉、`.setting-group`、`.option-row`
- `#gameScreen` 容器含 safe-area 单层：`padding-top: max(10px, env(safe-area-inset-top)); padding-left/right/bottom: max(16px, env(...))`
- 所有字体 `font-family: "Microsoft YaHei", "PingFang SC", sans-serif;`

- [ ] **Step 4: 冒烟验证**

Run:
```powershell
cd D:\1000length\project\Amblyopia_treatment_game
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');['menuScreen','gameScreen','settingsDrawer','gameMenuOverlay','btnStartSnake','card-soon','viewport-fit=cover'].forEach(k=>{if(!h.includes(k)){console.error('MISSING '+k);process.exit(1)}});console.log('T1 OK')"
```
Expected: `T1 OK`

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/bg-engine.js js/snake.js
git commit -m "feat: v2.0骨架与游戏菜单页"
```

---

### Task 2: 共享背景引擎（js/bg-engine.js）

**Files:**
- Modify: `js/bg-engine.js`（替换空桩为完整引擎）

**前置说明：** 模式/几何绘制/配色/闪烁逻辑从 `git show 0c8353c:snake_game.html` 迁移，按本 Task 的新常量与新 API 调整。迁移前先运行 `git show 0c8353c:snake_game.html > $env:TEMP\v1_snake.html` 备用。

- [ ] **Step 1: 定义常量与 settings 结构**

```js
(function () {
  'use strict';
  var GRID_UNUSED = 21; // 背景引擎不再依赖网格，仅为兼容保留
  var MODE_IDS = ['red_flicker', 'cam_grating', 'checkerboard', 'stripes']; // 4 种，已删 dots/fun_shapes
  var FLICKER_LEVELS = [1.2, 2, 3.2]; // 慢/中/快 Hz（v2.0 加快）
  var BG_FLICKER_JITTER = 0.2; // ±20%
  var BG_ROTATE_MS = 15000;    // 形状 15s 切换
  var BG_CROSSFADE_MS = 1000;  // 1s 淡入淡出
  var BG_COLOR_MIN_MS = 5000;  // 配色 5–8s 独立轮换
  var BG_COLOR_MAX_MS = 8000;
  var COLOR_PALETTES = [
    { bg: '#000000', fg: '#ffffff' },
    { bg: '#ffffff', fg: '#000000' },
    { bg: '#0000a8', fg: '#ffffff' },
    { bg: '#003300', fg: '#ffff00' }
  ];
  var ACCENT_COLORS = ['#ff2d2d', '#ffd400', '#00e5ff', '#ff66ff', '#7cff00', '#ff9d00'];
  var DEFAULT_SETTINGS = {
    flickerLevel: 1,
    modes: [true, true, true, true],
    colorMode: 'contrast',
    soundOn: true,
    colorChange: true,
    shapeChange: true,
    flickerChange: true
  };
```

- [ ] **Step 2: 纯函数（Node 可测）**

从 v1.0 迁移并调整以下函数（`git show 0c8353c:snake_game.html` 中的对应实现），全部保持纯函数：

```js
  function flickerHzForLevel(level) {
    if (level < 0 || level >= FLICKER_LEVELS.length) return FLICKER_LEVELS[FLICKER_LEVELS.length - 1];
    return FLICKER_LEVELS[level];
  }
  function jitterHz(baseHz) {
    return baseHz * (1 + (Math.random() * 2 - 1) * BG_FLICKER_JITTER);
  }
  function pickNextMode(previousIndex, enabledModes) {
    var enabled = [];
    for (var i = 0; i < enabledModes.length; i++) if (enabledModes[i]) enabled.push(i);
    if (enabled.length === 0) return -1;
    if (enabled.length === 1) return enabled[0];
    var next = previousIndex;
    while (next === previousIndex) next = enabled[Math.floor(Math.random() * enabled.length)];
    return next;
  }
  function nextBgModeIndex(previousIndex, enabledModes) {
    if (enabledModes.indexOf(true) === -1) return -1;
    return pickNextMode(previousIndex, enabledModes);
  }
  function pickColorPalette(previousIndex) {
    if (COLOR_PALETTES.length <= 1) return 0;
    var next = previousIndex;
    while (next === previousIndex) next = Math.floor(Math.random() * COLOR_PALETTES.length);
    return next;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildBgGeom(modeIndex, seed, w, h) {
    // 4 模式几何：red_flicker 无几何；cam_grating 条宽 40-80px+方向；
    // checkerboard 格数；stripes 方向(horizontal/vertical/diagonal)+条宽。
    // 从 v1.0 迁移 buildBgGeom 并去掉 dots/fun_shapes 分支。
    var rnd = mulberry32(seed);
    if (modeIndex === 1) {
      return { direction: ['horizontal', 'vertical', 'diagonal'][Math.floor(rnd() * 3)], width: 40 + Math.floor(rnd() * 41) };
    }
    if (modeIndex === 2) {
      return { cell: Math.max(8, Math.round(Math.min(w, h) / 21)) };
    }
    if (modeIndex === 3) {
      return { direction: ['horizontal', 'vertical', 'diagonal'][Math.floor(rnd() * 3)], width: 40 + Math.floor(rnd() * 61) };
    }
    return { none: true };
  }
  function transitionAlpha(now, switchAt, rotateMs, crossfadeMs) {
    // 返回 [0,1]：切换瞬间(now=switchAt)旧=1新=0；crossfadeMs 内线性过渡到新=1
    var el = now - switchAt;
    if (el <= 0) return 0;
    if (el >= crossfadeMs) return 1;
    return el / crossfadeMs;
  }
```

- [ ] **Step 3: 模式绘制器（drawBgFrame 系列）**

从 v1.0 迁移 `drawRedFlicker / drawCamGrating / drawCheckerboard / drawStripes`（去掉 dots/fun_shapes），新增过渡合成：当 `transitionAlpha` 处于 `(0,1)` 区间时，同时绘制上一模式（alpha = 1 - a）与当前模式（alpha = a）。实现：

```js
  var BG_DRAWERS = [drawRedFlicker, drawCamGrating, drawCheckerboard, drawStripes]; // 索引与 MODE_IDS 对齐

  function drawBgFrame(ctx, now, state) {
    var w = state.canvas.width, h = state.canvas.height;
    var a = transitionAlpha(now, state.switchAt, BG_ROTATE_MS, BG_CROSSFADE_MS);
    var prev = state.prevModeIndex, cur = state.modeIndex;
    if (prev >= 0 && a > 0 && a < 1) {
      // 旧模式淡出
      ctx.save(); ctx.globalAlpha = 1 - a;
      drawOne(ctx, prev, now, state.prevGeom, state.prevSeed);
      ctx.restore();
    }
    // 新模式（含纯色路径 bgModeIndex===-1）
    ctx.save(); ctx.globalAlpha = cur < 0 ? 1 : a;
    if (cur < 0) {
      ctx.fillStyle = paletteOf(state).bg;
      ctx.fillRect(0, 0, w, h);
    } else {
      drawOne(ctx, cur, now, state.geom, state.seed);
    }
    ctx.restore();
    // 配色淡入淡出（colorCrossfade 与形状过渡独立）
    var ca = transitionAlpha(now, state.colorSwitchAt, 1, 500);
    // ... 配色轮换按 5-8s 周期；闪烁叠加见 Step 4
  }
```

其中 `drawOne(ctx, modeIndex, now, geom, seed)` 按模式分派到 4 个绘制器；配色轮换计划 `state.colorSwitchAt` 由 `advance()` 按 `BG_COLOR_MIN_MS + rand*(BG_COLOR_MAX_MS-BG_COLOR_MIN_MS)` 推进；`state.switchAt` 每 `BG_ROTATE_MS` 推进并调用 `nextBgModeIndex` 取新模式、`buildBgGeom` 重建几何、重取闪烁频率 `jitterHz(flickerHzForLevel(settings.flickerLevel))`。

- [ ] **Step 4: 闪烁层**

```js
  function drawFlickerOverlay(ctx, now, state) {
    if (!state.settings.flickerChange) return;
    if (state.modeIndex === 0) return; // red_flicker 自带闪烁
    var period = 1000 / state.flickerHz;
    var phase = (now % period) / period; // 0..1
    // v2.0 增强：明暗区间 0→0.55（比 v1.0 更明显的对比）
    ctx.save();
    ctx.globalAlpha = phase < 0.5 ? 0.55 : 0;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    ctx.restore();
  }
```

- [ ] **Step 5: 引擎对象与公开 API**

```js
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
      running: false, paused: false, pauseStart: null
    };
    function paletteOf() { return COLOR_PALETTES[st.paletteIndex % COLOR_PALETTES.length]; }
    function newPattern(now) {
      st.modeIndex = nextBgModeIndex(st.modeIndex, st.settings.modes);
      if (st.modeIndex >= 0) { st.seed = (Math.random() * 1e9) >>> 0; st.geom = buildBgGeom(st.modeIndex, st.seed, canvas.width, canvas.height); }
      st.flickerHz = jitterHz(flickerHzForLevel(st.settings.flickerLevel));
    }
    function advance(now) {
      // 形状切换
      if (now >= st.switchAt) {
        st.prevModeIndex = st.modeIndex; st.prevSeed = st.seed; st.prevGeom = st.geom;
        st.switchAt = now + BG_ROTATE_MS;
        newPattern(now);
      }
      // 配色轮换（5-8s）
      if (now >= st.colorSwitchAt) {
        st.prevPaletteIndex = st.paletteIndex;
        st.paletteIndex = pickColorPalette(st.paletteIndex);
        st.colorCrossfadeAt = now;
        st.colorSwitchAt = now + BG_COLOR_MIN_MS + Math.random() * (BG_COLOR_MAX_MS - BG_COLOR_MIN_MS);
      }
    }
    return {
      start: function () { if (!st.running) { var now = performance.now(); st.running = true; st.paused = false; st.switchAt = now + BG_ROTATE_MS; st.colorSwitchAt = now + BG_COLOR_MIN_MS; newPattern(now); } },
      stop: function () { st.running = false; st.paused = false; },
      pause: function () { if (st.running && !st.paused) { st.paused = true; st.pauseStart = performance.now(); } },
      resume: function () { if (st.running && st.paused) { var d = performance.now() - st.pauseStart; st.switchAt += d; st.colorSwitchAt += d; st.paused = false; st.pauseStart = null; } },
      draw: function (now) { if (!st.running || st.paused) return; advance(now); drawBgFrame(canvas.getContext('2d'), now, st); },
      applySettings: function (next) { st.settings = next; if (st.running) newPattern(performance.now()); },
      dispose: function () { st.running = false; }
    };
  }
  window.BgEngine = { create: createEngine, MODE_IDS: MODE_IDS, FLICKER_LEVELS: FLICKER_LEVELS, flickerHzForLevel: flickerHzForLevel, jitterHz: jitterHz, pickNextMode: pickNextMode, nextBgModeIndex: nextBgModeIndex, pickColorPalette: pickColorPalette, transitionAlpha: transitionAlpha, buildBgGeom: buildBgGeom, DEFAULT_SETTINGS: DEFAULT_SETTINGS };
```

- [ ] **Step 6: Node 无头自测（在引擎文件末尾追加，供 verify 脚本使用）**

```js
  function runBgSelfTests() {
    var r = []; var check = function (name, ok) { r.push({ name: name, pass: !!ok }); };
    check('MODE_IDS 为 4 项', MODE_IDS.join(',') === 'red_flicker,cam_grating,checkerboard,stripes');
    check('FLICKER_LEVELS 为 1.2/2/3.2', FLICKER_LEVELS.join(',') === '1.2,2,3.2');
    check('flickerHzForLevel 映射', flickerHzForLevel(0) === 1.2 && flickerHzForLevel(1) === 2 && flickerHzForLevel(2) === 3.2);
    check('flickerHzForLevel 越界回退', flickerHzForLevel(9) === 3.2);
    var j = 0; for (var i = 0; i < 200; i++) { var v = jitterHz(2); if (v >= 1.6 && v <= 2.4) j++; }
    check('jitterHz 200 次均在 ±20%', j === 200);
    check('pickNextMode 无启用返回-1', pickNextMode(0, [false, false, false, false]) === -1);
    check('pickNextMode 单模式', pickNextMode(0, [false, true, false, false]) === 1);
    var noRepeat = true;
    var p = 0; for (var k = 0; k < 200; k++) { var n = pickNextMode(p, [true, true, true, true]); if (n === p || n < 0 || n > 3) noRepeat = false; p = n; }
    check('pickNextMode 200 次不重复且在范围内', noRepeat);
    check('nextBgModeIndex 全关-1', nextBgModeIndex(0, [false, false, false, false]) === -1);
    check('transitionAlpha 过渡边界', transitionAlpha(100, 100, 15000, 1000) === 0 && transitionAlpha(1100, 100, 15000, 1000) === 1 && Math.abs(transitionAlpha(600, 100, 15000, 1000) - 0.5) < 1e-9);
    check('buildBgGeom cam_grating 条宽范围', (function () { var g = buildBgGeom(1, 12345, 600, 600); return g.width >= 40 && g.width <= 80; })());
    check('COLOR_PALETTES 4 组', COLOR_PALETTES.length === 4);
    return r;
  }
  window.BgEngine.runSelfTests = runBgSelfTests;
})();
```

- [ ] **Step 7: 运行自测**

Run: `node -e "const fs=require('fs');const vm=require('vm');const s={console,Math,performance:{now:()=>0}};s.window=s;s.globalThis=s;vm.createContext(s);vm.runInContext(fs.readFileSync('js/bg-engine.js','utf8'),s);const r=s.BgEngine.runSelfTests();let f=0;r.forEach(x=>{if(!x.pass){f++;console.log('FAIL '+x.name)}});console.log('BG SELF-TEST PASS '+(r.length-f)+'/'+r.length);if(f)process.exit(1)"`
Expected: `BG SELF-TEST PASS 12/12`

- [ ] **Step 8: Commit**

```bash
git add js/bg-engine.js
git commit -m "feat: v2.0共享背景引擎（4模式/15s过渡/5-8s配色/闪烁档位）"
```

---

### Task 3: 贪吃蛇纯逻辑迁移（js/snake.js 第 1 部分）

**Files:**
- Modify: `js/snake.js`（替换空桩为：常量 + 纯函数 + 自测）

- [ ] **Step 1: 从 v1.0 迁移纯函数**

Run: `git show 0c8353c:snake_game.html > $env:TEMP\v1_snake.html`

从 `$env:TEMP\v1_snake.html` 原样迁移到 `js/snake.js`（函数体不变，注释保留中文）：
- 常量：`GRID_SIZE = 21`、`SPEED_START_MS = 180`、`SPEED_MIN_MS = 60`、`SPEED_STEP = 5`、`SPEED_DELTA_MS = 20`、`MAX_SPEED_LEVEL`、`DIR_VECTORS`
- 函数：`dirToVector / nextHead / isWallCollision / isSelfCollision / randomFoodCell / speedForLevel / speedLevelForDisplay / initialSpeedMs / isOppositeDir / canSetDirection / setDirection / directionForKey / steerByMouse / togglePause / handleGameKey / createInitialState / stepGame`
- 其余 v1.0 内容（背景、设置、DOM 接线、音效、自测中的背景部分）不迁移。

- [ ] **Step 2: 追加 snake 自测函数（供 verify 与 ?test=1）**

在 `js/snake.js` 末尾追加：

```js
  window.SnakeGame = { name: 'snake' };
  window.SnakeGame.runSelfTests = function () {
    // 从 v1.0 自测迁移核心逻辑用例（dirToVector/nextHead/碰撞/stepGame/方向/鼠标/速度），
    // 删除背景/配色/闪烁相关用例（已移至 bg-engine）。
    // 数量预期 >= 90 项，全部 PASS。
  };
```

自测用例直接从 `$env:TEMP\v1_snake.html` 的 `runSelfTests` 中保留蛇相关检查项（含 `check('...')` 调用），移除 `pickNextMode/COLOR_PALETTES/jitterHz/mulberry32/buildBgGeom/背景设置/defaultSettings/loadSettings/saveSettings/shouldPlaySound/computeBoardSize` 相关项（这些迁移到 bg-engine 或由 Task 5 提供）。

- [ ] **Step 3: Node 自测**

Run: `node -e "const fs=require('fs');const vm=require('vm');const s={console,Math,JSON,performance:{now:()=>0}};s.window=s;s.globalThis=s;vm.createContext(s);vm.runInContext(fs.readFileSync('js/snake.js','utf8'),s);const r=s.SnakeGame.runSelfTests();let f=0;r.forEach(x=>{if(!x.pass){f++;console.log('FAIL '+x.name)}});console.log('SNAKE SELF-TEST PASS '+(r.length-f)+'/'+r.length);if(f)process.exit(1)"`
Expected: `SNAKE SELF-TEST PASS <N>/<N>`（N≥90，无 FAIL）

- [ ] **Step 4: Commit**

```bash
git add js/snake.js
git commit -m "feat: 贪吃蛇核心逻辑迁移（纯函数+自测）"
```

---

### Task 4: 贪吃蛇 DOM 接线、G 画风与 Esc 菜单（js/snake.js 第 2 部分）

**Files:**
- Modify: `js/snake.js`（追加 DOM 接线：`if (typeof window !== 'undefined' && typeof document !== 'undefined')` 守卫内）

- [ ] **Step 1: 新增 G 画风渲染 `renderGame`**

替换 v1.0 方块渲染为（完整实现）：

```js
  function drawRoundCell(ctx, x, y, size, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
  }
  function renderGame() {
    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas.getContext('2d');
    var cell = canvas.width / GRID_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 蛇身：深绿渐变圆角大色块
    for (var i = state.snake.length - 1; i >= 1; i--) {
      var seg = state.snake[i];
      var gb = ctx.createLinearGradient(seg.x * cell, seg.y * cell, seg.x * cell + cell, seg.y * cell + cell);
      gb.addColorStop(0, '#43A047'); gb.addColorStop(1, '#2E7D32');
      ctx.fillStyle = gb;
      drawRoundCell(ctx, seg.x * cell + 1, seg.y * cell + 1, cell - 2, cell * 0.3);
      ctx.fill();
    }
    // 蛇头：亮绿 + 白底黑瞳大眼睛
    var head = state.snake[0];
    var gh = ctx.createLinearGradient(head.x * cell, head.y * cell, head.x * cell + cell, head.y * cell + cell);
    gh.addColorStop(0, '#66BB6A'); gh.addColorStop(1, '#43A047');
    ctx.fillStyle = gh;
    drawRoundCell(ctx, head.x * cell + 1, head.y * cell + 1, cell - 2, cell * 0.3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(head.x * cell + cell * 0.68, head.y * cell + cell * 0.4, cell * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath(); ctx.arc(head.x * cell + cell * 0.7, head.y * cell + cell * 0.42, cell * 0.08, 0, Math.PI * 2); ctx.fill();
    // 食物：大红果 + 绿叶 + 高光
    if (state.food) {
      var f = state.food, cx = f.x * cell + cell / 2, cy = f.y * cell + cell / 2, r = cell * 0.42;
      var gf = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.2, cx, cy, r);
      gf.addColorStop(0, '#ff8a80'); gf.addColorStop(1, '#d50000');
      ctx.fillStyle = gf;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7cff00';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy - r * 0.8); ctx.lineTo(cx + r * 0.4, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.6, cy - r * 1.4); ctx.lineTo(cx, cy - r * 1.05); ctx.lineTo(cx - r * 0.6, cy - r * 1.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }
```

- [ ] **Step 2: Esc 游戏菜单**

在 DOM 守卫内实现（完整）：
- `state.menuOpen` 字段（`createInitialState` 增加 `menuOpen: false`）。
- `openGameMenu()`：`state.paused = true; state.menuOpen = true;` 显示 `#gameMenuOverlay`，同步暂停按钮文案与背景相位。
- `closeGameMenu()`：`state.menuOpen = false; state.paused = false;` 隐藏遮罩，恢复背景循环。
- `resumeGame / restartGame / backToMenu`：绑定到 `#btnResume / #btnRestart / #btnBackMenu`。
- `backToMenu()`：停止主循环与背景循环，隐藏 `#gameScreen`，显示 `#menuScreen`，重置状态。
- 键盘：`onKeyDown` 中新增 `case 'Escape'`（`e.key === 'Escape'`）→ 若游戏中且未 gameOver：`menuOpen ? closeGameMenu() : openGameMenu()`。
- 暂停按钮 `#btnPause` 与 Esc 菜单互斥：点暂停按钮 → `openGameMenu()`（统一走 Esc 菜单）；`syncPauseButton` 文案按 `state.paused` 更新。

- [ ] **Step 3: 背景引擎装配与主循环**

- 每帧：`bgEngine.draw(now)`（在 `bgLoop` 中调用，替代 v1.0 的 `drawBgFrame`）；主循环保持 `tick()/renderGame()` 节奏。
- 游戏启动 `startGame()`：创建 `bgEngine = BgEngine.create(document.getElementById('bgCanvas'), settings)`；`bgEngine.start()`；暂停/恢复/结束/返回菜单时对应 `bgEngine.pause()/resume()/stop()`。
- 尺寸变化：复用 `applyResponsiveLayout`（从 v1.0 迁移 `computeBoardSize` + DPR 逻辑；`bgGeomDirty` 语义由引擎 `applySettings`/重建几何替代——尺寸变化时调用 `bgEngine.applySettings(settings)` 触发重取几何即可）。

- [ ] **Step 4: 音效与最高分/设置持久化**

- 从 v1.0 迁移：`playTone / eatSound / overSound / shouldPlaySound / ensureAudioContext`、`readHighScore / writeHighScore / syncHighScore`、`loadSettings / saveSettings`（settings 结构改为 Task 2 的 4 项 modes，含 6 项旧数据兼容映射：`if (Array.isArray(saved.modes) && saved.modes.length === 6) out.modes = [saved.modes[0], saved.modes[1], saved.modes[2], saved.modes[4]];`）。
- 设置抽屉与 HUD 按钮接线从 v1.0 迁移（`backfillRadio / bindRadios / modeBoxes / soundOn / btnMute / colorChange / shapeChange / flickerChange`），模式勾选循环改为遍历 4 项。

- [ ] **Step 5: Node + 浏览器桩冒烟**

- Node：`node verify_snake.js`（Task 6 前暂不要求全绿；本 Task 结束前至少 `node -e` 单文件自测仍全绿）。
- 浏览器桩：使用 Task 6 的 `acceptance_check.js` 骨架前，先手工核对以下 DOM 行为（或直接在浏览器 `file://` 打开验证）：
  1. 点击"开始"进入游戏，蛇按 G 画风渲染（圆角+眼睛、大果食物）
  2. 按 `Esc` 弹出菜单（继续/设置/重新开始/返回游戏列表）
  3. "设置"打开抽屉并暂停；"继续"恢复
  4. "返回游戏列表"回到菜单页
- 由于本 Task 依赖 `index.html` 内联 App 层（Task 5），DOM 行为验证放 Task 5 完成后统一执行。

- [ ] **Step 6: Commit**

```bash
git add js/snake.js
git commit -m "feat: 贪吃蛇G画风渲染与Esc游戏菜单"
```

---

### Task 5: 应用层（index.html 内联 App 脚本）

**Files:**
- Modify: `index.html`（把 Task 1 的占位内联脚本替换为完整 App 层）

- [ ] **Step 1: 全局 settings 与 App 路由**

```js
(function () {
  'use strict';
  var SETTINGS_KEY = 'amblyopia_snake_settings_v1';
  function loadSettings() {
    var out = JSON.parse(JSON.stringify(BgEngine.DEFAULT_SETTINGS));
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          var s = JSON.parse(raw);
          if (typeof s.flickerLevel === 'number' && s.flickerLevel >= 0 && s.flickerLevel < 3) out.flickerLevel = Math.floor(s.flickerLevel);
          if (Array.isArray(s.modes)) {
            if (s.modes.length === 6) out.modes = [!!s.modes[0], !!s.modes[1], !!s.modes[2], !!s.modes[4]]; // v1.0 兼容
            else if (s.modes.length === 4) out.modes = [!!s.modes[0], !!s.modes[1], !!s.modes[2], !!s.modes[3]];
          }
          if (s.colorMode === 'contrast' || s.colorMode === 'mixed') out.colorMode = s.colorMode;
          if (typeof s.startSpeed === 'number' && s.startSpeed >= 1 && s.startSpeed <= 5) out.startSpeed = Math.floor(s.startSpeed);
          if (typeof s.soundOn === 'boolean') out.soundOn = s.soundOn;
          ['colorChange', 'shapeChange', 'flickerChange'].forEach(function (k) { if (typeof s[k] === 'boolean') out[k] = s[k]; });
        }
      }
    } catch (e) { /* 损坏 JSON 回退默认 */ }
    return out;
  }
  function saveSettings(s) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  var settings = loadSettings();
  window.App = {
    settings: settings,
    showScreen: function (name) {
      document.getElementById('menuScreen').classList.toggle('hidden', name !== 'menu');
      document.getElementById('gameScreen').classList.toggle('hidden', name !== 'game-snake');
    }
  };
```

- [ ] **Step 2: 菜单页接线**

```js
  // 开始贪吃蛇
  document.getElementById('btnStartSnake').addEventListener('click', function () {
    App.showScreen('game-snake');
    if (window.SnakeGame && SnakeGame.start) SnakeGame.start(settings);
  });
  // 返回菜单（由 SnakeGame.backToMenu 调用）
  window.App.backFromGame = function () { App.showScreen('menu'); };
```

- [ ] **Step 3: 家长设置抽屉（菜单页与游戏内共用）**

从 Task 4 的 snake.js 迁移抽屉绑定逻辑到 App 层（或由 snake.js 暴露 `SnakeGame.bindSettingsUI()`，App 在两种屏幕均调用一次）。绑定项：`flickerLevel / mode(4) / colorMode / startSpeed / soundOn / colorChange / shapeChange / flickerChange`，变更即时 `saveSettings` 并通知 `bgEngine.applySettings(settings)`（若游戏在运行）。

- [ ] **Step 4: 菜单页背景预览（可选增强）**

菜单页在 `#menuScreen` 内放置一个预览 canvas，使用同一 `BgEngine.create` 实例运行 4 模式轮换（弱化尺寸，`computeBoardSize` 复用），让家长在进入游戏前也能看到刺激背景效果。若实现，需在返回菜单时 `bgEngine.stop()` 并新建预览实例。

- [ ] **Step 5: ?test=1 自测入口**

```js
  if (new URLSearchParams(window.location.search).has('test')) {
    var all = [];
    if (window.SnakeGame && SnakeGame.runSelfTests) all = all.concat(SnakeGame.runSelfTests());
    if (window.BgEngine && BgEngine.runSelfTests) all = all.concat(BgEngine.runSelfTests());
    var pass = 0, fail = 0;
    all.forEach(function (r) { if (r.pass) pass++; else { fail++; console.log('FAIL ' + r.name); } });
    var banner = document.getElementById('testBanner');
    banner.textContent = 'SELF-TEST PASS (' + pass + ')/FAIL (' + fail + ')';
    banner.classList.remove('hidden');
    banner.classList.add(fail === 0 ? 'test-pass' : 'test-fail');
  }
```

- [ ] **Step 6: 浏览器手工冒烟**

双击 `index.html`（file://）验证：
1. 菜单页显示贪吃蛇卡片 + 2 张"敬请期待" + 遮眼提醒；齿轮打开设置抽屉
2. 开始游戏：G 画风蛇/食物可见，键盘/WASD 与鼠标跟随可用，背景 4 模式轮换且 15s 切换平滑、配色 5–8s 变化、闪烁明显
3. `Esc` 弹出菜单，四个按钮分别生效；设置变更即时生效并刷新后保留
4. 结束流程：撞墙/撞身后显示结束浮层，最高分持久化
5. 返回游戏列表回到菜单页

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: 应用层路由/设置抽屉/自测入口"
```

---

### Task 6: 验证脚本更新（verify_snake.js / acceptance_check.js）

**Files:**
- Modify: `verify_snake.js`
- Modify: `acceptance_check.js`

- [ ] **Step 1: 更新 `verify_snake.js`**

改为读取 `js/bg-engine.js` + `js/snake.js` + `index.html` 内联 `<script>`（不含 src 的）合并后，在 Node vm 运行 `globalThis.__snakeTests.runSelfTests()`（由 App 层在 `?test=1` 分支暴露 `window.__snakeTests = { runSelfTests: function () { return SnakeGame.runSelfTests().concat(BgEngine.runSelfTests()); } }`）。无 DOM 时跳过 DOM 初始化。输出 `SELF-TEST PASS <N>/<N>`。

- [ ] **Step 2: 更新 `acceptance_check.js`**

静态检查改为针对多文件：
- `index.html` 含菜单卡片（`btnStartSnake`）、2 张 `card-soon`、`gameMenuOverlay` 与四个按钮、`viewport-fit=cover`、加载顺序正确
- `js/bg-engine.js` 含 `MODE_IDS` 4 项（无 dots/fun_shapes）、`BG_ROTATE_MS = 15000`、`BG_CROSSFADE_MS = 1000`、`FLICKER_LEVELS = [1.2, 2, 3.2]`、颜色周期 5000/8000
- `js/snake.js` 含 `Escape` 处理、G 画风锚点（`drawRoundCell`、眼睛、大果）、`backToMenu`
- 无外链（`http`/`https` src/href、`@import`）
- DOM 桩冒烟：合并加载全部 js 后模拟"菜单→开始→Esc 菜单→继续→设置→返回菜单"流程无异常，设置写入 localStorage

- [ ] **Step 3: 全量验证**

Run:
```powershell
cd D:\1000length\project\Amblyopia_treatment_game
node verify_snake.js
node acceptance_check.js
```
Expected: 两者均 PASS 且退出码 0（verify ≥ 102 项；acceptance ≥ 30 项）。

- [ ] **Step 4: Commit**

```bash
git add verify_snake.js acceptance_check.js index.html
git commit -m "test: v2.0验证脚本适配多文件架构"
```

---

### Task 7: 收尾（删除 v1.0、最终验收、文档）

**Files:**
- Delete: `snake_game.html`
- Modify: `docs/superpowers/specs/2026-08-21-amblyopia-v2-design.md`（验收清单勾选）

- [ ] **Step 1: 删除 v1.0 单文件**

```bash
git rm snake_game.html
```

- [ ] **Step 2: 更新 spec 验收清单**

把 `2026-08-21-amblyopia-v2-design.md` 第十二节的 12 个 `- [ ]` 改为 `- [x]`（已通过验证）。

- [ ] **Step 3: 全量最终验证**

Run:
```powershell
node verify_snake.js
node acceptance_check.js
git status --short
```
Expected: 全绿、退出码 0、工作区只剩预期文件。

- [ ] **Step 4: 手工验收（file://）**

双击 `index.html`，按 spec 第十二节逐条人工确认（菜单/进游戏/Esc 菜单/背景/画风/持久化/音效/遮眼提醒）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: v2.0收尾（移除v1.0单文件并更新验收清单）"
```

- [ ] **Step 6: 汇报**

汇总：文件清单、自测数量、验收结果、git log、是否推送 GitHub（待用户决定）。

---

## 自审记录

**1. Spec 覆盖：**
- 多文件架构与加载顺序 → Task 1、5
- 游戏菜单页（卡片+占位）→ Task 1
- 背景引擎（4 模式/15s/1s/5–8s/闪烁档位）→ Task 2
- 贪吃蛇 G 画风 → Task 4
- Esc 菜单（继续/设置/重新开始/返回列表）→ Task 4、5
- 家长设置抽屉与持久化（含 v1.0 兼容）→ Task 4、5
- 平板/自适应预留 → Task 1（safe-area）、Task 4（computeBoardSize 迁移）
- 验证策略（verify/acceptance/?test=1）→ Task 2/3/5/6
- 交付动作（删 v1.0、文件夹改名已完成）→ Task 7

**2. 占位符扫描：** 无 TBD/TODO；迁移类步骤给出精确提取命令与修改点；自测迁移给出来源文件与保留/删除清单。

**3. 类型一致性：** `BgEngine.create(canvas, settings)` 返回 `{start,stop,pause,resume,draw,applySettings,dispose}` 全计划一致；`SnakeGame.start(settings)` 在 Task 4 定义、Task 5 调用一致；settings.modes 4 项在 Task 2/4/5/6 一致；`transitionAlpha(now, switchAt, rotateMs, crossfadeMs)` 定义与使用一致。
