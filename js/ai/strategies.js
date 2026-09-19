/*
 * AI strategy registry.
 *
 * Future trained strategies can be added here without changing game turn
 * handling. A strategy receives the current number and its displayed moves.
 */
const AI_STRATEGIES = {
    random: {
        name: 'Random Strategy',
        description: 'Chooses any available factor at random.',
        choose: function(moves) {
            return moves[Math.floor(Math.random() * moves.length)];
        }
    },
    smallest: {
        name: 'Smallest Factor',
        description: 'Always chooses the smallest available factor.',
        choose: function(moves) {
            return moves.find(move => move.type === 'factor') || moves[0];
        }
    },
    largest: {
        name: 'Largest Factor',
        description: 'Always chooses the largest available factor.',
        choose: function(moves) {
            const factors = moves.filter(move => move.type === 'factor');
            return factors[factors.length - 1] || moves[moves.length - 1];
        }
    },
    trained: {
        name: 'Trained Strategy',
        description: 'Uses the latest saved neural network from browser or Node.js PPO training.',
        choose: function(moves) {
            const networkMove = chooseWithTrainedNetwork(moves);
            if (networkMove) return networkMove;
            return moves[Math.floor(Math.random() * moves.length)];
        }
    }
};

// Cache the reconstructed network object so we don't re-parse/rebuild it on every move.
let cachedTrainedNetwork = null;
let cachedTrainedNetworkSource = null;

/**
 * Picks a move using js/ai/model/model.js (produced by node train/train.js),
 * padding/encoding the state exactly like the trainer does. Returns null when
 * no trained model has been saved yet, so callers can fall back gracefully.
 */
function chooseWithTrainedNetwork(moves) {
    if ((!TRAINED_MODEL_DATA || !TRAINED_MODEL_DATA.network) && typeof localStorage !== 'undefined') {
        const savedModel = localStorage.getItem(STORAGE_KEY_TRAINED_MODEL);
        if (savedModel) {
            try {
                TRAINED_MODEL_DATA = JSON.parse(savedModel);
            } catch (error) {
                showToast('Saved trained model is invalid and cannot be loaded.', 'error');
            }
        }
    }
    if (typeof TRAINED_MODEL_DATA === 'undefined' || !TRAINED_MODEL_DATA) return null;
    if (typeof encodeState === 'undefined' || typeof networkFromJSON === 'undefined') return null;

    if (cachedTrainedNetwork === null || cachedTrainedNetworkSource !== TRAINED_MODEL_DATA) {
        cachedTrainedNetwork = networkFromJSON(TRAINED_MODEL_DATA.network);
        cachedTrainedNetworkSource = TRAINED_MODEL_DATA;
    }

    const paddedMoves = moves.slice(0, ACTION_SLOTS);
    while (paddedMoves.length < ACTION_SLOTS) paddedMoves.push(null);

    const encoded = encodeState({
        currentNumber: gameState.currentNumber,
        startNumber: gameState.startNumber,
        step: gameState.history.length,
        maxSteps: settings.maxSteps,
        moves: moves
    });
    const { policyLogits } = forward(cachedTrainedNetwork, encoded.features);
    const probs = maskedSoftmax(policyLogits, encoded.mask);
    const actionIndex = argmaxValid(probs, encoded.mask);
    return paddedMoves[actionIndex] || moves[0];
}

function getAiStrategy(type) {
    return AI_STRATEGIES[type] || AI_STRATEGIES.random;
}

function chooseAiMove(type, moves) {
    if (!moves.length) return null;
    return getAiStrategy(type).choose(moves);
}

// Allow the Node.js AI trainer (train/) to reuse the random/smallest/largest
// baseline strategies as self-play/evaluation opponents, without affecting
// browser <script> loading. The "trained" strategy is intentionally never
// invoked from Node (it depends on browser-only globals like localStorage).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AI_STRATEGIES, getAiStrategy, chooseAiMove };
}
