/*
 * Node.js self-play environment for AI training. Reuses the exact same move
 * generation logic as the browser game (js/game-rules.js) so training never
 * drifts from real gameplay rules.
 */
const path = require('path');
const gameRules = require(path.join(__dirname, '..', 'js', 'game-rules.js'));
const features = require(path.join(__dirname, '..', 'js', 'ai', 'features.js'));
const nn = require(path.join(__dirname, '..', 'js', 'ai', 'neuralnet.js'));

const MAX_START_NUMBER = 2n ** 64n;

function padMoves(moves) {
    const padded = moves.slice(0, features.ACTION_SLOTS);
    while (padded.length < features.ACTION_SLOTS) padded.push(null);
    return padded;
}

/**
 * Plays one full self-play game using `net` for both sides, alternating turns.
 * Returns per-player transition trajectories (features/mask/action/logProb/value)
 * plus the outcome, so the caller can assign rewards and run GAE.
 */
function playSelfPlayEpisode(net, options) {
    const startNumber = options.startNumber;
    const maxSteps = options.maxSteps;

    let currentNumber = BigInt(startNumber);
    let step = 0;
    let playerTurn = 0;
    const trajectories = [[], []];
    let winner = null; // 0, 1, or null (tie)

    while (step < maxSteps) {
        const rawMoves = gameRules.getAvailableMoves(currentNumber, startNumber);
        if (!rawMoves.length) {
            // No legal moves (shouldn't normally happen since factor 1 always
            // exists for composite numbers, and n=1 ends the game already).
            winner = 1 - playerTurn;
            break;
        }
        const moves = padMoves(rawMoves);
        const encoded = features.encodeState({ currentNumber, startNumber, step, maxSteps, moves: rawMoves });
        const cache = nn.forwardWithCache(net, encoded.features);
        const probs = nn.maskedSoftmax(cache.policyLogits, encoded.mask);
        let actionIndex = nn.sampleAction(probs);
        if (!encoded.mask[actionIndex]) actionIndex = nn.argmaxValid(probs, encoded.mask);
        const logProb = Math.log(Math.min(Math.max(probs[actionIndex], 1e-8), 1));

        trajectories[playerTurn].push({
            features: encoded.features,
            mask: encoded.mask,
            action: actionIndex,
            logProb,
            value: cache.value,
            reward: 0
        });

        const chosenMove = moves[actionIndex];
        currentNumber = BigInt(chosenMove.value);
        step++;

        if (currentNumber === 1n) {
            winner = playerTurn;
            break;
        }
        playerTurn = 1 - playerTurn;
    }

    const totalSteps = step;
    const isTie = winner === null;

    for (let player = 0; player < 2; player++) {
        const trajectory = trajectories[player];
        if (!trajectory.length) continue;
        if (isTie) {
            // Tie: every transition scores exactly 0, per the game's scoring rules.
            continue;
        }
        const won = winner === player;
        const terminalScore = won ? (maxSteps - totalSteps + 1) : -(maxSteps - totalSteps + 1);
        for (let i = 0; i < trajectory.length - 1; i++) trajectory[i].reward = -0.01; // small time-pressure shaping
        trajectory[trajectory.length - 1].reward = terminalScore;
    }

    return { trajectories, winner, totalSteps };
}

module.exports = { playSelfPlayEpisode, MAX_START_NUMBER };
