const BROWSER_CHECKPOINT_INTERVAL = 5;
const BROWSER_PPO_CONFIG = {
    gamma: 0.99,
    lambda: 0.95,
    clipRange: 0.2,
    entropyCoef: 0.01,
    valueCoef: 0.5,
    learningRate: 3e-4,
    epochs: 4,
    batchSize: 64,
    startRange: 1_000_000n
};

let browserTrainingActive = false;
let browserTrainingStopRequested = false;

function padTrainingMoves(moves) {
    const padded = moves.slice(0, ACTION_SLOTS);
    while (padded.length < ACTION_SLOTS) padded.push(null);
    return padded;
}

function playBrowserSelfPlayEpisode(net, config) {
    let currentNumber = config.startNumber;
    let step = 0;
    let playerTurn = 0;
    let winner = null;
    const trajectories = [[], []];

    while (step < config.maxSteps) {
        const rawMoves = getAvailableMoves(currentNumber, config.startNumber);
        if (!rawMoves.length) {
            winner = 1 - playerTurn;
            break;
        }

        const moves = padTrainingMoves(rawMoves);
        const encoded = encodeState({
            currentNumber,
            startNumber: config.startNumber,
            step,
            maxSteps: config.maxSteps,
            moves: rawMoves
        });
        const cache = forwardWithCache(net, encoded.features);
        const probabilities = maskedSoftmax(cache.policyLogits, encoded.mask);
        let action = sampleAction(probabilities);
        if (!encoded.mask[action]) action = argmaxValid(probabilities, encoded.mask);

        trajectories[playerTurn].push({
            features: encoded.features,
            mask: encoded.mask,
            action,
            logProb: Math.log(Math.min(Math.max(probabilities[action], 1e-8), 1)),
            value: cache.value,
            reward: 0
        });

        currentNumber = BigInt(moves[action].value);
        step++;
        if (currentNumber === 1n) {
            winner = playerTurn;
            break;
        }
        playerTurn = 1 - playerTurn;
    }

    for (let player = 0; player < trajectories.length; player++) {
        const trajectory = trajectories[player];
        if (!trajectory.length || winner === null) continue;
        const terminalScore = (winner === player ? 1 : -1) * (config.maxSteps - step + 1);
        for (let index = 0; index < trajectory.length - 1; index++) trajectory[index].reward = -0.01;
        trajectory[trajectory.length - 1].reward = terminalScore;
    }

    return { trajectories, winner, totalSteps: step };
}

function computeBrowserGAE(trajectory, gamma, lambda) {
    const advantages = new Array(trajectory.length);
    let nextValue = 0;
    let nextAdvantage = 0;
    for (let index = trajectory.length - 1; index >= 0; index--) {
        const delta = trajectory[index].reward + gamma * nextValue - trajectory[index].value;
        nextAdvantage = delta + gamma * lambda * nextAdvantage;
        advantages[index] = nextAdvantage;
        nextValue = trajectory[index].value;
    }
    return {
        advantages,
        returns: advantages.map((advantage, index) => advantage + trajectory[index].value)
    };
}

function collectBrowserRollout(net, config) {
    const samples = [];
    let episodes = 0;
    let decisiveGames = 0;

    while (samples.length < config.rolloutSize) {
        const offset = BigInt(Math.floor(Math.random() * Number(config.startRange)));
        const startNumber = config.startNumber + offset <= MAX_START_NUMBER
            ? config.startNumber + offset
            : config.startNumber;
        const episode = playBrowserSelfPlayEpisode(net, { ...config, startNumber });
        episodes++;
        if (episode.winner !== null) decisiveGames++;

        for (const trajectory of episode.trajectories) {
            if (!trajectory.length) continue;
            const { advantages, returns } = computeBrowserGAE(trajectory, config.gamma, config.lambda);
            for (let index = 0; index < trajectory.length; index++) {
                samples.push({
                    features: trajectory[index].features,
                    mask: trajectory[index].mask,
                    action: trajectory[index].action,
                    oldLogProb: trajectory[index].logProb,
                    advantage: advantages[index],
                    returnValue: returns[index]
                });
            }
        }
    }
    return { samples, episodes, decisiveGames };
}

function shuffleTrainingSamples(samples) {
    for (let index = samples.length - 1; index > 0; index--) {
        const target = Math.floor(Math.random() * (index + 1));
        [samples[index], samples[target]] = [samples[target], samples[index]];
    }
}

function updateBrowserPpo(net, optimizerState, samples, config) {
    const mean = samples.reduce((total, sample) => total + sample.advantage, 0) / samples.length;
    const variance = samples.reduce((total, sample) => total + (sample.advantage - mean) ** 2, 0) / samples.length;
    const standardDeviation = Math.sqrt(variance) || 1e-8;
    for (const sample of samples) sample.advantage = (sample.advantage - mean) / standardDeviation;

    let totalLoss = 0;
    let updateCount = 0;
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        shuffleTrainingSamples(samples);
        for (let start = 0; start < samples.length; start += config.batchSize) {
            const batch = samples.slice(start, start + config.batchSize);
            const gradients = createZeroGradients(net);
            for (const sample of batch) {
                totalLoss += accumulateGradients(net, gradients, forwardWithCache(net, sample.features), sample, config);
                updateCount++;
            }
            applyGradients(net, gradients, optimizerState, batch.length, config);
        }
    }
    return totalLoss / Math.max(1, updateCount);
}

function getBrowserTrainingState() {
    const rawCheckpoint = localStorage.getItem(STORAGE_KEY_AI_TRAINING_CHECKPOINT);
    if (rawCheckpoint) {
        try {
            const checkpoint = JSON.parse(rawCheckpoint);
            if (!checkpoint.net || !checkpoint.optState || !Number.isInteger(checkpoint.iteration)) {
                throw new Error('missing network, optimizer state, or iteration');
            }
            return {
                net: networkFromJSON(checkpoint.net),
                optimizerState: checkpoint.optState,
                iteration: checkpoint.iteration
            };
        } catch (error) {
            throw new Error(`The saved browser training checkpoint is invalid: ${error.message}`);
        }
    }

    let deployedModel = TRAINED_MODEL_DATA;
    if ((!deployedModel || !deployedModel.network) && localStorage.getItem(STORAGE_KEY_TRAINED_MODEL)) {
        try {
            deployedModel = JSON.parse(localStorage.getItem(STORAGE_KEY_TRAINED_MODEL));
        } catch (error) {
            throw new Error(`The saved trained model is invalid: ${error.message}`);
        }
    }
    if (deployedModel && deployedModel.network) {
        const net = networkFromJSON(deployedModel.network);
        return {
            net,
            optimizerState: createOptimizerState(net),
            iteration: 0
        };
    }

    const net = createNetwork(FEATURE_SIZE, ACTION_SLOTS);
    return { net, optimizerState: createOptimizerState(net), iteration: 0 };
}

function saveBrowserTrainingState(net, optimizerState, iteration, config) {
    const trainedAt = new Date().toISOString();
    const model = {
        version: 1,
        featureSize: FEATURE_SIZE,
        actionSlots: ACTION_SLOTS,
        trainedAt,
        metadata: {
            source: 'browser-ppo',
            iteration,
            rolloutSize: config.rolloutSize,
            startNumber: config.startNumber.toString(),
            maxSteps: config.maxSteps
        },
        network: networkToJSON(net)
    };
    const checkpoint = {
        version: 1,
        createdAt: trainedAt,
        iteration,
        config: {
            ...config,
            startNumber: config.startNumber.toString(),
            startRange: config.startRange.toString()
        },
        net: model.network,
        optState: optimizerState
    };

    try {
        localStorage.setItem(STORAGE_KEY_TRAINED_MODEL, JSON.stringify(model));
        localStorage.setItem(STORAGE_KEY_AI_TRAINING_CHECKPOINT, JSON.stringify(checkpoint));
    } catch (error) {
        throw new Error(`Could not save the browser training checkpoint: ${error.message}`);
    }
    TRAINED_MODEL_DATA = model;
    cachedTrainedNetwork = null;
    cachedTrainedNetworkSource = null;
    return checkpoint;
}

function setTrainingControls(active) {
    document.getElementById('training-run-button').disabled = active;
    document.getElementById('training-stop-button').disabled = !active;
}

function updateTrainingResult(message, isError) {
    const result = document.getElementById('training-result');
    result.innerHTML = message;
    result.classList.remove('hidden');
    result.classList.toggle('border-rose-500/50', !!isError);
    result.classList.toggle('border-slate-700', !isError);
}

function stopAiTraining() {
    if (browserTrainingActive) {
        browserTrainingStopRequested = true;
        showToast('Training will stop after the current PPO iteration.');
    }
}

function checkpointTimestamp(date) {
    return date.toISOString().replace(/[-:.]/g, '');
}

function exportAiTrainingCheckpoint() {
    const checkpoint = localStorage.getItem(STORAGE_KEY_AI_TRAINING_CHECKPOINT);
    if (!checkpoint) {
        showToast('No browser training checkpoint is available to export.', 'error');
        return;
    }
    let iteration;
    try {
        iteration = JSON.parse(checkpoint).iteration;
        if (!Number.isInteger(iteration)) throw new Error('missing iteration');
    } catch (error) {
        showToast(`Saved browser training checkpoint cannot be exported: ${error.message}`, 'error');
        return;
    }

    const blob = new Blob([checkpoint], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${checkpointTimestamp(new Date())}-iter-${iteration}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Browser training checkpoint exported.');
}

async function runAiTraining() {
    if (browserTrainingActive) return;

    const iterations = Number.parseInt(document.getElementById('training-cycles').value, 10);
    const rolloutSize = Number.parseInt(document.getElementById('training-rollout-size').value, 10);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) {
        showToast('PPO iterations must be between 1 and 10000.', 'error');
        return;
    }
    if (![128, 256, 512].includes(rolloutSize)) {
        showToast('Choose a valid rollout size.', 'error');
        return;
    }

    let trainingState;
    try {
        trainingState = getBrowserTrainingState();
    } catch (error) {
        showToast(error.message, 'error');
        updateTrainingResult(`<strong class="text-rose-300">Training could not start.</strong><br>${error.message}`, true);
        return;
    }

    const config = {
        ...BROWSER_PPO_CONFIG,
        rolloutSize,
        startNumber: settings.startNumber,
        maxSteps: settings.maxSteps
    };
    browserTrainingActive = true;
    browserTrainingStopRequested = false;
    setTrainingControls(true);

    try {
        for (let completed = 0; completed < iterations; completed++) {
            const rollout = collectBrowserRollout(trainingState.net, config);
            const averageLoss = updateBrowserPpo(trainingState.net, trainingState.optimizerState, rollout.samples, config);
            trainingState.iteration++;

            if (trainingState.iteration % BROWSER_CHECKPOINT_INTERVAL === 0 || completed === iterations - 1 || browserTrainingStopRequested) {
                saveBrowserTrainingState(trainingState.net, trainingState.optimizerState, trainingState.iteration, config);
            }

            updateTrainingResult(
                `<strong class="text-accent-emerald">PPO training in progress.</strong><br>` +
                `Iteration ${trainingState.iteration}: ${rollout.samples.length} samples from ${rollout.episodes} self-play games ` +
                `(${rollout.decisiveGames} decisive), average loss ${averageLoss.toFixed(4)}.`
            );
            await new Promise(resolve => setTimeout(resolve, 0));
            if (browserTrainingStopRequested) break;
        }

        const status = browserTrainingStopRequested ? 'stopped' : 'completed';
        updateTrainingResult(
            `<strong class="text-accent-emerald">PPO training ${status}.</strong><br>` +
            `Latest checkpoint: iteration ${trainingState.iteration}. The trained policy is ready in PvE and EvE; export the checkpoint to keep a portable backup.`
        );
        showToast(`PPO training ${status}; checkpoint saved at iteration ${trainingState.iteration}.`);
    } catch (error) {
        console.error('Browser PPO training failed', error);
        updateTrainingResult(`<strong class="text-rose-300">PPO training failed.</strong><br>${error.message}`, true);
        showToast(`PPO training failed: ${error.message}`, 'error');
    } finally {
        browserTrainingActive = false;
        browserTrainingStopRequested = false;
        setTrainingControls(false);
    }
}
