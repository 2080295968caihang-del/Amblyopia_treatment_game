// verify_snake.js - v2.0 多文件架构无头自测
// 合并 js/bg-engine.js + js/snake.js + index.html 内联脚本，在 Node vm 中运行全部自测。
// 用法: node verify_snake.js [project-root]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || __dirname;
const localRoot = fs.existsSync(path.join(root, 'index.html')) ? root : path.join(root, 'amblyopia_game');

function readRel(rel) {
  return fs.readFileSync(path.join(localRoot, rel), 'utf8');
}

// 提取 index.html 中所有内联 <script>（不含 src）
function inlineScripts(html) {
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts;
}

const html = readRel('index.html');
const parts = [readRel('js/bg-engine.js'), readRel('js/snake.js')].concat(inlineScripts(html));
const combined = parts.join('\n;\n');

// 运行环境：Node 默认没有 document/window/localStorage，脚本应做守卫避免崩溃
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
  location: { search: '?test=1', href: '' },
  localStorage: {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(combined, sandbox, { filename: 'app.js' });
} catch (e) {
  console.error('FAIL: 脚本运行出错:', e.message);
  process.exit(1);
}

const tests = sandbox.__snakeTests;
if (!tests || typeof tests.runSelfTests !== 'function') {
  console.error('FAIL: 未暴露 globalThis.__snakeTests.runSelfTests');
  process.exit(1);
}
const results = tests.runSelfTests();
let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; }
  else { fail++; console.log('  FAIL ' + r.name + (r.detail ? ' -- ' + r.detail : '')); }
}
console.log(`SELF-TEST PASS ${pass}/${results.length}`);
if (fail > 0 || pass !== results.length) process.exit(1);
