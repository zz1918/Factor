/*
 * Evaluates a network against the browser's baseline strategies (random,
 * smallest, largest) using greedy (argmax over valid actions) move selection.
 * Used both periodically during training and by train/evaluate.js standalone.
 */
const path = require('path');
const gameRules = require(path.join(__dirname, '..', 'js', 'game-rules.js'));
const features = require(path.join(__dirname, '..', 'js', 'ai', 'features.js'));
const nn = require(path.join(__dirname, '..', 'js', 'ai', 'neuralnet.js'));
const { AI_STRATEGIES } = require(path.join(__dirname, '..', 'js', 'ai', 'strategies.js'));

function padMoves(moves) {
    const padded = moves.slice(0, features.ACTION_SLOTS);
    while (padded.length < features.ACTION_SLOTS) padded.push(null);
    return padded;
}

function chooseWithNetwork(net, currentNumber, startNumber, step, maxSteps, rawMoves) {
    const moves = padMoves(rawMoves);
    const encoded = features.encodeState({ currentNumber, startNumber, step, maxSteps, moves: rawMoves });
    const { policyLogits } = nn.forward(net, encoded.features);
    const probs = nn.maskedSoftmax(policyLogits, encoded.mask);
    const actionIndex = nn.argmaxValid(probs, encoded.mask);
    return moves[actionIndex];
}

/** Plays one game: network (playerIndex 0 or 1) vs a named baseline strategy. */
function playEvaluationGame(net, networkPlayer, baselineName, startNumber, maxSteps) {
    let currentNumber = BigInt(startNumber);
    let step = 0;
    let playerTurn = 0;
    let winner = null;
    const baseline = AI_STRATEGIES[baselineName] || AI_STRATEGIES.random;

    while (step < maxSteps) {
        const rawMoves = gameRules.getAvailableMoves(currentNumber);
        if (!rawMoves.length) {
            winner = 1 - playerTurn;
            break;
        }
        const move = playerTurn === networkPlayer
            ? chooseWithNetwork(net, currentNumber, startNumber, step, maxSteps, rawMoves)
            : baseline.choose(rawMoves);
        currentNumber = BigInt(move.value);
        step++;
        if (currentNumber === 1n) {
            winner = playerTurn;
            break;
        }
        playerTurn = 1 - playerTurn;
    }
    return { winner, totalSteps: step };
}

/** Runs `gamesPerBaseline` games (alternating who moves first) against each baseline. */
function evaluateAgainstBaselines(net, options) {
    const baselines = options.baselines || ['random', 'smallest', 'largest'];
    const gamesPerBaseline = options.gamesPerBaseline || 20;
    const startNumber = options.startNumber;
    const maxSteps = options.maxSteps;

    const results = {};
    let totalScore = 0;
    let totalGames = 0;

    for (const baselineName of baselines) {
        let wins = 0, losses = 0, ties = 0, scoreSum = 0;
        for (let i = 0; i < gamesPerBaseline; i++) {
            const networkPlayer = i % 2; // alternate who goes first
            const { winner, totalSteps } = playEvaluationGame(net, networkPlayer, baselineName, startNumber, maxSteps);
            let score;
            if (winner === null) { ties++; score = 0; }
            else if (winner === networkPlayer) { wins++; score = maxSteps - totalSteps + 1; }
            else { losses++; score = -(maxSteps - totalSteps + 1); }
            scoreSum += score;
        }
        results[baselineName] = { wins, losses, ties, averageScore: scoreSum / gamesPerBaseline };
        totalScore += scoreSum;
        totalGames += gamesPerBaseline;
    }

    return { perBaseline: results, averageScore: totalScore / totalGames };
}

module.exports = { evaluateAgainstBaselines, playEvaluationGame };
