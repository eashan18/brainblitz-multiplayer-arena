// Unified Network Manager
// Seamlessly routes between Socket.io (server-backed) and Broadcast/P2P (standalone fallback)
class NetworkManager {
  constructor() {
    this.socket = null;
    this.mode = 'detecting'; // 'socket' | 'standalone'
    this.callbacks = {};
    this.broadcastChannel = null;
    this.standaloneController = null;
    this.currentRoom = null;
    this.localPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
  }

  async init() {
    // Attempt connecting to Socket.io server
    if (typeof io !== 'undefined') {
      try {
        this.socket = io({
          timeout: 4000,
          reconnectionAttempts: 2
        });

        const connected = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 2500);
          this.socket.on('connect', () => {
            clearTimeout(timer);
            resolve(true);
          });
          this.socket.on('connect_error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (connected) {
          this.mode = 'socket';
          this.setupSocketListeners();
          console.log('⚡ Connected via Socket.IO WebSocket Engine');
          this.emit('network-ready', { mode: 'socket' });
          return;
        }
      } catch (e) {
        console.warn('Socket.IO connection attempt failed, switching to standalone engine', e);
      }
    }

    // Fallback: Standalone / Multi-Tab Broadcast Mode
    this.mode = 'standalone';
    this.setupStandaloneEngine();
    console.log('🌐 Standalone Engine Activated (Browser P2P & Bot Simulator)');
    this.emit('network-ready', { mode: 'standalone' });
  }

  setupSocketListeners() {
    const events = [
      'room-updated',
      'game-countdown',
      'new-round',
      'player-answered',
      'round-results',
      'game-over',
      'returned-to-lobby'
    ];

    events.forEach(event => {
      this.socket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  setupStandaloneEngine() {
    this.standaloneController = new window.LocalGameController();
    try {
      this.broadcastChannel = new BroadcastChannel('brainblitz_channel');
      this.broadcastChannel.onmessage = (e) => {
        const { event, data, roomCode } = e.data;
        if (this.currentRoom && this.currentRoom.code === roomCode) {
          this.emit(event, data);
        }
      };
    } catch (e) {
      console.log('BroadcastChannel not supported in this context, running localized');
    }
  }

  // General Event Subscriptions
  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => {
        try { cb(data); } catch (err) { console.error('Callback error:', err); }
      });
    }
  }

  // Action methods
  createRoom(payload, callback) {
    if (this.mode === 'socket' && this.socket && this.socket.connected) {
      this.socket.emit('create-room', payload, (res) => {
        if (res.success) this.currentRoom = res.room;
        if (callback) callback(res);
      });
    } else {
      // Standalone mode
      const room = this.standaloneController.createLocalRoom(payload.name, payload.avatar, {
        mode: payload.mode || 'mixed',
        rounds: payload.rounds || 5,
        roundTime: payload.roundTime || 12
      });
      // Add initial friendly bots so solo tester has immediate opponents
      this.standaloneController.addBot('ByteBot ⚡', '🤖', 0.85);
      this.standaloneController.addBot('Nova 🌟', '🚀', 0.75);
      this.currentRoom = room;

      if (callback) callback({ success: true, room });
      this.emit('room-updated', room);
    }
  }

  joinRoom(payload, callback) {
    if (this.mode === 'socket' && this.socket && this.socket.connected) {
      this.socket.emit('join-room', payload, (res) => {
        if (res.success) this.currentRoom = res.room;
        if (callback) callback(res);
      });
    } else {
      // Standalone join simulation
      if (callback) {
        callback({
          success: false,
          message: 'To connect across separate machines, run npm start (or deploy the included server.js to Render/Vercel). In standalone mode, you can host and battle smart AI bots directly!'
        });
      }
    }
  }

  addBot(callback) {
    if (this.mode === 'socket') {
      this.socket.emit('add-bot', null, callback);
    } else {
      const bots = [
        { name: 'Cipher 🔮', avatar: '👾', acc: 0.9 },
        { name: 'Apex ⚡', avatar: '🐯', acc: 0.7 },
        { name: 'Vortex 🌪️', avatar: '🐱', acc: 0.8 }
      ];
      const botCount = this.currentRoom.players.filter(p => p.isBot).length;
      if (botCount >= 5) {
        if (callback) callback({ success: false, message: 'Max bots reached.' });
        return;
      }
      const b = bots[botCount % bots.length];
      const newBot = this.standaloneController.addBot(b.name, b.avatar, b.acc);
      this.emit('room-updated', this.currentRoom);
      if (callback) callback({ success: true, bot: newBot });
    }
  }

  updateSettings(settings) {
    if (this.mode === 'socket') {
      this.socket.emit('update-settings', settings);
    } else {
      if (!this.currentRoom) return;
      Object.assign(this.currentRoom.settings, settings);
      this.emit('room-updated', this.currentRoom);
    }
  }

  toggleReady() {
    if (this.mode === 'socket') {
      this.socket.emit('toggle-ready');
    } else {
      // In standalone, host is always ready
    }
  }

  startGame() {
    if (this.mode === 'socket') {
      this.socket.emit('start-game', window.GAME_QUESTIONS);
    } else {
      this.startStandaloneGame();
    }
  }

  submitAnswer(answer, responseTime) {
    if (this.mode === 'socket') {
      this.socket.emit('submit-answer', { answer, responseTime });
    } else {
      this.handleStandaloneAnswer(answer, responseTime);
    }
  }

  rematch() {
    if (this.mode === 'socket') {
      this.socket.emit('rematch');
    } else {
      this.currentRoom.state = 'lobby';
      this.currentRoom.currentRound = 0;
      this.currentRoom.players.forEach(p => {
        p.score = 0;
        p.streak = 0;
        p.highestStreak = 0;
        delete p.lastAnswer;
      });
      this.emit('room-updated', this.currentRoom);
      this.emit('returned-to-lobby');
    }
  }

  // Standalone game loop implementation
  startStandaloneGame() {
    const room = this.currentRoom;
    room.state = 'countdown';
    room.currentRound = 0;
    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.highestStreak = 0;
      p.correctAnswers = 0;
      p.totalAnswers = 0;
      p.reactionTimes = [];
    });

    this.emit('game-countdown', { count: 3 });

    setTimeout(() => {
      this.nextStandaloneRound();
    }, 3200);
  }

  nextStandaloneRound() {
    const room = this.currentRoom;
    room.currentRound++;

    if (room.currentRound > room.settings.rounds) {
      this.endStandaloneGame();
      return;
    }

    room.players.forEach(p => delete p.lastAnswer);

    // Pick question
    const qIndex = room.currentRound - 1;
    let type = room.settings.mode;
    if (type === 'mixed') {
      const types = ['trivia', 'anagram', 'reflex'];
      type = types[qIndex % types.length];
    }

    let qData;
    if (type === 'anagram') {
      const item = window.GAME_QUESTIONS.anagrams[qIndex % window.GAME_QUESTIONS.anagrams.length];
      const opts = [item.word, 'MATRIX', 'ALGORITHM', 'NETWORK'].filter(w => w !== item.word).slice(0, 3);
      opts.push(item.word);
      opts.sort(() => Math.random() - 0.5);
      qData = {
        type: 'anagram',
        prompt: `Unscramble this word: ${item.scrambled}`,
        clue: item.clue,
        options: opts,
        correctAnswer: item.word,
        explanation: `${item.scrambled} unscrambles to ${item.word} (${item.clue})`
      };
    } else if (type === 'reflex') {
      const item = window.GAME_QUESTIONS.reflex[qIndex % window.GAME_QUESTIONS.reflex.length];
      qData = {
        type: 'reflex',
        prompt: 'STRIKE TEST: What COLOR is the text printed in?',
        displayWord: item.word,
        targetColor: item.textColor,
        options: ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'].sort(() => Math.random() - 0.5).slice(0, 4),
        correctAnswer: item.textName,
        explanation: `The ink color was ${item.textName}, even though the text spelled ${item.word}!`
      };
      if (!qData.options.includes(item.textName)) {
        qData.options[0] = item.textName;
        qData.options.sort(() => Math.random() - 0.5);
      }
    } else {
      const item = window.GAME_QUESTIONS.trivia[qIndex % window.GAME_QUESTIONS.trivia.length];
      qData = {
        type: 'trivia',
        prompt: item.prompt,
        options: [...item.options].sort(() => Math.random() - 0.5),
        correctAnswer: item.correctAnswer,
        explanation: item.explanation
      };
    }

    room.roundData = qData;
    room.state = 'playing';
    room.roundStartTime = Date.now();

    this.emit('new-round', {
      round: room.currentRound,
      totalRounds: room.settings.rounds,
      roundTime: room.settings.roundTime,
      question: qData
    });

    // Simulate bot answers
    this.simulateStandaloneBots(room);

    // Timeout
    clearTimeout(this.standaloneTimer);
    this.standaloneTimer = setTimeout(() => {
      this.finishStandaloneRound();
    }, room.settings.roundTime * 1000 + 400);
  }

  simulateStandaloneBots(room) {
    const bots = room.players.filter(p => p.isBot);
    bots.forEach(bot => {
      const delay = Math.floor(Math.random() * 3000) + 1500;
      setTimeout(() => {
        if (room.state !== 'playing' || !room.roundData || bot.lastAnswer) return;
        const isCorrect = Math.random() < (bot.accuracy || 0.8);
        let ans = room.roundData.correctAnswer;
        if (!isCorrect && room.roundData.options) {
          const wrong = room.roundData.options.filter(o => o !== ans);
          ans = wrong[Math.floor(Math.random() * wrong.length)] || 'Wrong';
        }
        this.processStandaloneScore(bot, ans, delay);
        this.checkStandaloneAllAnswered();
      }, delay);
    });
  }

  handleStandaloneAnswer(answer, responseTime) {
    const room = this.currentRoom;
    if (!room || room.state !== 'playing') return;
    const human = room.players.find(p => !p.isBot);
    if (!human || human.lastAnswer) return;

    this.processStandaloneScore(human, answer, responseTime);
    this.checkStandaloneAllAnswered();
  }

  processStandaloneScore(player, answer, timeTaken) {
    const room = this.currentRoom;
    const isCorrect = String(answer).trim().toLowerCase() === String(room.roundData.correctAnswer).trim().toLowerCase();

    player.totalAnswers++;
    player.reactionTimes.push(timeTaken);

    let pointsEarned = 0;
    if (isCorrect) {
      player.correctAnswers++;
      player.streak++;
      if (player.streak > player.highestStreak) player.highestStreak = player.streak;

      const timeFractionRemaining = Math.max(0, (room.settings.roundTime * 1000 - timeTaken) / (room.settings.roundTime * 1000));
      const speedPoints = Math.round(500 * timeFractionRemaining);
      const streakBonus = Math.min(player.streak * 50, 250);
      pointsEarned = 500 + speedPoints + streakBonus;
    } else {
      player.streak = 0;
    }

    player.score += pointsEarned;
    player.lastAnswer = { answer, isCorrect, timeTaken, pointsEarned };

    this.emit('player-answered', {
      playerId: player.id,
      playerName: player.name,
      hasAnswered: true
    });
  }

  checkStandaloneAllAnswered() {
    const room = this.currentRoom;
    const allAnswered = room.players.every(p => p.lastAnswer !== undefined);
    if (allAnswered) {
      clearTimeout(this.standaloneTimer);
      this.finishStandaloneRound();
    }
  }

  finishStandaloneRound() {
    const room = this.currentRoom;
    if (room.state !== 'playing') return;
    room.state = 'round_result';

    room.players.forEach(p => {
      if (!p.lastAnswer) {
        p.streak = 0;
        p.totalAnswers++;
        p.lastAnswer = {
          answer: null,
          isCorrect: false,
          timeTaken: room.settings.roundTime * 1000,
          pointsEarned: 0
        };
      }
    });

    const summary = {
      correctAnswer: room.roundData.correctAnswer,
      explanation: room.roundData.explanation || '',
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        lastAnswer: p.lastAnswer
      })).sort((a, b) => b.score - a.score)
    };

    this.emit('round-results', summary);

    setTimeout(() => {
      if (this.currentRoom && this.currentRoom.state === 'round_result') {
        this.nextStandaloneRound();
      }
    }, 4500);
  }

  endStandaloneGame() {
    const room = this.currentRoom;
    room.state = 'game_over';

    const leaderboard = room.players.map(p => {
      const avgReaction = p.reactionTimes.length > 0
        ? Math.round(p.reactionTimes.reduce((a, b) => a + b, 0) / p.reactionTimes.length)
        : 0;
      const accuracy = p.totalAnswers > 0
        ? Math.round((p.correctAnswers / p.totalAnswers) * 100)
        : 0;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        score: p.score,
        highestStreak: p.highestStreak,
        accuracy,
        avgReaction
      };
    }).sort((a, b) => b.score - a.score);

    this.emit('game-over', {
      leaderboard,
      winner: leaderboard[0]
    });
  }
}

window.networkManager = new NetworkManager();
