// BrainBlitz Main UI Controller & State Machine
document.addEventListener('DOMContentLoaded', async () => {
  const sound = window.soundEngine;
  const net = window.networkManager;
  const qr = window.qrVisualizer;
  const confetti = window.confettiCannon;

  // Selected Avatar state
  let selectedAvatar = '🦊';
  let myPlayerId = null;
  let isHost = false;
  let currentRoom = null;
  let roundTimerInterval = null;
  let roundStartTime = 0;
  let hasAnsweredCurrentRound = false;

  // DOM Elements
  const views = {
    landing: document.getElementById('view-landing'),
    lobby: document.getElementById('view-lobby'),
    countdown: document.getElementById('view-countdown'),
    game: document.getElementById('view-game'),
    roundSummary: document.getElementById('view-round-summary'),
    gameOver: document.getElementById('view-game-over')
  };

  function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) {
      views[viewName].classList.add('active');
    }
  }

  // Audio Toggle
  const muteBtn = document.getElementById('btn-mute-toggle');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
      muteBtn.setAttribute('title', isMuted ? 'Unmute' : 'Mute');
    });
    if (sound.isMuted()) muteBtn.innerHTML = '🔇';
  }

  // Avatar Picker
  const avatarButtons = document.querySelectorAll('.avatar-option');
  avatarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playClick();
      avatarButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = btn.dataset.avatar;
    });
  });

  // Check URL query param for room code
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const inputJoin = document.getElementById('input-join-code');
    if (inputJoin) inputJoin.value = roomParam.toUpperCase();
    const joinTab = document.getElementById('tab-join');
    if (joinTab) joinTab.click();
  }

  // Tabs (Create vs Join)
  const tabCreate = document.getElementById('tab-create');
  const tabJoin = document.getElementById('tab-join');
  const panelCreate = document.getElementById('panel-create');
  const panelJoin = document.getElementById('panel-join');

  if (tabCreate && tabJoin) {
    tabCreate.addEventListener('click', () => {
      sound.playClick();
      tabCreate.classList.add('active');
      tabJoin.classList.remove('active');
      panelCreate.classList.remove('hidden');
      panelJoin.classList.add('hidden');
    });
    tabJoin.addEventListener('click', () => {
      sound.playClick();
      tabJoin.classList.add('active');
      tabCreate.classList.remove('active');
      panelJoin.classList.remove('hidden');
      panelCreate.classList.add('hidden');
    });
  }

  // Initialize Network
  await net.init();

  // Network Engine Badge
  const badgeNet = document.getElementById('net-status-badge');
  if (badgeNet) {
    if (net.mode === 'socket') {
      badgeNet.innerHTML = '<span class="status-dot green"></span> WebSocket Live Server';
      badgeNet.className = 'status-badge online';
    } else {
      badgeNet.innerHTML = '<span class="status-dot purple"></span> Standalone Browser Mode';
      badgeNet.className = 'status-badge standalone';
    }
  }

  // Create Room Click
  const btnCreateRoom = document.getElementById('btn-create-room');
  btnCreateRoom.addEventListener('click', () => {
    sound.playClick();
    const nameInput = document.getElementById('input-player-name');
    const name = nameInput.value.trim() || 'Player 1';
    const mode = document.getElementById('select-game-mode').value;
    const rounds = parseInt(document.getElementById('select-rounds').value, 10);

    btnCreateRoom.disabled = true;
    btnCreateRoom.innerText = 'Creating Room...';

    net.createRoom({ name, avatar: selectedAvatar, mode, rounds }, (res) => {
      btnCreateRoom.disabled = false;
      btnCreateRoom.innerText = '⚡ Create Arena Room';

      if (res.success) {
        currentRoom = res.room;
        isHost = true;
        myPlayerId = res.room.hostId;
        renderLobby(res.room);
        switchView('lobby');
        sound.playJoin();
      } else {
        alert(res.message || 'Failed to create room.');
      }
    });
  });

  // Join Room Click
  const btnJoinRoom = document.getElementById('btn-join-room');
  btnJoinRoom.addEventListener('click', () => {
    sound.playClick();
    const nameInput = document.getElementById('input-player-name');
    const name = nameInput.value.trim() || 'Guest';
    const codeInput = document.getElementById('input-join-code');
    const code = codeInput.value.trim().toUpperCase();

    if (!code || code.length < 3) {
      alert('Please enter a valid Room Code.');
      return;
    }

    btnJoinRoom.disabled = true;
    btnJoinRoom.innerText = 'Joining...';

    net.joinRoom({ name, avatar: selectedAvatar, code }, (res) => {
      btnJoinRoom.disabled = false;
      btnJoinRoom.innerText = '🚀 Enter Match';

      if (res.success) {
        currentRoom = res.room;
        isHost = false;
        renderLobby(res.room);
        switchView('lobby');
        sound.playJoin();
      } else {
        alert(res.message || 'Could not join room.');
      }
    });
  });

  // Copy Room Link / Code
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      sound.playClick();
      if (!currentRoom) return;
      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom.code}`;
      navigator.clipboard.writeText(joinUrl).then(() => {
        const oldText = btnCopyCode.innerHTML;
        btnCopyCode.innerHTML = '✅ Link Copied!';
        setTimeout(() => { btnCopyCode.innerHTML = oldText; }, 2000);
      });
    });
  }

  // Add Bot Click
  const btnAddBot = document.getElementById('btn-add-bot');
  if (btnAddBot) {
    btnAddBot.addEventListener('click', () => {
      sound.playClick();
      net.addBot((res) => {
        if (!res.success) alert(res.message);
      });
    });
  }

  // Toggle Ready Click
  const btnReady = document.getElementById('btn-toggle-ready');
  if (btnReady) {
    btnReady.addEventListener('click', () => {
      sound.playClick();
      net.toggleReady();
    });
  }

  // Start Match Click (Host only)
  const btnStartMatch = document.getElementById('btn-start-match');
  if (btnStartMatch) {
    btnStartMatch.addEventListener('click', () => {
      sound.playClick();
      btnStartMatch.disabled = true;
      btnStartMatch.innerText = 'Launching Arena...';
      net.startGame();
    });
  }

  // Rematch Click
  const btnRematch = document.getElementById('btn-rematch');
  if (btnRematch) {
    btnRematch.addEventListener('click', () => {
      sound.playClick();
      net.rematch();
    });
  }

  // Share Result Click
  const btnShareResult = document.getElementById('btn-share-result');
  if (btnShareResult) {
    btnShareResult.addEventListener('click', () => {
      sound.playClick();
      const text = `🏆 Just played BrainBlitz Multiplayer Arena! Join the party or check it out: ${window.location.origin}`;
      if (navigator.share) {
        navigator.share({ title: 'BrainBlitz Result', text, url: window.location.href });
      } else {
        navigator.clipboard.writeText(text);
        alert('Score & Game Link copied to clipboard!');
      }
    });
  }

  // Network Event Handlers
  net.on('room-updated', (room) => {
    currentRoom = room;
    renderLobby(room);
  });

  net.on('game-countdown', (data) => {
    switchView('countdown');
    let count = data.count || 3;
    const cdEl = document.getElementById('countdown-number');
    cdEl.innerText = count;
    sound.playCountdown(false);

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        cdEl.innerText = count;
        sound.playCountdown(false);
      } else if (count === 0) {
        cdEl.innerText = 'BLITZ!';
        sound.playCountdown(true);
      } else {
        clearInterval(timer);
      }
    }, 1000);
  });

  net.on('new-round', (data) => {
    switchView('game');
    hasAnsweredCurrentRound = false;
    renderGameRound(data);
  });

  net.on('player-answered', (data) => {
    const pEl = document.querySelector(`[data-player-bubble="${data.playerId}"]`);
    if (pEl) {
      pEl.classList.add('answered');
    }
  });

  net.on('round-results', (summary) => {
    renderRoundSummary(summary);
    switchView('roundSummary');
  });

  net.on('game-over', (data) => {
    renderGameOver(data);
    switchView('gameOver');
    sound.playVictory();
    confetti.launch(150);
  });

  net.on('returned-to-lobby', () => {
    switchView('lobby');
    if (btnStartMatch) {
      btnStartMatch.disabled = false;
      btnStartMatch.innerText = '⚡ Start Match';
    }
  });

  // UI Render functions
  function renderLobby(room) {
    document.getElementById('display-room-code').innerText = room.code;
    qr.renderQRCode('qr-container', `${window.location.origin}${window.location.pathname}?room=${room.code}`, 130);

    const listEl = document.getElementById('lobby-players-grid');
    listEl.innerHTML = '';

    const players = Array.isArray(room.players) ? room.players : Object.values(room.players);

    players.forEach(p => {
      const card = document.createElement('div');
      card.className = `player-lobby-card ${p.isHost ? 'host' : ''}`;
      card.innerHTML = `
        <div class="avatar-ring">${p.avatar}</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(p.name)} ${p.isHost ? '<span class="badge host">HOST</span>' : ''} ${p.isBot ? '<span class="badge bot">BOT</span>' : ''}</div>
          <div class="player-status ${p.ready ? 'ready' : 'waiting'}">${p.ready ? '● Ready' : '○ Waiting'}</div>
        </div>
      `;
      listEl.appendChild(card);
    });

    // Check host permissions
    const amHost = (room.hostId === myPlayerId) || isHost || (players[0] && players[0].id === myPlayerId);
    if (btnStartMatch) btnStartMatch.style.display = amHost ? 'inline-block' : 'none';
    if (btnAddBot) btnAddBot.style.display = amHost ? 'inline-block' : 'none';
    if (btnReady) btnReady.style.display = amHost ? 'none' : 'inline-block';
  }

  function renderGameRound(data) {
    const q = data.question;
    document.getElementById('game-round-pill').innerText = `Round ${data.round} / ${data.totalRounds}`;
    document.getElementById('question-type-badge').innerText = q.type.toUpperCase();

    // Render Question & Prompt
    const promptEl = document.getElementById('game-question-text');
    const visualBox = document.getElementById('game-visual-box');
    promptEl.innerText = q.prompt;

    if (q.type === 'reflex') {
      visualBox.style.display = 'block';
      visualBox.innerHTML = `
        <div class="reflex-word" style="color: ${q.targetColor}; font-size: 3.5rem; font-weight: 800; letter-spacing: 2px;">
          ${q.displayWord}
        </div>
      `;
    } else if (q.type === 'anagram') {
      visualBox.style.display = 'block';
      visualBox.innerHTML = `
        <div class="anagram-hint" style="color: #38bdf8; font-size: 1.1rem; margin-bottom: 8px;">
          💡 Clue: <em>${q.clue || ''}</em>
        </div>
      `;
    } else {
      visualBox.style.display = 'none';
      visualBox.innerHTML = '';
    }

    // Render Options Grid
    const optsContainer = document.getElementById('game-options-grid');
    optsContainer.innerHTML = '';

    q.options.forEach((optText, idx) => {
      const btn = document.createElement('button');
      btn.className = 'game-option-btn';
      btn.innerHTML = `<span class="opt-key">${['A', 'B', 'C', 'D'][idx] || ''}</span> <span class="opt-text">${escapeHtml(optText)}</span>`;

      btn.addEventListener('click', () => {
        if (hasAnsweredCurrentRound) return;
        hasAnsweredCurrentRound = true;

        const responseTime = Date.now() - roundStartTime;
        btn.classList.add('selected');

        // Disable other buttons
        optsContainer.querySelectorAll('button').forEach(b => b.disabled = true);

        sound.playClick();
        net.submitAnswer(optText, responseTime);
      });

      optsContainer.appendChild(btn);
    });

    // Render Opponent Bubbles
    const oppContainer = document.getElementById('opponent-bubbles');
    oppContainer.innerHTML = '';
    const players = Array.isArray(currentRoom.players) ? currentRoom.players : Object.values(currentRoom.players);

    players.forEach(p => {
      const bubble = document.createElement('div');
      bubble.className = 'opponent-bubble';
      bubble.dataset.playerBubble = p.id;
      bubble.innerHTML = `${p.avatar} <span class="bubble-name">${escapeHtml(p.name.slice(0, 8))}</span>`;
      oppContainer.appendChild(bubble);
    });

    // Timer Bar
    roundStartTime = Date.now();
    const timerBar = document.getElementById('round-timer-progress');
    const timerText = document.getElementById('round-timer-text');
    const duration = data.roundTime;
    let remaining = duration;

    clearInterval(roundTimerInterval);
    timerBar.style.width = '100%';
    timerBar.style.transition = `width ${duration}s linear`;
    timerText.innerText = `${remaining}s`;

    requestAnimationFrame(() => {
      timerBar.style.width = '0%';
    });

    roundTimerInterval = setInterval(() => {
      remaining--;
      if (remaining >= 0) {
        timerText.innerText = `${remaining}s`;
        if (remaining <= 3) {
          sound.playCountdown(false);
        }
      } else {
        clearInterval(roundTimerInterval);
      }
    }, 1000);
  }

  function renderRoundSummary(summary) {
    clearInterval(roundTimerInterval);
    const summaryCard = document.getElementById('summary-answer-reveal');
    summaryCard.innerHTML = `
      <div class="reveal-banner">Correct Answer: <strong>${escapeHtml(summary.correctAnswer)}</strong></div>
      <p class="reveal-explanation">${escapeHtml(summary.explanation)}</p>
    `;

    // Leaderboard table
    const tableBody = document.getElementById('round-leaderboard-body');
    tableBody.innerHTML = '';

    summary.players.forEach((p, rank) => {
      const row = document.createElement('tr');
      const ans = p.lastAnswer || {};
      const earned = ans.pointsEarned ? `+${ans.pointsEarned}` : '+0';
      const statusIcon = ans.isCorrect ? '✅' : '❌';

      if (rank === 0 && ans.isCorrect && !sound.isMuted()) {
        // High streak or win sound
      }

      row.innerHTML = `
        <td><span class="rank-tag rank-${rank + 1}">#${rank + 1}</span></td>
        <td><span class="avatar-sm">${p.avatar}</span> <strong>${escapeHtml(p.name)}</strong></td>
        <td>${statusIcon} ${earned}</td>
        <td><strong>${p.score.toLocaleString()}</strong></td>
        <td>${p.streak > 1 ? `🔥 ${p.streak}` : '-'}</td>
      `;
      tableBody.appendChild(row);
    });

    // Play feedback sound
    const humanPlayer = summary.players.find(p => p.id === myPlayerId) || summary.players[0];
    if (humanPlayer && humanPlayer.lastAnswer && humanPlayer.lastAnswer.isCorrect) {
      sound.playCorrect();
    } else {
      sound.playWrong();
    }
  }

  function renderGameOver(data) {
    const list = data.leaderboard;
    const podiumEl = document.getElementById('podium-winners');
    podiumEl.innerHTML = '';

    // 1st, 2nd, 3rd podium
    const podiumOrder = [list[1], list[0], list[2]].filter(Boolean);
    podiumOrder.forEach(p => {
      if (!p) return;
      const rank = list.indexOf(p) + 1;
      const col = document.createElement('div');
      col.className = `podium-place place-${rank}`;
      col.innerHTML = `
        <div class="podium-crown">${rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}</div>
        <div class="podium-avatar">${p.avatar}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-score">${p.score.toLocaleString()} pts</div>
        <div class="podium-pillar pillar-${rank}">#${rank}</div>
      `;
      podiumEl.appendChild(col);
    });

    // Detailed Stats Table
    const statsBody = document.getElementById('final-stats-body');
    statsBody.innerHTML = '';

    list.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${idx + 1}</td>
        <td>${p.avatar} ${escapeHtml(p.name)}</td>
        <td><strong>${p.score.toLocaleString()}</strong></td>
        <td>${p.accuracy}%</td>
        <td>${p.avgReaction ? `${p.avgReaction}ms` : '-'}</td>
        <td>${p.highestStreak}x</td>
      `;
      statsBody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
