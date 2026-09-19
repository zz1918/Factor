/*
 * Standalone CLI to evaluate a saved model (checkpoint JSON or the deployed
 * js/ai/model/model.js) against the baseline strategies, without training.
 *
 * Usage:
 *   node train/evaluate-cli.js --model train/checkpoints/checkpoint-100.json
 *   node train/evaluate-cli.js --model js/ai/model/model.js --games-per-baseline 50
 */
const fs = require('fs');
const path = require('path');
const nn = require(path.join(__dirname, '..', 'js', 'ai', 'neuralnet.js'));
const { evaluateAgainstBaselines } = require('./evaluator');

function parseArgs(argv) {
    const args = { model: null, startNumber: 1000n, maxSteps: 100, gamesPerBaseline: 20 };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        const value = argv[i + 1];
        switch (key) {
            case '--model': args.model = value; i++; break;
            case '--start-number': args.startNumber = BigInt(value); i++; break;
            case '--max-steps': args.maxSteps = parseInt(value, 10); i++; break;
            case '--games-per-baseline': args.gamesPerBaseline = parseInt(value, 10); i++; break;
            default: break;
        }
    }
    return args;
}

function loadNetwork(modelPath) {
    const resolved = path.resolve(modelPath);
    if (resolved.endsWith('.js')) {
        // js/ai/model/model.js declares `const TRAINED_MODEL_DATA = {...}`.
        const content = fs.readFileSync(resolved, 'utf8');
        const sandbox = {};
        // eslint-disable-next-line no-new-func
        new Function('module', 'exports', content + '\nmodule.exports = TRAINED_MODEL_DATA;')(sandbox, sandbox);
        const data = sandbox.exports;
        if (!data) throw new Error('model.js has no trained model saved yet (TRAINED_MODEL_DATA is null).');
        return nn.networkFromJSON(data.network);
    }
    const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return nn.networkFromJSON(data.net);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.model) {
        console.error('Usage: node train/evaluate-cli.js --model <path to checkpoint .json or model.js>');
        process.exit(1);
    }
    const net = loadNetwork(args.model);
    const result = evaluateAgainstBaselines(net, {
        startNumber: args.startNumber,
        maxSteps: args.maxSteps,
        gamesPerBaseline: args.gamesPerBaseline
    });
    console.log(`Average score across all baselines: ${result.averageScore.toFixed(3)}`);
    console.log(JSON.stringify(result.perBaseline, null, 2));
}

main();
