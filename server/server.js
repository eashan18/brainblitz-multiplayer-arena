const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    roomsActive: Object.keys(rooms).length,
    timestamp: new Date().toISOString()
  });
});

// Room state store
// roomCode -> { code, hostId, settings, players: {}, state: 'lobby'|'countdown'|'playing'|'round_result'|'game_over', currentRound, totalRounds, roundData, roundTimer }
const rooms = {};

// Helper: Generate clean 4-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars 0/O, 1/I
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

// Bot names and avatars for solo test mode
const BOT_PROFILES = [
  { name: 'ByteBot ⚡', avatar: '🤖', speedMin: 1800, speedMax: 4500, accuracy: 0.85 },
  { name: 'Nova AI 🌟', avatar: '🚀', speedMin: 2200, speedMax: 5000, accuracy: 0.75 },
  { name: 'Cipher 🔮', avatar: '👾', speedMin: 1500, speedMax: 3800, accuracy: 0.90 }
];

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = socket.id;

  // Handle Room Creation
  socket.on('create-room', (payload, callback) => {
    const code = generateRoomCode();
    currentRoom = code;

    rooms[code] = {
      code,
      hostId: playerId,
      state: 'lobby',
      settings: {
        mode: payload.mode || 'mixed', // 'trivia' | 'anagram' | 'reflex' | 'mixed'
        rounds: payload.rounds || 5,
        roundTime: payload.roundTime || 12 // seconds per round
      },
      currentRound: 0,
      roundData: null,
      roundStartTime: 0,
      roundTimeout: null,
      botTimeouts: [],
      players: {
        [playerId]: {
          id: playerId,
          name: payload.name ? payload.name.trim().slice(0, 16) : 'Host Commander',
          avatar: payload.avatar || '🦊',
          isHost: true,
          isBot: false,
          ready: true,
          score: 0,
          streak: 0,
          highestStreak: 0,
          correctAnswers: 0,
          totalAnswers: 0,
          reactionTimes: []
        }
      }
    };

    socket.join(code);
    if (typeof callback === 'function') {
      callback({ success: true, room: getSanitizedRoom(rooms[code]) });
    }
  });

  // Handle Room Join
  socket.on('join-room', (payload, callback) => {
    const code = (payload.code || '').trim().toUpperCase();
    const room = rooms[code];

    if (!room) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Room not found. Check code and try again.' });
      }
      return;
    }

    if (room.state !== 'lobby') {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Game has already started in this room.' });
      }
      return;
    }

    if (Object.keys(room.players).length >= 8) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Room is full (max 8 players).' });
      }
      return;
    }

    currentRoom = code;
    room.players[playerId] = {
      id: playerId,
      name: payload.name ? payload.name.trim().slice(0, 16) : `Player ${Object.keys(room.players).length + 1}`,
      avatar: payload.avatar || '🐱',
      isHost: false,
      isBot: false,
      ready: false,
      score: 0,
      streak: 0,
      highestStreak: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      reactionTimes: []
    };

    socket.join(code);
    io.to(code).emit('room-updated', getSanitizedRoom(room));

    if (typeof callback === 'function') {
      callback({ success: true, room: getSanitizedRoom(room) });
    }
  });

  // Add simulated AI Bot for testing
  socket.on('add-bot', (_, callback) => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== playerId || room.state !== 'lobby') return;

    const botCount = Object.values(room.players).filter(p => p.isBot).length;
    if (botCount >= BOT_PROFILES.length) {
      if (typeof callback === 'function') callback({ success: false, message: 'Max bots reached.' });
      return;
    }

    const profile = BOT_PROFILES[botCount];
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    room.players[botId] = {
      id: botId,
      name: profile.name,
      avatar: profile.avatar,
      isHost: false,
      isBot: true,
      botProfile: profile,
      ready: true,
      score: 0,
      streak: 0,
      highestStreak: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      reactionTimes: []
    };

    io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
    if (typeof callback === 'function') callback({ success: true });
  });

  // Remove Bot
  socket.on('remove-bot', (botId) => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== playerId || room.state !== 'lobby') return;

    if (room.players[botId] && room.players[botId].isBot) {
      delete room.players[botId];
      io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
    }
  });

  // Update Settings
  socket.on('update-settings', (settings) => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== playerId || room.state !== 'lobby') return;

    if (settings.mode) room.settings.mode = settings.mode;
    if (settings.rounds) room.settings.rounds = Math.min(10, Math.max(3, Number(settings.rounds)));
    if (settings.roundTime) room.settings.roundTime = Math.min(30, Math.max(8, Number(settings.roundTime)));

    io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
  });

  // Toggle Ready
  socket.on('toggle-ready', () => {
    const room = rooms[currentRoom];
    if (!room || !room.players[playerId] || room.state !== 'lobby') return;

    // Host is always ready
    if (room.players[playerId].isHost) return;

    room.players[playerId].ready = !room.players[playerId].ready;
    io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
  });

  // Host Starts Game
  socket.on('start-game', (clientRoundData) => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== playerId || room.state !== 'lobby') return;

    // Reset scores & stats
    for (const pid in room.players) {
      room.players[pid].score = 0;
      room.players[pid].streak = 0;
      room.players[pid].highestStreak = 0;
      room.players[pid].correctAnswers = 0;
      room.players[pid].totalAnswers = 0;
      room.players[pid].reactionTimes = [];
      delete room.players[pid].lastAnswer;
    }

    room.state = 'countdown';
    room.currentRound = 0;
    io.to(currentRoom).emit('game-countdown', { count: 3 });

    setTimeout(() => {
      startNextRound(currentRoom, clientRoundData);
    }, 3200);
  });

  // Player Submits Answer
  socket.on('submit-answer', (payload) => {
    const room = rooms[currentRoom];
    if (!room || room.state !== 'playing' || !room.roundData) return;

    const player = room.players[playerId];
    if (!player || player.lastAnswer) return; // Player already answered this round

    processPlayerAnswer(room, player, payload.answer, payload.responseTime);

    // Check if all players have answered
    checkAllAnswered(room);
  });

  // Rematch / Return to Lobby
  socket.on('rematch', () => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== playerId) return;

    room.state = 'lobby';
    room.currentRound = 0;
    room.roundData = null;
    clearTimeout(room.roundTimeout);
    clearBotTimers(room);

    for (const pid in room.players) {
      room.players[pid].score = 0;
      room.players[pid].streak = 0;
      room.players[pid].highestStreak = 0;
      delete room.players[pid].lastAnswer;
      if (!room.players[pid].isHost && !room.players[pid].isBot) {
        room.players[pid].ready = false;
      }
    }

    io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
    io.to(currentRoom).emit('returned-to-lobby');
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];

    delete room.players[playerId];

    const remainingPlayerIds = Object.keys(room.players).filter(id => !room.players[id].isBot);

    if (remainingPlayerIds.length === 0) {
      // Room empty of human players, clean up
      clearTimeout(room.roundTimeout);
      clearBotTimers(room);
      delete rooms[currentRoom];
    } else {
      // If host left, elect new host
      if (room.hostId === playerId) {
        const nextHostId = remainingPlayerIds[0];
        room.hostId = nextHostId;
        room.players[nextHostId].isHost = true;
        room.players[nextHostId].ready = true;
      }
      io.to(currentRoom).emit('room-updated', getSanitizedRoom(room));
      if (room.state === 'playing') {
        checkAllAnswered(room);
      }
    }
  });
});

// Start round logic
function startNextRound(roomCode, clientQuestionBank) {
  const room = rooms[roomCode];
  if (!room) return;

  room.currentRound++;
  if (room.currentRound > room.settings.rounds) {
    endGame(room);
    return;
  }

  // Clear previous answers
  for (const pid in room.players) {
    delete room.players[pid].lastAnswer;
  }

  // Pick question based on mode
  const question = generateQuestion(room.settings.mode, room.currentRound, clientQuestionBank);
  room.roundData = question;
  room.state = 'playing';
  room.roundStartTime = Date.now();

  io.to(roomCode).emit('new-round', {
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    roundTime: room.settings.roundTime,
    question: {
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      clue: question.clue,
      targetColor: question.targetColor,
      displayWord: question.displayWord
    }
  });

  // Schedule Bot answers
  scheduleBotAnswers(room);

  // Set timeout for round end
  clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    finishRound(room);
  }, room.settings.roundTime * 1000 + 500);
}

function processPlayerAnswer(room, player, answer, clientResponseTime) {
  const now = Date.now();
  const timeTaken = Math.max(100, Math.min(room.settings.roundTime * 1000, clientResponseTime || (now - room.roundStartTime)));
  const isCorrect = String(answer).trim().toLowerCase() === String(room.roundData.correctAnswer).trim().toLowerCase();

  player.totalAnswers++;
  player.reactionTimes.push(timeTaken);

  let pointsEarned = 0;
  if (isCorrect) {
    player.correctAnswers++;
    player.streak++;
    if (player.streak > player.highestStreak) {
      player.highestStreak = player.streak;
    }

    // Speed bonus: up to 500 base points + up to 500 speed points
    const timeFractionRemaining = Math.max(0, (room.settings.roundTime * 1000 - timeTaken) / (room.settings.roundTime * 1000));
    const speedPoints = Math.round(500 * timeFractionRemaining);
    const streakBonus = Math.min(player.streak * 50, 250);
    pointsEarned = 500 + speedPoints + streakBonus;
  } else {
    player.streak = 0;
  }

  player.score += pointsEarned;
  player.lastAnswer = {
    answer,
    isCorrect,
    timeTaken,
    pointsEarned
  };

  io.to(room.code).emit('player-answered', {
    playerId: player.id,
    playerName: player.name,
    hasAnswered: true
  });
}

function scheduleBotAnswers(room) {
  clearBotTimers(room);
  const bots = Object.values(room.players).filter(p => p.isBot);

  bots.forEach(bot => {
    const profile = bot.botProfile || { speedMin: 2000, speedMax: 4000, accuracy: 0.8 };
    const delay = Math.floor(Math.random() * (profile.speedMax - profile.speedMin)) + profile.speedMin;
    const shouldBeCorrect = Math.random() < profile.accuracy;

    const timer = setTimeout(() => {
      if (room.state !== 'playing' || !room.roundData || bot.lastAnswer) return;

      let botAnswer;
      if (shouldBeCorrect) {
        botAnswer = room.roundData.correctAnswer;
      } else {
        // Pick wrong option
        if (room.roundData.options && room.roundData.options.length > 1) {
          const wrongOptions = room.roundData.options.filter(o => o !== room.roundData.correctAnswer);
          botAnswer = wrongOptions[Math.floor(Math.random() * wrongOptions.length)] || 'Wrong';
        } else {
          botAnswer = 'RANDOM_GUESS';
        }
      }

      processPlayerAnswer(room, bot, botAnswer, delay);
      checkAllAnswered(room);
    }, delay);

    room.botTimeouts.push(timer);
  });
}

function clearBotTimers(room) {
  if (room.botTimeouts && room.botTimeouts.length) {
    room.botTimeouts.forEach(t => clearTimeout(t));
    room.botTimeouts = [];
  }
}

function checkAllAnswered(room) {
  const allPlayers = Object.values(room.players);
  const allAnswered = allPlayers.every(p => p.lastAnswer !== undefined);

  if (allAnswered) {
    clearTimeout(room.roundTimeout);
    clearBotTimers(room);
    finishRound(room);
  }
}

function finishRound(room) {
  if (room.state !== 'playing') return;
  room.state = 'round_result';

  // Mark non-answering players
  for (const pid in room.players) {
    const p = room.players[pid];
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
  }

  const roundSummary = {
    correctAnswer: room.roundData.correctAnswer,
    explanation: room.roundData.explanation || '',
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      lastAnswer: p.lastAnswer
    })).sort((a, b) => b.score - a.score)
  };

  io.to(room.code).emit('round-results', roundSummary);

  // Transition to next round after 4.5 seconds
  setTimeout(() => {
    if (rooms[room.code] && rooms[room.code].state === 'round_result') {
      startNextRound(room.code);
    }
  }, 4500);
}

function endGame(room) {
  room.state = 'game_over';
  clearBotTimers(room);

  const leaderboard = Object.values(room.players).map(p => {
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

  io.to(room.code).emit('game-over', {
    leaderboard,
    winner: leaderboard[0]
  });
}

function getSanitizedRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    currentRound: room.currentRound,
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isBot: p.isBot,
      ready: p.ready,
      score: p.score,
      streak: p.streak
    }))
  };
}

// Built-in questions generator
const BUILTIN_TRIVIA = [
  {
    type: 'trivia',
    prompt: 'Which programming language was created by Brendan Eich in just 10 days in 1995?',
    options: ['JavaScript', 'Python', 'Java', 'Ruby'],
    correctAnswer: 'JavaScript',
    explanation: 'Brendan Eich designed JavaScript at Netscape in May 1995.'
  },
  {
    type: 'trivia',
    prompt: 'What does "AI" stand for in modern computing?',
    options: ['Automated Interface', 'Artificial Intelligence', 'Algorithm Integration', 'Advanced Internet'],
    correctAnswer: 'Artificial Intelligence',
    explanation: 'Artificial Intelligence is the simulation of human intelligence by machines.'
  },
  {
    type: 'trivia',
    prompt: 'Which HTTP status code represents "OK / Successful Request"?',
    options: ['200', '404', '500', '301'],
    correctAnswer: '200',
    explanation: '200 OK is the standard response for successful HTTP requests.'
  },
  {
    type: 'trivia',
    prompt: 'In WebSocket communication, how is the connection maintained?',
    options: ['Full-duplex persistent TCP socket', 'Periodic HTTP polling', 'UDP broadcast only', 'DNS requests'],
    correctAnswer: 'Full-duplex persistent TCP socket',
    explanation: 'WebSockets provide full-duplex communication channels over a single TCP connection.'
  },
  {
    type: 'trivia',
    prompt: 'What company developed the transformer architecture behind modern LLMs in 2017?',
    options: ['Google (Brain/Research)', 'Microsoft', 'OpenAI', 'Meta'],
    correctAnswer: 'Google (Brain/Research)',
    explanation: 'Google researchers published "Attention Is All You Need" introducing the Transformer.'
  },
  {
    type: 'trivia',
    prompt: 'Which data structure follows the First-In, First-Out (FIFO) principle?',
    options: ['Queue', 'Stack', 'Tree', 'Graph'],
    correctAnswer: 'Queue',
    explanation: 'A Queue processes items in FIFO order (e.g. line at a counter).'
  },
  {
    type: 'trivia',
    prompt: 'What is the speed of light in vacuum approximately?',
    options: ['300,000 km/s', '150,000 km/s', '1,000,000 km/s', '3,000 km/s'],
    correctAnswer: '300,000 km/s',
    explanation: 'Light travels at ~299,792 km/s in a vacuum.'
  },
  {
    type: 'trivia',
    prompt: 'In CSS, which display value allows elements to flex and adjust size responsively?',
    options: ['flex', 'grid', 'block', 'table'],
    correctAnswer: 'flex',
    explanation: 'Flexbox provides a responsive layout model.'
  }
];

const BUILTIN_ANAGRAMS = [
  { word: 'ALGORITHM', scrambled: 'GMHTAILOR', clue: 'Step-by-step problem solver' },
  { word: 'NETWORK', scrambled: 'TWENROK', clue: 'Interconnected computer systems' },
  { word: 'BROWSER', scrambled: 'WREROSB', clue: 'App used to surf the web' },
  { word: 'SYNAPSE', scrambled: 'PAYSENS', clue: 'Junction between brain neurons' },
  { word: 'DATABASE', scrambled: 'BATASADE', clue: 'Structured collection of records' }
];

const BUILTIN_REFLEX = [
  { word: 'BLUE', textColor: '#ef4444', textName: 'RED', correctMatch: 'RED' },
  { word: 'GREEN', textColor: '#3b82f6', textName: 'BLUE', correctMatch: 'BLUE' },
  { word: 'YELLOW', textColor: '#10b981', textName: 'GREEN', correctMatch: 'GREEN' },
  { word: 'PURPLE', textColor: '#f59e0b', textName: 'YELLOW', correctMatch: 'YELLOW' }
];

function generateQuestion(mode, roundIndex, clientQuestions) {
  let selectedMode = mode;
  if (mode === 'mixed') {
    const modes = ['trivia', 'anagram', 'reflex'];
    selectedMode = modes[(roundIndex - 1) % modes.length];
  }

  if (selectedMode === 'anagram') {
    const item = BUILTIN_ANAGRAMS[(roundIndex - 1) % BUILTIN_ANAGRAMS.length];
    return {
      type: 'anagram',
      prompt: `Unscramble this word: ${item.scrambled}`,
      clue: item.clue,
      options: shuffle([
        item.word,
        mutateWord(item.word, 1),
        mutateWord(item.word, 2),
        mutateWord(item.word, 3)
      ]),
      correctAnswer: item.word,
      explanation: `${item.scrambled} unscrambles to ${item.word} (${item.clue})`
    };
  }

  if (selectedMode === 'reflex') {
    const item = BUILTIN_REFLEX[(roundIndex - 1) % BUILTIN_REFLEX.length];
    return {
      type: 'reflex',
      prompt: 'STRIKE TEST: What COLOR is the text printed in?',
      displayWord: item.word,
      targetColor: item.textColor,
      options: shuffle(['RED', 'BLUE', 'GREEN', 'YELLOW']),
      correctAnswer: item.textName,
      explanation: `The ink color was ${item.textName}, even though the text spelled ${item.word}!`
    };
  }

  // Default: Trivia
  const item = BUILTIN_TRIVIA[(roundIndex - 1) % BUILTIN_TRIVIA.length];
  return {
    type: 'trivia',
    prompt: item.prompt,
    options: shuffle([...item.options]),
    correctAnswer: item.correctAnswer,
    explanation: item.explanation
  };
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mutateWord(word, offset) {
  const letters = word.split('');
  const swapIdx = (offset * 2) % (letters.length - 1);
  const temp = letters[swapIdx];
  letters[swapIdx] = letters[swapIdx + 1];
  letters[swapIdx + 1] = temp;
  return letters.join('');
}

// Start Server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 BrainBlitz Multiplayer Arena Server Running!`);
    console.log(`📍 Local URL: http://localhost:${PORT}`);
    console.log(`🎮 Real-time WebSocket game engine active.`);
    console.log(`===============================================`);
  });
}

module.exports = { app, server, rooms, generateRoomCode, generateQuestion };
