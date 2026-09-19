# AI Strategy Area

This folder is the extension point for AI strategy development and future
training work.

## Current design

- `strategies.js` contains the runtime strategy registry.
- Each strategy exposes a display name, description, and `choose(factors)`
  function.
- Game code calls `chooseAiMove()` and does not need to know how a strategy
  makes its decision.
- Each turn supplies up to three randomly sampled moves from the available
  factors and, when valid for an odd composite value, the `× 3 + 1` move.
- PvE and EvE display an AI selection screen before a match starts.
- The `trained` entry runs the deployed neural model when one is available,
  otherwise it falls back to the saved baseline profile or a random legal move.

Future training scripts, datasets, model artifacts, and evaluation tools can be
added under this folder without coupling them to the game UI or turn engine.

The training screen runs PPO self-play directly in the browser. It persists the
current deployed model and one full, resumable checkpoint (weights plus Adam
optimizer state) in `localStorage`. Use **Export Checkpoint** to download that
checkpoint as JSON. The resulting Trained Strategy can then be selected in PvE
and EvE.
