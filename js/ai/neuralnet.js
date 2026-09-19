/*
 * Hand-written feedforward neural network with manual backpropagation, used
 * for both AI training (train/) and in-browser inference (js/ai/strategies.js).
 * No external ML libraries - just plain JS arrays and arithmetic, so the game
 * stays dependency-free and the trainer runs with plain `node train/train.js`.
 *
 * Architecture (see PLAN.md section 7.3):
 *   input -> Dense(128, ReLU) -> Dense(128, ReLU) -> Dense(64, ReLU)
 *         -> policyHead: Dense(numActions)  (logits)
 *         -> valueHead:  Dense(1)           (scalar baseline)
 */

const DEFAULT_HIDDEN_SIZES = [128, 128, 64];

function randn() {
    // Box-Muller transform.
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function zerosMatrix(rows, cols) {
    const m = new Array(rows);
    for (let i = 0; i < rows; i++) m[i] = new Array(cols).fill(0);
    return m;
}

function zerosVector(size) {
    return new Array(size).fill(0);
}

function createDenseLayer(inputSize, outputSize, scale) {
    const W = new Array(outputSize);
    for (let i = 0; i < outputSize; i++) {
        const row = new Array(inputSize);
        for (let j = 0; j < inputSize; j++) row[j] = randn() * scale;
        W[i] = row;
    }
    return { W, b: zerosVector(outputSize) };
}

/** y = W . x + b, where W is (out x in). */
function affine(layer, x) {
    const out = new Array(layer.W.length);
    for (let i = 0; i < layer.W.length; i++) {
        const row = layer.W[i];
        let sum = layer.b[i];
        for (let j = 0; j < row.length; j++) sum += row[j] * x[j];
        out[i] = sum;
    }
    return out;
}

/** W^T . v, i.e. gradient of an affine layer's output w.r.t. its input. */
function affineTranspose(layer, v) {
    const inputSize = layer.W[0].length;
    const out = new Array(inputSize).fill(0);
    for (let i = 0; i < layer.W.length; i++) {
        const row = layer.W[i];
        const vi = v[i];
        if (vi === 0) continue;
        for (let j = 0; j < inputSize; j++) out[j] += row[j] * vi;
    }
    return out;
}

function relu(x) {
    return x.map(v => (v > 0 ? v : 0));
}

function reluGrad(z, upstream) {
    return z.map((v, i) => (v > 0 ? upstream[i] : 0));
}

function createNetwork(inputSize, numActions, hiddenSizes) {
    hiddenSizes = hiddenSizes || DEFAULT_HIDDEN_SIZES;
    const hidden = [];
    let prevSize = inputSize;
    for (const size of hiddenSizes) {
        hidden.push(createDenseLayer(prevSize, size, Math.sqrt(2 / prevSize))); // He init for ReLU
        prevSize = size;
    }
    return {
        inputSize,
        numActions,
        hiddenSizes: hiddenSizes.slice(),
        hidden,
        policyHead: createDenseLayer(prevSize, numActions, 0.01),
        valueHead: createDenseLayer(prevSize, 1, 0.01)
    };
}

/** Forward pass without caching intermediate values (fast path for inference). */
function forward(net, x) {
    let a = x;
    for (const layer of net.hidden) a = relu(affine(layer, a));
    const policyLogits = affine(net.policyHead, a);
    const value = affine(net.valueHead, a)[0];
    return { policyLogits, value };
}

/** Forward pass caching every layer's pre/post activation, needed for backprop. */
function forwardWithCache(net, x) {
    const zs = [];
    const activations = [x];
    let a = x;
    for (const layer of net.hidden) {
        const z = affine(layer, a);
        a = relu(z);
        zs.push(z);
        activations.push(a);
    }
    const policyLogits = affine(net.policyHead, a);
    const value = affine(net.valueHead, a)[0];
    return { zs, activations, finalHidden: a, policyLogits, value };
}

/** Softmax over logits, forcing masked-out slots to ~0 probability. */
function maskedSoftmax(logits, mask) {
    const maskedLogits = logits.map((l, i) => (mask[i] ? l : -1e9));
    const maxLogit = Math.max(...maskedLogits);
    const exps = maskedLogits.map(l => Math.exp(l - maxLogit));
    const sum = exps.reduce((s, v) => s + v, 0) || 1e-8;
    return exps.map(e => e / sum);
}

function sampleAction(probs) {
    const r = Math.random();
    let cumulative = 0;
    for (let i = 0; i < probs.length; i++) {
        cumulative += probs[i];
        if (r <= cumulative) return i;
    }
    return probs.length - 1;
}

function argmaxValid(probs, mask) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    for (let i = 0; i < probs.length; i++) {
        if (mask[i] && probs[i] > bestValue) {
            bestValue = probs[i];
            bestIndex = i;
        }
    }
    return bestIndex;
}

/**
 * Computes PPO gradients for one transition and accumulates them into `grads`
 * (same shape as the network: hidden[i].W/b, policyHead.W/b, valueHead.W/b).
 * Returns the scalar total loss for logging purposes.
 */
function accumulateGradients(net, grads, cache, sample, config) {
    const { action, mask, advantage, oldLogProb, returnValue } = sample;
    const probs = maskedSoftmax(cache.policyLogits, mask);
    const clampedProbs = probs.map(p => Math.min(Math.max(p, 1e-8), 1));
    const newLogProb = Math.log(clampedProbs[action]);

    const ratio = Math.exp(newLogProb - oldLogProb);
    const clippedRatio = Math.min(Math.max(ratio, 1 - config.clipRange), 1 + config.clipRange);
    const surr1 = ratio * advantage;
    const surr2 = clippedRatio * advantage;
    const useUnclipped = surr1 <= surr2;
    const policyLoss = -Math.min(surr1, surr2);

    let dLogProb;
    if (useUnclipped) {
        dLogProb = -ratio * advantage;
    } else {
        const wasClamped = ratio < 1 - config.clipRange || ratio > 1 + config.clipRange;
        dLogProb = wasClamped ? 0 : -ratio * advantage;
    }

    // Entropy over valid actions only (masked slots contribute ~0 already).
    let entropy = 0;
    for (let i = 0; i < probs.length; i++) {
        if (!mask[i]) continue;
        entropy -= clampedProbs[i] * Math.log(clampedProbs[i]);
    }

    const dLogits = new Array(probs.length).fill(0);
    for (let i = 0; i < probs.length; i++) {
        if (!mask[i]) continue;
        const onehot = i === action ? 1 : 0;
        dLogits[i] += dLogProb * (onehot - clampedProbs[i]);
        // Entropy bonus gradient: d(-entropyCoef * H)/dz_i = entropyCoef * p_i * (log p_i + H)
        dLogits[i] += config.entropyCoef * clampedProbs[i] * (Math.log(clampedProbs[i]) + entropy);
    }

    const valueError = cache.value - returnValue;
    const valueLoss = 0.5 * valueError * valueError;
    const dValue = config.valueCoef * valueError;

    // --- Backprop through heads ---
    const finalHidden = cache.finalHidden;
    for (let i = 0; i < net.policyHead.W.length; i++) {
        const gradRow = grads.policyHead.W[i];
        const dz = dLogits[i];
        if (dz !== 0) for (let j = 0; j < finalHidden.length; j++) gradRow[j] += dz * finalHidden[j];
        grads.policyHead.b[i] += dz;
    }
    for (let j = 0; j < finalHidden.length; j++) grads.valueHead.W[0][j] += dValue * finalHidden[j];
    grads.valueHead.b[0] += dValue;

    let dHidden = affineTranspose(net.policyHead, dLogits);
    const dHiddenFromValue = net.valueHead.W[0].map(w => w * dValue);
    for (let j = 0; j < dHidden.length; j++) dHidden[j] += dHiddenFromValue[j];

    // --- Backprop through hidden layers (reverse order) ---
    for (let layerIndex = net.hidden.length - 1; layerIndex >= 0; layerIndex--) {
        const layer = net.hidden[layerIndex];
        const gradLayer = grads.hidden[layerIndex];
        const z = cache.zs[layerIndex];
        const prevActivation = cache.activations[layerIndex];
        const dz = reluGrad(z, dHidden);

        for (let i = 0; i < layer.W.length; i++) {
            const gradRow = gradLayer.W[i];
            const dzi = dz[i];
            if (dzi !== 0) for (let j = 0; j < prevActivation.length; j++) gradRow[j] += dzi * prevActivation[j];
            gradLayer.b[i] += dzi;
        }
        if (layerIndex > 0) dHidden = affineTranspose(layer, dz);
    }

    return policyLoss + config.valueCoef * valueLoss - config.entropyCoef * entropy;
}

function createZeroGradients(net) {
    return {
        hidden: net.hidden.map(layer => ({ W: zerosMatrix(layer.W.length, layer.W[0].length), b: zerosVector(layer.b.length) })),
        policyHead: { W: zerosMatrix(net.policyHead.W.length, net.policyHead.W[0].length), b: zerosVector(net.policyHead.b.length) },
        valueHead: { W: zerosMatrix(net.valueHead.W.length, net.valueHead.W[0].length), b: zerosVector(net.valueHead.b.length) }
    };
}

function createOptimizerState(net) {
    const makeState = layer => ({
        mW: zerosMatrix(layer.W.length, layer.W[0].length),
        vW: zerosMatrix(layer.W.length, layer.W[0].length),
        mb: zerosVector(layer.b.length),
        vb: zerosVector(layer.b.length)
    });
    return {
        t: 0,
        hidden: net.hidden.map(makeState),
        policyHead: makeState(net.policyHead),
        valueHead: makeState(net.valueHead)
    };
}

function adamUpdateLayer(layer, grad, state, lr, t, beta1, beta2, eps) {
    for (let i = 0; i < layer.W.length; i++) {
        for (let j = 0; j < layer.W[i].length; j++) {
            const g = grad.W[i][j];
            state.mW[i][j] = beta1 * state.mW[i][j] + (1 - beta1) * g;
            state.vW[i][j] = beta2 * state.vW[i][j] + (1 - beta2) * g * g;
            const mHat = state.mW[i][j] / (1 - Math.pow(beta1, t));
            const vHat = state.vW[i][j] / (1 - Math.pow(beta2, t));
            layer.W[i][j] -= lr * mHat / (Math.sqrt(vHat) + eps);
        }
        const gb = grad.b[i];
        state.mb[i] = beta1 * state.mb[i] + (1 - beta1) * gb;
        state.vb[i] = beta2 * state.vb[i] + (1 - beta2) * gb * gb;
        const mHatB = state.mb[i] / (1 - Math.pow(beta1, t));
        const vHatB = state.vb[i] / (1 - Math.pow(beta2, t));
        layer.b[i] -= lr * mHatB / (Math.sqrt(vHatB) + eps);
    }
}

/** Applies an Adam update to every parameter using averaged gradients over a minibatch. */
function applyGradients(net, grads, optState, batchSize, config) {
    const lr = config.learningRate;
    const beta1 = config.beta1 || 0.9;
    const beta2 = config.beta2 || 0.999;
    const eps = config.epsilon || 1e-8;
    optState.t += 1;

    const scaledGrad = layerGrad => ({
        W: layerGrad.W.map(row => row.map(v => v / batchSize)),
        b: layerGrad.b.map(v => v / batchSize)
    });

    for (let i = 0; i < net.hidden.length; i++) {
        adamUpdateLayer(net.hidden[i], scaledGrad(grads.hidden[i]), optState.hidden[i], lr, optState.t, beta1, beta2, eps);
    }
    adamUpdateLayer(net.policyHead, scaledGrad(grads.policyHead), optState.policyHead, lr, optState.t, beta1, beta2, eps);
    adamUpdateLayer(net.valueHead, scaledGrad(grads.valueHead), optState.valueHead, lr, optState.t, beta1, beta2, eps);
}

function cloneNetwork(net) {
    return JSON.parse(JSON.stringify(net));
}

function networkToJSON(net) {
    return {
        inputSize: net.inputSize,
        numActions: net.numActions,
        hiddenSizes: net.hiddenSizes,
        hidden: net.hidden,
        policyHead: net.policyHead,
        valueHead: net.valueHead
    };
}

function networkFromJSON(data) {
    return {
        inputSize: data.inputSize,
        numActions: data.numActions,
        hiddenSizes: data.hiddenSizes,
        hidden: data.hidden,
        policyHead: data.policyHead,
        valueHead: data.valueHead
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createNetwork,
        forward,
        forwardWithCache,
        maskedSoftmax,
        sampleAction,
        argmaxValid,
        accumulateGradients,
        createZeroGradients,
        createOptimizerState,
        applyGradients,
        cloneNetwork,
        networkToJSON,
        networkFromJSON
    };
}
