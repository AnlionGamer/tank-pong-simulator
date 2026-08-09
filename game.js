(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;
  const DIVIDER = 8;
  const HP = 3;
  const WINS = 2;
  const SHOT_SPEED = 420;

  const difficultyOverlay = document.getElementById('difficultyOverlay');
  const roundOverlay = document.getElementById('roundOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');

  const DIFFICULTIES = {
    easy: { speed: 120, fire: 2.65, react: 0.26, horizon: 0.85, lead: 0.25, wobble: 54, aimTolerance: 0.42 },
    medium: { speed: 180, fire: 1.65, react: 0.16, horizon: 1.05, lead: 0.55, wobble: 28, aimTolerance: 0.30 },
    hard: { speed: 270, fire: 1.15, react: 0.09, horizon: 1.25, lead: 0.85, wobble: 10, aimTolerance: 0.20 }
  };

  const state = {
    started: false,
    paused: false,
    roundActive: false,
    matchOver: false,
    difficulty: null,
    scoreA: 0,
    scoreB: 0,
    round: 1,
    lastTime: performance.now()
  };

  const tankA = {
    x: 100, y: CY, width: 40, height: 50, speed: 240, color: '#00ff00',
    turretAngle: 0, turretLength: 25, vx: 0, vy: 0,
    hp: HP, maxHp: HP, fireCooldown: 0, fireInterval: 1
  };

  const tankB = {
    x: W - 100, y: CY, width: 40, height: 50, speed: 180, color: '#ff00ff',
    turretAngle: Math.PI, turretLength: 25, vx: 0, vy: 0,
    hp: HP, maxHp: HP, fireCooldown: 0, fireInterval: 1.65,
    decisionCooldown: 0, dodgeDirection: 1, wanderTimer: 0, aimError: 0
  };

  const keys = new Set();
  let projectiles = [];
  let particles = [];
  let mouseX = CX;
  let mouseY = CY;
  let audioContext = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function ensureAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  }

  function playSound(type) {
    ensureAudio();
    if (!audioContext) return;

    const settings = {
      fire: [720, 0.07, 0.10],
      hit: [320, 0.12, 0.16],
      explosion: [150, 0.16, 0.32],
      gameover: [220, 0.12, 0.55]
    }[type] || [400, 0.08, 0.10];

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.setValueAtTime(settings[0], now);
    gain.gain.setValueAtTime(settings[1], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[2]);
    osc.start(now);
    osc.stop(now + settings[2]);
  }

  function buildHealthDots() {
    for (const [id, cssClass] of [['hpA', 'player'], ['hpB', 'ai']]) {
      const container = document.getElementById(id);
      container.innerHTML = '';
      for (let i = 0; i < HP; i++) {
        const dot = document.createElement('span');
        dot.className = `hp-dot ${cssClass} full`;
        container.appendChild(dot);
      }
    }
  }

  function updateHud() {
    document.getElementById('scoreA').textContent = state.scoreA;
    document.getElementById('scoreB').textContent = state.scoreB;
    document.getElementById('roundNumber').textContent = state.round;
    document.getElementById('playerPosition').textContent = `${Math.round(tankA.x)}, ${Math.round(tankA.y)}`;
    document.getElementById('fireStatus').textContent = tankA.fireCooldown > 0 ? `${tankA.fireCooldown.toFixed(1)}s` : 'Ready';
    document.getElementById('difficultyLabel').textContent = state.difficulty
      ? `Difficulty: ${state.difficulty[0].toUpperCase()}${state.difficulty.slice(1)}`
      : 'Difficulty: —';

    document.querySelectorAll('#hpA .hp-dot').forEach((dot, index) => dot.classList.toggle('full', index < tankA.hp));
    document.querySelectorAll('#hpB .hp-dot').forEach((dot, index) => dot.classList.toggle('full', index < tankB.hp));
  }

  function setMouseFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  function resetRound() {
    Object.assign(tankA, { x: 100, y: CY, vx: 0, vy: 0, hp: HP, fireCooldown: 0 });
    Object.assign(tankB, {
      x: W - 100, y: CY, vx: 0, vy: 0, hp: HP,
      fireCooldown: Math.min(0.75, tankB.fireInterval * 0.5),
      decisionCooldown: 0,
      dodgeDirection: Math.random() < 0.5 ? -1 : 1,
      wanderTimer: 0,
      aimError: 0
    });
    projectiles = [];
    particles = [];
    mouseX = CX;
    mouseY = CY;
    state.roundActive = true;
    updateHud();
  }

  function startGame(level) {
    state.difficulty = level;
    state.started = true;
    state.paused = false;
    state.roundActive = true;
    state.matchOver = false;
    state.scoreA = 0;
    state.scoreB = 0;
    state.round = 1;
    tankB.speed = DIFFICULTIES[level].speed;
    tankB.fireInterval = DIFFICULTIES[level].fire;
    difficultyOverlay.classList.remove('show');
    resetRound();
    state.lastTime = performance.now();
  }

  function togglePause() {
    if (!state.started || state.matchOver || !state.roundActive) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle('show', state.paused);
    state.lastTime = performance.now();
  }

  function fireProjectile(tank) {
    projectiles.push({
      x: tank.x + Math.cos(tank.turretAngle) * tank.turretLength,
      y: tank.y + Math.sin(tank.turretAngle) * tank.turretLength,
      vx: Math.cos(tank.turretAngle) * SHOT_SPEED,
      vy: Math.sin(tank.turretAngle) * SHOT_SPEED,
      radius: 4,
      color: tank.color,
      owner: tank === tankA ? 'A' : 'B'
    });
    playSound('fire');
  }

  function createExplosion(x, y, color, count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 110 + Math.random() * 220;
      const life = 0.55 + Math.random() * 0.35;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 4,
        color
      });
    }
  }

  function circleRectCollision(circle, rect) {
    const closestX = clamp(circle.x, rect.x - rect.width / 2, rect.x + rect.width / 2);
    const closestY = clamp(circle.y, rect.y - rect.height / 2, rect.y + rect.height / 2);
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('arrowup') || keys.has('w')) dy--;
    if (keys.has('arrowdown') || keys.has('s')) dy++;
    if (keys.has('arrowleft') || keys.has('a')) dx--;
    if (keys.has('arrowright') || keys.has('d')) dx++;

    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    tankA.vx = dx * tankA.speed;
    tankA.vy = dy * tankA.speed;
    tankA.x += tankA.vx * dt;
    tankA.y += tankA.vy * dt;
    tankA.x = clamp(tankA.x, tankA.width / 2, CX - DIVIDER / 2 - tankA.width / 2);
    tankA.y = clamp(tankA.y, tankA.height / 2, H - tankA.height / 2);
    tankA.turretAngle = Math.atan2(mouseY - tankA.y, mouseX - tankA.x);
    tankA.fireCooldown = Math.max(0, tankA.fireCooldown - dt);
  }

  function findThreat(config) {
    let best = null;
    for (const projectile of projectiles) {
      if (projectile.owner !== 'A' || projectile.vx <= 0) continue;
      const time = (tankB.x - tankB.width / 2 - projectile.x) / projectile.vx;
      if (time <= 0 || time > config.horizon) continue;

      const projectedY = projectile.y + projectile.vy * time;
      const miss = Math.abs(projectedY - tankB.y);
      const dangerBand = tankB.height / 2 + projectile.radius + 38;
      if (miss <= dangerBand && (!best || time < best.time)) best = { time, projectedY };
    }
    return best;
  }

  function chooseAiMovement(config) {
    const threat = findThreat(config);
    if (threat) {
      const spaceUp = tankB.y - tankB.height / 2;
      const spaceDown = H - (tankB.y + tankB.height / 2);
      let direction = threat.projectedY >= tankB.y ? -1 : 1;
      if (direction < 0 && spaceUp < 65) direction = 1;
      if (direction > 0 && spaceDown < 65) direction = -1;
      tankB.dodgeDirection = direction;
      tankB.wanderTimer = 0;
      return;
    }

    tankB.wanderTimer -= config.react;
    const nearTop = tankB.y <= tankB.height / 2 + 10 && tankB.dodgeDirection < 0;
    const nearBottom = tankB.y >= H - tankB.height / 2 - 10 && tankB.dodgeDirection > 0;
    if (tankB.wanderTimer <= 0 || nearTop || nearBottom) {
      tankB.dodgeDirection = Math.random() < 0.5 ? -1 : 1;
      tankB.wanderTimer = 0.55 + Math.random() * 0.85;
    }
  }

  function updateAi(dt) {
    const config = DIFFICULTIES[state.difficulty];
    tankB.decisionCooldown -= dt;
    if (tankB.decisionCooldown <= 0) {
      chooseAiMovement(config);
      tankB.decisionCooldown = config.react;
      tankB.aimError = (Math.random() * 2 - 1) * config.wobble;
    }

    tankB.vy = tankB.dodgeDirection * tankB.speed;
    tankB.y = clamp(tankB.y + tankB.vy * dt, tankB.height / 2, H - tankB.height / 2);
    tankB.x = clamp(tankB.x, CX + DIVIDER / 2 + tankB.width / 2, W - tankB.width / 2);

    const distance = Math.max(1, tankB.x - tankA.x);
    const travelTime = distance / SHOT_SPEED;
    const leadTime = travelTime * config.lead;
    const targetX = tankA.x + tankA.vx * leadTime;
    const targetY = tankA.y + tankA.vy * leadTime + tankB.aimError;
    tankB.turretAngle = Math.atan2(targetY - tankB.y, targetX - tankB.x);

    tankB.fireCooldown = Math.max(0, tankB.fireCooldown - dt);
    if (tankB.fireCooldown <= 0) {
      const directAngle = Math.atan2(tankA.y - tankB.y, tankA.x - tankB.x);
      const angleDelta = Math.abs(Math.atan2(
        Math.sin(tankB.turretAngle - directAngle),
        Math.cos(tankB.turretAngle - directAngle)
      ));
      if (angleDelta <= config.aimTolerance) {
        fireProjectile(tankB);
        tankB.fireCooldown = tankB.fireInterval;
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.x < -20 || projectile.x > W + 20 || projectile.y < -20 || projectile.y > H + 20) {
        projectiles.splice(i, 1);
      }
    }
  }

  function checkHits() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      let hit = null;
      if (projectile.owner === 'B' && circleRectCollision(projectile, tankA)) hit = tankA;
      if (projectile.owner === 'A' && circleRectCollision(projectile, tankB)) hit = tankB;
      if (!hit) continue;

      projectiles.splice(i, 1);
      hit.hp = Math.max(0, hit.hp - 1);
      createExplosion(hit.x, hit.y, hit.color, 16);
      playSound('hit');
      updateHud();
      if (hit.hp <= 0) {
        finishRound(hit === tankA ? 'B' : 'A');
        return;
      }
    }
  }

  function finishRound(winner) {
    if (!state.roundActive) return;
    state.roundActive = false;
    projectiles = [];

    if (winner === 'A') {
      state.scoreA++;
      createExplosion(tankB.x, tankB.y, tankB.color, 40);
    } else {
      state.scoreB++;
      createExplosion(tankA.x, tankA.y, tankA.color, 40);
    }
    playSound('explosion');
    updateHud();

    if (state.scoreA >= WINS || state.scoreB >= WINS) {
      state.matchOver = true;
      document.getElementById('gameOverText').textContent = state.scoreA > state.scoreB ? 'YOU WIN THE MATCH' : 'AI WINS THE MATCH';
      document.getElementById('gameOverScore').textContent = `Final score: ${state.scoreA} — ${state.scoreB}`;
      gameOverOverlay.classList.add('show');
      playSound('gameover');
      return;
    }

    document.getElementById('roundResult').textContent = winner === 'A'
      ? `ROUND ${state.round}: YOU WIN`
      : `ROUND ${state.round}: AI WINS`;
    document.getElementById('roundSummary').textContent = `Match score: ${state.scoreA} — ${state.scoreB}`;
    roundOverlay.classList.add('show');
  }

  function nextRound() {
    if (state.matchOver || state.roundActive || !state.started) return;
    state.round++;
    roundOverlay.classList.remove('show');
    resetRound();
    state.lastTime = performance.now();
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 360 * dt;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function drawTank(tank) {
    ctx.save();
    ctx.fillStyle = tank.color;
    ctx.shadowColor = tank.color;
    ctx.shadowBlur = 14;
    ctx.fillRect(tank.x - tank.width / 2, tank.y - tank.height / 2, tank.width, tank.height);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#333';
    ctx.fillRect(tank.x - tank.width / 2, tank.y - tank.height / 2 - 5, tank.width, 3);
    ctx.fillRect(tank.x - tank.width / 2, tank.y + tank.height / 2 + 2, tank.width, 3);

    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = tank.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y);
    ctx.lineTo(
      tank.x + Math.cos(tank.turretAngle) * tank.turretLength,
      tank.y + Math.sin(tank.turretAngle) * tank.turretLength
    );
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawTank(tankA);
    drawTank(tankB);

    ctx.save();
    for (const projectile of projectiles) {
      ctx.fillStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function gameLoop(now) {
    let dt = (now - state.lastTime) / 1000;
    state.lastTime = now;
    dt = Math.min(dt, 0.05);

    if (state.started && !state.paused && state.roundActive && !state.matchOver) {
      updatePlayer(dt);
      updateAi(dt);
      updateProjectiles(dt);
      checkHits();
    }
    if (!state.paused) updateParticles(dt);
    updateHud();
    render();
    requestAnimationFrame(gameLoop);
  }

  document.querySelectorAll('.difficulty-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      startGame(button.dataset.difficulty);
    });
  });

  canvas.addEventListener('pointermove', setMouseFromEvent);
  canvas.addEventListener('pointerdown', event => {
    setMouseFromEvent(event);
    if (event.button !== 0 || !state.started || state.paused || !state.roundActive || state.matchOver) return;
    if (tankA.fireCooldown <= 0) {
      fireProjectile(tankA);
      tankA.fireCooldown = tankA.fireInterval;
    }
  });

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', ' '].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (key === 'p' && !event.repeat) togglePause();
    if (key === ' ' && !event.repeat) nextRound();
  });

  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    if (state.started && state.roundActive && !state.matchOver && !state.paused) togglePause();
  });

  document.getElementById('continueButton').addEventListener('click', nextRound);
  document.getElementById('restartButton').addEventListener('click', () => location.reload());

  buildHealthDots();
  updateHud();
  requestAnimationFrame(gameLoop);
})();
