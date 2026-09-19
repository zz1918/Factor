# AI Training (train/)

Trains the "Factor Strike" AI using **PPO (Proximal Policy Optimization)** with
self-play, implemented as a hand-written feedforward neural network in plain
JavaScript (see [`js/ai/neuralnet.js`](../js/ai/neuralnet.js)). No Python and
no ML libraries are required - only Node.js, which is also the runtime the
rest of this project already assumes for tooling.

The trainer reuses the browser game's exact move-generation logic
([`js/game-rules.js`](../js/game-rules.js)) and state/action feature encoding
([`js/ai/features.js`](../js/ai/features.js)), so training never drifts from
real gameplay rules.

## Requirements

- Node.js (any recent version). No `npm install` needed - zero dependencies.

## Running training

```powershell
node train/train.js --iterations 200 --rollout-size 2048 --start-number 1000 --max-steps 100
```

Options (all optional, shown with defaults):

| Flag | Default | Description |
|---|---|---|
| `--iterations` | 200 | Number of PPO training iterations |
| `--rollout-size` | 2048 | Minimum self-play transitions collected per iteration |
| `--start-number` | 1000 | Base starting number for self-play games (randomized per game, see below) |
| `--max-steps` | 100 | Tie limit (matches the in-game "Max Steps" setting) |
| `--eval-every` | 10 | Iterations between evaluations against baseline strategies |
| `--checkpoint-every` | 20 | Iterations between full checkpoint saves |
| `--games-per-baseline` | 20 | Games played per baseline strategy during evaluation |
| `--resume` | (none) | Path to a checkpoint JSON file to resume from |

Each self-play game picks a random starting number near `--start-number` (up to
+1,000,000) so the network generalizes across magnitudes instead of
memorizing one fixed game.

## Outputs

- **`train/checkpoints/checkpoint-<UTC timestamp>-iter-<iteration>.json`** - full training state
  (network weights + Adam optimizer state), written every `--checkpoint-every`
  iterations. Use `--resume` to continue training from one of these.
- **`js/ai/model/model.js`** - the deployed model, automatically overwritten
  whenever a new iteration beats the previous best average evaluation score.
  This file is loaded directly by `index.html` via a normal `<script>` tag, so
  the "Trained Strategy" AI option in the game works offline (no `fetch`,
  no local web server needed).

## Standalone evaluation

```powershell
node train/evaluate-cli.js --model js/ai/model/model.js --games-per-baseline 50
node train/evaluate-cli.js --model train/checkpoints/checkpoint-100.json
```

Plays games against the `random`, `smallest`, and `largest` baseline
strategies from [`js/ai/strategies.js`](../js/ai/strategies.js) and reports
win/loss/tie counts and average score per baseline.

## How it works

1. **Self-play** (`selfplay.js`): the current network plays both sides of a
   game, alternating moves, using `getAvailableMoves()` from the real game
   rules. Each ply is a training sample: encoded state features, the chosen
   action, its log-probability, and the network's value estimate.
2. **Scoring** (matches the live game exactly): a win scores
   `maxSteps - stepsUsed + 1` (faster win = higher score); a loss scores the
   negative of that (faster loss = lower score); a tie (max steps reached)
   scores `0` for both players.
3. **GAE** (`ppo.js`): advantages and returns are computed per-player
   trajectory with Generalized Advantage Estimation (`gamma=0.99`,
   `lambda=0.95`).
4. **PPO update** (`ppo.js` + `js/ai/neuralnet.js`): clipped surrogate policy
   loss + value loss + entropy bonus, optimized with Adam, over several
   epochs of shuffled minibatches.
5. **Evaluation & deployment** (`evaluator.js`, `train.js`): periodically the
   network plays greedily (highest-probability legal move) against the
   baseline strategies; if its average score improves, `js/ai/model/model.js`
   is overwritten so the browser game immediately picks up the better model.

See [`../PLAN.md`](../PLAN.md) section 7 for the full design rationale
(state encoding, network architecture, hyperparameters).
