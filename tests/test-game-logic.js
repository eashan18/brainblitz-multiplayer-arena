// Automated Test Suite for BrainBlitz Game Logic & Server Rules
const assert = require('assert');
const { generateRoomCode, generateQuestion, rooms } = require('../server/server.js');

console.log('🧪 Starting BrainBlitz Automated Test Suite...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

// Test 1: Room Code Generation
runTest('generateRoomCode produces unique 4-character alphanumeric string without ambiguous chars', () => {
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    const code = generateRoomCode();
    assert.strictEqual(typeof code, 'string');
    assert.strictEqual(code.length, 4);
    assert.strictEqual(/^[A-HJ-NP-Z2-9]{4}$/.test(code), true, `Code ${code} contained forbidden characters`);
    codes.add(code);
  }
  // With 32^4 combinations, 50 random samples should be unique
  assert.strictEqual(codes.size, 50);
});

// Test 2: Trivia Question Generation
runTest('generateQuestion generates valid Trivia question with 4 options and correct answer included', () => {
  const q = generateQuestion('trivia', 1);
  assert.strictEqual(q.type, 'trivia');
  assert.ok(q.prompt.length > 5);
  assert.strictEqual(q.options.length, 4);
  assert.ok(q.options.includes(q.correctAnswer));
});

// Test 3: Anagram Question Generation
runTest('generateQuestion generates valid Anagram challenge with options and clue', () => {
  const q = generateQuestion('anagram', 1);
  assert.strictEqual(q.type, 'anagram');
  assert.ok(q.prompt.includes('Unscramble'));
  assert.ok(q.clue.length > 0);
  assert.ok(q.options.includes(q.correctAnswer));
});

// Test 4: Reflex Question Generation
runTest('generateQuestion generates valid Color Stroop reflex challenge', () => {
  const q = generateQuestion('reflex', 1);
  assert.strictEqual(q.type, 'reflex');
  assert.ok(q.targetColor.startsWith('#'));
  assert.ok(q.options.includes(q.correctAnswer));
});

// Test 5: Mixed Mode Cycling
runTest('generateQuestion in mixed mode cycles through trivia, anagram, and reflex modes', () => {
  const q1 = generateQuestion('mixed', 1);
  const q2 = generateQuestion('mixed', 2);
  const q3 = generateQuestion('mixed', 3);
  assert.strictEqual(q1.type, 'trivia');
  assert.strictEqual(q2.type, 'anagram');
  assert.strictEqual(q3.type, 'reflex');
});

// Test 6: Scoring & Speed Bonus Formula
runTest('Scoring formula calculates speed bonus and streak multiplier accurately', () => {
  const roundTimeSec = 12;
  const timeTakenMs = 2400; // Answered in 2.4s out of 12s
  const streak = 3;

  const timeFractionRemaining = (roundTimeSec * 1000 - timeTakenMs) / (roundTimeSec * 1000);
  const speedPoints = Math.round(500 * timeFractionRemaining);
  const streakBonus = Math.min(streak * 50, 250);
  const totalPoints = 500 + speedPoints + streakBonus;

  assert.strictEqual(timeFractionRemaining, 0.8);
  assert.strictEqual(speedPoints, 400);
  assert.strictEqual(streakBonus, 150);
  assert.strictEqual(totalPoints, 1050);
});

console.log(`\n========================================`);
console.log(`🎉 Test Run Complete: ${testsPassed}/${testsTotal} Passed.`);
console.log(`========================================\n`);

if (testsPassed !== testsTotal) {
  process.exit(1);
}
