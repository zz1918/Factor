/*
 * Evaluates every saved checkpoint and deploys the strongest policy to the
 * browser model file used by GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const nn = require(path.join(__dirname, '..', 'js', 'ai', 'neuralnet.js'));
const features = require(path.join(__dirname, '..', 'js', 'ai', 'features.js'));
const { evaluateAgainstBaselines } = require('./evaluator');

const GAMES_PER_BASELINE = 100;
const START_NUMBER = 1000n;
const MAX_STEPS = 100;

function validateNetwork(network, checkpointPath) {
    if (!network || typeof network !== 'object') {
        throw new Error(`${checkpointPath} does not contain a network.`);
    }
    if (network.inputSize !== features.FEATURE_SIZE) {
        throw new Error(`${checkpointPath} has feature size ${network.inputSize}; expected ${features.FEATURE_SIZE}.`);
    }
    if (network.numActions !== features.ACTION_SLOTS) {
        throw new Error(`${checkpointPath} has ${network.numActions} action slots; expected ${features.ACTION_SLOTS}.`);
    }
    if (!Array.isArray(network.hidden) || !network.policyHead || !network.valueHead) {
        throw new Error(`${checkpointPath} has an incomplete network structure.`);
    }
}

function loadCheckpoint(checkpointPath) {
    let checkpoint;
    try {
        checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    } catch (error) {
        throw new Error(`Could not parse ${checkpointPath}: ${error.message}`);
    }

    validateNetwork(checkpoint.net, checkpointPath);
    return {
        checkpoint,
        network: nn.networkFromJSON(checkpoint.net)
    };
}

function getCheckpointPaths(checkpointsDir) {
    if (!fs.existsSync(checkpointsDir)) {
        throw new Error(`Checkpoint directory does not exist: ${checkpointsDir}`);
    }

    const paths = fs.readdirSync(checkpointsDir)
        .filter(fileName => fileName.toLowerCase().endsWith('.json'))
        .sort()
        .map(fileName => path.join(checkpointsDir, fileName));

    if (!paths.length) {
        throw new Error(`No JSON checkpoints were found in ${checkpointsDir}.`);
    }
    return paths;
}

function evaluateCheckpoint(checkpointPath) {
    const { checkpoint, network } = loadCheckpoint(checkpointPath);
    const evaluation = evaluateAgainstBaselines(network, {
        startNumber: START_NUMBER,
        maxSteps: MAX_STEPS,
        gamesPerBaseline: GAMES_PER_BASELINE
    });

    return { checkpointPath, checkpoint, network, evaluation };
}

function saveDeployedModel(candidate, modelPath) {
    const checkpointName = path.basename(candidate.checkpointPath);
    const payload = {
        version: 1,
        featureSize: features.FEATURE_SIZE,
        actionSlots: features.ACTION_SLOTS,
        trainedAt: new Date().toISOString(),
        metadata: {
            source: 'checkpoint-selection',
            checkpoint: path.join('train', 'checkpoints', checkpointName).replace(/\\/g, '/'),
            checkpointIteration: candidate.checkpoint.iteration ?? null,
            evaluation: {
                startNumber: START_NUMBER.toString(),
                maxSteps: MAX_STEPS,
                gamesPerBaseline: GAMES_PER_BASELINE,
                averageScore: candidate.evaluation.averageScore,
                perBaseline: candidate.evaluation.perBaseline
            }
        },
        network: nn.networkToJSON(candidate.network)
    };
    const content = `/*\n * Trained neural network, selected from saved checkpoints by\n * \`node train/deploy-best-checkpoint.js\`. Do not edit by hand.\n */\nlet TRAINED_MODEL_DATA = ${JSON.stringify(payload)};\n`;
    fs.writeFileSync(modelPath, content);
}

function getNextPatchVersion(versionContent) {
    const versionPattern = /^\s*## Version (\d+)\.(\d+)\.(\d+) -/gm;
    let latest = null;
    let match;

    while ((match = versionPattern.exec(versionContent)) !== null) {
        const version = match.slice(1).map(Number);
        if (!latest
            || version[0] > latest[0]
            || (version[0] === latest[0] && version[1] > latest[1])
            || (version[0] === latest[0] && version[1] === latest[1] && version[2] > latest[2])) {
            latest = version;
        }
    }

    if (!latest) {
        throw new Error('VERSION.md does not contain a semantic version heading.');
    }
    return `${latest[0]}.${latest[1]}.${latest[2] + 1}`;
}

function appendDeploymentVersion(candidate, versionPath) {
    const versionContent = fs.readFileSync(versionPath, 'utf8');
    const version = getNextPatchVersion(versionContent);
    const deployedAt = new Date().toISOString();
    const checkpointName = path.basename(candidate.checkpointPath);
    const entry = [
        '',
        `## Version ${version} - Model Deployment`,
        '',
        `- Deployed checkpoint \`${checkpointName}\` after evaluating all saved checkpoints.`,
        `- Evaluation average score: \`${candidate.evaluation.averageScore.toFixed(3)}\` across 100 games each against Random, Smallest Factor, and Largest Factor.`,
        `- Deployment timestamp (UTC): \`${deployedAt}\`.`,
        ''
    ].join('\n');

    fs.writeFileSync(versionPath, `${versionContent.trimEnd()}\n${entry}`);
    return version;
}

function main() {
    const checkpointsDir = path.join(__dirname, 'checkpoints');
    const modelPath = path.join(__dirname, '..', 'js', 'ai', 'model', 'model.js');
    const versionPath = path.join(__dirname, '..', 'VERSION.md');
    const checkpointPaths = getCheckpointPaths(checkpointsDir);
    const candidates = [];

    console.log(`Evaluating ${checkpointPaths.length} checkpoint(s): ${GAMES_PER_BASELINE} games per baseline.`);
    for (const checkpointPath of checkpointPaths) {
        try {
            const candidate = evaluateCheckpoint(checkpointPath);
            candidates.push(candidate);
            console.log(`${path.basename(checkpointPath)}: average score ${candidate.evaluation.averageScore.toFixed(3)}`);
        } catch (error) {
            console.error(`Skipped ${path.basename(checkpointPath)}: ${error.message}`);
        }
    }

    if (!candidates.length) {
        throw new Error('No valid checkpoints could be evaluated; model.js was not changed.');
    }

    candidates.sort((left, right) => right.evaluation.averageScore - left.evaluation.averageScore);
    const best = candidates[0];
    saveDeployedModel(best, modelPath);
    const version = appendDeploymentVersion(best, versionPath);
    console.log(`Deployed ${path.basename(best.checkpointPath)} to ${modelPath}.`);
    console.log(`Best average score: ${best.evaluation.averageScore.toFixed(3)}`);
    console.log(`Created deployment version ${version}.`);
}

try {
    main();
} catch (error) {
    console.error(`Deployment failed: ${error.message}`);
    process.exitCode = 1;
}
