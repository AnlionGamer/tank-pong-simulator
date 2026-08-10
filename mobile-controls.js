(() => {
  'use strict';

  const isMobilePhone =
    navigator.userAgentData?.mobile === true ||
    /Android.+Mobile|iPhone|iPod/i.test(navigator.userAgent);

  if (!isMobilePhone || navigator.maxTouchPoints < 1) return;

  const canvas = document.getElementById('gameCanvas');
  const matchScreen = document.getElementById('matchScreen');
  const layer = document.getElementById('mobileControlLayer');
  const orientationHint = document.getElementById('mobileOrientationHint');
  const moveZone = document.getElementById('moveZone');
  const aimZone = document.getElementById('aimZone');
  const moveStick = document.getElementById('moveStick');
  const aimStick = document.getElementById('aimStick');
  const moveKnob = document.getElementById('moveKnob');
  const aimKnob = document.getElementById('aimKnob');

  if (!canvas || !matchScreen || !layer || !moveZone || !aimZone) return;

  document.body.classList.add('phone-controls');
  layer.hidden = false;
  if (orientationHint) orientationHint.hidden = false;

  const DEADZONE = 0.14;
  const KEY_THRESHOLD = 0.20;
  const STICK_RADIUS = 42;

  const move = { active: false, pointerId: null, originX: 0, originY: 0, x: 0, y: 0 };
  const aim = { active: false, pointerId: null, originX: 0, originY: 0, x: 0, y: 0 };
  const heldKeys = new Set();
  let firingSynthetic = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dispatchKey(type, key) {
    window.dispatchEvent(new KeyboardEvent(type, {
      key,
      code: `Key${key.toUpperCase()}`,
      bubbles: true,
      cancelable: true
    }));
  }

  function setKey(key, pressed) {
    const held = heldKeys.has(key);
    if (pressed && !held) {
      heldKeys.add(key);
      dispatchKey('keydown', key);
    } else if (!pressed && held) {
      heldKeys.delete(key);
      dispatchKey('keyup', key);
    } else if (pressed) {
      // Reassert while held so a stick already down during the countdown
      // begins moving immediately once gameplay becomes active.
      dispatchKey('keydown', key);
    }
  }

  function releaseMoveKeys() {
    for (const key of [...heldKeys]) {
      heldKeys.delete(key);
      dispatchKey('keyup', key);
    }
  }

  function makePointerEvent(type, clientX, clientY, buttons) {
    const options = {
      clientX,
      clientY,
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
      isPrimary: true
    };

    if (window.PointerEvent) return new PointerEvent(type, options);
    return new MouseEvent(type, options);
  }

  function dispatchAimAndFire() {
    const magnitude = Math.hypot(aim.x, aim.y);
    if (!aim.active || magnitude < DEADZONE || !matchScreen.classList.contains('active')) {
      stopSyntheticFire();
      return;
    }

    const dx = aim.x / magnitude;
    const dy = aim.y / magnitude;
    const rect = canvas.getBoundingClientRect();

    // Aim far beyond the arena so the direction remains effectively relative
    // to the tank even while the tank changes position.
    const targetCanvasX = canvas.width / 2 + dx * 5000;
    const targetCanvasY = canvas.height / 2 + dy * 5000;
    const clientX = rect.left + (targetCanvasX / canvas.width) * rect.width;
    const clientY = rect.top + (targetCanvasY / canvas.height) * rect.height;

    canvas.dispatchEvent(makePointerEvent('pointermove', clientX, clientY, 1));
    canvas.dispatchEvent(makePointerEvent('pointerdown', clientX, clientY, 1));
    firingSynthetic = true;
  }

  function stopSyntheticFire() {
    if (!firingSynthetic) return;
    window.dispatchEvent(makePointerEvent('pointerup', 0, 0, 0));
    firingSynthetic = false;
  }

  function updateMoveInput() {
    if (!move.active || !matchScreen.classList.contains('active')) {
      releaseMoveKeys();
      return;
    }

    setKey('a', move.x < -KEY_THRESHOLD);
    setKey('d', move.x > KEY_THRESHOLD);
    setKey('w', move.y < -KEY_THRESHOLD);
    setKey('s', move.y > KEY_THRESHOLD);
  }

  function positionStick(stick, x, y) {
    stick.style.left = `${x}px`;
    stick.style.top = `${y}px`;
  }

  function resetKnob(knob) {
    knob.style.transform = 'translate(0px, 0px)';
  }

  function updateStickVector(state, knob, clientX, clientY) {
    const dx = clientX - state.originX;
    const dy = clientY - state.originY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;

    knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    state.x = clamp(dx / STICK_RADIUS, -1, 1);
    state.y = clamp(dy / STICK_RADIUS, -1, 1);
  }

  function setupZone(zone, stick, knob, state, isAim) {
    zone.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || state.active) return;
      event.preventDefault();
      event.stopPropagation();

      state.active = true;
      state.pointerId = event.pointerId;
      state.originX = event.clientX;
      state.originY = event.clientY;
      state.x = 0;
      state.y = 0;

      const rect = zone.getBoundingClientRect();
      positionStick(stick, event.clientX - rect.left, event.clientY - rect.top);
      resetKnob(knob);
      zone.classList.add('active');

      try { zone.setPointerCapture(event.pointerId); } catch {}
    });

    zone.addEventListener('pointermove', event => {
      if (!state.active || event.pointerId !== state.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      updateStickVector(state, knob, event.clientX, event.clientY);
    });

    const end = event => {
      if (!state.active || event.pointerId !== state.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      state.active = false;
      state.pointerId = null;
      state.x = 0;
      state.y = 0;
      zone.classList.remove('active');
      resetKnob(knob);
      if (isAim) stopSyntheticFire();
      else releaseMoveKeys();
    };

    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', event => {
      if (!state.active || event.pointerId !== state.pointerId) return;
      state.active = false;
      state.pointerId = null;
      state.x = 0;
      state.y = 0;
      zone.classList.remove('active');
      resetKnob(knob);
      if (isAim) stopSyntheticFire();
      else releaseMoveKeys();
    });
  }

  setupZone(moveZone, moveStick, moveKnob, move, false);
  setupZone(aimZone, aimStick, aimKnob, aim, true);

  function inputLoop() {
    updateMoveInput();
    dispatchAimAndFire();
    requestAnimationFrame(inputLoop);
  }

  window.addEventListener('blur', () => {
    move.active = false;
    aim.active = false;
    moveZone.classList.remove('active');
    aimZone.classList.remove('active');
    resetKnob(moveKnob);
    resetKnob(aimKnob);
    releaseMoveKeys();
    stopSyntheticFire();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseMoveKeys();
      stopSyntheticFire();
    }
  });

  requestAnimationFrame(inputLoop);
})();
