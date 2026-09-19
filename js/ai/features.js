/*
 * State/action feature encoding shared by the browser game (js/ai/strategies.js,
 * for the "trained" strategy) and the Node.js trainer (train/). Keeping this in
 * one isomorphic file guarantees training-time and inference-time encoding never
 * drift apart.
 *
 * All game numbers are BigInt (exact up to 2^64). Neural network inputs must be
 * plain floats, so every BigInt value is encoded as 8 normalized byte-features
 * (256 buckets per byte) rather than converted directly to Number, which would
 * lose precision above 2^53.
 */

// In the browser, `isPrime` is a global provided by js/game-rules.js (loaded
// earlier in index.html). In Node, each required file has its own scope, so
// resolve it explicitly via require() there instead of relying on a global.
let resolvedIsPrime = typeof isPrime !== 'undefined' ? isPrime : null;
if (!resolvedIsPrime && typeof module !== 'undefined' && module.exports) {
    resolvedIsPrime = require('../game-rules.js').isPrime;
}

const ACTION_SLOTS = 3;
const BYTES_PER_BIGINT = 8; // 64 bits
const BASE_FEATURE_COUNT = 2 * BYTES_PER_BIGINT + 6; // current + start bytes, plus 6 scalar features
const PER_ACTION_FEATURE_COUNT = 2 + BYTES_PER_BIGINT + 1 + BYTES_PER_BIGINT; // isFactor, isMultiplyAdd, value bytes, relative log ratio, result bytes
const FEATURE_SIZE = BASE_FEATURE_COUNT + ACTION_SLOTS * PER_ACTION_FEATURE_COUNT;

/**
 * Splits a BigInt (0 .. 2^64) into 8 normalized byte features (little-endian),
 * each in [0, 1]. Exact - no precision is lost for values that don't fit in a
 * JS Number.
 */
function bigIntToByteFeatures(n) {
    const features = new Array(BYTES_PER_BIGINT);
    let value = BigInt(n);
    for (let i = 0; i < BYTES_PER_BIGINT; i++) {
        features[i] = Number(value & 0xffn) / 255;
        value >>= 8n;
    }
    return features;
}

/** log2(n + 1) normalized to roughly [0, 1] assuming n <= 2^64. */
function logMagnitude(n) {
    const value = BigInt(n);
    if (value <= 0n) return 0;
    // BigInt.toString(2).length is exact and avoids Number overflow for huge n.
    const bitLength = value.toString(2).length;
    return bitLength / 64;
}

/**
 * Encodes a game position plus its (at most 3) available moves into a fixed-size
 * float feature vector, along with a validity mask for the action slots.
 *
 * @param {Object} params
 * @param {bigint} params.currentNumber
 * @param {bigint} params.startNumber
 * @param {number} params.step - moves played so far in the game
 * @param {number} params.maxSteps - configured tie limit
 * @param {Array<{type: string, value: bigint}>} params.moves - up to 3 legal moves
 * @returns {{features: number[], mask: number[]}}
 */
function encodeState(params) {
    const currentNumber = BigInt(params.currentNumber);
    const startNumber = BigInt(params.startNumber);
    const step = params.step || 0;
    const maxSteps = params.maxSteps || 1;
    const moves = params.moves || [];

    const features = [];
    features.push(...bigIntToByteFeatures(currentNumber));
    features.push(...bigIntToByteFeatures(startNumber));
    features.push(logMagnitude(currentNumber));
    features.push(logMagnitude(startNumber));
    features.push(Math.min(1, step / maxSteps));
    features.push(Math.min(1, maxSteps / 100000));
    features.push(Number(currentNumber % 2n === 0n ? 1n : 0n));
    features.push(resolvedIsPrime(currentNumber) ? 1 : 0);

    const mask = new Array(ACTION_SLOTS).fill(0);
    const currentLog = logMagnitude(currentNumber) || 1e-6;

    for (let slot = 0; slot < ACTION_SLOTS; slot++) {
        const move = moves[slot];
        if (move) {
            mask[slot] = 1;
            features.push(move.type === 'factor' ? 1 : 0);
            features.push(move.type === 'multiplyAdd' ? 1 : 0);
            features.push(...bigIntToByteFeatures(move.value));
            features.push(logMagnitude(move.value) / currentLog);
            features.push(...bigIntToByteFeatures(move.value));
        } else {
            features.push(0, 0, ...new Array(BYTES_PER_BIGINT).fill(0), 0, ...new Array(BYTES_PER_BIGINT).fill(0));
        }
    }

    return { features, mask };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ACTION_SLOTS,
        FEATURE_SIZE,
        bigIntToByteFeatures,
        logMagnitude,
        encodeState
    };
}
