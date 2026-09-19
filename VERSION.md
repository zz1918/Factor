# Factor Strike Game Version Record

This file is the single record of released versions and notable updates for
**Factor Strike**.

## Version 1.0.0 - Initial Game

### Overview

Factor Strike is a number strategy game in which players take turns subtracting
positive proper factors from a current integer. The first player to reduce the
number to **1** wins.

### Game Modes

- **PvP:** Two local human players alternate turns.
- **PvE:** One human player competes against an AI bot.
- **EvE:** Two AI bots play against each other automatically.

### Core Gameplay

- The default starting number is **1,000**.
- Players may choose any factor that is at least `1` and less than the current number.
- The selected factor is subtracted from the current number.
- Turns alternate between the two players.
- The game ends when a move reduces the current number to `1`.
- The AI initially chooses a valid factor randomly.

### Features

- Configurable starting number from `2` to `1,000,000`.
- Quick starting-number presets: `100`, `500`, `1,000`, and `2,500`.
- Available-factor grid with factor count and subtraction previews.
- Active-turn display showing the current player or AI bot.
- Move history showing each subtraction and resulting value.
- Game-over modal with winner, total moves, and starting number.
- Save and load support using browser `localStorage`.
- Restart game and return-to-main-menu controls.
- Toast notifications for saves, invalid actions, loading errors, and settings updates.
- Responsive dark glass-style interface with animated visual feedback.

### Implementation

- Implemented as a self-contained web game in `index.html`.
- Uses Tailwind CSS, Font Awesome, and Google Fonts through CDN resources.
- Game state, settings, factor calculation, turn handling, AI automation, and UI rendering are implemented in client-side JavaScript.

## Version 1.1.0 - Modular Game Structure and AI Selection

### Updates

- Split the monolithic client-side script into focused files under `js/`:
  - `state.js` for shared settings and game state.
  - `game-rules.js` for proper-factor calculations.
  - `game.js` for turns, moves, AI execution, and victory handling.
  - `ui.js` for board rendering and notifications.
  - `storage.js` for local-storage persistence.
  - `app.js` for screen navigation and application setup.
- Added the `js/ai/` area for AI strategies and future training work.
- Added an AI strategy registry with Random, Smallest Factor, Largest Factor,
  and a reserved Trained Strategy entry.
- Added an AI selection screen before PvE and EvE games.
- PvE lets the player choose one AI strategy; EvE lets the player choose a
  strategy independently for each bot.
- Saved games now preserve the selected AI strategies.

## Version 1.3.0 - Limited Move Choices

### Updates

- Each turn now presents at most three randomly sampled proper-factor choices.
- The factor `1` is available only when the current value is prime.
- Added a `× 3 + 1` move to every turn.
- Human and AI players use the same displayed move set.
- Move history and previews now support both subtraction and `× 3 + 1` actions.

## Version 1.3.1 - Bounded Random Move Set

### Updates

- The `× 3 + 1` move is now available only for odd current values.
- The `× 3 + 1` result must not exceed `2^64`.
- The special move is sampled together with factor moves rather than being
  added separately.
- Every turn now displays at most three total selectable moves.

## Version 1.3.2 - Prime Special-Move Restriction

### Updates

- Removed the `× 3 + 1` move for prime current values.
- The special move is now limited to odd composite values whose result remains
  within the `2^64` maximum.

## Version 1.4.0 - AI Training and Scoring Framework

### Updates

- Added a Train AI entry to the game-mode selection page.
- Added a training screen with configurable cycle count and candidate strategy.
- Added documented strategy directions for random, greedy-smallest, greedy-largest,
  and future learned policies.
- Added a persistent baseline training profile under the AI storage contract.
- Added configurable maximum game steps; reaching the limit ends the game as a
  tie and awards both players 0.
- Added speed-based scores: faster wins receive higher positive scores and
  faster losses receive equally weighted negative scores.
- Added live-game score display to the game-over modal.
- Added [PLAN.md](./PLAN.md) to document the AI training
  roadmap and current browser training process.

## Version 1.2.0 - Extended Integer Range

### Updates

- Extended the maximum starting value from `1,000,000` to `2^64`
  (`18,446,744,073,709,551,616`).
- Converted game values, factors, arithmetic, factor sorting, and saved numeric
  state to exact JavaScript `BigInt` handling.
- Added 64-bit primality testing and Pollard Rho factorization so large values
  can be factored without relying on unsafe JavaScript `Number` precision.

## Version 1.5.0 - Node.js PPO AI Training Implementation

### Updates

- Implemented the neural-network AI training pipeline designed in
  [PLAN.md](./PLAN.md) section 7, entirely in **Node.js with no Python and no
  external ML libraries** (hand-written network, forward/backward pass, and
  Adam optimizer).
- Added `js/ai/features.js`: shared browser/Node state and action feature
  encoding (BigInt-safe byte encoding, log magnitudes, parity/primality, and
  per-move features for up to 3 action slots).
- Added `js/ai/neuralnet.js`: a shared browser/Node feedforward network
  (Dense 128 -> 128 -> 64 trunk with policy and value heads), masked softmax
  action selection, PPO gradient computation, and an Adam optimizer.
- Added `train/selfplay.js`, `train/ppo.js`, `train/evaluator.js`: a Node.js
  self-play environment (reusing `js/game-rules.js` move generation exactly),
  Generalized Advantage Estimation, and a clipped-objective PPO update loop.
- Added `train/train.js` (CLI: `node train/train.js`) and
  `train/evaluate-cli.js` for running training and standalone evaluation
  against the Random, Smallest Factor, and Largest Factor baselines.
- Training automatically saves full checkpoints to `train/checkpoints/` and
  overwrites `js/ai/model/model.js` with the new deployed model whenever
  evaluation score improves.
- Updated `js/ai/strategies.js`'s "Trained Strategy" to load and run the
  neural network from `js/ai/model/model.js` (loaded via a normal `<script>`
  tag, so it works even from `file://` with no local server), falling back to
  the existing baseline profile or a random move if no model has been trained
  yet.
- Added `train/README.md` with full usage instructions.
- Updated [PLAN.md](./PLAN.md) to mark the PPO network, masked action
  selection, self-play rollout collection, and model export/runtime as
  implemented, and to document the final Node.js-based (rather than
  Python-based) technology stack.

## Version 1.6.0 - Browser PPO Training

### Updates

- Replaced the browser baseline tournament with real PPO self-play training.
- Added browser-local persistence for the deployed neural model and one
  resumable checkpoint containing weights, Adam optimizer state, configuration,
  and iteration.
- Added checkpoint export as a portable JSON download.
- Added responsive training controls, including stop-after-current-iteration,
  and made the newly trained model immediately available to PvE and EvE.
- Updated settings validation and input controls to accept the complete unsigned
  64-bit range while rejecting invalid or out-of-range values.

## Version 1.6.1 - Tutorial Page

- Added a Tutorial page covering legal moves, special moves, win conditions,
  speed-based scoring, and tie rules.

## Version 1.6.2 - `× 3 + 1` Restricts

- Restricted `× 3 + 1` moves so their result cannot exceed the initial number.

## Version 1.6.3 - Model Deployment

- Deployed checkpoint `20260919T195105433Z-iter-1000.json` after evaluating all saved checkpoints.
- Evaluation average score: `11.083` across 100 games each against Random, Smallest Factor, and Largest Factor.
- Deployment timestamp (UTC): `2026-09-19T20:09:47.743Z`.
