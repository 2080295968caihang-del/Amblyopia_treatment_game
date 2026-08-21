/* =========================================================
   js/snake.js · 贪吃蛇游戏（纯逻辑 + DOM 接线）
   Task 3 部分：常量 + 纯函数 + 自测（Node 无头可测）
   Task 4 部分：G 画风渲染 / Esc 菜单 / 背景引擎装配 / 音效持久化
   暴露全局 window.SnakeGame
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var GRID_SIZE = 21;                  // 21×21 网格
  var SPEED_START_MS = 180;            // 起始速度（毫秒/格，默认中慢）
  var SPEED_MIN_MS = 60;               // 速度上限（最快）
  var SPEED_STEP = 5;                  // 每吃 5 个食物升一档
  var SPEED_DELTA_MS = 20;             // 每升一档速度减少的毫秒数
  var MAX_SPEED_LEVEL = 1 + Math.floor((SPEED_START_MS - SPEED_MIN_MS) / SPEED_DELTA_MS); // 速度上限对应的最大档位
  var DIR_VECTORS = {                  // 方向 → 单位向量（模块级常量，避免每次调用重建）
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  var LAYOUT_RESERVED_H = 150;         // HUD + 常驻遮眼提示 + 边距预留高度（CSS 像素）
  var MAX_BOARD_CSS = 640;             // 棋盘最大边长上限（CSS 像素）

  /* ---------- 核心纯函数 ---------- */

  // 方向 → 单位向量（未知方向返回零向量）
  function dirToVector(dir) {
    return DIR_VECTORS[dir] || { x: 0, y: 0 };
  }

  // 返回头部沿方向移动一格后的坐标
  function nextHead(head, dir) {
    var v = dirToVector(dir);
    return { x: head.x + v.x, y: head.y + v.y };
  }

  // 越界判断（0 ≤ 坐标 < GRID_SIZE）
  function isWallCollision(head) {
    return head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
  }

  // 撞自身判断：head 为移动后的新头，与蛇身任一段重叠即算。
  // excludeTail=true 时忽略蛇尾——蛇不进食移动时尾段同时腾空，
  // 蛇头移入当前尾格是合法操作；调用方在“蛇不增长”的那次移动中应传 true。
  function isSelfCollision(head, snake, excludeTail) {
    var end = excludeTail ? snake.length - 1 : snake.length;
    for (var i = 0; i < end; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) return true;
    }
    return false;
  }

  // 在非蛇身位置随机生成食物
  function randomFoodCell(snake) {
    var occupied = {};
    for (var i = 0; i < snake.length; i++) {
      occupied[snake[i].x + ',' + snake[i].y] = true;
    }
    var free = [];
    for (var y = 0; y < GRID_SIZE; y++) {
      for (var x = 0; x < GRID_SIZE; x++) {
        if (!occupied[x + ',' + y]) free.push({ x: x, y: y });
      }
    }
    if (free.length === 0) return null; // 棋盘被蛇占满的极端情况
    return free[Math.floor(Math.random() * free.length)];
  }

  // 家长设置起始速度档（1–5）→ 毫秒/格：很慢→很快；越界回退默认起始速度
  function initialSpeedMs(startSpeed) {
    var table = [220, 180, 140, 100, 60]; // 索引 = startSpeed - 1
    var i = startSpeed - 1;
    if (i < 0 || i >= table.length) return SPEED_START_MS;
    return table[i];
  }

  // 每吃 SPEED_STEP 个食物降一档速度（毫秒/格），最低不低于 SPEED_MIN_MS。
  // baseMs 为起始速度：默认与旧行为一致，家长设置自定义起始速度时由主循环传入。
  function speedForLevel(foodsEaten, baseMs) {
    if (baseMs === undefined) baseMs = SPEED_START_MS;
    var level = Math.floor(foodsEaten / SPEED_STEP);
    return Math.max(SPEED_MIN_MS, baseMs - level * SPEED_DELTA_MS);
  }

  // HUD 速度档：基于当前实际间隔相对起始速度的位置，1 起步、封顶 MAX_SPEED_LEVEL。
  // 家长自定义起始速度（startSpeed）会即时反映在档位上，
  // 不会出现"实际速度不变但档位虚高乱爬"（如 startSpeed=5 全程 60ms 时始终显示档 1）。
  function speedLevelForDisplay(foodsEaten, baseMs) {
    if (baseMs === undefined) baseMs = SPEED_START_MS;
    var currentMs = speedForLevel(foodsEaten, baseMs);
    var level = Math.round((baseMs - currentMs) / SPEED_DELTA_MS) + 1;
    return Math.min(Math.max(level, 1), MAX_SPEED_LEVEL);
  }

  // 自适应棋盘边长（CSS 像素）：取 min(视口宽, 视口高 - 预留高度)，
  // 向下取整到 GRID_SIZE 的整数倍（每格整数像素），并封顶 MAX_BOARD_CSS；
  // 视口过小时至少保留一格的边长；非有限输入回退到安全最小值。
  function computeBoardSize(viewportW, viewportH, reservedH) {
    var w = Number.isFinite(viewportW) ? viewportW : 0;
    var h = Number.isFinite(viewportH) ? viewportH : 0;
    var reserved = Number.isFinite(reservedH) && reservedH >= 0 ? reservedH : LAYOUT_RESERVED_H;
    var available = Math.min(w, h - reserved, MAX_BOARD_CSS);
    var cells = Math.max(1, Math.floor(available / GRID_SIZE));
    return cells * GRID_SIZE;
  }

  // 创建一局游戏的初始状态（纯数据）
  function createInitialState() {
    return {
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      dir: 'right',
      nextDir: 'right',
      food: null,
      score: 0,
      foodsEaten: 0,
      running: false,
      paused: false,
      gameOver: false,
      mouseActive: false
    };
  }

  // 判断两个方向是否互为 180° 反向
  function isOppositeDir(a, b) {
    var va = dirToVector(a);
    var vb = dirToVector(b);
    return va.x + vb.x === 0 && va.y + vb.y === 0;
  }

  // 是否允许把方向改为 newDir（禁止 180° 反向；同方向/垂直方向允许）
  function canSetDirection(currentDir, newDir) {
    return !isOppositeDir(currentDir, newDir);
  }

  // 输入层：把新方向写入 state.nextDir，反向时拒绝并返回 false（Task 3 接键盘/触控）
  function setDirection(state, dir) {
    // 按 nextDir 判反向：一 tick 内先 up 再 down（相对待生效方向的 180° 反向）也应被拒绝
    if (!canSetDirection(state.nextDir || state.dir, dir)) return false;
    state.nextDir = dir;
    return true;
  }

  /* ---------- 输入控制（键盘 / 鼠标，Node 可测） ---------- */

  // 数值钳制到 [min, max]：用于把越界的鼠标坐标收敛回网格
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // 键位映射：方向键 / WASD（大小写皆可）→ 方向；其他键返回 null
  function directionForKey(key) {
    switch (key) {
      case 'ArrowUp': case 'w': case 'W': return 'up';
      case 'ArrowDown': case 's': case 'S': return 'down';
      case 'ArrowLeft': case 'a': case 'A': return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      default: return null;
    }
  }

  // 鼠标转向：由蛇头到鼠标网格坐标的向量取主导轴方向（水平/垂直分量较大者），
  // 平局时优先水平；经 setDirection 语义写入 state.nextDir（禁止 180° 反向）。
  // 鼠标坐标越界时先钳制回网格；鼠标正落在蛇头上时无方向，返回 false。
  function steerByMouse(state, mouseCell) {
    if (!mouseCell) return false;
    var head = state.snake[0];
    var dx = clamp(mouseCell.x, 0, GRID_SIZE - 1) - head.x;
    var dy = clamp(mouseCell.y, 0, GRID_SIZE - 1) - head.y;
    if (dx === 0 && dy === 0) return false;
    var dir;
    if (Math.abs(dx) >= Math.abs(dy)) dir = dx >= 0 ? 'right' : 'left';
    else dir = dy >= 0 ? 'down' : 'up';
    return setDirection(state, dir);
  }

  // 暂停切换：原地翻转 state.paused 并返回 state（供空格/P 与 HUD 暂停按钮复用）
  function togglePause(state) {
    state.paused = !state.paused;
    return state;
  }

  // 方向/暂停键统一入口：仅游戏运行中生效；未开始或 gameOver 后按键一律忽略并返回 false。
  // 方向键成功写入时复位 mouseActive：键盘接管、鼠标跟随暂停，下次移动鼠标再恢复。
  // 返回值：true 表示已消费该输入（含被 180° 反向拒绝的方向键），并非方向必然生效。
  // controlMode='mouse' 时方向键仅消费不转向（暂停/菜单键仍生效），避免鼠标操控下误触
  function handleGameKey(state, key, controlMode) {
    if (!state.running || state.gameOver) return false;
    if (key === ' ' || key === 'p' || key === 'P') {
      togglePause(state); // 暂停键不干预鼠标跟随状态（恢复后延续当前控制方式）
      return true;
    }
    var dir = directionForKey(key);
    if (dir === null) return false;
    if (controlMode === 'mouse') return true; // 鼠标操控：方向键无效
    var applied = setDirection(state, dir);
    if (applied) state.mouseActive = false; // 键盘方向键接管：复位鼠标跟随
    return true;
  }

  // 走一步的核心纯逻辑：不修改传入 state，返回 { state, ate, gameOver }
  // opts.foodCell 可选：指定吃食物后新食物的位置（默认随机生成，供测试确定性使用）
  function stepGame(state, opts) {
    var opt = opts || {};
    // 生效方向：nextDir 与当前 dir 反向时回退到 dir（禁止 180° 反向的防御）
    var queued = state.nextDir || state.dir;
    var dir = isOppositeDir(queued, state.dir) ? state.dir : queued;
    var newHead = nextHead(state.snake[0], dir);
    // 是否吃到食物
    var ate = !!state.food && state.food.x === newHead.x && state.food.y === newHead.y;
    // 碰撞判定：不进食的 tick 尾段腾空（excludeTail=true）；进食的 tick 不腾尾（全段判定）
    var hitWall = isWallCollision(newHead);
    var hitSelf = isSelfCollision(newHead, state.snake, ate ? undefined : true);
    // 组装新蛇：进食不弹尾（蛇长 +1），未进食弹尾
    var newSnake = [newHead].concat(state.snake);
    if (!ate) newSnake.pop();
    // 进食后重新生成食物
    var newFood = state.food;
    if (ate) newFood = opt.foodCell || randomFoodCell(newSnake);
    return {
      state: {
        snake: newSnake,
        dir: dir,
        nextDir: dir,
        food: newFood,
        score: ate ? state.score + 10 : state.score,
        foodsEaten: ate ? state.foodsEaten + 1 : state.foodsEaten,
        running: state.running,
        paused: state.paused,
        mouseActive: state.mouseActive,
        gameOver: hitWall || hitSelf
      },
      ate: ate,
      gameOver: hitWall || hitSelf
    };
  }

  /* ---------- 自测框架 ---------- */
  // 运行全部自测，返回 [{pass, name, detail?}]，纯逻辑、无 DOM 依赖
  function runSelfTests() {
    var results = [];

    // 断言辅助：追加一条测试结果
    function check(name, cond, detail) {
      results.push({ pass: !!cond, name: name, detail: cond ? undefined : detail });
    }

    // 坐标点相等比较
    function samePoint(a, b) {
      return !!a && !!b && a.x === b.x && a.y === b.y;
    }

    // ---- dirToVector：四个方向 ----
    check('dirToVector: up → {0,-1}', samePoint(dirToVector('up'), { x: 0, y: -1 }), '实际 ' + JSON.stringify(dirToVector('up')));
    check('dirToVector: down → {0,1}', samePoint(dirToVector('down'), { x: 0, y: 1 }), '实际 ' + JSON.stringify(dirToVector('down')));
    check('dirToVector: left → {-1,0}', samePoint(dirToVector('left'), { x: -1, y: 0 }), '实际 ' + JSON.stringify(dirToVector('left')));
    check('dirToVector: right → {1,0}', samePoint(dirToVector('right'), { x: 1, y: 0 }), '实际 ' + JSON.stringify(dirToVector('right')));

    // ---- nextHead：移动后的头部坐标 ----
    check('nextHead: 右移一格', samePoint(nextHead({ x: 5, y: 5 }, 'right'), { x: 6, y: 5 }), '实际 ' + JSON.stringify(nextHead({ x: 5, y: 5 }, 'right')));
    check('nextHead: 上移一格', samePoint(nextHead({ x: 5, y: 5 }, 'up'), { x: 5, y: 4 }), '实际 ' + JSON.stringify(nextHead({ x: 5, y: 5 }, 'up')));
    check('nextHead: 左移越过左边界', samePoint(nextHead({ x: 0, y: 5 }, 'left'), { x: -1, y: 5 }), '实际 ' + JSON.stringify(nextHead({ x: 0, y: 5 }, 'left')));
    check('nextHead: 下移越过下边界', samePoint(nextHead({ x: 5, y: GRID_SIZE - 1 }, 'down'), { x: 5, y: GRID_SIZE }), '实际 ' + JSON.stringify(nextHead({ x: 5, y: GRID_SIZE - 1 }, 'down')));

    // ---- isWallCollision：边界 ----
    check('isWallCollision: 左上角界内', !isWallCollision({ x: 0, y: 0 }), '实际 true');
    check('isWallCollision: 右下角界内', !isWallCollision({ x: GRID_SIZE - 1, y: GRID_SIZE - 1 }), '实际 true');
    check('isWallCollision: 左越界', isWallCollision({ x: -1, y: 5 }), '实际 false');
    check('isWallCollision: 右越界', isWallCollision({ x: GRID_SIZE, y: 5 }), '实际 false');
    check('isWallCollision: 上越界', isWallCollision({ x: 5, y: -1 }), '实际 false');
    check('isWallCollision: 下越界', isWallCollision({ x: 5, y: GRID_SIZE }), '实际 false');

    // ---- isSelfCollision：撞自身（含新头；excludeTail=true 时忽略蛇尾） ----
    var body = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }];
    check('isSelfCollision: 新头撞到身体', isSelfCollision({ x: 2, y: 4 }, body), '实际 false');
    check('isSelfCollision: 新头与旧头重叠', isSelfCollision({ x: 3, y: 3 }, body), '实际 false');
    check('isSelfCollision: 未撞自身', !isSelfCollision({ x: 4, y: 4 }, body), '实际 true');
    check('isSelfCollision: 移入腾空尾格（excludeTail=true）不算碰撞', !isSelfCollision({ x: 2, y: 4 }, body, true), '实际 true');
    check('isSelfCollision: excludeTail 缺省时尾格算碰撞', isSelfCollision({ x: 2, y: 4 }, body), '实际 false');

    // ---- randomFoodCell：不在蛇身、且在网格内 ----
    {
      var snake = [];
      for (var fy = 0; fy < GRID_SIZE; fy++) {
        for (var fx = 0; fx < GRID_SIZE; fx++) {
          if ((fx + fy) % 2 === 0) snake.push({ x: fx, y: fy });
        }
      }
      var foodOk = true;
      var failDetail = '';
      for (var fi = 0; fi < 200 && foodOk; fi++) {
        var f = randomFoodCell(snake);
        var inGrid = f && f.x >= 0 && f.x < GRID_SIZE && f.y >= 0 && f.y < GRID_SIZE;
        var onSnake = f && snake.some(function (s) { return s.x === f.x && s.y === f.y; });
        if (!inGrid || onSnake) {
          foodOk = false;
          failDetail = '生成食物 ' + JSON.stringify(f) + ' 非法';
        }
      }
      check('randomFoodCell: 200 次均不在蛇身且在网格内', foodOk, failDetail);
    }

    // ---- randomFoodCell：满盘（蛇占满所有格子）----
    {
      var fullSnake = [];
      for (var sy = 0; sy < GRID_SIZE; sy++) {
        for (var sx = 0; sx < GRID_SIZE; sx++) fullSnake.push({ x: sx, y: sy });
      }
      var ffull = randomFoodCell(fullSnake);
      check('randomFoodCell: 满盘时返回 null', ffull === null, '实际 ' + JSON.stringify(ffull));
    }

    // ---- speedForLevel：单调不增且有下限 ----
    {
      var monotonic = true;
      var aboveFloor = true;
      for (var sn = 0; sn < 120; sn++) {
        if (speedForLevel(sn) < speedForLevel(sn + 1)) monotonic = false;
        if (speedForLevel(sn) < SPEED_MIN_MS) aboveFloor = false;
      }
      check('speedForLevel: 随食物数单调不增', monotonic, '出现增档');
      check('speedForLevel: 不低于速度下限', aboveFloor, '低于 ' + SPEED_MIN_MS + 'ms');
      check('speedForLevel: 0 个食物时为起始速度', speedForLevel(0) === SPEED_START_MS, '实际 ' + speedForLevel(0));
      check('speedForLevel: 食物足够多时到达速度下限', speedForLevel(120) === SPEED_MIN_MS, '实际 ' + speedForLevel(120));
      check('speedForLevel: 边界 4 个食物仍为起始速度', speedForLevel(4) === 180, '实际 ' + speedForLevel(4));
      check('speedForLevel: 边界 5 个食物降一档', speedForLevel(5) === 160, '实际 ' + speedForLevel(5));
      check('speedForLevel: 边界 30 个食物到达下限', speedForLevel(30) === 60, '实际 ' + speedForLevel(30));
    }

    // ---- 方向：禁止 180° 反向（向左时按右不生效） ----
    check('禁止反向: isOppositeDir(left, right) 为 true', isOppositeDir('left', 'right') === true, '实际 false');
    check('禁止反向: isOppositeDir(right, up) 为 false', isOppositeDir('right', 'up') === false, '实际 true');
    check('禁止反向: 向左时按右不生效（setDirection 拒绝）', (function () {
      var s = createInitialState();
      s.dir = 'left'; s.nextDir = 'left'; // 初始向左
      var ok = setDirection(s, 'right');
      return ok === false && s.nextDir === 'left';
    })(), '实际未拒绝或方向被改写');
    check('禁止反向: 同方向允许', (function () {
      var s = createInitialState();
      s.dir = 'left'; s.nextDir = 'left';
      return setDirection(s, 'left') === true && s.nextDir === 'left';
    })(), '实际被拒绝');
    check('禁止反向: 垂直转向允许', (function () {
      var s = createInitialState();
      return setDirection(s, 'up') === true && s.nextDir === 'up';
    })(), '实际被拒绝');
    check('禁止反向: 一 tick 内先 up 再 down 被拒绝', (function () {
      var s = createInitialState();
      setDirection(s, 'up'); // 相对 right 垂直，允许 → nextDir='up'
      return setDirection(s, 'down') === false && s.nextDir === 'up';
    })(), '实际未拒绝或 nextDir 被改写');
    check('禁止反向: stepGame 防御直接置入的反向 nextDir', (function () {
      var s = createInitialState();
      s.food = { x: 20, y: 20 };
      s.nextDir = 'left'; // 绕过 setDirection 直接注入反向
      var r = stepGame(s);
      return !r.gameOver && samePoint(r.state.snake[0], { x: 11, y: 10 });
    })(), '实际按反向移动');

    // ---- stepGame：正常移动（不进食，尾段腾空） ----
    {
      var s = createInitialState();
      s.food = { x: 20, y: 20 };
      var r = stepGame(s);
      check('stepGame: 未进食时蛇长不变', r.state.snake.length === 3 && !r.ate && !r.gameOver, '实际长度 ' + r.state.snake.length + ' ate=' + r.ate + ' over=' + r.gameOver);
      check('stepGame: 未进食时头部右移一格', samePoint(r.state.snake[0], { x: 11, y: 10 }), '实际 ' + JSON.stringify(r.state.snake[0]));
      check('stepGame: 尾部腾空移入合法', (function () {
        var s2 = createInitialState();
        s2.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }];
        s2.dir = 'down'; s2.nextDir = 'down';
        s2.food = { x: 0, y: 0 };
        var r2 = stepGame(s2);
        return !r2.gameOver && r2.state.snake.length === 2 && samePoint(r2.state.snake[0], { x: 5, y: 6 });
      })(), '移入尾格被误判为碰撞');
    }

    // ---- stepGame：吃食物 ----
    {
      var se = createInitialState();
      se.food = { x: 11, y: 10 }; // 下一步即食物
      var re = stepGame(se);
      check('stepGame: 吃食物后蛇长 +1', re.ate === true && re.state.snake.length === 4, '实际 ate=' + re.ate + ' 长度 ' + re.state.snake.length);
      check('stepGame: 吃食物后分数 +10', re.state.score === 10, '实际 ' + re.state.score);
      check('stepGame: 吃食物后 foodsEaten +1', re.state.foodsEaten === 1, '实际 ' + re.state.foodsEaten);
      check('stepGame: 吃食物后新食物不在蛇身', (function () {
        var f = re.state.food;
        return !!f && !re.state.snake.some(function (seg) { return seg.x === f.x && seg.y === f.y; });
      })(), '实际 ' + JSON.stringify(re.state.food));
      check('stepGame: foodCell 可指定新食物位置', (function () {
        var s3 = createInitialState();
        s3.food = { x: 11, y: 10 }; // 先让本步能吃到食物
        var r3 = stepGame(s3, { foodCell: { x: 0, y: 0 } });
        return samePoint(r3.state.food, { x: 0, y: 0 });
      })(), '实际 ' + JSON.stringify(stepGame(createInitialState(), { foodCell: { x: 0, y: 0 } }).state.food));
    }

    // ---- stepGame：撞墙 / 撞身触发 gameOver ----
    {
      var sw = createInitialState();
      sw.snake = [{ x: 0, y: 0 }, { x: 0, y: 1 }];
      sw.dir = 'left'; sw.nextDir = 'left';
      sw.food = { x: 20, y: 20 };
      var rw = stepGame(sw);
      check('stepGame: 撞墙触发 gameOver', rw.gameOver === true && rw.state.gameOver === true, '实际 ' + rw.gameOver);
    }
    {
      var ss = createInitialState();
      ss.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }];
      ss.dir = 'down'; ss.nextDir = 'down';
      ss.food = { x: 0, y: 0 };
      var rs = stepGame(ss);
      check('stepGame: 撞身触发 gameOver', rs.gameOver === true, '实际 ' + rs.gameOver);
    }
    {
      var st = createInitialState();
      st.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }];
      st.dir = 'down'; st.nextDir = 'down';
      st.food = { x: 5, y: 6 }; // 尾格上有食物：进食 → 不腾尾 → 撞身
      var rt = stepGame(st);
      check('stepGame: 进食 tick 移入未腾空尾格算撞身', rt.ate === true && rt.gameOver === true, '实际 ate=' + rt.ate + ' over=' + rt.gameOver);
    }
    check('stepGame: 不改动传入 state（纯净）', (function () {
      var s4 = createInitialState();
      s4.food = { x: 20, y: 20 };
      var before = JSON.stringify(s4);
      stepGame(s4);
      return JSON.stringify(s4) === before;
    })(), '实际被修改');

    // ---- stepGame：补充用例 ----
    check('stepGame: 直线连续 5 步不越界不误报', (function () {
      var s5 = createInitialState();
      s5.food = { x: 20, y: 20 };
      var ok = true;
      for (var i = 0; i < 5; i++) {
        var r5 = stepGame(s5);
        if (r5.gameOver) ok = false;
        s5 = r5.state;
      }
      return ok && s5.snake.length === 3 && samePoint(s5.snake[0], { x: 15, y: 10 });
    })(), '连续移动被误判或方向错误');
    check('createInitialState: 默认结构完整', (function () {
      var s6 = createInitialState();
      return s6.snake.length === 3 && s6.dir === 'right' && s6.nextDir === 'right' && s6.score === 0 && !s6.running && !s6.paused && !s6.gameOver && !s6.mouseActive;
    })(), '默认字段缺失');
    check('setDirection: nextDir 为空时按 dir 判反向', (function () {
      var s7 = createInitialState();
      s7.dir = 'up'; s7.nextDir = null;
      return setDirection(s7, 'down') === false && s7.nextDir === null;
    })(), '未按 dir 判反向');

    // ---- 输入控制：directionForKey 键位映射 ----
    check('directionForKey: ArrowUp → up', directionForKey('ArrowUp') === 'up', '实际 ' + directionForKey('ArrowUp'));
    check('directionForKey: w / W → up', directionForKey('w') === 'up' && directionForKey('W') === 'up', '实际 ' + directionForKey('w') + ' / ' + directionForKey('W'));
    check('directionForKey: ArrowDown → down', directionForKey('ArrowDown') === 'down', '实际 ' + directionForKey('ArrowDown'));
    check('directionForKey: s / S → down', directionForKey('s') === 'down' && directionForKey('S') === 'down', '实际 ' + directionForKey('s') + ' / ' + directionForKey('S'));
    check('directionForKey: ArrowLeft → left', directionForKey('ArrowLeft') === 'left', '实际 ' + directionForKey('ArrowLeft'));
    check('directionForKey: a / A → left', directionForKey('a') === 'left' && directionForKey('A') === 'left', '实际 ' + directionForKey('a') + ' / ' + directionForKey('A'));
    check('directionForKey: ArrowRight → right', directionForKey('ArrowRight') === 'right', '实际 ' + directionForKey('ArrowRight'));
    check('directionForKey: d / D → right', directionForKey('d') === 'right' && directionForKey('D') === 'right', '实际 ' + directionForKey('d') + ' / ' + directionForKey('D'));
    check('directionForKey: 无效键返回 null', directionForKey('x') === null && directionForKey('Enter') === null && directionForKey('') === null, '实际 ' + JSON.stringify(directionForKey('x')));

    // ---- 输入控制：steerByMouse 主导轴转向 ----
    {
      var sm1 = createInitialState(); // 蛇头 (10,10)，初始 dir=right
      var ok1 = steerByMouse(sm1, { x: 15, y: 10 });
      check('steerByMouse: 鼠标在蛇头右侧 → right', ok1 === true && sm1.nextDir === 'right', '实际 ok=' + ok1 + ' nextDir=' + sm1.nextDir);
    }
    {
      var sm2 = createInitialState();
      var ok2 = steerByMouse(sm2, { x: 10, y: 3 });
      check('steerByMouse: 鼠标在蛇头上方 → up', ok2 === true && sm2.nextDir === 'up', '实际 ok=' + ok2 + ' nextDir=' + sm2.nextDir);
    }
    {
      var sm3 = createInitialState();
      var ok3 = steerByMouse(sm3, { x: 11, y: 15 }); // dx=1, dy=5：垂直分量主导
      check('steerByMouse: 垂直分量主导 → down', ok3 === true && sm3.nextDir === 'down', '实际 ok=' + ok3 + ' nextDir=' + sm3.nextDir);
    }
    {
      var sm4 = createInitialState();
      var ok4 = steerByMouse(sm4, { x: 15, y: 11 }); // dx=5, dy=1：水平分量主导
      check('steerByMouse: 水平分量主导 → right', ok4 === true && sm4.nextDir === 'right', '实际 ok=' + ok4 + ' nextDir=' + sm4.nextDir);
    }
    {
      var sm5 = createInitialState();
      var ok5 = steerByMouse(sm5, { x: 12, y: 12 }); // dx=2, dy=2 平局 → 水平优先
      check('steerByMouse: 平局时水平优先 → right', ok5 === true && sm5.nextDir === 'right', '实际 ok=' + ok5 + ' nextDir=' + sm5.nextDir);
    }
    {
      var sm6 = createInitialState();
      sm6.dir = 'right'; sm6.nextDir = 'right';
      var ok6 = steerByMouse(sm6, { x: 5, y: 10 }); // 鼠标在左侧：相对当前方向 180° 反向
      check('steerByMouse: 180° 反向被拒绝且 nextDir 不变', ok6 === false && sm6.nextDir === 'right', '实际 ok=' + ok6 + ' nextDir=' + sm6.nextDir);
    }
    {
      var sm7 = createInitialState();
      var ok7 = steerByMouse(sm7, { x: 10, y: 10 }); // 鼠标正落在蛇头上
      check('steerByMouse: 鼠标在蛇头上不产生方向', ok7 === false && sm7.nextDir === 'right', '实际 ok=' + ok7 + ' nextDir=' + sm7.nextDir);
    }
    {
      var sm8 = createInitialState();
      sm8.dir = 'down'; sm8.nextDir = 'down';
      var ok8 = steerByMouse(sm8, { x: -5, y: 10 }); // 鼠标越界：钳制到 (0,10) → left
      check('steerByMouse: 越界鼠标坐标先钳制回网格', ok8 === true && sm8.nextDir === 'left', '实际 ok=' + ok8 + ' nextDir=' + sm8.nextDir);
    }
    {
      var sm9 = createInitialState();
      var ok9 = steerByMouse(sm9, null); // 尚无鼠标数据
      check('steerByMouse: 无鼠标数据返回 false 且不改方向', ok9 === false && sm9.nextDir === 'right', '实际 ok=' + ok9 + ' nextDir=' + sm9.nextDir);
    }

    // ---- 输入控制：togglePause 暂停往返 ----
    {
      var tp = createInitialState(); // paused=false
      var r1 = togglePause(tp);
      var p1 = tp.paused;
      var r2 = togglePause(tp);
      var p2 = tp.paused;
      check('togglePause: 暂停 → 恢复（往返不变）', p1 === true && p2 === false, '实际 ' + p1 + ' → ' + p2);
      check('togglePause: 原地修改并返回同一 state', r1 === tp && r2 === tp, '实际返回了不同对象');
    }

    // ---- 输入控制：handleGameKey 运行态守卫 ----
    {
      var h1 = createInitialState(); // running=false：未开始
      var before1 = JSON.stringify(h1);
      var okh1 = handleGameKey(h1, 'ArrowUp');
      check('handleGameKey: 未运行时方向键不生效', okh1 === false && JSON.stringify(h1) === before1, '实际 ok=' + okh1);
    }
    {
      var h2 = createInitialState();
      h2.running = true; h2.gameOver = true; // gameOver 后
      var before2 = JSON.stringify(h2);
      var okh2 = handleGameKey(h2, 'ArrowUp');
      check('handleGameKey: gameOver 后方向键不生效', okh2 === false && JSON.stringify(h2) === before2, '实际 ok=' + okh2);
    }
    {
      var h3 = createInitialState();
      h3.running = true; h3.gameOver = true;
      var okh3 = handleGameKey(h3, ' ');
      check('handleGameKey: gameOver 后空格不暂停', okh3 === false && h3.paused === false, '实际 ok=' + okh3 + ' paused=' + h3.paused);
    }
    {
      var h4 = createInitialState();
      h4.running = true;
      var okh4 = handleGameKey(h4, 'ArrowUp');
      check('handleGameKey: 运行中方向键生效', okh4 === true && h4.nextDir === 'up', '实际 ok=' + okh4 + ' nextDir=' + h4.nextDir);
    }
    {
      var h5 = createInitialState();
      h5.running = true;
      var okh5 = handleGameKey(h5, 'P');
      check('handleGameKey: 运行中 P 切换暂停', okh5 === true && h5.paused === true, '实际 ok=' + okh5 + ' paused=' + h5.paused);
    }
    {
      var h6 = createInitialState();
      h6.running = true;
      var before6 = JSON.stringify(h6);
      var okh6 = handleGameKey(h6, 'Enter');
      check('handleGameKey: 无效键返回 false 且不改状态', okh6 === false && JSON.stringify(h6) === before6, '实际 ok=' + okh6);
    }

    // ---- 输入控制：键盘命中复位鼠标跟随 ----
    {
      var k1 = createInitialState();
      k1.running = true; k1.mouseActive = true;
      var okk1 = handleGameKey(k1, 'ArrowUp');
      check('handleGameKey: 方向键命中后 mouseActive 复位（键盘接管）', okk1 === true && k1.mouseActive === false && k1.nextDir === 'up', '实际 ok=' + okk1 + ' mouseActive=' + k1.mouseActive + ' nextDir=' + k1.nextDir);
    }
    {
      var k2 = createInitialState();
      k2.running = true; k2.mouseActive = true;
      var okk2 = handleGameKey(k2, ' ');
      check('handleGameKey: 暂停键不重置鼠标跟随', okk2 === true && k2.mouseActive === true && k2.paused === true, '实际 ok=' + okk2 + ' mouseActive=' + k2.mouseActive);
    }
    {
      var k3 = createInitialState();
      k3.running = true; k3.mouseActive = true;
      k3.dir = 'right'; k3.nextDir = 'right';
      var okk3 = handleGameKey(k3, 'ArrowLeft'); // 180° 反向被拒
      check('handleGameKey: 反向键被拒时保留鼠标跟随（仅成功时接管）', okk3 === true && k3.nextDir === 'right' && k3.mouseActive === true, '实际 ok=' + okk3 + ' nextDir=' + k3.nextDir + ' mouseActive=' + k3.mouseActive);
    }
    {
      var m1 = createInitialState();
      m1.running = true;
      var okm1 = handleGameKey(m1, 'ArrowUp', 'mouse');
      check('handleGameKey: 鼠标操控模式方向键不转向', okm1 === true && m1.nextDir === 'right', '实际 ok=' + okm1 + ' nextDir=' + m1.nextDir);
    }
    {
      var m2 = createInitialState();
      m2.running = true;
      var okm2 = handleGameKey(m2, ' ', 'mouse');
      check('handleGameKey: 鼠标操控模式暂停键仍生效', okm2 === true && m2.paused === true, '实际 ok=' + okm2);
    }

    // ---- 起始速度 / 速度档（家长设置关联） ----
    check('initialSpeedMs: 1–5 档映射', (function () {
      return initialSpeedMs(1) === 220 && initialSpeedMs(2) === 180 && initialSpeedMs(3) === 140 && initialSpeedMs(4) === 100 && initialSpeedMs(5) === 60;
    })(), '映射不符');
    check('initialSpeedMs: 越界档位回退默认起始速度', initialSpeedMs(0) === SPEED_START_MS && initialSpeedMs(6) === SPEED_START_MS, '越界未回退');
    check('speedForLevel(n, baseMs): 自定义起始速度生效', (function () {
      var fast = speedForLevel(0, 100);
      return fast === 100;
    })(), '实际 ' + speedForLevel(0, 100));
    check('speedForLevel(n, baseMs): 按档递减', (function () {
      var stepped = speedForLevel(5, 100);
      return stepped === 80;
    })(), '实际 ' + speedForLevel(5, 100));
    check('speedForLevel(n, baseMs): 不低于 SPEED_MIN_MS', (function () {
      var clamped = speedForLevel(30, 100);
      return clamped === SPEED_MIN_MS;
    })(), '实际 ' + speedForLevel(30, 100));
    check('speedLevelForDisplay: 默认起始速度下档位与旧行为一致', (function () {
      return speedLevelForDisplay(0) === 1 && speedLevelForDisplay(5) === 2 && speedLevelForDisplay(30) === MAX_SPEED_LEVEL;
    })(), '档位不符');
    check('speedLevelForDisplay: 自定义起始速度即时反映且不虚高', (function () {
      return speedLevelForDisplay(0, 60) === 1;
    })(), '实际 ' + speedLevelForDisplay(0, 60));
    check('speedLevelForDisplay: 档位封顶在 1~MAX_SPEED_LEVEL', (function () {
      var v = speedLevelForDisplay(200, 220);
      return v >= 1 && v <= MAX_SPEED_LEVEL;
    })(), '实际 ' + speedLevelForDisplay(200, 220));

    // ---- 补充：边界与确定性用例 ----
    check('randomFoodCell: 只剩一个自由格时返回该格', (function () {
      var almostFull = [];
      for (var ay = 0; ay < GRID_SIZE; ay++) {
        for (var ax = 0; ax < GRID_SIZE; ax++) {
          if (!(ax === 7 && ay === 7)) almostFull.push({ x: ax, y: ay });
        }
      }
      var f7 = randomFoodCell(almostFull);
      return !!f7 && f7.x === 7 && f7.y === 7;
    })(), '未返回唯一自由格');
    check('handleGameKey: 小写 wasd 生效并接管鼠标', (function () {
      var k4 = createInitialState();
      k4.running = true; k4.mouseActive = true;
      var ok4 = handleGameKey(k4, 'w');
      return ok4 === true && k4.nextDir === 'up' && k4.mouseActive === false;
    })(), '实际 ok=' + handleGameKey(createInitialState(), 'w'));
    check('speedForLevel: baseMs 低于下限时立即钳制到下限', (function () {
      return speedForLevel(0, 30) === SPEED_MIN_MS;
    })(), '实际 ' + speedForLevel(0, 30));

    // ---- computeBoardSize：自适应棋盘（审查补充） ----
    check('computeBoardSize: 返回值是 GRID_SIZE 整数倍且不超 MAX_BOARD_CSS', (function () {
      var v = computeBoardSize(1024, 768, 140);
      return v % GRID_SIZE === 0 && v <= MAX_BOARD_CSS;
    })(), '实际 ' + computeBoardSize(1024, 768, 140));
    check('computeBoardSize: 横屏大屏 1920×1080 封顶', computeBoardSize(1920, 1080, 140) === Math.floor(MAX_BOARD_CSS / GRID_SIZE) * GRID_SIZE, '实际 ' + computeBoardSize(1920, 1080, 140));
    check('computeBoardSize: 竖屏大屏 1080×1920 封顶', computeBoardSize(1080, 1920, 140) === Math.floor(MAX_BOARD_CSS / GRID_SIZE) * GRID_SIZE, '实际 ' + computeBoardSize(1080, 1920, 140));
    check('computeBoardSize: 平板横屏 1024×768 以高度为约束', computeBoardSize(1024, 768, 140) === 609, '实际 ' + computeBoardSize(1024, 768, 140));
    check('computeBoardSize: 平板竖屏 768×1024 封顶', computeBoardSize(768, 1024, 140) === Math.floor(MAX_BOARD_CSS / GRID_SIZE) * GRID_SIZE, '实际 ' + computeBoardSize(768, 1024, 140));
    check('computeBoardSize: 高度受限时取 高-预留', computeBoardSize(1920, 600, 140) === 441, '实际 ' + computeBoardSize(1920, 600, 140));
    check('computeBoardSize: 小视口回退到单格边长', computeBoardSize(20, 500, 100) === GRID_SIZE, '实际 ' + computeBoardSize(20, 500, 100));
    check('computeBoardSize: 视口小于预留高度仍不小于单格', computeBoardSize(100, 50, 140) === GRID_SIZE, '实际 ' + computeBoardSize(100, 50, 140));
    check('computeBoardSize: 预留高度缺省时用默认值', computeBoardSize(640, 700, 140) === computeBoardSize(640, 700), '实际不一致');
    check('computeBoardSize: NaN/Infinity 非有限输入回退', computeBoardSize(NaN, Infinity, 140) === GRID_SIZE, '实际 ' + computeBoardSize(NaN, Infinity, 140));

    return results;
  }

  window.SnakeGame = { name: 'snake' };
  window.SnakeGame.runSelfTests = runSelfTests;

﻿/* ---------- 浏览器端初始化（Node 下自动跳过） ---------- */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  /* ---------- 设置持久化（localStorage，v1.0 键名与 6→3 模式兼容） ---------- */
  var SETTINGS_KEY = 'amblyopia_snake_settings_v1';
  var HIGH_SCORE_KEY = 'amblyopia_snake_highscore_v1';
  var defaultSettings = {
    flickerLevel: 1,                  // 0/1/2 → 1.2/2/3.2 Hz
    modes: [true, true, true],        // 3 种模式是否参与轮换
    controlMode: 'both',              // 'keyboard' 键盘 | 'mouse' 鼠标 | 'both' 两者均可
    colorMode: 'contrast',            // 'contrast' 高对比 | 'mixed' 混合（带彩色点缀）
    startSpeed: 2,                    // 起始速度档 1–5 → initialSpeedMs
    soundOn: true,                    // 音效开关
    colorChange: true,                // 颜色变化开关
    shapeChange: true,                // 形状（模式）变化开关
    flickerChange: true               // 闪烁开关
  };

  // 从 localStorage 读取设置：解析失败或字段缺失时用默认值补齐。
  // v1.0 的 modes 为 6 项、v2.0 为 4 项，加载时映射为新 3 项（均丢弃红光闪烁位）。
  function loadSettings() {
    var out = {
      flickerLevel: defaultSettings.flickerLevel,
      modes: defaultSettings.modes.slice(),
      controlMode: defaultSettings.controlMode,
      colorMode: defaultSettings.colorMode,
      startSpeed: defaultSettings.startSpeed,
      soundOn: defaultSettings.soundOn,
      colorChange: defaultSettings.colorChange,
      shapeChange: defaultSettings.shapeChange,
      flickerChange: defaultSettings.flickerChange
    };
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return out;
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (Number.isFinite(saved.flickerLevel)) {
            var fl = Math.floor(saved.flickerLevel);
            if (fl >= 0 && fl < 3) out.flickerLevel = fl;
          }
          if (Array.isArray(saved.modes)) {
            if (saved.modes.length === 6) {
              // v1.0：6 项（旧索引 0..5）→ 新 3 项：CAM光栅=旧1、棋盘格=旧2、对比条纹=旧4
              out.modes = [saved.modes[1] === true, saved.modes[2] === true, saved.modes[4] === true];
            } else if (saved.modes.length === 4) {
              // v2.0：4 项（含红光闪烁）→ 新 3 项：丢弃旧索引 0
              out.modes = [saved.modes[1] === true, saved.modes[2] === true, saved.modes[3] === true];
            } else {
              for (var i = 0; i < out.modes.length; i++) {
                if (i < saved.modes.length) out.modes[i] = saved.modes[i] === true;
              }
            }
          }
          if (saved.controlMode === 'keyboard' || saved.controlMode === 'mouse' || saved.controlMode === 'both') out.controlMode = saved.controlMode;
          if (saved.colorMode === 'contrast' || saved.colorMode === 'mixed') out.colorMode = saved.colorMode;
          if (Number.isFinite(saved.startSpeed)) {
            var sp = Math.floor(saved.startSpeed);
            if (sp >= 1 && sp <= 5) out.startSpeed = sp;
          }
          if (typeof saved.soundOn === 'boolean') out.soundOn = saved.soundOn;
          if (typeof saved.colorChange === 'boolean') out.colorChange = saved.colorChange;
          if (typeof saved.shapeChange === 'boolean') out.shapeChange = saved.shapeChange;
          if (typeof saved.flickerChange === 'boolean') out.flickerChange = saved.flickerChange;
        }
      }
    } catch (e) {
      // 解析失败（损坏 JSON / localStorage 不可用）：静默回退默认
    }
    return out;
  }

  // 写入设置（写入失败如配额满时静默忽略，不影响游戏进行）
  function saveSettings(s) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      // 静默忽略
    }
  }

  var settings = loadSettings();

  /* ---------- Web Audio 合成音效 ---------- */
  // 播放开关判定：只有 settings.soundOn === true 才出声
  function shouldPlaySound(settingsObj) {
    return !!settingsObj && settingsObj.soundOn === true;
  }

  var audioCtx = null;

  // 懒创建的共享 AudioContext（浏览器自动播放策略：首次用户交互时创建/恢复）
  function ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (typeof AC === 'undefined') return null;
    try {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () { /* 静默忽略 */ });
      return audioCtx;
    } catch (e) {
      return null; // 音频设备不可用等异常：静默忽略，不影响游戏
    }
  }

  // 通用单音合成：freq 起始频率(Hz)、duration 时长(s)、type 波形、volume 音量(0-1)；
  // endFreq 可选：大于 0 时频率在 duration 内平滑下滑到 endFreq。
  function playTone(freq, duration, type, volume, endFreq) {
    if (!shouldPlaySound(settings)) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (typeof endFreq === 'number' && endFreq > 0 && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = function () { osc.disconnect(); gain.disconnect(); };
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) {
      // 静默忽略：任何音频异常都不影响游戏逻辑
    }
  }

  // 吃到食物：短促高音"叮"（880Hz 方波，0.08s）
  function eatSound() {
    playTone(880, 0.08, 'square', 0.25);
  }

  // 游戏结束：低音下滑提示（220Hz 滑到 110Hz，0.5s 三角波）
  function overSound() {
    playTone(220, 0.5, 'triangle', 0.3, 110);
  }

  /* ---------- 游戏状态与循环 ---------- */
  var state = createInitialState();
  var animationId = null;     // 主循环 rAF 句柄
  var lastFrameTs = null;     // 上一帧时间戳（用于时间累积）
  var accMs = 0;              // 距下一次移动累积的毫秒数
  var lastMouseCell = null;   // 鼠标在游戏屏上的最近目标格
  var bgEngine = null;        // 共享背景引擎实例（BgEngine.create）
  var bgLoopId = null;        // 背景循环 rAF 句柄

  // 读取最高分（localStorage 缺失、非法或读取异常时返回 0）
  function readHighScore() {
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(HIGH_SCORE_KEY);
        var n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
    } catch (e) {
      // 隐私模式 / file:// 受限等场景下读取失败，静默按 0 处理
    }
    return 0;
  }

  // 写入最高分（写入失败如配额满时静默忽略）
  function writeHighScore(score) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HIGH_SCORE_KEY, String(score));
    } catch (e) {
      // 静默忽略
    }
  }

  // 同步最高分：超过历史最高分时立即持久化，返回当前最高分
  function syncHighScore() {
    var high = readHighScore();
    if (state.score > high) {
      writeHighScore(state.score);
      return state.score;
    }
    return high;
  }

  // 刷新 HUD：分数 / 最高分 / 速度档（档位基于当前实际间隔计算，家长起始速度即时反映）
  function updateHud() {
    document.getElementById('hudScore').textContent = String(state.score);
    document.getElementById('hudHighScore').textContent = String(syncHighScore());
    document.getElementById('hudSpeed').textContent = String(speedLevelForDisplay(state.foodsEaten, initialSpeedMs(settings.startSpeed)));
  }

  // HUD 暂停按钮文案随暂停状态同步（⏸ 暂停 / ▶ 继续）
  var btnPause = document.getElementById('btnPause');
  function syncPauseButton() {
    if (btnPause) btnPause.textContent = state.paused ? '▶ 继续' : '⏸ 暂停';
  }
  syncPauseButton();

  // 背景设置即时生效：游戏运行中通知引擎应用最新设置
  function applyBgSettings() {
    if (bgEngine && state.running) bgEngine.applySettings(settings);
  }

  // 背景循环：独立 rAF，每帧调用引擎 draw(now)（引擎内部处理过渡/配色/闪烁）
  function bgLoop(timestamp) {
    bgLoopId = null;
    if (!state.running || state.paused || state.gameOver) return;
    if (bgEngine) bgEngine.draw(timestamp);
    bgLoopId = requestAnimationFrame(bgLoop);
  }

  // 启动背景循环：已在运行时不重复启动
  function startBgLoop() {
    if (!bgEngine || bgLoopId !== null) return;
    if (!state.running || state.paused || state.gameOver) return;
    bgLoopId = requestAnimationFrame(bgLoop);
  }

  // 停止背景循环：画布保留当前帧
  function stopBgLoop() {
    if (bgLoopId !== null) {
      cancelAnimationFrame(bgLoopId);
      bgLoopId = null;
    }
  }

  /* ---------- G 画风渲染（圆角大色块 + 大眼睛 + 红果） ---------- */
  // 圆角矩形路径
  function drawRoundCell(ctx, x, y, size, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
  }

  // 椭圆填充（兼容性：用 translate/scale/arc 实现）
  function fillEllipse(ctx, cx, cy, rx, ry, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    ctx.scale(rx, ry);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 在 #gameCanvas 上绘制蛇与食物（画布透明，叠加在背景引擎之上）
  function renderGame() {
    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas.getContext('2d');
    var cell = canvas.width / GRID_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 蛇身：深色外轮廓 + 深绿渐变圆角大色块
    for (var i = state.snake.length - 1; i >= 1; i--) {
      var seg = state.snake[i];
      var x = seg.x * cell, y = seg.y * cell;
      drawRoundCell(ctx, x + 1, y + 1, cell - 2, cell * 0.3);
      ctx.fillStyle = '#0d3318';
      ctx.fill();
      var gb = ctx.createLinearGradient(x, y, x + cell, y + cell);
      gb.addColorStop(0, '#43A047');
      gb.addColorStop(1, '#2E7D32');
      drawRoundCell(ctx, x + 2.5, y + 2.5, cell - 5, cell * 0.28);
      ctx.fillStyle = gb;
      ctx.fill();
    }
    // 蛇头：亮绿 + 白底黑瞳大眼睛（眼睛随朝向偏移）
    var head = state.snake[0];
    var hx = head.x * cell, hy = head.y * cell;
    drawRoundCell(ctx, hx + 1, hy + 1, cell - 2, cell * 0.32);
    ctx.fillStyle = '#0d3318';
    ctx.fill();
    var gh = ctx.createLinearGradient(hx, hy, hx + cell, hy + cell);
    gh.addColorStop(0, '#8CE05A');
    gh.addColorStop(1, '#4CAF50');
    drawRoundCell(ctx, hx + 2.5, hy + 2.5, cell - 5, cell * 0.3);
    ctx.fillStyle = gh;
    ctx.fill();
    var eyeR = cell * 0.17;
    var ex = hx + cell / 2, ey = hy + cell / 2;
    if (state.dir === 'right') ex += cell * 0.15;
    else if (state.dir === 'left') ex -= cell * 0.15;
    else if (state.dir === 'up') ey -= cell * 0.15;
    else if (state.dir === 'down') ey += cell * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex - cell * 0.17, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + cell * 0.17, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(ex - cell * 0.17, ey, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + cell * 0.17, ey, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
    // 食物：大红圆果（深色描边 + 径向渐变）+ 绿叶片 + 白色高光
    if (state.food) {
      var fx = state.food.x * cell + cell / 2, fy = state.food.y * cell + cell / 2;
      var fr = cell * 0.42;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(fx, fy, fr + 2, 0, Math.PI * 2); ctx.fill();
      var gfr = ctx.createRadialGradient(fx - fr * 0.3, fy - fr * 0.3, fr * 0.1, fx, fy, fr);
      gfr.addColorStop(0, '#ff6b4a');
      gfr.addColorStop(1, '#d32f2f');
      ctx.fillStyle = gfr;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e7d32';
      fillEllipse(ctx, fx + fr * 0.3, fy - fr * 0.95, fr * 0.5, fr * 0.22, -0.6);
      fillEllipse(ctx, fx - fr * 0.2, fy - fr * 0.95, fr * 0.42, fr * 0.2, 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(fx - fr * 0.3, fy - fr * 0.3, fr * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 每 tick 走一步：只更新逻辑与 HUD，渲染统一在帧末进行
  function tick() {
    // 鼠标跟随：每 tick 由蛇头到鼠标的向量取主导轴方向
    if (state.mouseActive && lastMouseCell) {
      steerByMouse(state, lastMouseCell);
    }
    var result = stepGame(state);
    state = result.state;
    if (result.ate) {
      eatSound(); // 吃到食物：短促高音"叮"
      updateHud();
    }
    if (result.gameOver) {
      overSound(); // 游戏结束：低音下滑提示
      gameOver();
    }
  }

  // 主循环：requestAnimationFrame + 时间累积，达到 speedForLevel(foodsEaten) 毫秒走一格
  function loop(timestamp) {
    if (state.gameOver) {
      animationId = null;
      return;
    }
    if (state.running && !state.paused) {
      startBgLoop(); // 背景循环随游戏运行启停（暂停时 bgLoop 自行停止并保留帧）
      var dt = lastFrameTs === null ? 0 : Math.min(timestamp - lastFrameTs, 250);
      lastFrameTs = timestamp;
      accMs += dt;
      var steps = 0;
      var baseMs = initialSpeedMs(settings.startSpeed); // 家长设置的起始速度档
      while (state.running && !state.paused && !state.gameOver && steps < 3) {
        var interval = speedForLevel(state.foodsEaten, baseMs);
        if (accMs < interval) break;
        accMs -= interval;
        steps++;
        tick();
      }
      if (state.gameOver) return; // 结束后不再调度空转帧
      renderGame();               // 帧末统一渲染一次（含 catch-up 多步后的最新状态）
    } else {
      // 暂停/未运行时清零累积，避免恢复瞬间跳格
      accMs = 0;
      lastFrameTs = null;
    }
    animationId = requestAnimationFrame(loop);
  }

  // 游戏结束：停止主循环、更新最高分、显示结束浮层
  function gameOver() {
    state.running = false;
    state.gameOver = true;
    state.menuOpen = false;
    stopBgLoop();
    if (bgEngine) bgEngine.pause(); // 结束浮层覆盖：背景冻结并保留当前帧
    syncHighScore();
    document.getElementById('endScore').textContent = String(state.score);
    document.getElementById('endHighScore').textContent = String(readHighScore());
    document.getElementById('endOverlay').classList.remove('hidden');
    syncPauseButton();
  }

  // 开始 / 再玩一次：重置状态并启动主循环与背景引擎
  function startGame() {
    if (shouldPlaySound(settings)) ensureAudioContext(); // 音效开启才解锁音频（静音时懒创建）
    state = createInitialState();
    state.food = randomFoodCell(state.snake);
    state.running = true;
    if (!bgEngine) bgEngine = window.BgEngine.create(document.getElementById('bgCanvas'), settings);
    bgEngine.start();  // 首次：初始化新图案；已在运行：空操作
    bgEngine.resume(); // 从结束/暂停恢复：接续相位（未暂停时为空操作）
    document.getElementById('endOverlay').classList.add('hidden');
    document.getElementById('gameMenuOverlay').classList.add('hidden');
    document.getElementById('settingsDrawer').classList.add('hidden');
    document.getElementById('drawerMask').classList.add('hidden');
    accMs = 0;
    lastFrameTs = null;
    lastMouseCell = null; // 跨局清除鼠标目标格，避免残留跟随
    updateHud();
    syncPauseButton();
    renderGame();
    startBgLoop();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  // 重新开始（Esc 菜单 / 结束浮层）：关闭浮层并重新开局
  function restartGame() {
    document.getElementById('gameMenuOverlay').classList.add('hidden');
    document.getElementById('endOverlay').classList.add('hidden');
    state.menuOpen = false;
    startGame();
  }

  /* ---------- Esc 游戏菜单（继续 / 设置 / 重新开始 / 返回游戏列表） ---------- */
  function openGameMenu() {
    if (!state.running || state.gameOver || state.menuOpen) return;
    state.paused = true;
    state.menuOpen = true;
    if (bgEngine) bgEngine.pause();
    document.getElementById('gameMenuOverlay').classList.remove('hidden');
    syncPauseButton();
  }

  function closeGameMenu() {
    if (!state.menuOpen) return;
    state.menuOpen = false;
    state.paused = false;
    if (bgEngine) bgEngine.resume();
    document.getElementById('gameMenuOverlay').classList.add('hidden');
    syncPauseButton();
  }

  // 返回游戏列表：停止主循环与背景引擎，回到菜单页
  function backToMenu() {
    state.running = false;
    state.gameOver = false;
    state.paused = false;
    state.menuOpen = false;
    if (animationId !== null) { cancelAnimationFrame(animationId); animationId = null; }
    stopBgLoop();
    if (bgEngine) bgEngine.stop();
    document.getElementById('gameMenuOverlay').classList.add('hidden');
    document.getElementById('endOverlay').classList.add('hidden');
    document.getElementById('settingsDrawer').classList.add('hidden');
    document.getElementById('drawerMask').classList.add('hidden');
    if (window.App && window.App.backFromGame) window.App.backFromGame();
    else {
      document.getElementById('gameScreen').classList.add('hidden');
      document.getElementById('menuScreen').classList.remove('hidden');
    }
  }

  /* ---------- 家长设置抽屉（菜单页与游戏内共用） ---------- */
  function openSettingsDrawer() {
    document.getElementById('drawerMask').classList.remove('hidden');
    document.getElementById('settingsDrawer').classList.remove('hidden');
  }

  function closeSettingsDrawer() {
    document.getElementById('drawerMask').classList.add('hidden');
    document.getElementById('settingsDrawer').classList.add('hidden');
  }

  // 回填一组单选按钮的选中态（value 匹配）
  function backfillRadio(name, value) {
    var radios = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === String(value);
    }
  }

  // 绑定一组单选按钮：onPick 写入 settings 并持久化，afterApply 通知背景引擎
  function bindRadios(name, onPick, afterApply) {
    var radios = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', function () {
        if (!this.checked) return;
        onPick(this.value);
        saveSettings(settings);
        if (afterApply) afterApply();
        else applyBgSettings();
      });
    }
  }

  // 模式勾选循环：按 BgEngine.MODE_IDS 索引写入 settings.modes
  var modeBoxes = document.querySelectorAll('input[name="mode"]');
  var MODE_IDS = (window.BgEngine && window.BgEngine.MODE_IDS) || ['cam_grating', 'checkerboard', 'stripes'];
  for (var mi = 0; mi < modeBoxes.length; mi++) {
    (function (box) {
      var idx = MODE_IDS.indexOf(box.value);
      if (idx < 0) return;
      box.checked = !!settings.modes[idx];
      box.addEventListener('change', function () {
        settings.modes[idx] = box.checked;
        saveSettings(settings);
        applyBgSettings();
      });
    })(modeBoxes[mi]);
  }

  // HUD 静音按钮与设置抽屉音效开关同步
  var soundOnEl = document.getElementById('soundOn');
  var btnMute = document.getElementById('btnMute');
  function updateMuteButton() {
    if (!btnMute) return;
    btnMute.textContent = settings.soundOn ? '🔊 音效开' : '🔇 音效关';
  }
  if (soundOnEl) {
    soundOnEl.checked = !!settings.soundOn;
    soundOnEl.addEventListener('change', function () {
      settings.soundOn = soundOnEl.checked;
      saveSettings(settings);
      updateMuteButton();
    });
  }
  if (btnMute) {
    btnMute.addEventListener('click', function () {
      settings.soundOn = !settings.soundOn;
      saveSettings(settings);
      updateMuteButton();
      if (soundOnEl) soundOnEl.checked = settings.soundOn;
      ensureAudioContext();
    });
  }
  updateMuteButton();

  // 背景变化三开关（id 与 settings 键同名）
  var bgCheckboxKeys = ['colorChange', 'shapeChange', 'flickerChange'];
  for (var bi = 0; bi < bgCheckboxKeys.length; bi++) {
    (function (key) {
      var el = document.getElementById(key);
      if (!el) return;
      el.checked = !!settings[key];
      el.addEventListener('change', function () {
        settings[key] = el.checked;
        saveSettings(settings);
        applyBgSettings();
      });
    })(bgCheckboxKeys[bi]);
  }

  // 一次性绑定设置抽屉（菜单页与游戏屏共用同一 DOM，避免重复监听）
  var uiBound = false;
  function bindSettingsUI() {
    if (uiBound) return;
    uiBound = true;
    backfillRadio('flickerLevel', settings.flickerLevel);
    bindRadios('flickerLevel', function (v) { settings.flickerLevel = Number(v); });
    backfillRadio('colorMode', settings.colorMode);
    bindRadios('colorMode', function (v) { settings.colorMode = v; });
    backfillRadio('startSpeed', settings.startSpeed);
    bindRadios('startSpeed', function (v) { settings.startSpeed = Number(v); });
    backfillRadio('controlMode', settings.controlMode);
    bindRadios('controlMode', function (v) { settings.controlMode = v; });
    var btnOpenSettings = document.getElementById('btnOpenSettings');
    if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsDrawer);
    var btnDrawerClose = document.getElementById('btnDrawerClose');
    if (btnDrawerClose) btnDrawerClose.addEventListener('click', closeSettingsDrawer);
    var drawerMask = document.getElementById('drawerMask');
    if (drawerMask) drawerMask.addEventListener('click', closeSettingsDrawer);
    var btnMenuSettings = document.getElementById('btnMenuSettings');
    if (btnMenuSettings) btnMenuSettings.addEventListener('click', openSettingsDrawer);
    var btnResume = document.getElementById('btnResume');
    if (btnResume) btnResume.addEventListener('click', closeGameMenu);
    var btnRestart = document.getElementById('btnRestart');
    if (btnRestart) btnRestart.addEventListener('click', restartGame);
    var btnBackMenu = document.getElementById('btnBackMenu');
    if (btnBackMenu) btnBackMenu.addEventListener('click', backToMenu);
    var btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) btnPlayAgain.addEventListener('click', restartGame);
    var btnEndBackMenu = document.getElementById('btnEndBackMenu');
    if (btnEndBackMenu) btnEndBackMenu.addEventListener('click', backToMenu);
    if (btnPause) {
      btnPause.addEventListener('click', function () {
        if (!state.running || state.gameOver) return;
        if (state.menuOpen) closeGameMenu();
        else openGameMenu();
      });
    }
  }

  /* ---------- 输入控制：键盘（方向键 / WASD + 空格、P 暂停 + Esc 菜单） ---------- */
  function onKeyDown(e) {
    if (e.repeat) return; // 长按重复触发跳过
    if (!state.running || state.gameOver) return;
    if (e.key === 'Escape') {
      if (state.menuOpen) closeGameMenu();
      else openGameMenu();
      e.preventDefault();
      return;
    }
    if (handleGameKey(state, e.key, settings.controlMode)) {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        syncPauseButton();
        // 与 Esc 菜单共用暂停语义：暂停时打开菜单，恢复时关闭
        if (state.paused && !state.menuOpen) openGameMenu();
        else if (!state.paused && state.menuOpen) closeGameMenu();
      }
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  /* ---------- 输入控制：鼠标 ---------- */
  var gameCanvasEl = document.getElementById('gameCanvas');

  // 把鼠标事件坐标换算为网格坐标（相对 #gameCanvas，按实际显示尺寸等比换算）
  function canvasMouseToCell(e) {
    var rect = gameCanvasEl.getBoundingClientRect();
    var x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
    var y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);
    return { x: x, y: y };
  }

  // 鼠标在游戏屏移动：记录目标格并启用鼠标跟随
  function onMouseMove(e) {
    lastMouseCell = canvasMouseToCell(e);
    if (settings.controlMode !== 'keyboard') state.mouseActive = true;
  }

  // 按住左键：锁定跟随（鼠标不动也持续朝目标格转向）
  function onMouseDown(e) {
    if (e.button === 0 && settings.controlMode !== 'keyboard') {
      lastMouseCell = canvasMouseToCell(e);
      state.mouseActive = true;
    }
  }

  // 松开左键：恢复键盘优先
  function onMouseUp(e) {
    if (e.button === 0) state.mouseActive = false;
  }

  if (gameCanvasEl) {
    gameCanvasEl.addEventListener('mousemove', onMouseMove);
    gameCanvasEl.addEventListener('mousedown', onMouseDown);
  }
  window.addEventListener('mouseup', onMouseUp);

  // 鼠标离开窗口 / 窗口失焦：清除跟随锁定
  function onWindowLeave() {
    state.mouseActive = false;
  }
  window.addEventListener('mouseleave', onWindowLeave);
  window.addEventListener('blur', onWindowLeave);

  /* ---------- 触控预留（平板 WebView 接入点） ---------- */
  // 后续实现滑动转向：touchstart 记录起点、touchmove 实时换算目标格、
  // touchend 计算滑动方向，经 setDirection / steerByMouse 写入 nextDir。
  function handleTouchStart(e) { /* 平板 WebView 接入点：预留 */ }
  function handleTouchMove(e) { /* 平板 WebView 接入点：预留 */ }
  function handleTouchEnd(e) { /* 平板 WebView 接入点：预留 */ }

  /* ---------- 自适应缩放：棋盘按 min(视口宽, 高-预留) 等比缩放并封顶 ---------- */
  // #gameCanvas 与 #bgCanvas 同步内部分辨率：× devicePixelRatio 后取整到 GRID_SIZE
  // 整数倍（每格整数设备像素，清晰度最佳）；显示尺寸由 .board-wrap 宽度控制（CSS 像素）。
  function applyResponsiveLayout() {
    var wrap = document.querySelector('.board-wrap');
    if (!wrap) return;
    var boardCss = computeBoardSize(window.innerWidth, window.innerHeight, LAYOUT_RESERVED_H);
    wrap.style.width = boardCss + 'px';
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var canvasPx = Math.max(1, Math.round(boardCss * dpr / GRID_SIZE) * GRID_SIZE);
    var bgCanvasEl = document.getElementById('bgCanvas');
    var sizeChanged = false;
    if (bgCanvasEl && (bgCanvasEl.width !== canvasPx || bgCanvasEl.height !== canvasPx)) {
      bgCanvasEl.width = canvasPx;
      bgCanvasEl.height = canvasPx;
      sizeChanged = true;
    }
    if (gameCanvasEl && (gameCanvasEl.width !== canvasPx || gameCanvasEl.height !== canvasPx)) {
      gameCanvasEl.width = canvasPx;
      gameCanvasEl.height = canvasPx;
      sizeChanged = true;
    }
    // 重设 canvas 尺寸会清空位图，必须立即同步补画
    if (sizeChanged) {
      renderGame();
      if (bgEngine) bgEngine.applySettings(settings); // 尺寸变化：引擎按新尺寸重建几何
    }
  }

  // resize 用 rAF 节流：合并连续事件，下一帧统一应用最终尺寸
  var layoutRafId = null;
  function scheduleResponsiveLayout() {
    if (layoutRafId !== null) return;
    layoutRafId = requestAnimationFrame(function () {
      layoutRafId = null;
      applyResponsiveLayout();
    });
  }
  window.addEventListener('resize', scheduleResponsiveLayout);
  window.addEventListener('orientationchange', scheduleResponsiveLayout);
  applyResponsiveLayout(); // 启动时按当前视口重算一次

  /* ---------- 暴露给 App 层（index.html 内联脚本） ---------- */
  window.SnakeGame.start = startGame;
  window.SnakeGame.backToMenu = backToMenu;
  window.SnakeGame.restartGame = restartGame;
  window.SnakeGame.bindSettingsUI = bindSettingsUI;
  window.SnakeGame.openSettingsDrawer = openSettingsDrawer;
  window.SnakeGame.closeSettingsDrawer = closeSettingsDrawer;
  window.SnakeGame.getSettings = function () { return settings; };
  window.SnakeGame.saveSettings = saveSettings;
  window.SnakeGame.applyBgSettings = applyBgSettings;
  window.SnakeGame.openGameMenu = openGameMenu;
  window.SnakeGame.closeGameMenu = closeGameMenu;
  window.SnakeGame.highScore = { read: readHighScore, write: writeHighScore };
}

})();
