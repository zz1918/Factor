# Factor Strike AI Training Plan and Current Process

This document describes the planned AI training direction and the training
workflow currently implemented in Factor Strike.

## 1. Training Goals

The goal is to develop AI policies that choose strong moves from the legal
options shown on each turn. A legal move can be:

- A sampled proper-factor subtraction.
- The `× 3 + 1` move when the current value is an odd composite number and the
  result does not exceed the initial number.

Each turn displays no more than three total choices. An AI must select only
from that displayed set.

The primary optimization target is the game score:

- Fast wins receive larger positive scores.
- Fast losses receive more negative scores.
- Games reaching the maximum step limit are ties, and both players receive `0`.

## 2. Candidate Strategy Plan

### 2.1 Random Strategy

Selects one of the displayed moves uniformly at random.

Purpose:

- Establishes a baseline.
- Provides exploration behavior.
- Helps measure whether other strategies learn anything useful.

### 2.2 Smallest-Factor Strategy

Chooses the smallest available factor move when one exists. If no factor move
is displayed, it chooses the available special move.

Purpose:

- Represents a conservative subtraction policy.
- Provides a deterministic baseline for comparison.

### 2.3 Largest-Factor Strategy

Chooses the largest available factor move when one exists. If no factor move is
displayed, it chooses the available special move.

Purpose:

- Represents an aggressive subtraction policy.
- Provides a second deterministic baseline.

### 2.4 Trained Strategy

Uses the latest deployed neural network. Browser training persists the model in
`localStorage`, while Node.js training writes it to `js/ai/model/model.js`.
If neither model is available, it chooses a random legal move.

## 3. Current Training Process

The current browser training process is implemented in
[`js/ai/training.js`](./js/ai/training.js).

### Step 1: Configure a PPO Run

From the game-mode selection page, choose **Train AI** and set:

- **PPO iterations:** Between `1` and `10,000`.
- **Rollout samples per iteration:** 128, 256, or 512.
- **Starting number:** The current game setting, from `2` through `2^64`.
- **Maximum steps:** The current maximum-step setting, from `1` through `100,000`.

### Step 2: Generate Self-Play Rollouts

The current policy plays both sides. Each turn records its encoded state,
legal-action mask, sampled action, action log-probability, and value estimate.
The game ends at `1` or at the configured tie limit.

### Step 3: Update the Neural Network

For each rollout, the browser:

1. computes GAE advantages and returns;
2. normalizes advantages;
3. runs four PPO epochs of shuffled minibatches;
4. applies Adam updates to the shared policy/value network.

The implementation uses the same BigInt arithmetic, feature encoding, action
masking, and move-generation rules as normal gameplay.

### Step 4: Persist and Export a Checkpoint

The browser saves the trained model under:

```text
factor_strike_trained_model
```

It also saves one complete resumable checkpoint—network weights, Adam state,
iteration, and configuration—under:

```text
factor_strike_ai_training_checkpoint
```

Use **Export Checkpoint** to download this data as a uniquely named JSON file:
`<UTC timestamp>-iter-<iteration>.json`.
Copy each download directly into `train/checkpoints/`; no renaming or merging
is required. Browser storage keeps only the latest full checkpoint to stay
within typical localStorage quotas.

## 4. Planned Improvements

### 4.1 Better Evaluation

- Run every candidate against every baseline for equal comparison.
- Use multiple starting numbers instead of one configured value.
- Record per-opponent scores.
- Track score variance and confidence across runs.

### 4.2 Search-Based Strategies

- One-step lookahead.
- Multi-step minimax search.
- Move ordering based on score potential.
- Endgame lookup tables for small values.

### 4.3 Reinforcement Learning

- Represent the current number, parity, primality, displayed moves, and step
  count as the game state.
- Use score as the reward.
- Train a policy through self-play.
- Penalize losses according to their speed.
- Treat maximum-step ties as zero-reward terminal states.

### 4.4 Learned Model Persistence

- Store model metadata separately from evaluation results.
- Version the model format.
- Preserve the training settings used to produce each model.
- Add import/export for trained profiles.
- Allow the user to select among saved trained models.

## 5. Important Constraints

- Training must never select a move outside the displayed legal move list.
- Numeric calculations must remain exact through `2^64`.
- The `× 3 + 1` move must remain restricted to valid odd composite states and
  must not exceed the initial number.
- A training profile must remain compatible with the runtime AI strategy
  registry.
- Training should be reproducible in future versions by recording random seeds,
  starting values, settings, and opponent schedules.

## 6. Current Status

| Area | Status |
|---|---|
| Random baseline | Implemented |
| Smallest-factor baseline | Implemented |
| Largest-factor baseline | Implemented |
| Train AI page | Implemented |
| Configurable cycle count | Implemented |
| Configurable maximum steps | Implemented |
| Speed-based win/loss scoring | Implemented |
| Zero-score ties | Implemented |
| Persistent training profile | Implemented |
| PPO policy/value network | Implemented |
| Masked categorical action selection | Implemented |
| Self-play rollout collection | Implemented |
| Neural model export and browser runtime | Implemented |
| Genuine learned model | Requires running `node train/train.js` |
| Self-play reinforcement learning | Implemented |
| Model import/export | Implemented (checkpoints + deployed model.js) |

## 7. Neural Network Design

### 7.1 Selected Machine-Learning Method

The planned method is **Proximal Policy Optimization (PPO)** with
self-play and a shared policy/value network.

PPO is selected because:

- The game is a sequential, turn-based decision problem.
- The action space is small but changes every turn.
- The game has delayed rewards: a move may be useful several turns before the
  result is known.
- Self-play can generate training data without requiring a manually labeled
  dataset.
- PPO is generally more stable than directly fitting a value to the noisy
  outcomes of random opponents.

The policy will use **masked categorical action selection**. The network always
outputs three action logits, but unavailable action slots are assigned a large
negative mask before the softmax operation. This guarantees that the AI cannot
select an action that is not displayed by the game.

### 7.2 State Representation

The network input will be a fixed-length feature vector. BigInt values will not
be converted directly to JavaScript `Number` values. Instead, the current
number will be encoded using normalized 64-bit features:

- Eight unsigned 8-bit chunks of the current value.
- Eight unsigned 8-bit chunks of the starting value.
- Log-scaled current-value magnitude.
- Log-scaled starting-value magnitude.
- Current step divided by the maximum-step limit.
- Maximum-step limit normalized to the supported range.
- Current-number parity.
- Current-number primality.
- Whether each displayed action is a factor or `× 3 + 1`.
- For each of the three displayed actions:
  - Factor/value represented as eight normalized 8-bit chunks.
  - Relative value compared with the current number.
  - Resulting number represented as eight normalized 8-bit chunks.

The resulting vector is fixed-size even though the legal move list changes.
Unused action slots are filled with zeros and marked unavailable by the action
mask.

### 7.3 Network Architecture

The first model should be intentionally small:

```text
Input feature vector
  -> Dense(128, ReLU)
  -> Dense(128, ReLU)
  -> Dense(64, ReLU)
  -> Policy head: Dense(3, linear logits)
  -> Value head: Dense(1, linear value estimate)
```

The policy head chooses among the three displayed moves. The value head
estimates the expected final score from the current state. A shared trunk keeps
the model compact and allows the policy and value estimate to learn common
number-game features.

Recommended initial hyperparameters:

- Optimizer: Adam.
- Learning rate: `3e-4`.
- Discount factor (`gamma`): `0.99`.
- GAE parameter (`lambda`): `0.95`.
- PPO clip range: `0.2`.
- Entropy coefficient: `0.01`.
- Value-loss coefficient: `0.5`.
- Hidden-layer activation: ReLU.
- Initial rollout length: 2,048 transitions.
- Mini-batch size: 64.
- PPO update epochs per rollout: 4.

These values are starting points and should be tuned using validation matches.

### 7.4 Action Encoding

The environment exposes exactly three action slots:

```text
action 0: displayed move 0
action 1: displayed move 1
action 2: displayed move 2
```

For each turn:

1. Generate the legal move list with `getAvailableMoves()`.
2. Place the generated moves into the three action slots.
3. Set the mask to `1` for occupied slots and `0` for empty slots.
4. Apply the mask to the policy logits.
5. Sample during training and choose the highest-probability valid action
   during evaluation.

The network therefore learns how to rank the currently available choices, not
how to invent factors or bypass the move-generation rules.

### 7.5 Reward and Score Target

The terminal reward will use the game's score directly:

```text
fast win:  +(maximum steps - steps used + 1)
fast loss: -(maximum steps - steps used + 1)
tie:        0
```

Intermediate moves receive a small time penalty, for example `-0.01`, to
encourage shorter games without overwhelming the terminal score. The terminal
score remains the primary training target.

For self-play, the reward is always from the perspective of the player whose
policy is being updated. When the opponent wins, the candidate receives the
negative score. When the maximum step limit is reached, both perspectives
receive zero terminal reward.

### 7.6 Training Schedule

The planned PPO training loop is:

1. Initialize the policy/value network.
2. Start self-play games from a randomized set of starting values.
3. At each turn, build the fixed-size state vector and legal-action mask.
4. Sample a masked action from the policy.
5. Store state, mask, action, log probability, reward, and value estimate.
6. End the episode at `1` or the maximum-step limit.
7. Compute discounted returns and generalized advantages.
8. Run clipped PPO updates on the collected rollout.
9. Evaluate against Random, Smallest Factor, Largest Factor, and previous
   model checkpoints.
10. Save the best checkpoint based on average score and win rate.

Training should mix self-play with baseline opponents during early iterations
to avoid both agents learning the same weak behavior.

### 7.7 Model Storage and Runtime

**Implementation note:** to avoid requiring a Python environment, training runs
entirely in **Node.js** using a hand-written feedforward network and PPO
implementation in plain JavaScript ([`js/ai/neuralnet.js`](../js/ai/neuralnet.js),
[`train/ppo.js`](../train/ppo.js)) — no PyTorch/JAX, no ONNX conversion, and no
npm dependencies. The same network code is loaded directly by the browser via
a `<script>` tag, so training and inference share one implementation with zero
risk of drift between the two environments.

- Training: `node train/train.js` (see [`train/README.md`](../train/README.md)).
- Export: the trained network's weights are serialized as plain JSON and
  written into [`js/ai/model/model.js`](../js/ai/model/model.js) as
  `let TRAINED_MODEL_DATA = {...}`, loaded via a normal `<script>` tag so it
  works even when the game is opened directly from disk (`file://`), with no
  `fetch()`/CORS concerns and no local web server required.
- Runtime: [`js/ai/strategies.js`](../js/ai/strategies.js)'s `trained` strategy
  reconstructs the network from `TRAINED_MODEL_DATA` (cached after first use)
  and picks the highest-probability legal move via masked softmax + argmax.
- Metadata: `model.js` records `version`, `featureSize`, `actionSlots`,
  `trainedAt`, and the evaluation results (`metadata.perBaseline`,
  `metadata.averageScore`) that made it the new best model.
- Checkpoints (full network + Adam optimizer state, for resuming training)
  are saved under `train/checkpoints/checkpoint-<UTC timestamp>-iter-<iteration>.json`.

The runtime `trained` strategy loads the newest compatible model and falls
back to the saved baseline strategy (or a random move) if no model is
available (i.e. `TRAINED_MODEL_DATA` is still `null`, before any training run).

### 7.8 Evaluation Requirements

A model is eligible for use in the game only after it is evaluated against:

- Random Strategy.
- Smallest-Factor Strategy.
- Largest-Factor Strategy.
- The previous best neural-network checkpoint.

Record at least:

- Average score.
- Win, loss, and tie rates.
- Average steps for wins.
- Average steps for losses.
- Performance by starting-number range.
- Performance by opponent type.

The model should replace the current best model only when its evaluation score
improves without an unacceptable regression in win rate or tie rate.

**Implementation note:** [`train/evaluator.js`](../train/evaluator.js) plays
alternating-first-move games against `random`, `smallest`, and `largest` (from
[`js/ai/strategies.js`](../js/ai/strategies.js)) using greedy move selection,
and reports win/loss/tie counts plus average score per baseline. `train/train.js`
runs this automatically every `--eval-every` iterations and only overwrites
`js/ai/model/model.js` when the average score improves. Use
`node train/evaluate-cli.js --model <path>` to evaluate any saved checkpoint or
the deployed model on demand.

## 8. AI Training Code Layout

| File | Purpose |
|---|---|
| [`js/ai/features.js`](../js/ai/features.js) | Shared (browser + Node) state/action feature encoding |
| [`js/ai/neuralnet.js`](../js/ai/neuralnet.js) | Shared (browser + Node) dense network, forward/backward pass, Adam optimizer |
| [`js/ai/model/model.js`](../js/ai/model/model.js) | Deployed trained model (`TRAINED_MODEL_DATA`), auto-generated |
| [`train/selfplay.js`](../train/selfplay.js) | Self-play episode generator reusing `js/game-rules.js` |
| [`train/ppo.js`](../train/ppo.js) | GAE advantage computation, rollout collection, PPO update |
| [`train/evaluator.js`](../train/evaluator.js) | Evaluation vs. baseline strategies |
| [`train/train.js`](../train/train.js) | CLI training entry point (`node train/train.js`) |
| [`train/evaluate-cli.js`](../train/evaluate-cli.js) | Standalone CLI evaluation of a saved model |
| [`train/deploy-best-checkpoint.js`](../train/deploy-best-checkpoint.js) | Evaluates all saved checkpoints and deploys the highest-scoring policy |
| [`Deploy-Best-Checkpoint.bat`](../Deploy-Best-Checkpoint.bat) | Double-click Windows launcher for checkpoint deployment |
| [`train/README.md`](../train/README.md) | Usage instructions and flag reference |

No Python and no external npm packages are required anywhere in this pipeline.
