(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const arenaWrap = document.getElementById('arenaWrap');
  const root = document.documentElement;

  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;
  const DIVIDER = 8;
  const MAX_HP = 3;
  const MATCH_WINS = 3;
  const SHOT_SPEED = 420;
  const PLAYER_FIRE_INTERVAL = 0.85;
  const ROUND_EXPLOSION_TIME = 1.05;
  const POWERUP_DURATION = 6;
  const POWERUP_RADIUS = 14;
  const COUNTDOWN_TOTAL = 3.35;
  const SETTINGS_KEY = 'tankPongSettingsV1';

  const FIXED_COLORS = {
    speed: '#ffe600',
    rapid: '#ff8a00',
    shield: '#4db8ff'
  };

  const PALETTE = [
    ['Green', '#00ff00'],
    ['Magenta', '#ff00ff'],
    ['Cyan', '#00ffff'],
    ['Yellow', '#ffff00'],
    ['Orange', '#ff8a00'],
    ['Blue', '#3f7cff'],
    ['Purple', '#a855f7'],
    ['Red', '#ff3333'],
    ['White', '#ffffff']
  ];

  const DEFAULT_SETTINGS = {
    playerColor: '#00ff00',
    opponentColor: '#ff00ff',
    arenaColor: '#00ffff',
    sound: true,
    volume: 0.65,
    effects: 'full',
    hudSize: 'normal'
  };

  const DIFFICULTIES = {
    easy: {
      label: 'Easy', speed: 125, fireInterval: 2.25, reaction: 0.30,
      threatHorizon: 0.68, dangerPadding: 20, dodgeMistake: 0.25,
      aimWobble: 76, lead: 0.15, aimTolerance: 0.48, powerupInterest: 0.35
    },
    medium: {
      label: 'Medium', speed: 180, fireInterval: 1.40, reaction: 0.16,
      threatHorizon: 1.00, dangerPadding: 34, dodgeMistake: 0.10,
      aimWobble: 34, lead: 0.52, aimTolerance: 0.31, powerupInterest: 0.65
    },
    hard: {
      label: 'Hard', speed: 245, fireInterval: 1.00, reaction: 0.075,
      threatHorizon: 1.35, dangerPadding: 48, dodgeMistake: 0.02,
      aimWobble: 12, lead: 0.86, aimTolerance: 0.21, powerupInterest: 0.90
    }
  };

  const el = {
    screens: [...document.querySelectorAll('.screen')],
    mainMenu: document.getElementById('mainMenuScreen'),
    singlePlayer: document.getElementById('singlePlayerScreen'),
    multiplayer: document.getElementById('multiplayerScreen'),
    options: document.getElementById('optionsScreen'),
    howToPlay: document.getElementById('howToPlayScreen'),
    match: document.getElementById('matchScreen'),
    hpA: document.getElementById('hpA'),
    hpB: document.getElementById('hpB'),
    scoreA: document.getElementById('scoreA'),
    scoreB: document.getElementById('scoreB'),
    roundNumber: document.getElementById('roundNumber'),
    difficultyLabel: document.getElementById('difficultyLabel'),
    pauseButton: document.getElementById('pauseButton'),
    overlay: document.getElementById('arenaOverlay'),
    overlayKicker: document.getElementById('overlayKicker'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayMessage: document.getElementById('overlayMessage'),
    overlayActions: document.getElementById('overlayActions'),
    playerPalette: document.getElementById('playerPalette'),
    opponentPalette: document.getElementById('opponentPalette'),
    arenaPalette: document.getElementById('arenaPalette'),
    soundToggle: document.getElementById('soundToggle'),
    volumeRange: document.getElementById('volumeRange'),
    volumeValue: document.getElementById('volumeValue'),
    effectsSelect: document.getElementById('effectsSelect'),
    hudSizeSelect: document.getElementById('hudSizeSelect'),
    fullscreenButton: document.getElementById('fullscreenButton'),
    optionsBackButton: document.getElementById('optionsBackButton'),
    optionNotice: document.getElementById('optionNotice')
  };

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  let settings = loadSettings();
  let optionsReturn = 'main';
  let audioContext = null;
  let mouseX = CX;
  let mouseY = CY;
  let mouseFireHeld = false;
  let projectiles = [];
  let particles = [];
  let powerups = [];
  const keys = new Set();

  const state = {
    phase: 'menu',
    mode: null,
    difficulty: null,
    paused: false,
    scoreA: 0,
    scoreB: 0,
    round: 1,
    simTime: 0,
    lastFrame: performance.now(),
    transitionTimer: 0,
    countdownTimer: 0,
    roundWinner: null,
    powerupTimer: 0,
    nextProjectileId: 1
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const normalize = (x, y) => {
    const mag = Math.hypot(x, y) || 1;
    return { x: x / mag, y: y / mag };
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
      color: player ? settings.playerColor : settings.opponentColor,
      turretAngle: player ? 0 : Math.PI,
      turretLength: 27,
      vx: 0,
      vy: 0,
      hp: MAX_HP,
      fireCooldown: 0,
      destroyed: false,
      effects: { speedUntil: 0, rapidUntil: 0, shield: 0 },
      ai: {
        decisionCooldown: 0, intentX: 0, intentY: 1,
        wanderTargetX: W - 150, wanderTargetY: CY, wanderTimer: 0,
        aimError: 0, dodgeThreatId: null, dodgeCommitUntil: 0
      }
    };
  }

  const tankA = makeTank('A');
  const tankB = makeTank('B');

  function showScreen(target) {
    el.screens.forEach(screen => screen.classList.toggle('active', screen === target));
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applySettings() {
    root.style.setProperty('--player', settings.playerColor);
    root.style.setProperty('--opponent', settings.opponentColor);
    root.style.setProperty('--arena', settings.arenaColor);
    tankA.color = settings.playerColor;
    tankB.color = settings.opponentColor;
    document.body.classList.remove('hud-small', 'hud-normal', 'hud-large');
    document.body.classList.add(`hud-${settings.hudSize}`);
    document.body.classList.toggle('effects-reduced', settings.effects === 'reduced');

    el.soundToggle.checked = settings.sound;
    el.volumeRange.value = Math.round(settings.volume * 100);
    el.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
    el.effectsSelect.value = settings.effects;
    el.hudSizeSelect.value = settings.hudSize;
    renderPalettes();
  }

  function renderPalettes() {
    const definitions = [
      [el.playerPalette, 'playerColor'],
      [el.opponentPalette, 'opponentColor'],
      [el.arenaPalette, 'arenaColor']
    ];

    for (const [container, key] of definitions) {
      container.innerHTML = '';
      for (const [name, color] of PALETTE) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `swatch${settings[key] === color ? ' selected' : ''}`;
        button.style.setProperty('--swatch', color);
        button.title = name;
        button.setAttribute('aria-label', `${name}${settings[key] === color ? ', selected' : ''}`);
        button.addEventListener('click', () => chooseColor(key, color));
        container.appendChild(button);
      }
    }
  }

  function chooseColor(key, color) {
    if (key === 'playerColor' && color === settings.opponentColor) {
      el.optionNotice.textContent = 'Your tank and opponent tank must use different colors.';
      return;
    }
    if (key === 'opponentColor' && color === settings.playerColor) {
      el.optionNotice.textContent = 'Your tank and opponent tank must use different colors.';
      return;
    }
    el.optionNotice.textContent = '';
    settings[key] = color;
    saveSettings();
    applySettings();
  }

  function buildHealthBars() {
    for (const [container, className] of [[el.hpA, 'player'], [el.hpB, 'opponent']]) {
      container.innerHTML = '';
      for (let i = 0; i < MAX_HP; i++) {
        const segment = document.createElement('span');
        segment.className = `hp-segment ${className} full`;
        container.appendChild(segment);
      }
    }
  }

  function updateHealthDisplay(container, hp) {
    container.querySelectorAll('.hp-segment').forEach((segment, index) => {
      segment.classList.toggle('full', index < hp);
    });
  }

  function updateHud() {
    el.scoreA.textContent = state.scoreA;
    el.scoreB.textContent = state.scoreB;
    el.roundNumber.textContent = state.round;
    el.difficultyLabel.textContent = state.difficulty ? DIFFICULTIES[state.difficulty].label : '';
    updateHealthDisplay(el.hpA, tankA.hp);
    updateHealthDisplay(el.hpB, tankB.hp);
    el.pauseButton.hidden = state.mode !== 'single';
  }

  function setOverlay({ kicker = '', title = '', message = '', actions = [], countdown = false } = {}) {
    el.overlay.hidden = false;
    el.overlay.classList.toggle('countdown', countdown);
    el.overlayKicker.textContent = kicker;
    el.overlayTitle.textContent = title;
    el.overlayMessage.textContent = message;
    el.overlayMessage.hidden = !message;
    el.overlayActions.innerHTML = '';
    el.overlayActions.hidden = actions.length === 0;
    actions.forEach(action => {
      const button = document.createElement('button');
      button.className = `overlay-btn${action.primary ? ' primary' : ''}`;
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      el.overlayActions.appendChild(button);
    });
  }

  function hideOverlay() {
    el.overlay.hidden = true;
    el.overlay.classList.remove('countdown');
    el.overlayActions.innerHTML = '';
  }

  function ensureAudio() {
    if (!settings.sound) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playSound(type) {
    const audio = ensureAudio();
    if (!audio || settings.volume <= 0) return;
    const config = {
      fire: [730, .055, .07, 'square'],
      hit: [300, .075, .13, 'sawtooth'],
      shield: [980, .06, .18, 'sine'],
      powerup: [560, .05, .16, 'triangle'],
      explosion: [125, .12, .36, 'sawtooth'],
      gameover: [210, .08, .55, 'triangle'],
      tick: [500, .035, .05, 'square'],
      go: [880, .05, .10, 'square']
    }[type] || [400, .05, .1, 'sine'];

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = config[3];
    osc.frequency.setValueAtTime(config[0], now);
    osc.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(config[1] * settings.volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + config[2]);
    osc.start(now);
    osc.stop(now + config[2]);
  }

  function currentSpeed(tank) {
    return tank.baseSpeed * (state.simTime < tank.effects.speedUntil ? 1.35 : 1);
  }

  function currentFireInterval(tank) {
    return tank.baseFireInterval * (state.simTime < tank.effects.rapidUntil ? .55 : 1);
  }

  function resetTank(tank) {
    const player = tank.side === 'A';
    tank.x = player ? 100 : W - 100;
    tank.y = CY;
    tank.vx = 0;
    tank.vy = 0;
    tank.hp = MAX_HP;
    tank.fireCooldown = player ? 0 : Math.min(.65, tank.baseFireInterval * .5);
    tank.destroyed = false;
    tank.effects.speedUntil = 0;
    tank.effects.rapidUntil = 0;
    tank.effects.shield = 0;
    tank.turretAngle = player ? 0 : Math.PI;
    tank.ai.decisionCooldown = 0;
    tank.ai.intentX = 0;
    tank.ai.intentY = Math.random() < .5 ? -1 : 1;
    tank.ai.wanderTargetX = W - 100 - Math.random() * 300;
    tank.ai.wanderTargetY = 70 + Math.random() * (H - 140);
    tank.ai.wanderTimer = 0;
    tank.ai.aimError = 0;
    tank.ai.dodgeThreatId = null;
    tank.ai.dodgeCommitUntil = 0;
  }

  function resetRoundState() {
    resetTank(tankA);
    resetTank(tankB);
    projectiles = [];
    particles = [];
    powerups = [];
    mouseFireHeld = false;
    keys.clear();
    mouseX = CX;
    mouseY = CY;
    state.simTime = 0;
    state.powerupTimer = 8 + Math.random() * 4;
    state.transitionTimer = 0;
    state.roundWinner = null;
    state.paused = false;
  }

  function beginSinglePlayer(level) {
    const config = DIFFICULTIES[level];
    if (!config) return;
    state.mode = 'single';
    state.difficulty = level;
    state.scoreA = 0;
    state.scoreB = 0;
    state.round = 1;
    tankB.baseSpeed = config.speed;
    tankB.baseFireInterval = config.fireInterval;
    showScreen(el.match);
    startRoundCountdown();
  }

  function startRoundCountdown() {
    resetRoundState();
    state.phase = 'countdown';
    state.countdownTimer = COUNTDOWN_TOTAL;
    state.lastFrame = performance.now();
    setOverlay({ kicker: `ROUND ${state.round} STARTS IN`, title: '3', countdown: true });
    updateHud();
    render();
    playSound('tick');
  }

  function updateCountdown(dt) {
    const before = state.countdownTimer;
    state.countdownTimer = Math.max(0, state.countdownTimer - dt);
    const t = state.countdownTimer;
    let title = 'GO!';
    let tickBoundary = null;

    if (t > 2.35) title = '3';
    else if (t > 1.35) { title = '2'; tickBoundary = 2.35; }
    else if (t > .35) { title = '1'; tickBoundary = 1.35; }
    else title = 'GO!';

    if (tickBoundary !== null && before > tickBoundary && t <= tickBoundary) playSound('tick');
    if (before > .35 && t <= .35) playSound('go');

    setOverlay({
      kicker: title === 'GO!' ? 'FIGHT' : `ROUND ${state.round} STARTS IN`,
      title,
      countdown: true
    });

    if (t <= 0) {
      state.phase = 'playing';
      hideOverlay();
      state.lastFrame = performance.now();
    }
  }

  function nextRound() {
    if (state.phase !== 'roundReady') return;
    state.round += 1;
    startRoundCountdown();
  }

  function restartCurrentMatch() {
    if (state.mode !== 'single' || !state.difficulty) return;
    beginSinglePlayer(state.difficulty);
  }

  function leaveToMenu() {
    state.phase = 'menu';
    state.mode = null;
    state.difficulty = null;
    state.paused = false;
    mouseFireHeld = false;
    keys.clear();
    hideOverlay();
    showScreen(el.mainMenu);
  }

  function togglePause() {
    if (state.mode !== 'single') return;
    if (state.phase === 'paused') {
      state.phase = 'playing';
      state.paused = false;
      hideOverlay();
      state.lastFrame = performance.now();
      return;
    }
    if (state.phase !== 'playing') return;
    state.phase = 'paused';
    state.paused = true;
    mouseFireHeld = false;
    keys.clear();
    setOverlay({
      kicker: 'SINGLE PLAYER',
      title: 'PAUSED',
      message: 'Gameplay is frozen.',
      actions: [
        { label: 'RESUME', primary: true, onClick: togglePause },
        { label: 'OPTIONS', onClick: () => openOptions('pause') },
        { label: 'RESTART MATCH', onClick: restartCurrentMatch },
        { label: 'MAIN MENU', onClick: leaveToMenu }
      ]
    });
  }

  function openOptions(returnTo = 'main') {
    optionsReturn = returnTo;
    showScreen(el.options);
    applySettings();
  }

  function closeOptions() {
    if (optionsReturn === 'pause' && state.phase === 'paused') {
      showScreen(el.match);
      setOverlay({
        kicker: 'SINGLE PLAYER', title: 'PAUSED', message: 'Gameplay is frozen.',
        actions: [
          { label: 'RESUME', primary: true, onClick: togglePause },
          { label: 'OPTIONS', onClick: () => openOptions('pause') },
          { label: 'RESTART MATCH', onClick: restartCurrentMatch },
          { label: 'MAIN MENU', onClick: leaveToMenu }
        ]
      });
    } else {
      showScreen(el.mainMenu);
    }
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
    const adjustedCount = settings.effects === 'reduced' ? Math.ceil(count * .45) : count;
    for (let i = 0; i < adjustedCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (90 + Math.random() * 260) * speedScale;
      const life = .45 + Math.random() * .6;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, size: 2 + Math.random() * 5, color });
    }
  }

  function createShieldBurst(tank) {
    const count = settings.effects === 'reduced' ? 10 : 22;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      particles.push({
        x: tank.x + Math.cos(angle) * 28, y: tank.y + Math.sin(angle) * 28,
        vx: Math.cos(angle) * 70, vy: Math.sin(angle) * 70,
        life: .28, maxLife: .28, size: 2.5, color: FIXED_COLORS.shield
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
    if (dx || dy) ({ x: dx, y: dy } = normalize(dx, dy));

    const speed = currentSpeed(tankA);
    tankA.vx = dx * speed;
    tankA.vy = dy * speed;
    tankA.x = clamp(tankA.x + tankA.vx * dt, tankA.width / 2, CX - DIVIDER / 2 - tankA.width / 2);
    tankA.y = clamp(tankA.y + tankA.vy * dt, tankA.height / 2, H - tankA.height / 2);
    tankA.turretAngle = Math.atan2(mouseY - tankA.y, mouseX - tankA.x);
    tankA.fireCooldown = Math.max(0, tankA.fireCooldown - dt);

    if (mouseFireHeld && tankA.fireCooldown <= 0) {
      fireProjectile(tankA);
      tankA.fireCooldown = currentFireInterval(tankA);
    }
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
      const dangerRadius = Math.hypot(tankB.width, tankB.height) * .45 + projectile.radius + config.dangerPadding;
      if (miss > dangerRadius) continue;
      if (!best || time < best.time) best = { projectile, time, miss };
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
    const options = [{ x: -v.y, y: v.x }, { x: v.y, y: -v.x }];
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
      const score = Math.min(xRoom, yRoom) + progress * .25;
      if (score > bestScore) { bestScore = score; best = option; }
    }
    return best;
  }

  function nearestAiPowerup() {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const powerup of powerups) {
      if (powerup.side !== 'B') continue;
      const distance = Math.hypot(powerup.x - tankB.x, powerup.y - tankB.y);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = powerup; }
    }
    return nearest ? { powerup: nearest, distance: nearestDistance } : null;
  }

  function chooseAiIntent(config) {
    const threat = findThreat(config);
    if (threat) {
      const sameThreat = tankB.ai.dodgeThreatId === threat.projectile.id;
      const committed = sameThreat && state.simTime < tankB.ai.dodgeCommitUntil && !aiIntentBlocked();
      if (committed) return;
      let dodge = boundedDodgeVector(threat.projectile);
      if (Math.random() < config.dodgeMistake) {
        dodge = Math.random() < .5
          ? { x: 0, y: Math.random() < .5 ? -1 : 1 }
          : { x: -dodge.x, y: -dodge.y };
      }
      tankB.ai.intentX = dodge.x;
      tankB.ai.intentY = dodge.y;
      tankB.ai.wanderTimer = 0;
      tankB.ai.dodgeThreatId = threat.projectile.id;
      tankB.ai.dodgeCommitUntil = state.simTime + clamp(threat.time + .18, .30, .80);
      return;
    }

    tankB.ai.dodgeThreatId = null;
    tankB.ai.dodgeCommitUntil = 0;
    const pickup = nearestAiPowerup();
    if (pickup && pickup.distance < 430 && Math.random() < config.powerupInterest) {
      const toward = normalize(pickup.powerup.x - tankB.x, pickup.powerup.y - tankB.y);
      tankB.ai.intentX = toward.x;
      tankB.ai.intentY = toward.y;
      return;
    }

    tankB.ai.wanderTimer -= config.reaction;
    if (tankB.ai.wanderTimer <= 0 || Math.hypot(tankB.ai.wanderTargetX - tankB.x, tankB.ai.wanderTargetY - tankB.y) < 35) {
      tankB.ai.wanderTargetX = CX + 80 + Math.random() * (W - CX - 160);
      tankB.ai.wanderTargetY = 60 + Math.random() * (H - 120);
      tankB.ai.wanderTimer = .6 + Math.random() * 1.2;
    }
    const toward = normalize(tankB.ai.wanderTargetX - tankB.x, tankB.ai.wanderTargetY - tankB.y);
    tankB.ai.intentX = toward.x;
    tankB.ai.intentY = toward.y;
  }

  function updateAi(dt) {
    const config = DIFFICULTIES[state.difficulty];
    tankB.ai.decisionCooldown -= dt;
    if (tankB.ai.decisionCooldown <= 0) {
      chooseAiIntent(config);
      tankB.ai.decisionCooldown = config.reaction;
      tankB.ai.aimError = (Math.random() * 2 - 1) * config.aimWobble;
    }

    const direction = normalize(tankB.ai.intentX, tankB.ai.intentY);
    const speed = currentSpeed(tankB);
    tankB.vx = direction.x * speed;
    tankB.vy = direction.y * speed;
    tankB.x = clamp(tankB.x + tankB.vx * dt, CX + DIVIDER / 2 + tankB.width / 2, W - tankB.width / 2);
    tankB.y = clamp(tankB.y + tankB.vy * dt, tankB.height / 2, H - tankB.height / 2);

    const distance = Math.max(1, Math.hypot(tankA.x - tankB.x, tankA.y - tankB.y));
    const travelTime = distance / SHOT_SPEED;
    const leadTime = travelTime * config.lead;
    const targetX = tankA.x + tankA.vx * leadTime;
    const targetY = tankA.y + tankA.vy * leadTime + tankB.ai.aimError;
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
        tankB.fireCooldown = currentFireInterval(tankB);
      }
    }
  }

  function updateProjectiles(dt) {
    const trailLimit = settings.effects === 'reduced' ? 3 : 7;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.trail.push({ x: projectile.x, y: projectile.y, life: .12 });
      if (projectile.trail.length > trailLimit) projectile.trail.shift();
      projectile.trail.forEach(point => { point.life -= dt; });
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.x < -30 || projectile.x > W + 30 || projectile.y < -30 || projectile.y > H + 30) {
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
    createExplosion(target.x, target.y, target.color, 15, .55);
    playSound('hit');
    return target.hp <= 0;
  }

  function checkHits() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      let target = null;
      if (projectile.owner === 'B' && circleRectCollision(projectile, tankA)) target = tankA;
      if (projectile.owner === 'A' && circleRectCollision(projectile, tankB)) target = tankB;
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
    mouseFireHeld = false;
    state.roundWinner = winner;
    const winsMatch = (winner === 'A' && state.scoreA + 1 >= MATCH_WINS) ||
      (winner === 'B' && state.scoreB + 1 >= MATCH_WINS);
    state.phase = winsMatch ? 'matchExplosion' : 'roundExplosion';
    state.transitionTimer = ROUND_EXPLOSION_TIME;
    projectiles = [];
    powerups = [];
    const loser = winner === 'A' ? tankB : tankA;
    loser.destroyed = true;
    if (winner === 'A') state.scoreA += 1;
    else state.scoreB += 1;
    createExplosion(loser.x, loser.y, loser.color, 78, 1.15);
    playSound('explosion');
    updateHud();
  }

  function updateTransition(dt) {
    state.transitionTimer -= dt;
    if (state.transitionTimer > 0) return;
    if (state.phase === 'matchExplosion') {
      state.phase = 'matchOver';
      const playerWon = state.scoreA > state.scoreB;
      setOverlay({
        kicker: 'MATCH COMPLETE',
        title: playerWon ? 'YOU WIN' : 'AI WINS',
        message: `Final score: ${state.scoreA} — ${state.scoreB}`,
        actions: [
          { label: 'PLAY AGAIN', primary: true, onClick: restartCurrentMatch },
          { label: 'MAIN MENU', onClick: leaveToMenu }
        ]
      });
      playSound('gameover');
    } else {
      state.phase = 'roundReady';
      setOverlay({
        kicker: `ROUND ${state.round} COMPLETE`,
        title: state.roundWinner === 'A' ? 'YOU WIN' : 'AI WINS',
        message: `Match score: ${state.scoreA} — ${state.scoreB}`,
        actions: [
          { label: 'NEXT ROUND', primary: true, onClick: nextRound },
          { label: 'MAIN MENU', onClick: leaveToMenu }
        ]
      });
    }
  }

  function spawnPowerupPair() {
    if (powerups.length > 0) return;
    const types = ['speed', 'rapid', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    const leftX = 150 + Math.random() * (CX - 260);
    const y = 70 + Math.random() * (H - 140);
    powerups.push({ type, side: 'A', x: leftX, y, radius: POWERUP_RADIUS, pulse: 0 });
    powerups.push({ type, side: 'B', x: W - leftX, y: H - y, radius: POWERUP_RADIUS, pulse: Math.PI });
  }

  function updatePowerups(dt) {
    state.powerupTimer -= dt;
    if (state.powerupTimer <= 0) {
      spawnPowerupPair();
      state.powerupTimer = 11 + Math.random() * 5;
    }
    powerups.forEach(powerup => { powerup.pulse += dt * 4; });
  }

  function applyPowerup(tank, type) {
    if (type === 'speed') tank.effects.speedUntil = Math.max(tank.effects.speedUntil, state.simTime) + POWERUP_DURATION;
    else if (type === 'rapid') tank.effects.rapidUntil = Math.max(tank.effects.rapidUntil, state.simTime) + POWERUP_DURATION;
    else if (type === 'shield') tank.effects.shield = 1;
    createExplosion(tank.x, tank.y, FIXED_COLORS[type], 16, .4);
    playSound('powerup');
  }

  function collectPowerups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const powerup = powerups[i];
      const tank = powerup.side === 'A' ? tankA : tankB;
      if (circleRectCollision(powerup, tank)) {
        applyPowerup(tank, powerup.type);
        powerups.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawGrid() {
    ctx.save();
    ctx.globalAlpha = .035;
    ctx.strokeStyle = settings.arenaColor;
    ctx.lineWidth = 1;
    for (let x = 60; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
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
    ctx.fillRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#282828';
    ctx.fillRect(-tank.width / 2 - 4, -tank.height / 2, 5, tank.height);
    ctx.fillRect(tank.width / 2 - 1, -tank.height / 2, 5, tank.height);
    ctx.fillStyle = '#050505';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = tank.color; ctx.lineWidth = 2; ctx.stroke();
    if (tank.effects.shield > 0) {
      ctx.strokeStyle = FIXED_COLORS.shield;
      ctx.lineWidth = 3;
      ctx.shadowColor = FIXED_COLORS.shield;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 37, 0, Math.PI * 2); ctx.stroke();
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
    ctx.lineTo(tank.x + Math.cos(tank.turretAngle) * tank.turretLength,
      tank.y + Math.sin(tank.turretAngle) * tank.turretLength);
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectile(projectile) {
    ctx.save();
    for (const point of projectile.trail) {
      ctx.globalAlpha = clamp(point.life / .12, 0, 1) * .32;
      ctx.fillStyle = projectile.color;
      ctx.beginPath(); ctx.arc(point.x, point.y, projectile.radius * .75, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 11;
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPowerup(powerup) {
    const color = FIXED_COLORS[powerup.type];
    const pulse = 1 + Math.sin(powerup.pulse) * .12;
    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, powerup.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    if (powerup.type === 'speed') {
      ctx.beginPath();
      ctx.moveTo(-7, -7); ctx.lineTo(1, 0); ctx.lineTo(-7, 7);
      ctx.moveTo(0, -7); ctx.lineTo(8, 0); ctx.lineTo(0, 7); ctx.stroke();
    } else if (powerup.type === 'rapid') {
      [-6, 0, 6].forEach(offset => { ctx.beginPath(); ctx.arc(offset, 0, 2.2, 0, Math.PI * 2); ctx.fill(); });
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(7, -4); ctx.lineTo(5, 5); ctx.lineTo(0, 9);
      ctx.lineTo(-5, 5); ctx.lineTo(-7, -4); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawGrid();
    powerups.forEach(drawPowerup);
    drawTank(tankA);
    drawTank(tankB);
    projectiles.forEach(drawProjectile);
    drawParticles();
  }

  function gameLoop(now) {
    let dt = Math.min((now - state.lastFrame) / 1000, .05);
    state.lastFrame = now;

    if (state.phase === 'countdown') {
      updateCountdown(dt);
    } else if (state.phase === 'playing') {
      state.simTime += dt;
      updatePlayer(dt);
      updateAi(dt);
      updatePowerups(dt);
      updateProjectiles(dt);
      checkHits();
      collectPowerups();
      updateParticles(dt);
    } else if (state.phase === 'roundExplosion' || state.phase === 'matchExplosion') {
      updateTransition(dt);
      updateParticles(dt);
    }

    updateHud();
    if (el.match.classList.contains('active')) render();
    requestAnimationFrame(gameLoop);
  }

  document.getElementById('singlePlayerButton').addEventListener('click', () => showScreen(el.singlePlayer));
  document.getElementById('multiplayerButton').addEventListener('click', () => showScreen(el.multiplayer));
  document.getElementById('optionsButton').addEventListener('click', () => openOptions('main'));
  document.getElementById('howToPlayButton').addEventListener('click', () => showScreen(el.howToPlay));
  document.querySelectorAll('[data-back="main"]').forEach(button => button.addEventListener('click', leaveToMenu));
  document.querySelectorAll('.difficulty-btn').forEach(button => {
    button.addEventListener('click', () => beginSinglePlayer(button.dataset.difficulty));
  });

  el.optionsBackButton.addEventListener('click', closeOptions);
  el.soundToggle.addEventListener('change', () => {
    settings.sound = el.soundToggle.checked;
    saveSettings();
    if (settings.sound) playSound('powerup');
  });
  el.volumeRange.addEventListener('input', () => {
    settings.volume = Number(el.volumeRange.value) / 100;
    el.volumeValue.textContent = `${el.volumeRange.value}%`;
    saveSettings();
  });
  el.effectsSelect.addEventListener('change', () => {
    settings.effects = el.effectsSelect.value;
    saveSettings();
    applySettings();
  });
  el.hudSizeSelect.addEventListener('change', () => {
    settings.hudSize = el.hudSizeSelect.value;
    saveSettings();
    applySettings();
  });
  el.fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch {
      el.optionNotice.textContent = 'Fullscreen is not available in this browser context.';
    }
  });

  canvas.addEventListener('pointermove', setMouseFromEvent);
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    setMouseFromEvent(event);
    if (event.button === 0 && state.phase === 'playing') mouseFireHeld = true;
  });
  window.addEventListener('pointerup', event => {
    if (event.button === 0) mouseFireHeld = false;
  });
  canvas.addEventListener('pointercancel', () => { mouseFireHeld = false; });

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    const controlled = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', ' '];
    if (controlled.includes(key) && el.match.classList.contains('active')) event.preventDefault();
    if (state.phase === 'playing') keys.add(key);
    if (key === 'p' && !event.repeat) togglePause();
    if (key === ' ' && !event.repeat && state.phase === 'roundReady') nextRound();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    mouseFireHeld = false;
    if (state.mode === 'single' && state.phase === 'playing') togglePause();
  });
  el.pauseButton.addEventListener('click', togglePause);

  buildHealthBars();
  applySettings();
  showScreen(el.mainMenu);
  requestAnimationFrame(gameLoop);
})();
