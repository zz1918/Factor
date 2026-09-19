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
            const parsed = JSON.parse(saved);
            if (parsed.startNumber) {
                const value = BigInt(parsed.startNumber);
                if (value > 1n && value <= MAX_START_NUMBER) settings.startNumber = value;
            }
        }
    } catch (e) {
        console.warn('Could not read settings from localStorage', e);
    }
    document.getElementById('setting-start-number').value = settings.startNumber;
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
