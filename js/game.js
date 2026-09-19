function startGame(mode, aiTypes = pendingAiTypes) {
    gameState.mode = mode;
    gameState.startNumber = settings.startNumber;
    gameState.currentNumber = settings.startNumber;
    gameState.currentPlayerIndex = 0;
    gameState.history = [];
    gameState.isGameOver = false;
    gameState.isAiProcessing = false;
    gameState.aiTypes = aiTypes.length ? aiTypes : ['random', 'random'];

    if (mode === 'PvP') {
        gameState.players = [
            { name: 'Player 1', isAi: false, color: 'text-brand-500', icon: 'fa-user' },
            { name: 'Player 2', isAi: false, color: 'text-accent-cyan', icon: 'fa-user' }
        ];
    } else if (mode === 'PvE') {
        gameState.players = [
            { name: 'Player', isAi: false, color: 'text-brand-500', icon: 'fa-user' },
            { name: 'AI Bot', isAi: true, aiType: gameState.aiTypes[0], color: 'text-accent-cyan', icon: 'fa-robot' }
        ];
    } else {
        gameState.players = [
            { name: 'AI Bot 1', isAi: true, aiType: gameState.aiTypes[0], color: 'text-accent-amber', icon: 'fa-robot' },
            { name: 'AI Bot 2', isAi: true, aiType: gameState.aiTypes[1], color: 'text-accent-rose', icon: 'fa-robot' }
        ];
    }

    showScreen('screen-game');
    updateUI();
    checkAndTriggerTurn();
}

function restartGame() {
    closeModal('modal-game-over');
    startGame(gameState.mode, gameState.aiTypes);
}

function makeMove(factor) {
    if (gameState.isGameOver) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (gameState.isAiProcessing && !activePlayer.isAi) return;

    const prevNumber = gameState.currentNumber;
    factor = BigInt(factor);
    const newNumber = prevNumber - factor;
    if (newNumber < 1n) {
        showToast('Invalid move: Value cannot drop below 1', 'error');
        return;
    }

    gameState.history.unshift({ player: activePlayer.name, from: prevNumber, factor: factor, to: newNumber });
    gameState.currentNumber = newNumber;
    if (newNumber === 1n) {
        gameState.isGameOver = true;
        updateUI();
        setTimeout(() => handleVictory(activePlayer), 400);
        return;
    }

    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % 2;
    updateUI();
    checkAndTriggerTurn();
}

function checkAndTriggerTurn() {
    if (gameState.isGameOver) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (!activePlayer.isAi) {
        gameState.isAiProcessing = false;
        toggleBotStatus(false);
        return;
    }

    gameState.isAiProcessing = true;
    toggleBotStatus(true, `${activePlayer.name} is choosing ${getAiStrategy(activePlayer.aiType).name}...`);
    aiTimeoutId = setTimeout(executeAiMove, gameState.mode === 'EvE' ? 900 : 700);
}

function executeAiMove() {
    if (gameState.isGameOver) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const chosenFactor = chooseAiFactor(activePlayer.aiType, getProperFactors(gameState.currentNumber));
    if (chosenFactor === null) return;
    gameState.isAiProcessing = false;
    makeMove(chosenFactor);
}

function handleVictory(winner) {
    document.getElementById('winner-title').innerText = `${winner.name} Wins!`;
    document.getElementById('winner-subtitle').innerText = `Successfully reduced the number to 1 in ${gameState.history.length} moves.`;
    document.getElementById('stat-total-moves').innerText = gameState.history.length;
    document.getElementById('stat-start-num').innerText = gameState.startNumber;
    document.getElementById('modal-game-over').classList.remove('hidden');
}
