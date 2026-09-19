/*
 * PPO (Proximal Policy Optimization) core: GAE advantage estimation, rollout
 * collection via self-play, and the clipped-objective parameter update.
 * See PLAN.md section 7 for the full design rationale.
 */
const path = require('path');
const nn = require(path.join(__dirname, '..', 'js', 'ai', 'neuralnet.js'));
const { playSelfPlayEpisode } = require('./selfplay');

/** Backward-recursive Generalized Advantage Estimation for one finite trajectory. */
function computeGAE(trajectory, gamma, lambda) {
    const n = trajectory.length;
    const advantages = new Array(n).fill(0);
    let nextValue = 0; // episodes are finite and fully terminate, so no bootstrap beyond the end
    let nextAdvantage = 0;
    for (let t = n - 1; t >= 0; t--) {
        const delta = trajectory[t].reward + gamma * nextValue - trajectory[t].value;
        nextAdvantage = delta + gamma * lambda * nextAdvantage;
        advantages[t] = nextAdvantage;
        nextValue = trajectory[t].value;
    }
    const returns = advantages.map((adv, t) => adv + trajectory[t].value);
    return { advantages, returns };
}

/** Runs self-play episodes with the current network until `rolloutSize` transitions are collected. */
function collectRollout(net, config) {
    const samples = [];
    const episodeStats = [];
    while (samples.length < config.rolloutSize) {
        const startNumber = config.randomStart
            ? config.startNumber + BigInt(Math.floor(Math.random() * config.startRange))
            : config.startNumber;
        const { trajectories, winner, totalSteps } = playSelfPlayEpisode(net, {
            startNumber,
            maxSteps: config.maxSteps
        });
        for (const trajectory of trajectories) {
            if (!trajectory.length) continue;
            const { advantages, returns } = computeGAE(trajectory, config.gamma, config.lambda);
            for (let i = 0; i < trajectory.length; i++) {
                samples.push({
                    features: trajectory[i].features,
                    mask: trajectory[i].mask,
                    action: trajectory[i].action,
                    oldLogProb: trajectory[i].logProb,
                    advantage: advantages[i],
                    returnValue: returns[i]
                });
            }
        }
        episodeStats.push({ winner, totalSteps });
    }
    return { samples, episodeStats };
}

function normalizeAdvantages(samples) {
    const mean = samples.reduce((s, x) => s + x.advantage, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + (x.advantage - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance) || 1e-8;
    for (const sample of samples) sample.advantage = (sample.advantage - mean) / std;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/** Runs `epochs` passes of minibatch PPO updates over the collected rollout samples. */
function ppoUpdate(net, optState, samples, config) {
    normalizeAdvantages(samples);
    let totalLoss = 0;
    let updateCount = 0;

    for (let epoch = 0; epoch < config.epochs; epoch++) {
        shuffle(samples);
        for (let start = 0; start < samples.length; start += config.batchSize) {
            const batch = samples.slice(start, start + config.batchSize);
            const grads = nn.createZeroGradients(net);
            for (const sample of batch) {
                const cache = nn.forwardWithCache(net, sample.features);
                totalLoss += nn.accumulateGradients(net, grads, cache, sample, config);
                updateCount++;
            }
            nn.applyGradients(net, grads, optState, batch.length, config);
        }
    }
    return totalLoss / Math.max(1, updateCount);
}

module.exports = { computeGAE, collectRollout, normalizeAdvantages, ppoUpdate };
