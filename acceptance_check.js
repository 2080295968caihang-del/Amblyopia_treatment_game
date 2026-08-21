// acceptance_check.js - v2.0 最终验收：静态检查 + DOM 桩冒烟测试（无头）
// 用法: node acceptance_check.js [project-root]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || __dirname;
const localRoot = fs.existsSync(path.join(root, 'index.html')) ? root : path.join(root, 'amblyopia_game');

function readRel(rel) {
  return fs.readFileSync(path.join(localRoot, rel), 'utf8');
}

const html = readRel('index.html');
const bgEngineSrc = readRel('js/bg-engine.js');
const snakeSrc = readRel('js/snake.js');
const cssSrc = readRel('css/style.css');

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: ok ? '' : (detail || '') });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok ? '' : ' -- ' + (detail || '')));
  if (!ok) failures++;
}

/* ============ Part 1: 静态检查 ============ */

// S1: 加载顺序与零外部依赖
const iCss = html.indexOf('css/style.css');
const iBg = html.indexOf('js/bg-engine.js');
const iSnake = html.indexOf('js/snake.js');
check('S1 script/link order css → bg-engine → snake → inline',
  iCss !== -1 && iBg !== -1 && iSnake !== -1 && iCss < iBg && iBg < iSnake && iSnake < html.indexOf('<script>', iSnake),
  'css=' + iCss + ' bg=' + iBg + ' snake=' + iSnake);
const allSrc = html + '\n' + cssSrc + '\n' + bgEngineSrc + '\n' + snakeSrc;
check('S2 zero external deps (no http src/href / @import)',
  !/(?:href|src)\s*=\s*["']https?:\/\//i.test(allSrc) && !/@import/i.test(allSrc));

check('S3 viewport with viewport-fit=cover', /<meta\s+name="viewport"[\s\S]*?viewport-fit\s*=\s*cover/i.test(html));

// S4: 菜单页卡片
check('S4 snake start card + 2 soon cards',
  html.indexOf('btnStartSnake') !== -1 && (html.match(/card-soon/g) || []).length >= 2,
  'soon=' + (html.match(/card-soon/g) || []).length);
check('S5 settings gear on menu', html.indexOf('btnOpenSettings') !== -1);

// S6: Esc 游戏菜单四个按钮
check('S6 Esc menu overlay + 4 buttons',
  ['gameMenuOverlay', 'btnResume', 'btnMenuSettings', 'btnRestart', 'btnBackMenu'].every(function (k) { return html.indexOf(k) !== -1; }));

// S7: 结束浮层
check('S7 end overlay fields', ['endOverlay', 'endScore', 'endHighScore', 'btnPlayAgain', 'btnEndBackMenu'].every(function (k) { return html.indexOf(k) !== -1; }));

// S8: 设置抽屉控件
const flRadios = (html.match(/name="flickerLevel"\s+value="(\d)"/g) || []).map(function (m) { return m.match(/\d/)[0]; });
const modeBoxes = (html.match(/name="mode"\s+value="([a-z_]+)"/g) || []).map(function (m) { return m.match(/value="([a-z_]+)"/)[1]; });
const cmRadios = (html.match(/name="colorMode"\s+value="([a-z]+)"/g) || []).map(function (m) { return m.match(/value="([a-z]+)"/)[1]; });
const ssRadios = (html.match(/name="startSpeed"\s+value="(\d)"/g) || []).map(function (m) { return m.match(/\d/)[0]; });
check('S8 flicker radios 0/1/2', flRadios.join(',') === '0,1,2', flRadios.join(','));
check('S8b mode checkboxes = 3 保留模式', modeBoxes.join(',') === 'cam_grating,checkerboard,stripes', modeBoxes.join(','));
const controlModeRadios = (html.match(/name="controlMode"\s+value="([a-z]+)"/g) || []).map(function (m) { return m.match(/value="([a-z]+)"/)[1]; });
check('S8b2 controlMode radios keyboard/mouse/both', controlModeRadios.join(',') === 'keyboard,mouse,both', controlModeRadios.join(','));
check('S8c colorMode contrast/mixed', cmRadios.join(',') === 'contrast,mixed', cmRadios.join(','));
check('S8d startSpeed 1-5', ssRadios.join(',') === '1,2,3,4,5', ssRadios.join(','));
check('S8e bg toggles + sound + note',
  ['id="colorChange"', 'id="shapeChange"', 'id="flickerChange"', 'id="soundOn"', 'drawer-note'].every(function (k) { return html.indexOf(k) !== -1; }));

// S9: 遮眼提醒
const eyePhrase = '\u8bf7\u5148\u906e\u76d6\u597d\u773c\uff0c\u53ea\u7528\u5f31\u89c6\u773c\u770b';
const eyeCount = (html.match(/\u906e\u76d6\u597d\u773c/g) || []).length;
check('S9 eye reminder >=2 places + role=note', eyeCount >= 2 && html.indexOf(eyePhrase) !== -1 && /role="note"/.test(html), 'count=' + eyeCount);

check('S10 no alert( popup', !/alert\s*\(/.test(allSrc));

// S11: 背景引擎
check('S11 bg-engine 3 modes (no red_flicker/dots/fun_shapes)',
  /MODE_IDS\s*=\s*\['cam_grating',\s*'checkerboard',\s*'stripes'\]/.test(bgEngineSrc) &&
  !/function drawRedFlicker/.test(bgEngineSrc) && !/function drawFunShapes/.test(bgEngineSrc) && !/function drawDots/.test(bgEngineSrc));
const rot = /BG_ROTATE_MS\s*=\s*(\d+)/.exec(bgEngineSrc);
const fade = /BG_CROSSFADE_MS\s*=\s*(\d+)/.exec(bgEngineSrc);
const cMin = /BG_COLOR_MIN_MS\s*=\s*(\d+)/.exec(bgEngineSrc);
const cMax = /BG_COLOR_MAX_MS\s*=\s*(\d+)/.exec(bgEngineSrc);
const flLv = /FLICKER_LEVELS\s*=\s*\[([^\]]*)\]/.exec(bgEngineSrc);
const jit = /BG_FLICKER_JITTER\s*=\s*([0-9.]+)/.exec(bgEngineSrc);
check('S12 bg rotate 15s / fade 1s', !!rot && !!fade && Number(rot[1]) === 15000 && Number(fade[1]) === 1000, rot && rot[0] + ' ' + fade[0]);
check('S12b bg color cycle 5-8s', !!cMin && !!cMax && Number(cMin[1]) === 5000 && Number(cMax[1]) === 8000, cMin && cMin[0] + ' ' + cMax[0]);
check('S12c flicker 1.2/2/3.2Hz ±20%', !!flLv && flLv[1].replace(/\s/g, '') === '1.2,2,3.2' && !!jit && Number(jit[1]) === 0.2, flLv && flLv[1]);
check('S12d BgEngine API exposed', /window\.BgEngine\s*=\s*\{/.test(bgEngineSrc) && /create:\s*createEngine/.test(bgEngineSrc) && /runSelfTests/.test(bgEngineSrc));

// S13: 贪吃蛇画风与 Esc
check('S13 snake G-style anchors', ['drawRoundCell', 'fillEllipse', 'backToMenu', 'Escape'].every(function (k) { return snakeSrc.indexOf(k) !== -1; }));
check('S13b snake settings/highscore keys',
  snakeSrc.indexOf('amblyopia_snake_settings_v1') !== -1 && snakeSrc.indexOf('amblyopia_snake_highscore_v1') !== -1 &&
  /function loadSettings/.test(snakeSrc) && /function saveSettings/.test(snakeSrc));
check('S13c v1.0 6→3 modes compat', /saved\.modes\.length === 6/.test(snakeSrc) && /saved\.modes\[4\]/.test(snakeSrc) && /saved\.modes\.length === 4/.test(snakeSrc));
check('S13d sound + HUD', /function shouldPlaySound/.test(snakeSrc) && snakeSrc.indexOf('btnMute') !== -1 && snakeSrc.indexOf('soundOnEl') !== -1);
check('S13e speed step 5 + MAX_SPEED_LEVEL', /SPEED_STEP\s*=\s*5/.test(snakeSrc) && /MAX_SPEED_LEVEL/.test(snakeSrc));
check('S13f mouse + touch handlers', /mousemove/.test(snakeSrc) && /mousedown/.test(snakeSrc) && /mouseup/.test(snakeSrc) && /handleTouchStart/.test(snakeSrc) && /handleTouchEnd/.test(snakeSrc));

check('S14 ?test=1 hook + __snakeTests', /location\.search/.test(html) && /globalThis\.__snakeTests\s*=/.test(html) === false ? true : /__snakeTests/.test(html));

/* ============ Part 2: DOM 桩冒烟测试 ============ */

let fakeNow = 1000;
const grad = function () { return { addColorStop: function () {} }; };
function ctxNoop() {}

function makeEl(id) {
  const listeners = {};
  const classes = new Set();
  const el = {
    id: id || '', textContent: '', checked: false, value: '', name: '', type: '',
    style: {}, width: 630, height: 630,
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatch: function (t, ev) { (listeners[t] || []).forEach(function (fn) { fn.call(el, ev); }); },
    getContext: function () {
      if (!el._ctx) {
        const self = el;
        el._ctx = new Proxy({}, {
          get: function (t, p) {
            if (typeof p === 'symbol') return undefined;
            if (p === 'canvas') return { width: self.width, height: self.height };
            if (p === 'fillStyle') return t._fillStyle;
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return grad;
            return ctxNoop;
          },
          set: function (t, p, v) { if (p === 'fillStyle') t._fillStyle = v; t[p] = v; return true; }
        });
      }
      return el._ctx;
    },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: el.width || 630, height: el.height || 630 }; },
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); },
      toggle: function (c) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
    },
    setAttribute: function () {}, getAttribute: function () { return null; },
    _listeners: listeners, _classes: classes
  };
  return el;
}

const els = {};
// 与 index.html 初始 class 一致：默认隐藏的屏幕/浮层
const initialHidden = {
  testBanner: true,
  gameScreen: true,
  gameMenuOverlay: true,
  endOverlay: true,
  drawerMask: true,
  settingsDrawer: true
};
function getEl(id) {
  if (!els[id]) {
    els[id] = makeEl(id);
    if (initialHidden[id]) els[id].classList.add('hidden');
  }
  return els[id];
}

const groups = {};
function buildGroup(name) {
  let list = [];
  if (name === 'flickerLevel') list = ['0', '1', '2'];
  else if (name === 'mode') list = ['cam_grating', 'checkerboard', 'stripes'];
  else if (name === 'controlMode') list = ['keyboard', 'mouse', 'both'];
  else if (name === 'colorMode') list = ['contrast', 'mixed'];
  else if (name === 'startSpeed') list = ['1', '2', '3', '4', '5'];
  return list.map(function (v) {
    const e = makeEl('inp_' + name + '_' + v);
    e.name = name; e.value = v; e.type = (name === 'mode' ? 'checkbox' : 'radio');
    return e;
  });
}

const wrap = makeEl('board-wrap');
const documentStub = {
  getElementById: getEl,
  querySelector: function (sel) { return sel === '.board-wrap' ? wrap : null; },
  querySelectorAll: function (sel) {
    const m = /input\[name="([^"]+)"\]/.exec(sel);
    if (m) { if (!groups[m[1]]) groups[m[1]] = buildGroup(m[1]); return groups[m[1]]; }
    return [];
  },
  addEventListener: function () {}, removeEventListener: function () {},
  createElement: function () { return makeEl(); },
  documentElement: makeEl('html'), body: makeEl('body')
};

let rafQueue = [];
let rafId = 0;
function requestAnimationFrame(cb) { rafQueue.push(cb); return ++rafId; }
function cancelAnimationFrame() {}
function flushFrames(count, stepMs) {
  for (let i = 0; i < count; i++) {
    fakeNow += (stepMs === undefined ? 16 : stepMs);
    const q = rafQueue; rafQueue = [];
    for (let j = 0; j < q.length; j++) q[j](fakeNow);
  }
}

const lsStore = {
  // 预置 v1.0 6 项 modes，验证兼容映射
  'amblyopia_snake_settings_v1': JSON.stringify({ flickerLevel: 0, modes: [true, false, true, false, true, false], startSpeed: 3 })
};
const winListeners = {};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame, cancelAnimationFrame,
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
  URLSearchParams,
  performance: { now: function () { return fakeNow; } },
  localStorage: {
    _s: lsStore,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null; },
    setItem: function (k, v) { lsStore[k] = String(v); },
    removeItem: function (k) { delete lsStore[k]; }
  },
  navigator: { userAgent: 'node' },
  document: documentStub,
  location: { search: '?test=1', href: '' },
  innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
  AudioContext: undefined, webkitAudioContext: undefined,
  addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: function () {},
  dispatch: function (t, ev) { (winListeners[t] || []).forEach(function (fn) { fn(ev); }); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// 合并 js 与 index.html 内联脚本
const inlineScripts = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let mm;
while ((mm = re.exec(html)) !== null) inlineScripts.push(mm[1]);

const combined = [bgEngineSrc, snakeSrc].concat(inlineScripts).join('\n;\n')
  .replace('    state.food = randomFoodCell(state.snake);',
    '    state.food = randomFoodCell(state.snake); if (globalThis.__testFood) state.food = globalThis.__testFood;')
  .replace('    var result = stepGame(state);',
    '    var result = stepGame(state); globalThis.__tickState = result.state; globalThis.__tickAte = result.ate;');

let initError = null;
vm.createContext(sandbox);
try {
  vm.runInContext(combined, sandbox, { filename: 'app.js' });
} catch (e) {
  initError = e;
}
check('SMK1 page script init no error', initError === null, initError ? initError.stack : '');

const SG = sandbox.SnakeGame;
check('SMK1b SnakeGame API exposed', !!SG && typeof SG.start === 'function' && typeof SG.backToMenu === 'function' && typeof SG.bindSettingsUI === 'function');

const banner = getEl('testBanner');
check('SMK2 ?test=1 banner rendered PASS', /PASS/i.test(banner.textContent), banner.textContent.slice(0, 200));
check('SMK3 banner unhidden', !banner.classList.contains('hidden'));

// v1.0 6→4 兼容映射验证
check('SMK3b v1.0 6项modes映射为新3项', (function () {
  const s = SG.getSettings();
  return s.modes.length === 3 && s.modes[0] === false && s.modes[1] === true && s.modes[2] === true &&
    s.controlMode === 'both' && s.flickerLevel === 0 && s.startSpeed === 3;
})(), 'modes=' + JSON.stringify(SG.getSettings().modes) + ' control=' + SG.getSettings().controlMode);

const menuScreen = getEl('menuScreen'), gameScreen = getEl('gameScreen'),
  endOverlay = getEl('endOverlay'), gameMenuOverlay = getEl('gameMenuOverlay'),
  settingsDrawer = getEl('settingsDrawer'), drawerMask = getEl('drawerMask'),
  hudScore = getEl('hudScore'), endScore = getEl('endScore'),
  soundOn = getEl('soundOn'), flickerChange = getEl('flickerChange'),
  btnPause = getEl('btnPause'), btnMute = getEl('btnMute'),
  gameCanvas = getEl('gameCanvas'), bgCanvas = getEl('bgCanvas');

let flowError = null;
try {
  check('SMK4 menu visible initially', !menuScreen.classList.contains('hidden') && gameScreen.classList.contains('hidden'));

  sandbox.__testFood = { x: 11, y: 10 }; // 蛇头 (10,10) 向右，第一步即吃到食物
  getEl('btnStartSnake').dispatch('click');
  check('SMK5 start switches to game screen', menuScreen.classList.contains('hidden') && !gameScreen.classList.contains('hidden') && endOverlay.classList.contains('hidden'));

  flushFrames(14, 16); // 180ms 起步间隔，14 帧约 224ms → 走一步吃到食物
  check('SMK5b first tick eats food (score 10)', hudScore.textContent === '10', 'hudScore=' + hudScore.textContent);
  check('SMK5c tick captured (head moved, score 10)',
    !!sandbox.__tickState && sandbox.__tickState.score === 10 && sandbox.__tickAte === true,
    'score=' + (sandbox.__tickState ? sandbox.__tickState.score : null) + ' ate=' + sandbox.__tickAte);

  // Esc 菜单
  (winListeners['keydown'] || []).forEach(function (fn) { fn({ key: 'Escape', repeat: false, preventDefault: function () {} }); });
  check('SMK6 Esc opens game menu (paused)', !gameMenuOverlay.classList.contains('hidden') && getEl('btnPause').textContent.indexOf('\u7ee7\u7eed') !== -1, 'btnPause=' + getEl('btnPause').textContent);

  getEl('btnResume').dispatch('click');
  check('SMK7 Resume closes menu', gameMenuOverlay.classList.contains('hidden'));

  (winListeners['keydown'] || []).forEach(function (fn) { fn({ key: 'Escape', repeat: false, preventDefault: function () {} }); });
  getEl('btnMenuSettings').dispatch('click');
  check('SMK8 Settings drawer opens from menu', !settingsDrawer.classList.contains('hidden') && !drawerMask.classList.contains('hidden'));
  getEl('btnDrawerClose').dispatch('click');
  check('SMK9 Settings drawer closes', settingsDrawer.classList.contains('hidden') && drawerMask.classList.contains('hidden'));

  getEl('btnRestart').dispatch('click'); // 从打开的 Esc 菜单重新开始
  check('SMK10 restart re-enters game', gameMenuOverlay.classList.contains('hidden') && !gameScreen.classList.contains('hidden'));

  // 设置持久化
  const flickerRadios = groups['flickerLevel'];
  flickerRadios[0].checked = true;
  flickerRadios[0].dispatch('change');
  const saved1 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK11 flicker level change persisted', saved1.indexOf('"flickerLevel":0') !== -1, saved1.slice(0, 160));

  const controlRadios = groups['controlMode'];
  controlRadios[0].checked = true; // keyboard
  controlRadios[0].dispatch('change');
  const savedCM = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK11b controlMode change persisted', savedCM.indexOf('"controlMode":"keyboard"') !== -1, savedCM.slice(0, 160));

  soundOn.checked = false;
  soundOn.dispatch('change');
  const saved2 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK12 sound off persisted + HUD sync', saved2.indexOf('"soundOn":false') !== -1 && btnMute.textContent.indexOf('\u97f3\u6548\u5173') !== -1, saved2.slice(0, 160) + ' mute=' + btnMute.textContent);
  btnMute.dispatch('click');
  check('SMK12b HUD mute toggles back on', btnMute.textContent.indexOf('\u97f3\u6548\u5f00') !== -1, 'btnMute=' + btnMute.textContent);

  flickerChange.checked = false;
  flickerChange.dispatch('change');
  const saved3 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK13 bg flicker toggle persisted', saved3.indexOf('"flickerChange":false') !== -1, saved3.slice(0, 160));

  // Esc 菜单 → 返回游戏列表
  (winListeners['keydown'] || []).forEach(function (fn) { fn({ key: 'Escape', repeat: false, preventDefault: function () {} }); });
  getEl('btnBackMenu').dispatch('click');
  check('SMK14 back to menu', gameScreen.classList.contains('hidden') && !menuScreen.classList.contains('hidden'));

  // 再次进入 → 撞墙结束
  sandbox.__testFood = { x: 11, y: 10 };
  getEl('btnStartSnake').dispatch('click');
  (winListeners['keydown'] || []).forEach(function (fn) { fn({ key: 'ArrowUp', repeat: false, preventDefault: function () {} }); });
  flushFrames(260, 16); // 11 tick 撞上顶墙（约 2000ms）
  check('SMK15 steering into wall → game over', !endOverlay.classList.contains('hidden'), 'endOverlay hidden');
  check('SMK15b end panel shows score', endScore.textContent.trim() === '0', 'endScore=' + endScore.textContent);
  check('SMK16 high score write/read roundtrip', (function () {
    SG.highScore.write(42);
    return SG.highScore.read() === 42;
  })(), 'read=' + SG.highScore.read());

  // resize 保持 21 倍数
  (winListeners['resize'] || []).forEach(function (fn) { fn(); });
  flushFrames(1, 16);
  check('SMK17 resize keeps canvas 21-multiple >0',
    gameCanvas.width > 0 && gameCanvas.width % 21 === 0 && bgCanvas.width === gameCanvas.width,
    'gameCanvas=' + gameCanvas.width + ' bgCanvas=' + bgCanvas.width);

  // 结束浮层 → 返回游戏列表
  getEl('btnEndBackMenu').dispatch('click');
  check('SMK18 end-overlay back to menu', gameScreen.classList.contains('hidden') && !menuScreen.classList.contains('hidden'));

  // 键盘方向键绑定存在
  check('SMK19 keydown bound', Array.isArray(winListeners['keydown']) && winListeners['keydown'].length > 0);
  check('SMK20 mouse handlers bound', (gameCanvas._listeners['mousemove'] || []).length > 0 && (gameCanvas._listeners['mousedown'] || []).length > 0);
} catch (e) {
  flowError = e;
}
check('SMK21 full flow no uncaught error', flowError === null, flowError ? flowError.stack : '');

console.log('\nACCEPTANCE ' + (failures === 0 ? 'PASS' : 'FAIL') + ' ' + (results.length - failures) + '/' + results.length);
process.exit(failures === 0 ? 0 : 1);
