const STORAGE_KEY_SETTINGS = 'factor_strike_settings';
const STORAGE_KEY_SAVED_GAME = 'factor_strike_saved_game';
const STORAGE_KEY_AI_TRAINING_CHECKPOINT = 'factor_strike_ai_training_checkpoint';
const STORAGE_KEY_TRAINED_MODEL = 'factor_strike_trained_model';
const STORAGE_KEY_PLAYER_HISTORY = 'factor_strike_player_history';
const STORAGE_KEY_AI_BATTLE_HISTORY = 'factor_strike_ai_battle_history';
const MAX_STORED_HISTORY_GAMES = 50;
const MAX_START_NUMBER = 2n ** 64n;

let settings = {
    startNumber: 1000n,
    maxSteps: 100
};

let gameState = {
    mode: 'PvP',
    currentNumber: 1000n,
    startNumber: 1000n,
    currentPlayerIndex: 0,
    winnerIndex: null,
    players: [],
    history: [],
    isGameOver: false,
    isAiProcessing: false,
    aiTypes: [],
    currentChoices: [],
    scores: [0, 0]
};

let pendingGameMode = null;
let pendingAiTypes = [];
let aiTimeoutId = null;
