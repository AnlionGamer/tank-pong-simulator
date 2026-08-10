(() => {
  'use strict';

  const panel = document.getElementById('statePanel');
  const title = document.getElementById('stateTitle');
  const message = document.getElementById('stateMessage');
  const kicker = document.getElementById('startKicker');
  const stateActions = document.getElementById('stateActions');
  const continueButton = document.getElementById('continueButton');
  const restartButton = document.getElementById('restartButton');
  const roundNumber = document.getElementById('roundNumber');
  const difficultyButtons = [...document.querySelectorAll('.difficulty-btn')];

  let countdownActive = false;
  let releasingClick = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function blockGameplayKey(event) {
    if (!countdownActive) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', ' '].includes(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function setCountdownDisplay(value, round) {
    panel.classList.add('countdown-active');
    panel.classList.remove('setup');
    kicker.textContent = value === 'GO!' ? 'FIGHT' : `ROUND ${round} STARTS IN`;
    title.textContent = value;
    message.textContent = value === 'GO!'
      ? 'Combat is live.'
      : 'Movement, firing, AI, cooldowns, and power-ups remain frozen until GO.';
    stateActions.hidden = true;
    continueButton.hidden = true;
    restartButton.hidden = true;
  }

  async function runCountdown(target) {
    if (countdownActive || releasingClick) return;

    countdownActive = true;
    const round = roundNumber.textContent || '1';

    for (const value of ['3', '2', '1']) {
      setCountdownDisplay(value, round);
      await wait(1000);
    }

    setCountdownDisplay('GO!', round);
    await wait(350);

    countdownActive = false;
    releasingClick = true;
    panel.classList.remove('countdown-active');
    target.click();
    releasingClick = false;
  }

  function interceptStart(event) {
    if (releasingClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runCountdown(event.currentTarget);
  }

  function interceptNextRound(event) {
    if (releasingClick || continueButton.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runCountdown(continueButton);
  }

  difficultyButtons.forEach(button => {
    button.addEventListener('click', interceptStart, true);
  });

  continueButton.addEventListener('click', interceptNextRound, true);

  window.addEventListener('keydown', event => {
    if (countdownActive) {
      blockGameplayKey(event);
      return;
    }

    if (event.key === ' ' && !event.repeat && !continueButton.hidden && !releasingClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      runCountdown(continueButton);
    }
  }, true);
})();
