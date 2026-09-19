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

## Version 1.2.0 - Extended Integer Range

### Updates

- Extended the maximum starting value from `1,000,000` to `2^64`
  (`18,446,744,073,709,551,616`).
- Converted game values, factors, arithmetic, factor sorting, and saved numeric
  state to exact JavaScript `BigInt` handling.
- Added 64-bit primality testing and Pollard Rho factorization so large values
  can be factored without relying on unsafe JavaScript `Number` precision.
- Updated settings validation and input controls to accept the complete unsigned
  64-bit range while rejecting invalid or out-of-range values.
