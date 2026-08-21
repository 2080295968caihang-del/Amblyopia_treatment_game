# 弱视治疗贪吃蛇（snake_game.html）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付单文件 `snake_game.html`——基于公认弱视疗法（遮盖、红光闪烁、CAM 光栅、精细目力）的背景刺激 + 贪吃蛇游戏，桌面浏览器双击即玩，预留平板 WebView/触控接口。

**Architecture:** 单文件内三层结构：刺激背景 canvas（底层）→ 游戏 canvas（蛇/食物）→ DOM HUD/UI（顶层）。核心逻辑（方向、碰撞、食物、速度、闪烁频率）写成纯函数，通过 `snake_game.html?test=1` 自测模式断言验证；设置与最高分存 `localStorage`。

**Tech Stack:** 原生 HTML5 + CSS + JavaScript（Canvas 2D、Web Audio API），零依赖、零 CDN、离线可用。

**执行说明（重要）：** 沙箱禁止写入 `D:\1000length\project\Amblyopia_Treatment`，实现将在可写暂存目录完成，最终由用户执行复制命令放入目标目录。本计划中的提交步骤为可选（目标仓库提交由用户决定）。

---

## 任务分解与文件职责

| 文件 | 职责 |
|------|------|
| `snake_game.html` | 全部功能：结构/样式/逻辑/自测模式，单文件 |
| `docs/superpowers/specs/2026-08-21-amblyopia-snake-game-design.md` | 已确认的设计规格 |
| `docs/superpowers/plans/2026-08-21-amblyopia-snake-game.md` | 本实现计划 |

---

### Task 1: 文件骨架与自测框架

**Files:**
- Create: `snake_game.html`

- [ ] **Step 1: 建立 HTML 骨架（三个界面 + 两层 canvas + 设置抽屉）**

结构要点：
- 开始屏 `#startScreen`：标题、遮眼提醒、最高分、`开始游戏`/`家长设置`按钮
- 游戏屏 `#gameScreen`：`#bgCanvas`（刺激背景）+ `#gameCanvas`（蛇/食物）+ HUD
- 结束浮层 `#endOverlay`：分数、最高分、`再玩一次`
- 设置抽屉 `#settingsDrawer`：闪烁档位单选、6 个模式勾选、配色单选、起始速度、音效开关、背景变化三开关
- 全部样式内嵌 `<style>`，高对比配色、可缩放

- [ ] **Step 2: 定义常量与核心纯函数**

```js
const GRID_SIZE = 21;                 // 21×21 网格
const SPEED_START_MS = 180;           // 起始速度（毫秒/格，默认中慢）
const SPEED_MIN_MS = 60;              // 速度上限（最快）
const SPEED_STEP = 5;                 // 每吃 5 个食物升一档
const FLICKER_LEVELS = [0.95, 1.4, 2.4]; // 慢/中/快 Hz

function dirToVector(dir)            // {up:{0,-1}, down:{0,1}, left:{-1,0}, right:{1,0}}
function nextHead(head, dir)         // 返回移动后的头部坐标
function isWallCollision(head)       // 越界判断
function isSelfCollision(head, snake) // 撞自身判断（含新头）
function randomFoodCell(snake)       // 在非蛇身随机生成食物 {x,y}
function speedForLevel(foodsEaten)   // 每 SPEED_STEP 个食物降一档速度，返回 ms
function flickerHzForLevel(level)    // 0/1/2 → 0.95/1.4/2.4
```

- [ ] **Step 3: 自测框架（`?test=1` 模式）**

- 页面加载时检测 `location.search` 含 `test=1`，调用 `runSelfTests()`
- 断言覆盖：`dirToVector` 四个方向、`isWallCollision` 边界、`isSelfCollision`、`randomFoodCell` 不在蛇身、`speedForLevel` 单调递减且有下限、`flickerHzForLevel` 三档映射
- 结果输出到 console，并在页面顶部显示 `SELF-TEST PASS (n)/FAIL (m)`

- [ ] **Step 4: 验证自测**

打开 `snake_game.html?test=1`，Console 与页面显示全部 PASS。

---

### Task 2: 蛇核心逻辑

**Files:**
- Modify: `snake_game.html`（游戏状态与主循环）

- [ ] **Step 1: 游戏状态与主循环**

```js
const state = {
  snake: [{x:10,y:10},{x:9,y:10},{x:8,y:10}],
  dir: 'right', nextDir: 'right',
  food: null, score: 0, foodsEaten: 0,
  running: false, paused: false, gameOver: false
};
// 主循环：requestAnimationFrame + 时间累积，达到 speedForLevel(foodsEaten) 毫秒走一格
```

- [ ] **Step 2: 移动、吃食物、碰撞判定**

- 每 tick：`nextDir` 生效（禁止 180° 反向）→ `nextHead` → 撞墙/撞身则 `gameOver()`
- 吃到食物：分数 +10、蛇长 +1、`foodsEaten+1`、重新生成食物、播放音效
- `gameOver()`：显示结束浮层、更新最高分

- [ ] **Step 3: 在自测中新增断言**

- 禁止反向：向左时按右不生效
- 吃食物后蛇长 +1、分数 +10
- 撞墙/撞身触发 gameOver

- [ ] **Step 4: 验证**

`?test=1` 全部 PASS；手动开始游戏可正常移动、吃食物、撞墙结束。

---

### Task 3: 输入控制（键盘 + 鼠标，触控预留）

**Files:**
- Modify: `snake_game.html`

- [ ] **Step 1: 键盘控制**

- 方向键 / WASD 设置 `state.nextDir`（过滤 180° 反向）
- 空格 / P 切换暂停

- [ ] **Step 2: 鼠标控制**

- 鼠标在游戏屏移动：每 tick 计算蛇头到鼠标的向量，取主要方向（水平/垂直分量较大者）作为目标方向
- 按住左键：锁定跟随（`state.mouseActive = true`），松开恢复键盘优先
- 说明：鼠标移动时同时允许键盘覆盖

- [ ] **Step 3: 触控预留**

- 预留 `input.handleTouchStart/Move/End(e)` 空实现 + 注释"平板 WebView 接入点"
- CSS 设置 `touch-action: none` 于游戏屏，防止平板滚动干扰（后续实现滑动转向）

- [ ] **Step 4: 验证**

键盘四方向 + 暂停可用；鼠标移动蛇头跟随、按住左键锁定跟随。

---

### Task 4: 刺激背景层（6 模式 + 颜色 + 闪烁）

**Files:**
- Modify: `snake_game.html`（背景渲染模块）

- [ ] **Step 1: 背景渲染循环**

- `#bgCanvas` 独立 `requestAnimationFrame` 循环，尺寸与窗口同步
- 渲染顺序：背景模式图案 → 颜色变化 → 闪烁叠加

- [ ] **Step 2: 6 种刺激模式**

每个模式实现 `draw(ctx, t, cfg)`：
1. `RED_FLICKER`：全屏红/黑按 `flickerHz` 交替（sin 波占空）
2. `CAM_GRATING`：黑白方波条纹（宽 40–80px），方向横/竖/斜随机，整体缓慢平移（1px/tick 级）
3. `CHECKERBOARD`：100px 棋盘格，整体按 100px 周期缓慢跳动
4. `DOTS`：高对比圆点阵列（半径 8–16px 随机）
5. `STRIPES`：粗细变化的对比条纹
6. `FUN_SHAPES`：星星/花朵/爱心/月亮，高对比配色随机排布

- [ ] **Step 3: 配色与闪烁控制**

- 高对比配色组：`黑白` `红白` `蓝黄` `绿黑`（数组），每 20–40s 随机换组；"混合"模式额外每 5–8s 穿插 1–2 个彩色点缀
- 闪烁频率：`FLICKER_LEVELS[档位]` × 随机 ±20% 波动（每次进入新模式重新取值）
- 设置开关联动：颜色变化/形状变化/闪烁各自可独立关闭

- [ ] **Step 4: 模式轮换**

- 每 20–40s 从"已勾选模式集合"中随机选下一个模式（不重复连续两次）

- [ ] **Step 5: 验证**

视觉确认 6 种模式均出现、配色轮换、三档频率差异明显；设置关闭"闪烁"后背景静止。

---

### Task 5: 家长设置面板与持久化

**Files:**
- Modify: `snake_game.html`

- [ ] **Step 1: 设置数据模型与存取**

```js
const SETTINGS_KEY = 'amblyopia_snake_settings_v1';
const defaultSettings = {
  flickerLevel: 1,        // 0/1/2 → 0.95/1.4/2.4 Hz
  modes: [true,true,true,true,true,true], // 6 种模式参与轮换
  colorMode: 'contrast',  // 'contrast' | 'mixed'
  startSpeed: 2,          // 1–5
  soundOn: true,
  colorChange: true, shapeChange: true, flickerChange: true
};
function loadSettings()  // JSON.parse，失败回退默认
function saveSettings(s) // JSON.stringify 存 localStorage
```

- [ ] **Step 2: 设置抽屉交互**

- 打开/关闭抽屉；所有控件即时生效并 `saveSettings()`
- 设置页底部注明：建议每次 10–15 分钟、每天 1–2 次，请遵医嘱，遮盖好眼

- [ ] **Step 3: 在自测中新增断言**

- 默认设置结构完整；`loadSettings` 对损坏 JSON 回退默认；存取往返一致

- [ ] **Step 4: 验证**

修改设置 → 刷新页面 → 设置保留；关掉所有模式后背景无图案但颜色变化仍生效。

---

### Task 6: 音效

**Files:**
- Modify: `snake_game.html`

- [ ] **Step 1: Web Audio 合成音效**

```js
function playTone(freq, duration, type, volume) // 通用音
// eatSound(): 短促高音 '叮'（freq ~880Hz，0.08s）
// overSound(): 低音提示（freq ~220Hz 下滑，0.5s）
// 受 settings.soundOn 控制；AudioContext 在首次用户交互时创建（浏览器自动播放策略）
```

- [ ] **Step 2: 静音按钮**

- HUD 静音按钮切换 `settings.soundOn` 并保存

- [ ] **Step 3: 验证**

吃到食物有"叮"声；游戏结束有低音；静音后无声音；刷新后静音状态保留。

---

### Task 7: 界面流程与自适应

**Files:**
- Modify: `snake_game.html`

- [ ] **Step 1: 开始/结束/HUD 完善**

- 开始屏遮眼提醒："请先遮盖好眼，只用弱视眼看"（大字 + 图标示意）
- HUD：分数、最高分、速度档、暂停、静音
- 结束浮层：分数、最高分、`再玩一次`（重置状态回到游戏中）
- 最高分 key：`amblyopia_snake_highscore_v1`

- [ ] **Step 2: 自适应缩放**

- 棋盘按 `min(视口宽高)` 等比计算 cell 尺寸，窗口 resize 时重算
- 适配横屏/竖屏与平板比例；`#gameCanvas` 与 `#bgCanvas` 同步尺寸

- [ ] **Step 3: 验证**

窗口拉伸/平板比例下棋盘保持比例；开始→游戏→暂停→结束→再玩一次全流程正常；遮眼提醒在开始屏可见。

---

### Task 8: 最终验收

**Files:**
- 无（验证）

- [ ] **Step 1: 按规格十项验收清单逐项检查**

1. `snake_game.html` 双击（file://）可运行，控制台无报错
2. 键盘方向键/WASD 与鼠标跟随均可操控
3. 背景 6 种模式按节奏随机轮换
4. 颜色/形状/闪烁三开关独立生效
5. 闪烁三档（0.95/1.4/2.4Hz）生效且 ±20% 波动
6. 每吃 5 个食物速度升一档，起始速度可调
7. 设置与最高分刷新后保留
8. 音效可开关
9. 开始页含"遮盖好眼"提醒；无文字鼓励弹窗
10. 自测模式 `?test=1` 全部 PASS

- [ ] **Step 2: 汇总交付清单**

- `snake_game.html` + 设计文档 + 本计划
- 复制命令：
```powershell
Copy-Item -Path "C:\Users\1000length\.codex\visualizations\2026\08\21\01a02299-4891-71e1-a982-50058e199286\amblyopia_game\*" -Destination "D:\1000length\project\Amblyopia_Treatment" -Recurse -Force
```

- [ ] **Step 3: 可选提交（用户决定）**

在目标仓库内执行：
```bash
git add snake_game.html docs/
git commit -m "feat: 新增弱视治疗贪吃蛇游戏"
```
