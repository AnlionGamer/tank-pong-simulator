(() => {
  'use strict';

  const multiplayerScreen = document.getElementById('multiplayerScreen');
  if (!multiplayerScreen) return;

  if (!document.querySelector('link[data-tank-pong-lan]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'lan-multiplayer.css';
    stylesheet.dataset.tankPongLan = 'true';
    document.head.appendChild(stylesheet);
  }

  multiplayerScreen.innerHTML = `
    <div class="menu-card wide-card">
      <button class="back-btn" id="lanMainMenuButton">← MAIN MENU</button>
      <p class="eyebrow">LOCAL MULTIPLAYER</p>
      <h1 id="multiplayerTitle">SAME WI-FI BATTLE</h1>
      <p class="menu-subtitle">Connect directly to another Tank Pong player on the same local network. This connection test uses no Tank Pong game server, no account, and no online matchmaking.</p>

      <div class="lan-panel" id="lanStartPanel">
        <div class="lan-choice-grid">
          <section class="lan-card">
            <h2>PLAYER 1</h2>
            <p>Create the local match, then give the generated offer code to Player 2.</p>
            <button class="menu-btn primary" id="createLocalMatchButton">CREATE LOCAL MATCH</button>
          </section>
          <section class="lan-card">
            <h2>PLAYER 2</h2>
            <p>Join a local match by pasting the offer code created on Player 1's phone.</p>
            <button class="menu-btn" id="joinLocalMatchButton">JOIN LOCAL MATCH</button>
          </section>
        </div>
        <div class="lan-local-note"><strong>Connection test only:</strong> this build verifies direct two-phone communication first. Tank synchronization comes after this connection succeeds reliably.</div>
      </div>

      <div class="lan-panel" id="lanHostPanel" hidden>
        <div class="lan-steps">
          <section class="lan-step">
            <strong>STEP 1 — CREATE PLAYER 1 OFFER</strong>
            <p>Keep both phones on the same Wi-Fi. Create the offer, copy it, and send/show it to Player 2.</p>
            <button class="menu-btn primary" id="hostCreateOfferButton">CREATE OFFER CODE</button>
            <textarea class="lan-code" id="hostOfferCode" readonly aria-label="Player 1 offer code"></textarea>
            <div class="lan-actions"><button class="menu-btn compact" data-copy-target="hostOfferCode">COPY OFFER</button></div>
          </section>
          <section class="lan-step">
            <strong>STEP 2 — PASTE PLAYER 2 RESPONSE</strong>
            <p>After Player 2 creates a response, paste that response here and complete the connection.</p>
            <textarea class="lan-code" id="hostAnswerCode" placeholder="Paste Player 2 response code here"></textarea>
            <div class="lan-actions">
              <button class="menu-btn primary" id="hostCompleteButton">COMPLETE CONNECTION</button>
              <button class="menu-btn compact" data-lan-reset>START OVER</button>
            </div>
          </section>
        </div>
      </div>

      <div class="lan-panel" id="lanJoinPanel" hidden>
        <div class="lan-steps">
          <section class="lan-step">
            <strong>STEP 1 — PASTE PLAYER 1 OFFER</strong>
            <p>Paste the offer code from Player 1, then create this phone's response.</p>
            <textarea class="lan-code" id="joinOfferCode" placeholder="Paste Player 1 offer code here"></textarea>
            <button class="menu-btn primary" id="joinCreateAnswerButton">CREATE RESPONSE CODE</button>
          </section>
          <section class="lan-step">
            <strong>STEP 2 — RETURN RESPONSE TO PLAYER 1</strong>
            <p>Copy this response back to Player 1. This phone will wait while Player 1 completes the pairing.</p>
            <textarea class="lan-code" id="joinAnswerCode" readonly aria-label="Player 2 response code"></textarea>
            <div class="lan-actions">
              <button class="menu-btn compact" data-copy-target="joinAnswerCode">COPY RESPONSE</button>
              <button class="menu-btn compact" data-lan-reset>START OVER</button>
            </div>
          </section>
        </div>
      </div>

      <div class="lan-panel" id="lanStatusPanel" hidden>
        <div class="lan-card">
          <h2>LOCAL CONNECTION</h2>
          <div class="lan-status-grid">
            <div class="lan-stat"><span>ROLE</span><strong id="lanRoleStatus">—</strong></div>
            <div class="lan-stat"><span>CONNECTION</span><strong id="lanConnectionStatus">not connected</strong></div>
            <div class="lan-stat"><span>ICE</span><strong id="lanIceStatus">not connected</strong></div>
            <div class="lan-stat"><span>LAST PING</span><strong id="lanLatencyStatus">—</strong></div>
            <div class="lan-stat"><span>MESSAGES SENT</span><strong id="lanSentStatus">0</strong></div>
            <div class="lan-stat"><span>MESSAGES RECEIVED</span><strong id="lanReceivedStatus">0</strong></div>
          </div>
          <div class="lan-actions">
            <button class="menu-btn primary" id="lanPingButton" disabled>PING OTHER PHONE</button>
            <button class="menu-btn" id="lanDisconnectButton" disabled>DISCONNECT</button>
          </div>
        </div>
      </div>

      <p class="lan-notice" id="lanConnectionNotice" aria-live="polite"></p>
    </div>`;

  const mainMenuButton = document.getElementById('lanMainMenuButton');
  const mainMenuScreen = document.getElementById('mainMenuScreen');
  const createButton = document.getElementById('createLocalMatchButton');
  const joinButton = document.getElementById('joinLocalMatchButton');
  const startPanel = document.getElementById('lanStartPanel');
  const hostPanel = document.getElementById('lanHostPanel');
  const joinPanel = document.getElementById('lanJoinPanel');
  const statusPanel = document.getElementById('lanStatusPanel');
  const hostOffer = document.getElementById('hostOfferCode');
  const hostAnswer = document.getElementById('hostAnswerCode');
  const joinOffer = document.getElementById('joinOfferCode');
  const joinAnswer = document.getElementById('joinAnswerCode');
  const hostCreateOfferButton = document.getElementById('hostCreateOfferButton');
  const hostCompleteButton = document.getElementById('hostCompleteButton');
  const joinCreateAnswerButton = document.getElementById('joinCreateAnswerButton');
  const resetButtons = [...document.querySelectorAll('[data-lan-reset]')];
  const copyButtons = [...document.querySelectorAll('[data-copy-target]')];
  const connectionStatus = document.getElementById('lanConnectionStatus');
  const iceStatus = document.getElementById('lanIceStatus');
  const latencyStatus = document.getElementById('lanLatencyStatus');
  const sentStatus = document.getElementById('lanSentStatus');
  const receivedStatus = document.getElementById('lanReceivedStatus');
  const roleStatus = document.getElementById('lanRoleStatus');
  const pingButton = document.getElementById('lanPingButton');
  const disconnectButton = document.getElementById('lanDisconnectButton');
  const connectionNotice = document.getElementById('lanConnectionNotice');

  const RTC_SUPPORTED = typeof RTCPeerConnection === 'function';
  const TOKEN_PREFIX = 'TP-LAN-1.';
  const GATHER_TIMEOUT_MS = 7000;

  let peer = null;
  let channel = null;
  let role = null;
  let sentCount = 0;
  let receivedCount = 0;
  let pingSequence = 0;
  const pendingPings = new Map();

  function showPanel(panel) {
    [startPanel, hostPanel, joinPanel, statusPanel].forEach(item => {
      if (item) item.hidden = item !== panel;
    });
  }

  function setNotice(message = '', kind = '') {
    connectionNotice.textContent = message;
    connectionNotice.dataset.kind = kind;
  }

  function updateStats() {
    roleStatus.textContent = role === 'host' ? 'HOST' : role === 'join' ? 'JOINER' : '—';
    connectionStatus.textContent = peer?.connectionState || 'not connected';
    iceStatus.textContent = peer?.iceConnectionState || 'not connected';
    sentStatus.textContent = String(sentCount);
    receivedStatus.textContent = String(receivedCount);
    pingButton.disabled = channel?.readyState !== 'open';
    disconnectButton.disabled = !peer;
  }

  function resetLatency() {
    latencyStatus.textContent = '—';
    pendingPings.clear();
  }

  function encodeDescription(description) {
    const json = JSON.stringify({ type: description.type, sdp: description.sdp });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return TOKEN_PREFIX + btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function decodeDescription(token) {
    const cleaned = token.trim();
    if (!cleaned.startsWith(TOKEN_PREFIX)) {
      throw new Error('This does not look like a Tank Pong local connection code.');
    }
    let data = cleaned.slice(TOKEN_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    while (data.length % 4) data += '=';
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || !['offer', 'answer'].includes(parsed.type) || typeof parsed.sdp !== 'string') {
      throw new Error('The connection code is incomplete or invalid.');
    }
    parsed.sdp = keepHostCandidatesOnly(parsed.sdp);
    validateHostOnly(parsed.sdp);
    return parsed;
  }

  function keepHostCandidatesOnly(sdp) {
    return sdp
      .split(/\r?\n/)
      .filter(line => !line.startsWith('a=candidate:') || /\styp\shost(?:\s|$)/.test(line))
      .join('\r\n');
  }

  function validateHostOnly(sdp) {
    const candidates = sdp.split(/\r?\n/).filter(line => line.startsWith('a=candidate:'));
    const nonHost = candidates.find(line => !/\styp\shost(?:\s|$)/.test(line));
    if (nonHost) throw new Error('A non-local ICE candidate was rejected.');
  }

  function waitForIceGatheringComplete(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out while gathering this phone\'s local network connection information.'));
      }, GATHER_TIMEOUT_MS);
      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup();
          resolve();
        }
      };
      function cleanup() {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onState);
      }
      pc.addEventListener('icegatheringstatechange', onState);
    });
  }

  function preparePeer(nextRole) {
    closePeer();
    role = nextRole;
    sentCount = 0;
    receivedCount = 0;
    resetLatency();

    peer = new RTCPeerConnection({
      iceServers: [],
      iceCandidatePoolSize: 0
    });

    peer.addEventListener('connectionstatechange', () => {
      updateStats();
      if (peer.connectionState === 'connected') {
        showPanel(statusPanel);
        setNotice('Direct local connection established. No Tank Pong game server is being used.', 'success');
      } else if (peer.connectionState === 'failed') {
        setNotice('The direct local connection failed. Confirm both phones are on the same normal Wi-Fi network and try again.', 'error');
      } else if (peer.connectionState === 'disconnected') {
        setNotice('The other phone disconnected or became unreachable.', 'error');
      }
    });

    peer.addEventListener('iceconnectionstatechange', updateStats);
    peer.addEventListener('icecandidateerror', () => {
      setNotice('The browser reported a local connection candidate error. You can still try completing the pairing.', 'warning');
    });

    if (nextRole === 'join') {
      peer.addEventListener('datachannel', event => attachChannel(event.channel));
    }

    updateStats();
    return peer;
  }

  function attachChannel(nextChannel) {
    channel = nextChannel;
    channel.addEventListener('open', () => {
      updateStats();
      showPanel(statusPanel);
      setNotice('Direct local connection established. Press PING OTHER PHONE to verify two-way traffic.', 'success');
      sendMessage({ type: 'hello', role });
    });
    channel.addEventListener('close', () => {
      updateStats();
      if (peer) setNotice('The local data channel closed.', 'error');
    });
    channel.addEventListener('error', () => setNotice('The local data channel reported an error.', 'error'));
    channel.addEventListener('message', event => handleMessage(event.data));
    updateStats();
  }

  function sendMessage(message) {
    if (channel?.readyState !== 'open') return false;
    channel.send(JSON.stringify(message));
    sentCount += 1;
    updateStats();
    return true;
  }

  function handleMessage(raw) {
    receivedCount += 1;
    updateStats();
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'ping') {
      sendMessage({ type: 'pong', id: message.id, sentAt: message.sentAt });
      return;
    }
    if (message.type === 'pong' && pendingPings.has(message.id)) {
      const started = pendingPings.get(message.id);
      pendingPings.delete(message.id);
      latencyStatus.textContent = `${Math.max(0, Math.round(performance.now() - started))} ms`;
      setNotice('Ping returned successfully. Two-way local data is working.', 'success');
      return;
    }
    if (message.type === 'hello') {
      setNotice('The other Tank Pong phone is connected and exchanging data.', 'success');
    }
  }

  function closePeer() {
    try { channel?.close(); } catch {}
    try { peer?.close(); } catch {}
    channel = null;
    peer = null;
    role = null;
    sentCount = 0;
    receivedCount = 0;
    resetLatency();
    updateStats();
  }

  async function createHostOffer() {
    if (!RTC_SUPPORTED) {
      setNotice('WebRTC is not available in this browser.', 'error');
      return;
    }
    try {
      setNotice('Preparing a direct local offer…');
      const pc = preparePeer('host');
      attachChannel(pc.createDataChannel('tank-pong-local', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      const local = {
        type: pc.localDescription.type,
        sdp: keepHostCandidatesOnly(pc.localDescription.sdp)
      };
      validateHostOnly(local.sdp);
      hostOffer.value = encodeDescription(local);
      setNotice('Offer ready. Copy it to Player 2, then paste Player 2\'s response below.', 'success');
    } catch (error) {
      setNotice(error.message || 'Could not create a local match offer.', 'error');
    }
  }

  async function createJoinAnswer() {
    if (!RTC_SUPPORTED) {
      setNotice('WebRTC is not available in this browser.', 'error');
      return;
    }
    try {
      setNotice('Reading Player 1\'s offer…');
      const offer = decodeDescription(joinOffer.value);
      if (offer.type !== 'offer') throw new Error('Player 1 must provide an offer code.');
      const pc = preparePeer('join');
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc);
      const local = {
        type: pc.localDescription.type,
        sdp: keepHostCandidatesOnly(pc.localDescription.sdp)
      };
      validateHostOnly(local.sdp);
      joinAnswer.value = encodeDescription(local);
      setNotice('Response ready. Copy it back to Player 1. This phone will wait for Player 1 to complete the connection.', 'success');
    } catch (error) {
      setNotice(error.message || 'Could not create the response code.', 'error');
    }
  }

  async function completeHostConnection() {
    try {
      if (!peer || role !== 'host') throw new Error('Create Player 1\'s offer first.');
      const answer = decodeDescription(hostAnswer.value);
      if (answer.type !== 'answer') throw new Error('Player 2 must provide a response code.');
      await peer.setRemoteDescription(answer);
      setNotice('Response accepted. Waiting for the direct local connection…');
      showPanel(statusPanel);
      updateStats();
    } catch (error) {
      setNotice(error.message || 'Could not complete the local connection.', 'error');
    }
  }

  async function copyTarget(targetId, button) {
    const target = document.getElementById(targetId);
    if (!target?.value) {
      setNotice('There is no connection code to copy yet.', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(target.value);
      const original = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = original; }, 1000);
    } catch {
      target.focus();
      target.select();
      setNotice('Clipboard access was blocked. The code is selected so you can copy it manually.', 'warning');
    }
  }

  function resetFlow() {
    closePeer();
    hostOffer.value = '';
    hostAnswer.value = '';
    joinOffer.value = '';
    joinAnswer.value = '';
    setNotice('');
    showPanel(startPanel);
  }

  mainMenuButton.addEventListener('click', () => {
    closePeer();
    multiplayerScreen.classList.remove('active');
    mainMenuScreen?.classList.add('active');
    resetFlow();
  });

  createButton.addEventListener('click', () => {
    resetFlow();
    showPanel(hostPanel);
    setNotice('Player 1 creates the offer. Both phones should stay on the same Wi-Fi network.');
  });
  joinButton.addEventListener('click', () => {
    resetFlow();
    showPanel(joinPanel);
    setNotice('Paste Player 1\'s offer code to create Player 2\'s response.');
  });
  hostCreateOfferButton.addEventListener('click', createHostOffer);
  joinCreateAnswerButton.addEventListener('click', createJoinAnswer);
  hostCompleteButton.addEventListener('click', completeHostConnection);
  resetButtons.forEach(button => button.addEventListener('click', resetFlow));
  copyButtons.forEach(button => button.addEventListener('click', () => copyTarget(button.dataset.copyTarget, button)));
  pingButton.addEventListener('click', () => {
    const id = `${Date.now()}-${++pingSequence}`;
    pendingPings.set(id, performance.now());
    if (!sendMessage({ type: 'ping', id, sentAt: Date.now() })) {
      pendingPings.delete(id);
      setNotice('The data channel is not open yet.', 'warning');
    }
  });
  disconnectButton.addEventListener('click', () => {
    closePeer();
    setNotice('Disconnected. Start a new local pairing when ready.');
    showPanel(startPanel);
  });

  window.addEventListener('beforeunload', closePeer);
  updateStats();
  showPanel(startPanel);
})();
