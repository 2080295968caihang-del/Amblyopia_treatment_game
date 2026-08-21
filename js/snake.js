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
  var LAYOUT_RESERVED_H = 140;         // HUD + 常驻遮眼提示 + 边距预留高度（CSS 像素）
  var MAX_BOARD_CSS = 720;             // 棋盘最大边长上限（CSS 像素）

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
  function handleGameKey(state, key) {
    if (!state.running || state.gameOver) return false;
    if (key === ' ' || key === 'p' || key === 'P') {
      togglePause(state); // 暂停键不干预鼠标跟随状态（恢复后延续当前控制方式）
      return true;
    }
    var dir = directionForKey(key);
    if (dir === null) return false;
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

    return results;
  }

  window.SnakeGame = { name: 'snake' };
  window.SnakeGame.runSelfTests = runSelfTests;
})();
