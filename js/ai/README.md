# AI Strategy Area

This folder is the extension point for AI strategy development and future
training work.

## Current design

- `strategies.js` contains the runtime strategy registry.
- Each strategy exposes a display name, description, and `choose(factors)`
  function.
- Game code calls `chooseAiFactor()` and does not need to know how a strategy
  makes its decision.
- PvE and EvE display an AI selection screen before a match starts.
- The `trained` entry is reserved for a future trained strategy and currently
  falls back to a random legal move.

Future training scripts, datasets, model artifacts, and evaluation tools can be
added under this folder without coupling them to the game UI or turn engine.
