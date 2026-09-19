const STORAGE_KEY_SETTINGS = 'factor_strike_settings';
const STORAGE_KEY_SAVED_GAME = 'factor_strike_saved_game';
const MAX_START_NUMBER = 2n ** 64n;

let settings = {
    startNumber: 1000n
};

let gameState = {
    mode: 'PvP',
    currentNumber: 1000n,
    startNumber: 1000n,
    currentPlayerIndex: 0,
    players: [],
    history: [],
    isGameOver: false,
    isAiProcessing: false,
    aiTypes: []
};

let pendingGameMode = null;
let pendingAiTypes = [];
let aiTimeoutId = null;
