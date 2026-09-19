function saveCurrentGame() {
    if (gameState.isGameOver) {
        showToast('Cannot save a finished game.', 'error');
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY_SAVED_GAME, serializeBigInts(gameState));
        showToast('Game state saved successfully!');
    } catch (e) {
        showToast('Failed to save game state.', 'error');
    }
}

function loadSavedGame() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_SAVED_GAME);
        if (!saved) {
            showToast('No saved game found.', 'error');
            return;
        }
        gameState = JSON.parse(saved, reviveBigInts);
        gameState.startNumber = BigInt(gameState.startNumber);
        gameState.currentNumber = BigInt(gameState.currentNumber);
        gameState.currentChoices = gameState.currentChoices || getAvailableMoves(gameState.currentNumber);
        gameState.aiTypes = gameState.aiTypes || gameState.players.map(player => player.aiType || 'random');
        showScreen('screen-game');
        updateUI();
        checkAndTriggerTurn();
        showToast('Game loaded successfully!');
    } catch (e) {
        showToast('Corrupted save data.', 'error');
    }
}

function loadSavedSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (saved) {
            const parsed = JSON.parse(saved, reviveBigInts);
            if (parsed.startNumber) {
                const value = BigInt(parsed.startNumber);
                if (value > 1n && value <= MAX_START_NUMBER) settings.startNumber = value;
            }
            if (parsed.maxSteps >= 1 && parsed.maxSteps <= 100000) settings.maxSteps = Number(parsed.maxSteps);
        }
    } catch (e) {
        console.warn('Could not read settings from localStorage', e);
    }
    document.getElementById('setting-start-number').value = settings.startNumber;
    document.getElementById('setting-max-steps').value = settings.maxSteps;
    document.getElementById('menu-default-number-display').innerText = settings.startNumber;
}

function saveSettings(event) {
    if (event) event.preventDefault();
    const rawValue = document.getElementById('setting-start-number').value.trim();
    let val;
    try {
        val = BigInt(rawValue);
    } catch (e) {
        val = null;
    }
    if (val === null || val < 2n || val > MAX_START_NUMBER || !/^\d+$/.test(rawValue)) {
        showToast('Please enter a valid integer greater than 1', 'error');
        return;
    }
    settings.startNumber = val;
    const maxSteps = Number.parseInt(document.getElementById('setting-max-steps').value, 10);
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100000) {
        showToast('Please enter a maximum step count from 1 to 100000.', 'error');
        return;
    }
    settings.maxSteps = maxSteps;
    try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, serializeBigInts(settings));
    } catch (e) {
        console.warn('Could not save settings to localStorage', e);
    }
    document.getElementById('menu-default-number-display').innerText = settings.startNumber;
    showToast('Settings saved successfully!');
    showScreen('screen-main-menu');
}

function serializeBigInts(value) {
    return JSON.stringify(value, (key, item) => typeof item === 'bigint' ? `${item}n` : item);
}

function reviveBigInts(key, value) {
    return typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value;
}

/**
 * Reads a capped list of completed-game records from localStorage, newest first.
 * Used for both STORAGE_KEY_PLAYER_HISTORY and STORAGE_KEY_AI_BATTLE_HISTORY.
 */
function getHistoryList(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const list = JSON.parse(raw, reviveBigInts);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        console.warn(`Could not read history from ${storageKey}`, e);
        return [];
    }
}

/** Persists a list of records, keeping only the most recent MAX_STORED_HISTORY_GAMES. */
function saveHistoryList(storageKey, list) {
    const trimmed = list.slice(-MAX_STORED_HISTORY_GAMES);
    try {
        localStorage.setItem(storageKey, serializeBigInts(trimmed));
    } catch (e) {
        console.warn(`Could not save history to ${storageKey}`, e);
    }
    return trimmed;
}

/** Appends one completed-game record to the given history list, trimming to the cap. */
function pushHistoryRecord(storageKey, record) {
    const list = getHistoryList(storageKey);
    list.push(record);
    return saveHistoryList(storageKey, list);
}

function findHistoryRecord(storageKey, recordId) {
    return getHistoryList(storageKey).find(record => record.id === recordId) || null;
}

function generateHistoryId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Builds a review-ready record. `chronologicalMoves` must already be ordered
 * oldest-first (move 1, move 2, ...), each shaped like a game history entry
 * (playerIndex, from, action/factor, to, options, chosenIndex).
 */
function buildCompletedGameRecord(mode, players, startNumber, maxSteps, chronologicalMoves, scores, winnerIndex) {
    return {
        id: generateHistoryId(),
        mode: mode,
        startNumber: startNumber,
        maxSteps: maxSteps,
        players: players.map(player => ({ name: player.name, isAi: !!player.isAi, aiType: player.aiType || null })),
        scores: scores.slice(),
        winnerIndex: winnerIndex,
        totalMoves: chronologicalMoves.length,
        finishedAt: new Date().toISOString(),
        moves: chronologicalMoves.map(entry => ({
            playerIndex: entry.playerIndex,
            from: entry.from,
            action: entry.action || 'factor',
            factor: entry.factor,
            to: entry.to,
            options: entry.options || [],
            chosenIndex: entry.chosenIndex
        }))
    };
}

/** Saves the just-finished gameState into the player or AI battle history list. */
function recordCompletedGame() {
    if (!gameState.history.length) return;
    const record = buildCompletedGameRecord(
        gameState.mode,
        gameState.players,
        gameState.startNumber,
        settings.maxSteps,
        gameState.history.slice().reverse(),
        gameState.scores,
        gameState.winnerIndex
    );
    const storageKey = gameState.mode === 'EvE' ? STORAGE_KEY_AI_BATTLE_HISTORY : STORAGE_KEY_PLAYER_HISTORY;
    pushHistoryRecord(storageKey, record);
}
