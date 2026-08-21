// verify_snake.js - 从 snake_game.html 提取脚本并在 Node 中运行 ?test=1 自测
// 用法: node verify_snake.js [path/to/snake_game.html]
const fs = require('fs');
const path = require('path');

const local = path.join(__dirname, 'snake_game.html');
const target = process.argv[2] || (fs.existsSync(local) ? local : path.join(__dirname, 'amblyopia_game', 'snake_game.html'));
const html = fs.readFileSync(target, 'utf8');

// 提取所有 <script>...</script> 内容（不含 src）
const scripts = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
if (scripts.length === 0) {
  console.error('FAIL: 未找到内联 <script>');
  process.exit(1);
}

// 运行环境：Node 默认没有 document/window/localStorage，游戏脚本应做守卫避免崩溃
const combined = scripts.join('\n;\n');

// 用 vm 运行，提供最小安全垫
const vm = require('vm');
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
  vm.runInContext(combined, sandbox, { filename: 'snake_game.js' });
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
  if (r.pass) { pass++; console.log('  PASS ' + r.name); }
  else { fail++; console.log('  FAIL ' + r.name + (r.detail ? ' -- ' + r.detail : '')); }
}
console.log(`\nSELF-TEST PASS ${pass}/${results.length}`);
if (fail > 0 || pass !== results.length) process.exit(1);
