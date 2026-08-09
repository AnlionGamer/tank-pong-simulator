(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const arenaWrap = document.getElementById('arenaWrap');

  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;
  const DIVIDER = 8;
  const MAX_HP = 3;
  const MATCH_WINS = 3;
  const SHOT_SPEED = 420;

  // Slightly faster than the previous test build, per play-test feedback.
  const PLAYER_FIRE_INTERVAL = 0.85;
  const ROUND_EXPLOSION_TIME = 1.05;
  const POWERUP_DURATION = 6;
  const POWERUP_RADIUS = 14;

  const COLORS = {
    player: '#00ff00',
    ai: '#ff00ff',
    arena: '#00ffff',
    speed: '#ffe600',
    rapid: '#ff8a00',
    shield: '#4db8ff'
  };

  const DIFFICULTIES = {
    easy: {
      label: 'Easy',
      speed: 125,
      fireInterval: 2.25,
      reaction: 0.30,
      threatHorizon: 0.68,
      dangerPadding: 20,
      dodgeMistake: 0.25,
      aimWobble: 76,
      lead: 0.15,
      aimTolerance: 0.48,
      powerupInterest: 0.35
    },
    medium: {
      label: 'Medium',
      speed: 180,
      fireInterval: 1.40,
      reaction: 0.16,
      threatHorizon: 1.00,
      dangerPadding: 34,
      dodgeMistake: 0.10,
      aimWobble: 34,
      lead: 0.52,
      aimTolerance: 0.31,
      powerupInterest: 0.65
    },
    hard: {
      label: 'Hard',
      speed: 245,
      fireInterval: 1.00,
      reaction: 0.075,
      threatHorizon: 1.35,
      dangerPadding: 48,
      dodgeMistake: 0.02,
      aimWobble: 12,
      lead: 0.86,
      aimTolerance: 0.21,
      powerupInterest: 0.90
    }
  };

  const state = {
    phase: 'setup',
    difficulty: null,
    paused: false,
    muted: false,
    scoreA: 0,
    scoreB: 0,
    round: 1,
    simTime: 0,
    lastFrame: performance.now(),
    transitionTimer: 0,
    roundWinner: null,
    powerupTimer: 0,
    nextProjectileId: 1
  };

  function makeTank(side) {
    const player = side === 'A';
    return {
      side,
      x: player ? 100 : W - 100,
      y: CY,
      width: 40,
      height: 50,
      baseSpeed: player ? 240 : DIFFICULTIES.medium.speed,
      baseFireInterval: player ? PLAYER_FIRE_INTERVAL : DIFFICULTIES.medium.fireInterval,
      color: player ? COLORS.player : COLORS.ai,
      turretAngle: player ? 0 : Math.PI,
      turretLength: 27,
      vx: 0,
      vy: 0,
      hp: MAX_HP,
      fireCooldown: 0,
      destroyed: false,
      effects: {
        speedUntil: 0,
        rapidUntil: 0,
        shield: 0
      },
      ai: {
        decisionCooldown: 0,
        intentX: 0,
        intentY: 1,
        wanderTargetX: W - 150,
        wanderTargetY: CY,
        wanderTimer: 0,
        aimError: 0,
        dodgeThreatId: null,
        dodgeCommitUntil: 0
      }
    };
  }

  const tankA = makeTank('A');
  const tankB = makeTank('B');

  const keys = new Set();
  let mouseX = CX;
  let mouseY = CY;
  let projectiles = [];
  let particles = [];
  let powerups = [];
  let audioContext = null;

  const el = {
    scoreA: document.getElementById('scoreA'),
    scoreB: document.getElementById('scoreB'),
    roundNumber: document.getElementById('roundNumber'),
    difficultyLabel: document.getElementById('difficultyLabel'),
    hpA: document.getElementById('hpA'),
    hpB: document.getElementById('hpB'),
    effectA: document.getElementById('effectA'),
    effectB: document.getElementById('effectB'),
    fireStatus: document.getElementById('fireStatus'),
    playerPosition: document.getElementById('playerPosition'),
    roundState: document.getElementById('roundState'),
    statePanel: document.getElementById('statePanel'),
    startKicker: document.getElementById('startKicker'),
    stateTitle: document.getElementById('stateTitle'),
    stateMessage: document.getElementById('stateMessage'),
    stateActions: document.getElementById('stateActions'),
    pauseButton: document.getElementById('pauseButton'),
    soundButton: document.getElementById('soundButton'),
    continueButton: document.getElementById('continueButton'),
    restartButton: document.getElementById('restartButton')
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const length = (x, y) => Math.hypot(x, y);

  function normalize(x, y) {
    const mag = length(x, y) || 1;
    return { x: x / mag, y: y / mag };
  }

  function buildHealthBars() {
    for (const [container, tankClass] of [[el.hpA, 'player'], [el.hpB, 'ai']]) {
      container.innerHTML = '';
      for (let i = 0; i < MAX_HP; i++) {
        const segment = document.createElement('span');
        segment.className = `hp-segment ${tankClass} full`;
        container.appendChild(segment);
      }
    }
  }

  function ensureAudio() {
    if (state.muted) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function playSound(type) {
    const audio = ensureAudio();
    if (!audio) return;

    const settings = {
      fire: [730, 0.055, 0.07, 'square'],
      hit: [300, 0.075, 0.13, 'sawtooth'],
      shield: [980, 0.06, 0.18, 'sine'],
      powerup: [560, 0.05, 0.16, 'triangle'],
      explosion: [125, 0.12, 0.36, 'sawtooth'],
      gameover: [210, 0.08, 0.55, 'triangle']
    }[type] || [400, 0.05, 0.1, 'sine'];

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;

    osc.type = settings[3];
    osc.frequency.setValueAtTime(settings[0], now);
    osc.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(settings[1], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[2]);
    osc.start(now);
    osc.stop(now + settings[2]);
  }

  function currentSpeed(tank) {
    return tank.baseSpeed * (state.simTime < tank.effects.speedUntil ? 1.35 : 1);
  }

  function currentFireInterval(tank) {
    return tank.baseFireInterval * (state.simTime < tank.effects.rapidUntil ? 0.55 : 1);
  }

  function activeEffectLabel(tank) {
    const labels = [];
    if (state.simTime < tank.effects.speedUntil) {
      labels.push(`Speed ${Math.max(0, tank.effects.speedUntil - state.simTime).toFixed(1)}s`);
    }
    if (state.simTime < tank.effects.rapidUntil) {
      labels.push(`Rapid ${Math.max(0, tank.effects.rapidUntil - state.simTime).toFixed(1)}s`);
    }
    if (tank.effects.shield > 0) labels.push('Shield ready');
    return labels.length ? labels.join(' · ') : 'No power-up';
  }

  function updateHealthDisplay(container, hp) {
    container.querySelectorAll('.hp-segment').forEach((segment, index) => {
      segment.classList.toggle('full', index < hp);
    });
  }

  function phaseLabel() {
    if (state.paused) return 'Paused';
    return {
      setup: 'Select difficulty to start',
      playing: 'Combat active',
      roundExplosion: 'Tank destroyed',
      roundReady: 'Round complete',
      matchExplosion: 'Final destruction',
      matchOver: 'Match complete'
    }[state.phase] || state.phase;
  }

  function updateHud() {
    el.scoreA.textContent = state.scoreA;
    el.scoreB.textContent = state.scoreB;
    el.roundNumber.textContent = state.round;
    el.difficultyLabel.textContent = state.difficulty
      ? `Difficulty: ${DIFFICULTIES[state.difficulty].label}`
      : 'Difficulty: not selected';

    updateHealthDisplay(el.hpA, tankA.hp);
    updateHealthDisplay(el.hpB, tankB.hp);

    el.effectA.textContent = activeEffectLabel(tankA);
    el.effectB.textContent = activeEffectLabel(tankB);
    el.fireStatus.textContent = tankA.fireCooldown > 0
      ? `${tankA.fireCooldown.toFixed(1)}s cooldown`
      : 'Ready';
    el.playerPosition.textContent = `${Math.round(tankA.x)}, ${Math.round(tankA.y)}`;
    el.roundState.textContent = phaseLabel();
    el.pauseButton.textContent = state.paused ? 'RESUME' : 'PAUSE';
    el.soundButton.textContent = state.muted ? 'SOUND: OFF' : 'SOUND: ON';

    arenaWrap.classList.toggle('paused', state.paused);
    el.statePanel.classList.toggle('setup', state.phase === 'setup');
  }

  function setStatePanel(title, message, actions = 'none') {
    el.stateTitle.textContent = title;
    el.stateMessage.innerHTML = message;
    el.stateActions.hidden = actions !== 'difficulty';
    el.continueButton.hidden = actions !== 'continue';
    el.restartButton.hidden = actions !== 'restart';
  }

  function resetTank(tank) {
    const isPlayer = tank.side === 'A';

    tank.x = isPlayer ? 100 : W - 100;
    tank.y = CY;
    tank.vx = 0;
    tank.vy = 0;
    tank.hp = MAX_HP;
    tank.fireCooldown = isPlayer ? 0 : Math.min(0.65, tank.baseFireInterval * 0.5);
    tank.destroyed = false;

    tank.effects.speedUntil = 0;
    tank.effects.rapidUntil = 0;
    tank.effects.shield = 0;

    tank.ai.decisionCooldown = 0;
    tank.ai.intentX = 0;
    tank.ai.intentY = Math.random() < 0.5 ? -1 : 1;
    tank.ai.wanderTargetX = W - 100 - Math.random() * 300;
    tank.ai.wanderTargetY = 70 + Math.random() * (H - 140);
    tank.ai.wanderTimer = 0;
    tank.ai.aimError = 0;
    tank.ai.dodgeThreatId = null;
    tank.ai.dodgeCommitUntil = 0;
  }

  function resetRound() {
    resetTank(tankA);
    resetTank(tankB);

    projectiles = [];
    particles = [];
    powerups = [];

    mouseX = CX;
    mouseY = CY;
    state.simTime = 0;
    state.powerupTimer = 8 + Math.random() * 4;
    state.transitionTimer = 0;
    state.roundWinner = null;
    state.phase = 'playing';
    state.paused = false;

    el.pauseButton.disabled = false;
    el.continueButton.hidden = true;
    el.restartButton.hidden = true;

    setStatePanel(
      `ROUND ${state.round}`,
      'Destroy the opposing tank. The cyan center line blocks tanks, not projectiles. Power-ups spawn in mirrored pairs.'
    );

    updateHud();
  }

  function startGame(level) {
    const config = DIFFICULTIES[level];
    if (!config) return;

    state.difficulty = level;
    state.scoreA = 0;
    state.scoreB = 0;
    state.round = 1;

    tankB.baseSpeed = config.speed;
    tankB.baseFireInterval = config.fireInterval;

    resetRound();
    state.lastFrame = performance.now();
    playSound('powerup');
  }

  function nextRound() {
    if (state.phase !== 'roundReady') return;
    state.round += 1;
    resetRound();
    state.lastFrame = performance.now();
  }

  function restartMatch() {
    state.phase = 'setup';
    state.difficulty = null;
    state.paused = false;
    state.scoreA = 0;
    state.scoreB = 0;
    state.round = 1;
    state.simTime = 0;

    resetTank(tankA);
    resetTank(tankB);

    tankB.baseSpeed = DIFFICULTIES.medium.speed;
    tankB.baseFireInterval = DIFFICULTIES.medium.fireInterval;

    projectiles = [];
    particles = [];
    powerups = [];

    el.pauseButton.disabled = true;

    setStatePanel(
      'SELECT A DIFFICULTY TO START',
      '<strong>The match is waiting for you.</strong> Choose Easy, Medium, or Hard below. Each tank has 3 HP; first to win 3 rounds takes the best-of-five match.',
      'difficulty'
    );

    updateHud();
  }

  function togglePause() {
    if (state.phase !== 'playing') return;

    state.paused = !state.paused;

    if (state.paused) {
      setStatePanel(
        'PAUSED',
        'Gameplay, cooldowns, AI, projectiles, and active power-up timers are frozen. Press P or Resume to continue.'
      );
    } else {
      setStatePanel(
        `ROUND ${state.round}`,
        'Combat resumed. Destroy the opposing tank before it destroys you.'
      );
      state.lastFrame = performance.now();
    }

    updateHud();
  }

  function setMouseFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  function fireProjectile(tank) {
    projectiles.push({
      id: state.nextProjectileId++,
      x: tank.x + Math.cos(tank.turretAngle) * tank.turretLength,
      y: tank.y + Math.sin(tank.turretAngle) * tank.turretLength,
      vx: Math.cos(tank.turretAngle) * SHOT_SPEED,
      vy: Math.sin(tank.turretAngle) * SHOT_SPEED,
      radius: 4,
      color: tank.color,
      owner: tank.side,
      trail: []
    });

    playSound('fire');
  }

  function createExplosion(x, y, color, count = 28, speedScale = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (90 + Math.random() * 260) * speedScale;
      const life = 0.45 + Math.random() * 0.6;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 5,
        color
      });
    }
  }

  function createShieldBurst(tank) {
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2;

      particles.push({
        x: tank.x + Math.cos(angle) * 28,
        y: tank.y + Math.sin(angle) * 28,
        vx: Math.cos(angle) * 70,
        vy: Math.sin(angle) * 70,
        life: 0.28,
        maxLife: 0.28,
        size: 2.5,
        color: COLORS.shield
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

    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;

    if (dx || dy) {
      const dir = normalize(dx, dy);
      dx = dir.x;
      dy = dir.y;
    }

    const speed = currentSpeed(tankA);

    tankA.vx = dx * speed;
    tankA.vy = dy * speed;
    tankA.x += tankA.vx * dt;
    tankA.y += tankA.vy * dt;

    tankA.x = clamp(
      tankA.x,
      tankA.width / 2,
      CX - DIVIDER / 2 - tankA.width / 2
    );
    tankA.y = clamp(
      tankA.y,
      tankA.height / 2,
      H - tankA.height / 2
    );

    tankA.turretAngle = Math.atan2(mouseY - tankA.y, mouseX - tankA.x);
    tankA.fireCooldown = Math.max(0, tankA.fireCooldown - dt);
  }

  function findThreat(config) {
    let best = null;

    for (const projectile of projectiles) {
      if (projectile.owner !== 'A') continue;

      const rx = tankB.x - projectile.x;
      const ry = tankB.y - projectile.y;
      const vv = projectile.vx * projectile.vx + projectile.vy * projectile.vy;
      if (vv <= 0) continue;

      const time = (rx * projectile.vx + ry * projectile.vy) / vv;
      if (time <= 0 || time > config.threatHorizon) continue;

      const projectedX = projectile.x + projectile.vx * time;
      const projectedY = projectile.y + projectile.vy * time;
      const miss = Math.hypot(projectedX - tankB.x, projectedY - tankB.y);
      const dangerRadius =
        Math.hypot(tankB.width, tankB.height) * 0.45 +
        projectile.radius +
        config.dangerPadding;

      if (miss > dangerRadius) continue;

      if (!best || time < best.time) {
        best = {
          projectile,
          time,
          projectedX,
          projectedY,
          miss
        };
      }
    }

    return best;
  }

  function aiIntentBlocked() {
    const minX = CX + DIVIDER / 2 + tankB.width / 2;
    const maxX = W - tankB.width / 2;
    const minY = tankB.height / 2;
    const maxY = H - tankB.height / 2;
    const edge = 8;

    return (
      (tankB.ai.intentX < 0 && tankB.x <= minX + edge) ||
      (tankB.ai.intentX > 0 && tankB.x >= maxX - edge) ||
      (tankB.ai.intentY < 0 && tankB.y <= minY + edge) ||
      (tankB.ai.intentY > 0 && tankB.y >= maxY - edge)
    );
  }

  function boundedDodgeVector(projectile) {
    const v = normalize(projectile.vx, projectile.vy);
    const options = [
      { x: -v.y, y: v.x },
      { x: v.y, y: -v.x }
    ];

    const minX = CX + tankB.width / 2 + 12;
    const maxX = W - tankB.width / 2 - 12;
    const minY = tankB.height / 2 + 12;
    const maxY = H - tankB.height / 2 - 12;

    let best = options[0];
    let bestScore = -Infinity;

    for (const option of options) {
      const futureX = clamp(tankB.x + option.x * 120, minX, maxX);
      const futureY = clamp(tankB.y + option.y * 120, minY, maxY);

      const xRoom = Math.min(futureX - minX, maxX - futureX);
      const yRoom = Math.min(futureY - minY, maxY - futureY);
      const progress = Math.hypot(futureX - tankB.x, futureY - tankB.y);
      const score = Math.min(xRoom, yRoom) + progress * 0.25;

      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }

    return best;
  }

  function nearestAiPowerup() {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const powerup of powerups) {
      if (powerup.side !== 'B') continue;

      const dist = Math.hypot(powerup.x - tankB.x, powerup.y - tankB.y);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearest = powerup;
      }
    }

    return nearest
      ? { powerup: nearest, distance: nearestDistance }
      : null;
  }

  function chooseAiIntent(config) {
    const threat = findThreat(config);

    if (threat) {
      const sameThreat = tankB.ai.dodgeThreatId === threat.projectile.id;
      const committed =
        sameThreat &&
        state.simTime < tankB.ai.dodgeCommitUntil &&
        !aiIntentBlocked();

      // Keep the chosen dodge direction while the same projectile is approaching.
      // This prevents the rapid up/down flip-flop seen in the play-test recording
      // when a shot is aimed directly at the AI tank.
      if (committed) return;

      let dodge = boundedDodgeVector(threat.projectile);

      if (Math.random() < config.dodgeMistake) {
        dodge = Math.random() < 0.5
          ? { x: 0, y: Math.random() < 0.5 ? -1 : 1 }
          : { x: -dodge.x, y: -dodge.y };
      }

      tankB.ai.intentX = dodge.x;
      tankB.ai.intentY = dodge.y;
      tankB.ai.wanderTimer = 0;
      tankB.ai.dodgeThreatId = threat.projectile.id;
      tankB.ai.dodgeCommitUntil =
        state.simTime + clamp(threat.time + 0.18, 0.30, 0.80);

      return;
    }

    tankB.ai.dodgeThreatId = null;
    tankB.ai.dodgeCommitUntil = 0;

    const pickup = nearestAiPowerup();

    if (
      pickup &&
      pickup.distance < 430 &&
      Math.random() < config.powerupInterest
    ) {
      const toward = normalize(
        pickup.powerup.x - tankB.x,
        pickup.powerup.y - tankB.y
      );

      tankB.ai.intentX = toward.x;
      tankB.ai.intentY = toward.y;
      return;
    }

    tankB.ai.wanderTimer -= config.reaction;

    if (
      tankB.ai.wanderTimer <= 0 ||
      Math.hypot(
        tankB.ai.wanderTargetX - tankB.x,
        tankB.ai.wanderTargetY - tankB.y
      ) < 35
    ) {
      tankB.ai.wanderTargetX =
        CX + 80 + Math.random() * (W - CX - 160);
      tankB.ai.wanderTargetY =
        60 + Math.random() * (H - 120);
      tankB.ai.wanderTimer =
        0.6 + Math.random() * 1.2;
    }

    const toward = normalize(
      tankB.ai.wanderTargetX - tankB.x,
      tankB.ai.wanderTargetY - tankB.y
    );

    tankB.ai.intentX = toward.x;
    tankB.ai.intentY = toward.y;
  }

  function updateAi(dt) {
    const config = DIFFICULTIES[state.difficulty];

    tankB.ai.decisionCooldown -= dt;

    if (tankB.ai.decisionCooldown <= 0) {
      chooseAiIntent(config);
      tankB.ai.decisionCooldown = config.reaction;
      tankB.ai.aimError =
        (Math.random() * 2 - 1) * config.aimWobble;
    }

    const direction = normalize(
      tankB.ai.intentX,
      tankB.ai.intentY
    );
    const speed = currentSpeed(tankB);

    tankB.vx = direction.x * speed;
    tankB.vy = direction.y * speed;

    tankB.x = clamp(
      tankB.x + tankB.vx * dt,
      CX + DIVIDER / 2 + tankB.width / 2,
      W - tankB.width / 2
    );
    tankB.y = clamp(
      tankB.y + tankB.vy * dt,
      tankB.height / 2,
      H - tankB.height / 2
    );

    const distance = Math.max(
      1,
      Math.hypot(tankA.x - tankB.x, tankA.y - tankB.y)
    );
    const travelTime = distance / SHOT_SPEED;
    const leadTime = travelTime * config.lead;
    const targetX = tankA.x + tankA.vx * leadTime;
    const targetY = tankA.y + tankA.vy * leadTime + tankB.ai.aimError;

    tankB.turretAngle = Math.atan2(
      targetY - tankB.y,
      targetX - tankB.x
    );

    tankB.fireCooldown = Math.max(
      0,
      tankB.fireCooldown - dt
    );

    if (tankB.fireCooldown <= 0) {
      const directAngle = Math.atan2(
        tankA.y - tankB.y,
        tankA.x - tankB.x
      );

      const angleDelta = Math.abs(
        Math.atan2(
          Math.sin(tankB.turretAngle - directAngle),
          Math.cos(tankB.turretAngle - directAngle)
        )
      );

      if (angleDelta <= config.aimTolerance) {
        fireProjectile(tankB);
        tankB.fireCooldown = currentFireInterval(tankB);
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];

      projectile.trail.push({
        x: projectile.x,
        y: projectile.y,
        life: 0.12
      });

      if (projectile.trail.length > 7) {
        projectile.trail.shift();
      }

      for (const point of projectile.trail) {
        point.life -= dt;
      }

      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      if (
        projectile.x < -30 ||
        projectile.x > W + 30 ||
        projectile.y < -30 ||
        projectile.y > H + 30
      ) {
        projectiles.splice(i, 1);
      }
    }
  }

  function applyDamage(target) {
    if (target.effects.shield > 0) {
      target.effects.shield = 0;
      createShieldBurst(target);
      playSound('shield');
      return false;
    }

    target.hp = Math.max(0, target.hp - 1);
    createExplosion(target.x, target.y, target.color, 15, 0.55);
    playSound('hit');

    return target.hp <= 0;
  }

  function checkHits() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      let target = null;

      if (
        projectile.owner === 'B' &&
        circleRectCollision(projectile, tankA)
      ) {
        target = tankA;
      }

      if (
        projectile.owner === 'A' &&
        circleRectCollision(projectile, tankB)
      ) {
        target = tankB;
      }

      if (!target) continue;

      projectiles.splice(i, 1);

      if (applyDamage(target)) {
        finishRound(target.side === 'A' ? 'B' : 'A');
        return;
      }
    }
  }

  function finishRound(winner) {
    if (state.phase !== 'playing') return;

    state.roundWinner = winner;

    const winsMatch =
      (winner === 'A' && state.scoreA + 1 >= MATCH_WINS) ||
      (winner === 'B' && state.scoreB + 1 >= MATCH_WINS);

    state.phase = winsMatch
      ? 'matchExplosion'
      : 'roundExplosion';

    state.transitionTimer = ROUND_EXPLOSION_TIME;
    projectiles = [];
    powerups = [];

    const loser = winner === 'A' ? tankB : tankA;
    loser.destroyed = true;

    if (winner === 'A') state.scoreA += 1;
    else state.scoreB += 1;

    createExplosion(
      loser.x,
      loser.y,
      loser.color,
      78,
      1.15
    );
    playSound('explosion');

    el.pauseButton.disabled = true;

    setStatePanel(
      winner === 'A'
        ? 'ENEMY TANK DESTROYED'
        : 'YOUR TANK WAS DESTROYED',
      'The destruction animation will finish before the match can continue.'
    );

    updateHud();
  }

  function updateTransition(dt) {
    if (
      state.phase !== 'roundExplosion' &&
      state.phase !== 'matchExplosion'
    ) {
      return;
    }

    state.transitionTimer -= dt;
    if (state.transitionTimer > 0) return;

    if (state.phase === 'matchExplosion') {
      state.phase = 'matchOver';

      const playerWon = state.scoreA > state.scoreB;

      setStatePanel(
        playerWon
          ? 'YOU WIN THE MATCH'
          : 'AI WINS THE MATCH',
        `Final score: ${state.scoreA} — ${state.scoreB}. Best of five complete.`,
        'restart'
      );

      playSound('gameover');
    } else {
      state.phase = 'roundReady';

      setStatePanel(
        state.roundWinner === 'A'
          ? `ROUND ${state.round}: YOU WIN`
          : `ROUND ${state.round}: AI WINS`,
        `Match score: ${state.scoreA} — ${state.scoreB}. First to 3 round wins takes the match.`,
        'continue'
      );
    }

    updateHud();
  }

  function spawnPowerupPair() {
    if (powerups.length > 0) return;

    const types = ['speed', 'rapid', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    const leftX = 150 + Math.random() * (CX - 260);
    const y = 70 + Math.random() * (H - 140);

    powerups.push({
      type,
      side: 'A',
      x: leftX,
      y,
      radius: POWERUP_RADIUS,
      pulse: 0
    });

    powerups.push({
      type,
      side: 'B',
      x: W - leftX,
      y: H - y,
      radius: POWERUP_RADIUS,
      pulse: Math.PI
    });
  }

  function updatePowerups(dt) {
    state.powerupTimer -= dt;

    if (state.powerupTimer <= 0) {
      spawnPowerupPair();
      state.powerupTimer = 11 + Math.random() * 5;
    }

    for (const powerup of powerups) {
      powerup.pulse += dt * 4;
    }
  }

  function applyPowerup(tank, type) {
    if (type === 'speed') {
      tank.effects.speedUntil =
        Math.max(tank.effects.speedUntil, state.simTime) +
        POWERUP_DURATION;
    } else if (type === 'rapid') {
      tank.effects.rapidUntil =
        Math.max(tank.effects.rapidUntil, state.simTime) +
        POWERUP_DURATION;
    } else if (type === 'shield') {
      tank.effects.shield = 1;
    }

    createExplosion(
      tank.x,
      tank.y,
      COLORS[type],
      16,
      0.4
    );
    playSound('powerup');
  }

  function collectPowerups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const powerup = powerups[i];
      const tank =
        powerup.side === 'A'
          ? tankA
          : tankB;

      if (circleRectCollision(powerup, tank)) {
        applyPowerup(tank, powerup.type);
        powerups.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 300 * dt;
      particle.life -= dt;

      if (particle.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,0.035)';
    ctx.lineWidth = 1;

    const spacing = 60;

    for (let x = spacing; x < W; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    for (let y = spacing; y < H; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawTank(tank) {
    if (tank.destroyed) return;

    ctx.save();
    ctx.translate(tank.x, tank.y);

    ctx.fillStyle = tank.color;
    ctx.shadowColor = tank.color;
    ctx.shadowBlur = 16;
    ctx.fillRect(
      -tank.width / 2,
      -tank.height / 2,
      tank.width,
      tank.height
    );

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#282828';
    ctx.fillRect(
      -tank.width / 2 - 4,
      -tank.height / 2,
      5,
      tank.height
    );
    ctx.fillRect(
      tank.width / 2 - 1,
      -tank.height / 2,
      5,
      tank.height
    );

    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (tank.effects.shield > 0) {
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 3;
      ctx.shadowColor = COLORS.shield;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 37, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.shadowColor = tank.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y);
    ctx.lineTo(
      tank.x + Math.cos(tank.turretAngle) * tank.turretLength,
      tank.y + Math.sin(tank.turretAngle) * tank.turretLength
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectile(projectile) {
    ctx.save();

    for (const point of projectile.trail) {
      const alpha =
        clamp(point.life / 0.12, 0, 1) * 0.32;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        projectile.radius * 0.75,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 11;
    ctx.beginPath();
    ctx.arc(
      projectile.x,
      projectile.y,
      projectile.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  function drawPowerup(powerup) {
    const color = COLORS[powerup.type];
    const pulse =
      1 + Math.sin(powerup.pulse) * 0.12;

    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.scale(pulse, pulse);

    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      powerup.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;

    if (powerup.type === 'speed') {
      ctx.beginPath();
      ctx.moveTo(-7, -7);
      ctx.lineTo(1, 0);
      ctx.lineTo(-7, 7);
      ctx.moveTo(0, -7);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 7);
      ctx.stroke();
    } else if (powerup.type === 'rapid') {
      for (const offset of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.arc(offset, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, -4);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 9);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-7, -4);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles() {
    ctx.save();

    for (const particle of particles) {
      ctx.globalAlpha =
        clamp(
          particle.life / particle.maxLife,
          0,
          1
        );

      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    drawGrid();

    for (const powerup of powerups) {
      drawPowerup(powerup);
    }

    drawTank(tankA);
    drawTank(tankB);

    for (const projectile of projectiles) {
      drawProjectile(projectile);
    }

    drawParticles();
  }

  function gameLoop(now) {
    let dt = (now - state.lastFrame) / 1000;
    state.lastFrame = now;
    dt = Math.min(dt, 0.05);

    if (!state.paused) {
      if (state.phase === 'playing') {
        state.simTime += dt;
        updatePlayer(dt);
        updateAi(dt);
        updatePowerups(dt);
        updateProjectiles(dt);
        checkHits();
        collectPowerups();
      }

      if (
        state.phase === 'roundExplosion' ||
        state.phase === 'matchExplosion'
      ) {
        updateTransition(dt);
      }

      updateParticles(dt);
    }

    updateHud();
    render();
    requestAnimationFrame(gameLoop);
  }

  document
    .querySelectorAll('.difficulty-btn')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => startGame(button.dataset.difficulty)
      );
    });

  canvas.addEventListener(
    'pointermove',
    setMouseFromEvent
  );

  canvas.addEventListener(
    'pointerdown',
    event => {
      setMouseFromEvent(event);

      if (
        event.button !== 0 ||
        state.phase !== 'playing' ||
        state.paused
      ) {
        return;
      }

      if (tankA.fireCooldown <= 0) {
        fireProjectile(tankA);
        tankA.fireCooldown =
          currentFireInterval(tankA);
      }
    }
  );

  window.addEventListener(
    'keydown',
    event => {
      const key = event.key.toLowerCase();

      if (
        [
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          'w',
          'a',
          's',
          'd',
          'p',
          ' '
        ].includes(key)
      ) {
        event.preventDefault();
      }

      keys.add(key);

      if (
        key === 'p' &&
        !event.repeat
      ) {
        togglePause();
      }

      if (
        key === ' ' &&
        !event.repeat &&
        state.phase === 'roundReady'
      ) {
        nextRound();
      }
    }
  );

  window.addEventListener(
    'keyup',
    event => keys.delete(event.key.toLowerCase())
  );

  window.addEventListener(
    'blur',
    () => {
      keys.clear();

      if (
        state.phase === 'playing' &&
        !state.paused
      ) {
        togglePause();
      }
    }
  );

  el.pauseButton.addEventListener(
    'click',
    togglePause
  );

  el.soundButton.addEventListener(
    'click',
    () => {
      state.muted = !state.muted;

      if (!state.muted) {
        playSound('powerup');
      }

      updateHud();
    }
  );

  el.continueButton.addEventListener(
    'click',
    nextRound
  );

  el.restartButton.addEventListener(
    'click',
    restartMatch
  );

  buildHealthBars();
  restartMatch();
  requestAnimationFrame(gameLoop);
})();
