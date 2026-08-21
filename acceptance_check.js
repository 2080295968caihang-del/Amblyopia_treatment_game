// acceptance_check.js - T8 final acceptance: static checks + DOM-stub smoke test (headless)
// Usage: node acceptance_check.js [path/to/snake_game.html]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const local = path.join(__dirname, 'snake_game.html');
const target = process.argv[2] || (fs.existsSync(local) ? local : path.join(__dirname, 'amblyopia_game', 'snake_game.html'));
const html = fs.readFileSync(target, 'utf8');
let failures = 0;
const results = [];

function check(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: ok ? '' : (detail || '') });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok ? '' : ' -- ' + (detail || '')));
  if (!ok) failures++;
}

/* ---------- Part 1: static checks ---------- */

const hasScriptSrc = /<script[^>]*\bsrc\s*=/i.test(html);
const hasExtUrl = /(?:href|src)\s*=\s*["']https?:\/\//i.test(html);
const hasLinkTag = /<link\b/i.test(html);
const hasImport = /@import/i.test(html);
check('S1 zero external deps (no script src / ext url / link / import)',
  !hasScriptSrc && !hasExtUrl && !hasLinkTag && !hasImport,
  'scriptSrc=' + hasScriptSrc + ' extUrl=' + hasExtUrl + ' link=' + hasLinkTag + ' import=' + hasImport);

check('S2 viewport with viewport-fit=cover', /<meta\s+name="viewport"[\s\S]*?viewport-fit\s*=\s*cover/i.test(html));

const eyeCover = '\u906e\u76d6\u597d\u773c';
const eyeCount = (html.match(new RegExp(eyeCover, 'g')) || []).length;
const fullPhrase = '\u8bf7\u5148\u906e\u76d6\u597d\u773c\uff0c\u53ea\u7528\u5f31\u89c6\u773c\u770b';
check('S3 eye reminder present >=2 places', eyeCount >= 2, 'count=' + eyeCount);
check('S3c start-screen full reminder phrase', html.indexOf(fullPhrase) !== -1);
check('S3b reminder has role=note + icon container',
  /eye-reminder[\s\S]{0,260}role="note"/.test(html) || /role="note"[\s\S]{0,260}eye-reminder/.test(html));

check('S4 no alert( text popup', !/alert\s*\(/.test(html));

check('S5 ?test=1 hook + __snakeTests exposed',
  /location\.search/.test(html) && /globalThis\.__snakeTests\s*=/.test(html));

const dfk = html.indexOf('function directionForKey');
const dfkArea = dfk >= 0 ? html.slice(dfk, dfk + 400) : '';
const hgk = html.indexOf('function handleGameKey');
const hgkArea = hgk >= 0 ? html.slice(hgk, hgk + 500) : '';
check('S6 keyboard arrows/WASD/pause keys',
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].every(function (k) { return dfkArea.indexOf(k) !== -1; }) &&
  /case 'w'/.test(dfkArea) && /case 'a'/.test(dfkArea) && /case 's'/.test(dfkArea) && /case 'd'/.test(dfkArea) &&
  hgkArea.indexOf("' '") !== -1 && hgkArea.indexOf("'p'") !== -1 && hgkArea.indexOf("'P'") !== -1 &&
  /handleGameKey\(state, e\.key\)/.test(html),
  'dfk=' + dfk + ' hgk=' + hgk);

check('S7 mouse mousemove/mousedown/mouseup + canvasMouseToCell',
  /mousemove/.test(html) && /mousedown/.test(html) && /mouseup/.test(html) && /canvasMouseToCell/.test(html));

check('S8 touch handlers reserved (handleTouch*)',
  /handleTouchStart/.test(html) && /handleTouchMove/.test(html) && /handleTouchEnd/.test(html));

const MODE_RE = /const MODE_IDS\s*=\s*\[([^\]]*)\]/;
const mm = MODE_RE.exec(html);
let modeOk = false, modeList = '';
if (mm) {
  modeList = mm[1].split(',').map(function (x) { return x.trim().replace(/['"]/g, ''); }).join(',');
  modeOk = modeList === 'red_flicker,cam_grating,checkerboard,dots,stripes,fun_shapes';
}
check('S9 six stimulus modes', modeOk, modeList || 'MODE_IDS not found');
const rotMin = /const BG_ROTATE_MIN_MS\s*=\s*(\d+)/.exec(html);
const rotMax = /const BG_ROTATE_MAX_MS\s*=\s*(\d+)/.exec(html);
check('S9b mode rotation 20-40s', !!rotMin && !!rotMax && Number(rotMin[1]) === 20000 && Number(rotMax[1]) === 40000,
  rotMin ? rotMin[0] + ' ' + rotMax[0] : 'not found');

check('S10 colorChange/shapeChange/flickerChange toggles',
  ['colorChange', 'shapeChange', 'flickerChange'].every(function (k) { return html.indexOf(k) !== -1; }));

const fl = /const FLICKER_LEVELS\s*=\s*\[([^\]]*)\]/.exec(html);
const jit = /const BG_FLICKER_JITTER\s*=\s*([0-9.]+)/.exec(html);
check('S11 flicker levels 0.95/1.4/2.4Hz', !!fl && fl[1].replace(/\s/g, '') === '0.95,1.4,2.4', fl ? fl[1] : 'not found');
check('S11b flicker jitter +-20%', !!jit && Number(jit[1]) === 0.2, jit ? jit[1] : 'not found');

const step = /const SPEED_STEP\s*=\s*(\d+)/.exec(html);
check('S12 speed step every 5 foods', !!step && Number(step[1]) === 5, step ? step[1] : 'not found');
const speedRadios = (html.match(/name="startSpeed"\s+value="(\d)"/g) || []).map(function (m) { return m.match(/\d/)[0]; });
check('S12b start speed 5 levels 1-5', speedRadios.join(',') === '1,2,3,4,5', speedRadios.join(','));
check('S12c speed cap level exists', /MAX_SPEED_LEVEL/.test(html));

check('S13 settings + highscore persistence keys',
  html.indexOf('amblyopia_snake_settings_v1') !== -1 && html.indexOf('amblyopia_snake_highscore_v1') !== -1 &&
  /function loadSettings/.test(html) && /function saveSettings/.test(html));

check('S14 sound toggle (shouldPlaySound/btnMute/soundOn)',
  /function shouldPlaySound/.test(html) && html.indexOf('btnMute') !== -1 && html.indexOf('id="soundOn"') !== -1);

check('S15 guidance note (per session / doctor)',
  html.indexOf('drawer-note') !== -1 && html.indexOf('\u6bcf\u6b21') !== -1 && html.indexOf('\u906e\u76d6\u597d\u773c') !== -1);

/* ---------- Part 2: DOM-stub smoke test ---------- */

let fakeNow = 1000;

function ctxNoop() {}
const noopCtx = new Proxy({}, {
  get: function (t, p) { if (typeof p === 'symbol') return undefined; if (p === 'canvas') return {}; return ctxNoop; },
  set: function (t, p, v) { t[p] = v; return true; }
});
function noop() {}

function makeRecCtx(el) {
  el._drawLog = [];
  return new Proxy({}, {
    get: function (t, p) {
      if (typeof p === 'symbol') return undefined;
      if (p === 'canvas') return { width: el.width, height: el.height };
      if (p === 'fillStyle') return t._fillStyle;
      return function () {
        if (p === 'fillRect') el._drawLog.push({ op: 'fillRect', style: t._fillStyle, args: Array.prototype.slice.call(arguments) });
        else if (p === 'clearRect') el._drawLog.push({ op: 'clearRect', args: Array.prototype.slice.call(arguments) });
      };
    },
    set: function (t, p, v) { if (p === 'fillStyle') t._fillStyle = v; t[p] = v; return true; }
  });
}

function makeEl(id) {
  const listeners = {};
  const classes = new Set();
  const el = {
    id: id || '', textContent: '', checked: false, value: '', name: '', type: '',
    style: {}, width: 630, height: 630,
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatch: function (t, ev) { (listeners[t] || []).forEach(function (fn) { fn.call(el, ev); }); },
    getContext: function () { if (!el._ctx) el._ctx = makeRecCtx(el); return el._ctx; },
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
function getEl(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

const groups = {};
function buildGroup(name) {
  let list = [];
  if (name === 'flickerLevel') list = [['0'], ['1'], ['2']];
  else if (name === 'mode') list = [['red_flicker'], ['cam_grating'], ['checkerboard'], ['dots'], ['stripes'], ['fun_shapes']];
  else if (name === 'colorMode') list = [['contrast'], ['mixed']];
  else if (name === 'startSpeed') list = [['1'], ['2'], ['3'], ['4'], ['5']];
  return list.map(function (v) {
    const e = makeEl('inp_' + name + '_' + v[0]);
    e.name = name; e.value = v[0]; e.type = (name === 'mode' ? 'checkbox' : 'radio');
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

const winListeners = {};
const windowStub = {
  innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
  location: { search: '?test=1', href: '' },
  addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: function () {},
  dispatch: function (t, ev) { (winListeners[t] || []).forEach(function (fn) { fn(ev); }); },
  AudioContext: undefined, webkitAudioContext: undefined
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

const lsStore = {};
const sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  requestAnimationFrame: requestAnimationFrame, cancelAnimationFrame: cancelAnimationFrame,
  Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array, String: String,
  Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, Promise: Promise,
  URLSearchParams: URLSearchParams,
  performance: { now: function () { return fakeNow; } },
  localStorage: {
    _s: lsStore,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null; },
    setItem: function (k, v) { lsStore[k] = String(v); },
    removeItem: function (k) { delete lsStore[k]; }
  },
  navigator: { userAgent: 'node' },
  document: documentStub
};
sandbox.window = windowStub;
sandbox.location = windowStub.location;
sandbox.globalThis = sandbox;

const scripts = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);

// Test-only source instrumentation (does NOT touch snake_game.html on disk):
// 1) allow deterministic food placement via globalThis.__testFood
// 2) capture per-tick state for assertions
const combined = scripts.join('\n;\n')
  .replace('    state.food = randomFoodCell(state.snake);',
    '    state.food = randomFoodCell(state.snake); if (globalThis.__testFood) state.food = globalThis.__testFood;')
  .replace('    const result = stepGame(state);',
    '    const result = stepGame(state); globalThis.__tickState = result.state; globalThis.__tickAte = result.ate;')


let initError = null;
vm.createContext(sandbox);
try {
  vm.runInContext(combined, sandbox, { filename: 'snake_game.js' });
} catch (e) {
  initError = e;
}
check('SMK1 page script init no error', initError === null, initError ? initError.stack : '');

const banner = getEl('testBanner');
check('SMK2 ?test=1 banner rendered PASS', /PASS/i.test(banner.textContent), banner.textContent.slice(0, 200));
check('SMK3 banner unhidden after self-test', !banner.classList.contains('hidden'));

check('SMK4 internal functions exposed',
  typeof sandbox.startGame === 'function' && typeof sandbox.gameOver === 'function' && typeof sandbox.tick === 'function',
  'startGame=' + typeof sandbox.startGame + ' gameOver=' + typeof sandbox.gameOver + ' tick=' + typeof sandbox.tick);

const startScreen = getEl('startScreen'), gameScreen = getEl('gameScreen'),
  endOverlay = getEl('endOverlay'), btnStart = getEl('btnStart'),
  btnPause = getEl('btnPause'), btnMute = getEl('btnMute'),
  endScore = getEl('endScore'), hudScore = getEl('hudScore'),
  soundOn = getEl('soundOn'), flickerChange = getEl('flickerChange'),
  gameCanvas = getEl('gameCanvas'), bgCanvas = getEl('bgCanvas'),
  settingsDrawer = getEl('settingsDrawer'), drawerMask = getEl('drawerMask');

let flowError = null;
try {
  sandbox.__testFood = { x: 11, y: 10 }; // head starts (10,10) moving right -> first tick eats
  btnStart.dispatch('click');
  check('SMK5 start screen switches', startScreen.classList.contains('hidden') && !gameScreen.classList.contains('hidden') && endOverlay.classList.contains('hidden'));

  // a few frames: first tick eats the deterministic food
  flushFrames(14, 16);
  check('SMK5b first tick eats food (score 10)', hudScore.textContent === '10', 'hudScore=' + hudScore.textContent);
  check('SMK5c tick captured state (head moved, score 10)',
    !!sandbox.__tickState && sandbox.__tickState.score === 10 && sandbox.__tickAte === true,
    'score=' + (sandbox.__tickState ? sandbox.__tickState.score : null) + ' ate=' + sandbox.__tickAte);

  const keydown = winListeners['keydown'];
  check('SMK6 keydown bound', Array.isArray(keydown) && keydown.length > 0);
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].forEach(function (k) {
    keydown.forEach(function (fn) { fn({ key: k, repeat: false, preventDefault: noop }); });
  });

  keydown.forEach(function (fn) { fn({ key: 'p', repeat: false, preventDefault: noop }); });
  check('SMK7 keyboard P pauses (btn -> resume)', btnPause.textContent.indexOf('\u7ee7\u7eed') !== -1, 'btnPause=' + btnPause.textContent);
  keydown.forEach(function (fn) { fn({ key: 'p', repeat: false, preventDefault: noop }); });
  check('SMK8 keyboard P resumes (btn -> pause)', btnPause.textContent.indexOf('\u6682\u505c') !== -1, 'btnPause=' + btnPause.textContent);

  const canvMove = gameCanvas._listeners['mousemove'] || [];
  const canvDown = gameCanvas._listeners['mousedown'] || [];
  check('SMK9 canvas mouse events bound', canvMove.length > 0 && canvDown.length > 0);
  canvMove.forEach(function (fn) { fn({ clientX: 300, clientY: 300, button: 0, preventDefault: noop }); });
  canvDown.forEach(function (fn) { fn({ clientX: 300, clientY: 300, button: 0, preventDefault: noop }); });
  (winListeners['mouseup'] || []).forEach(function (fn) { fn({ button: 0 }); });

  btnPause.dispatch('click');
  check('SMK10 HUD pause button works', btnPause.textContent.indexOf('\u7ee7\u7eed') !== -1, 'btnPause=' + btnPause.textContent);
  btnPause.dispatch('click');
  check('SMK11 HUD resume button works', btnPause.textContent.indexOf('\u6682\u505c') !== -1, 'btnPause=' + btnPause.textContent);

  getEl('btnOpenSettings').dispatch('click');
  check('SMK12 settings drawer opens', !settingsDrawer.classList.contains('hidden') && !drawerMask.classList.contains('hidden'));
  getEl('btnDrawerClose').dispatch('click');
  check('SMK13 settings drawer closes', settingsDrawer.classList.contains('hidden') && drawerMask.classList.contains('hidden'));

  const flickerRadios = groups['flickerLevel'];
  flickerRadios[0].checked = true;
  flickerRadios[0].dispatch('change');
  const saved1 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK14 flicker level change persisted', saved1.indexOf('"flickerLevel":0') !== -1, saved1.slice(0, 160));

  soundOn.checked = false;
  soundOn.dispatch('change');
  const saved2 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK15 sound off persisted', saved2.indexOf('"soundOn":false') !== -1, saved2.slice(0, 160));
  check('SMK16 HUD mute button shows sound-off', btnMute.textContent.indexOf('\u97f3\u6548\u5173') !== -1, 'btnMute=' + btnMute.textContent);
  btnMute.dispatch('click');
  check('SMK17 HUD mute button toggles to sound-on', btnMute.textContent.indexOf('\u97f3\u6548\u5f00') !== -1, 'btnMute=' + btnMute.textContent);

  flickerChange.checked = false;
  flickerChange.dispatch('change');
  const saved3 = lsStore['amblyopia_snake_settings_v1'] || '';
  check('SMK18 bg flicker toggle persisted', saved3.indexOf('"flickerChange":false') !== -1, saved3.slice(0, 160));

  sandbox.gameOver();
  check('SMK19 game over overlay shown', !endOverlay.classList.contains('hidden'));
  check('SMK20 end panel shows score 10', endScore.textContent.trim() === '10', 'endScore=' + endScore.textContent);
  const hs = lsStore['amblyopia_snake_highscore_v1'];
  check('SMK21 high score written to localStorage', hs !== null && String(hs).trim() === '10', 'highscore=' + hs);
  sandbox.writeHighScore(42);
  check('SMK21b high score write/read roundtrip', sandbox.readHighScore() === 42, 'read=' + sandbox.readHighScore());

  (winListeners['resize'] || []).forEach(function (fn) { fn(); });
  flushFrames(1, 16);
  check('SMK22 resize keeps canvas 21-multiple >0',
    gameCanvas.width > 0 && gameCanvas.width % 21 === 0 && bgCanvas.width === gameCanvas.width,
    'gameCanvas=' + gameCanvas.width + ' bgCanvas=' + bgCanvas.width);

  (winListeners['keydown'] || []).forEach(function (fn) { fn({ key: 'ArrowUp', repeat: false, preventDefault: noop }); });
  getEl('btnRestart').dispatch('click');
  check('SMK23 restart re-enters game', !gameScreen.classList.contains('hidden') && endOverlay.classList.contains('hidden'));
} catch (e) {
  flowError = e;
}
check('SMK24 full flow no uncaught error', flowError === null, flowError ? flowError.stack : '');

console.log('\nACCEPTANCE ' + (failures === 0 ? 'PASS' : 'FAIL') + ' ' + (results.length - failures) + '/' + results.length);
process.exit(failures === 0 ? 0 : 1);
