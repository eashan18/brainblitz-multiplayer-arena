// Game Modes & Question Bank Data
const GAME_QUESTIONS = {
  trivia: [
    {
      category: 'Artificial Intelligence',
      prompt: 'Which landmark 2017 paper introduced the Transformer architecture?',
      options: ['Attention Is All You Need', 'Deep Residual Learning', 'Generative Adversarial Nets', 'Mastering the Game of Go'],
      correctAnswer: 'Attention Is All You Need',
      explanation: 'Authored by Vaswani et al. at Google Brain & Research, it revolutionized modern AI/LLMs.'
    },
    {
      category: 'Web Technology',
      prompt: 'What WebSocket method is invoked when an established connection is abruptly terminated?',
      options: ['onclose', 'onerror', 'onterminate', 'ondisconnect'],
      correctAnswer: 'onclose',
      explanation: 'The WebSocket API triggers the onclose event when a connection closes.'
    },
    {
      category: 'Computer Science',
      prompt: 'What is the average time complexity of a lookup in a well-balanced Hash Map?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      correctAnswer: 'O(1)',
      explanation: 'Hash maps provide constant average time O(1) retrieval using hash hashing functions.'
    },
    {
      category: 'Software Engineering',
      prompt: 'In git, which command creates and immediately switches to a new branch?',
      options: ['git checkout -b <name>', 'git branch -new <name>', 'git switch -create', 'git push origin'],
      correctAnswer: 'git checkout -b <name>',
      explanation: 'git checkout -b or git switch -c immediately switches to the newly created branch.'
    },
    {
      category: 'Web Architecture',
      prompt: 'What is the primary role of WebRTC in browser applications?',
      options: ['Peer-to-peer real-time audio/video and data exchange', 'Server-side database storage', 'CSS animation acceleration', 'SSL certificate verification'],
      correctAnswer: 'Peer-to-peer real-time audio/video and data exchange',
      explanation: 'WebRTC enables direct browser-to-browser peer communication without intermediary server relay.'
    },
    {
      category: 'AI & Data Science',
      prompt: 'What technique uses reward signals to train agents through trial and error?',
      options: ['Reinforcement Learning (RL)', 'Supervised Learning', 'Unsupervised Clustering', 'Linear Regression'],
      correctAnswer: 'Reinforcement Learning (RL)',
      explanation: 'RL trains agents to maximize cumulative rewards in dynamic environments.'
    },
    {
      category: 'Frontend Development',
      prompt: 'Which CSS property creates modern, frosted-glass backdrop blur effects?',
      options: ['backdrop-filter', 'filter: blur()', 'background-blend-mode', 'box-shadow'],
      correctAnswer: 'backdrop-filter',
      explanation: 'backdrop-filter: blur(10px) applies blurring to elements behind the styled box.'
    },
    {
      category: 'Computing History',
      prompt: 'Who is widely regarded as the world’s first computer programmer for writing an algorithm for the Analytical Engine?',
      options: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Katherine Johnson'],
      correctAnswer: 'Ada Lovelace',
      explanation: 'Ada Lovelace worked with Charles Babbage and wrote the first published algorithm in 1843.'
    }
  ],

  anagrams: [
    { word: 'ALGORITHM', scrambled: 'GMHTAILOR', clue: 'Step-by-step logic recipe' },
    { word: 'SOCKET', scrambled: 'TESKOC', clue: 'Real-time two-way communication pipe' },
    { word: 'KEYFRAME', scrambled: 'FAKYEREM', clue: 'Animation milestone point' },
    { word: 'COMPILER', scrambled: 'PILMOREC', clue: 'Translates source code to machine binary' },
    { word: 'PROMISE', scrambled: 'MISEROP', clue: 'Represents eventual async completion in JS' },
    { word: 'LATENCY', scrambled: 'CATYLEN', clue: 'Delay between request and response' }
  ],

  reflex: [
    { word: 'RED', textColor: '#3b82f6', textName: 'BLUE', correctMatch: 'BLUE' },
    { word: 'GREEN', textColor: '#ef4444', textName: 'RED', correctMatch: 'RED' },
    { word: 'YELLOW', textColor: '#10b981', textName: 'GREEN', correctMatch: 'GREEN' },
    { word: 'PURPLE', textColor: '#f59e0b', textName: 'YELLOW', correctMatch: 'YELLOW' },
    { word: 'BLUE', textColor: '#a855f7', textName: 'PURPLE', correctMatch: 'PURPLE' },
    { word: 'ORANGE', textColor: '#06b6d4', textName: 'CYAN', correctMatch: 'CYAN' }
  ]
};

// Client-side Bot Simulator (for standalone offline/static peer mode)
class LocalGameController {
  constructor() {
    this.room = null;
    this.roundTimer = null;
    this.botTimers = [];
  }

  createLocalRoom(hostName, avatar, settings) {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.room = {
      code,
      hostId: 'player_host',
      state: 'lobby',
      settings: settings || { mode: 'mixed', rounds: 5, roundTime: 12 },
      currentRound: 0,
      roundData: null,
      players: [
        {
          id: 'player_host',
          name: hostName || 'Solo Champion',
          avatar: avatar || '🦊',
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
      ]
    };
    return this.room;
  }

  addBot(name, avatar, accuracy = 0.8) {
    if (!this.room || this.room.players.length >= 6) return null;
    const bot = {
      id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: name || 'ByteBot ⚡',
      avatar: avatar || '🤖',
      isHost: false,
      isBot: true,
      ready: true,
      score: 0,
      streak: 0,
      highestStreak: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      reactionTimes: [],
      accuracy
    };
    this.room.players.push(bot);
    return bot;
  }
}

window.GAME_QUESTIONS = GAME_QUESTIONS;
window.LocalGameController = LocalGameController;
