function scoreTrainingResult(won, steps) {
    const score = settings.maxSteps - steps + 1;
    return won ? score : -score;
}

function startGame(mode, aiTypes = pendingAiTypes) {
    gameState.mode = mode;
    gameState.startNumber = settings.startNumber;
    gameState.currentNumber = settings.startNumber;
    gameState.currentPlayerIndex = 0;
    gameState.history = [];
    gameState.currentChoices = [];
    gameState.isGameOver = false;
    gameState.isAiProcessing = false;
    gameState.winnerIndex = null;
    gameState.currentChoices = getAvailableMoves(gameState.currentNumber);
    gameState.scores = [0, 0];
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

function makeMove(move) {
    if (gameState.isGameOver) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (gameState.isAiProcessing && !activePlayer.isAi) return;

    const prevNumber = gameState.currentNumber;
    const selectedMove = typeof move === 'object' ? move : { type: 'factor', value: BigInt(move) };
    const isAvailable = gameState.currentChoices.some(choice =>
        choice.type === selectedMove.type && choice.value === BigInt(selectedMove.value)
    );
    if (!isAvailable) {
        showToast('Invalid move: Choose one of the displayed options.', 'error');
        return;
    }

    const newNumber = selectedMove.type === 'multiplyAdd'
        ? prevNumber * 3n + 1n
        : prevNumber - BigInt(selectedMove.value);
    if (newNumber > MAX_START_NUMBER) {
        showToast('Invalid move: Value cannot exceed 2^64.', 'error');
        return;
    }
    const chosenIndex = gameState.currentChoices.findIndex(choice =>
        choice.type === selectedMove.type && choice.value === BigInt(selectedMove.value)
    );
    const historyEntry = selectedMove.type === 'multiplyAdd'
        ? { player: activePlayer.name, playerIndex: gameState.currentPlayerIndex, from: prevNumber, action: 'multiplyAdd', to: newNumber, options: gameState.currentChoices, chosenIndex: chosenIndex }
        : { player: activePlayer.name, playerIndex: gameState.currentPlayerIndex, from: prevNumber, factor: BigInt(selectedMove.value), to: newNumber, options: gameState.currentChoices, chosenIndex: chosenIndex };

    gameState.history.unshift(historyEntry);
    gameState.currentNumber = newNumber;
    if (newNumber === 1n) {
        gameState.isGameOver = true;
        gameState.winnerIndex = gameState.currentPlayerIndex;
        const score = scoreTrainingResult(true, gameState.history.length);
        gameState.scores[gameState.currentPlayerIndex] = score;
        gameState.scores[(gameState.currentPlayerIndex + 1) % 2] = -score;
        updateUI();
        recordCompletedGame();
        setTimeout(() => handleVictory(activePlayer), 400);
        return;
    }

    if (gameState.history.length >= settings.maxSteps) {
        gameState.isGameOver = true;
        gameState.winnerIndex = null;
        gameState.scores = [0, 0];
        updateUI();
        recordCompletedGame();
        setTimeout(handleTie, 400);
        return;
    }

    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % 2;
    gameState.currentChoices = getAvailableMoves(gameState.currentNumber);
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

    if (!gameState.currentChoices.length) {
        gameState.currentChoices = getAvailableMoves(gameState.currentNumber);
    }
    gameState.isAiProcessing = true;
    toggleBotStatus(true, `${activePlayer.name} is choosing ${getAiStrategy(activePlayer.aiType).name}...`);
    aiTimeoutId = setTimeout(executeAiMove, gameState.mode === 'EvE' ? 900 : 700);
}

function executeAiMove() {
    if (gameState.isGameOver) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const chosenMove = chooseAiMove(activePlayer.aiType, gameState.currentChoices);
    if (chosenMove === null) return;
    gameState.isAiProcessing = false;
    makeMove(chosenMove);
}

function handleVictory(winner) {
    document.getElementById('winner-title').innerText = `${winner.name} Wins!`;
    document.getElementById('winner-subtitle').innerText = `Successfully reduced the number to 1 in ${gameState.history.length} moves.`;
    document.getElementById('stat-total-moves').innerText = gameState.history.length;
    document.getElementById('stat-start-num').innerText = gameState.startNumber;
    document.getElementById('stat-score').innerText = gameState.scores[gameState.currentPlayerIndex];
    document.getElementById('modal-game-over').classList.remove('hidden');
}

function handleTie() {
    document.getElementById('winner-title').innerText = 'Tie Game';
    document.getElementById('winner-subtitle').innerText = `The maximum of ${settings.maxSteps} moves was reached. Both players score 0.`;
    document.getElementById('stat-total-moves').innerText = gameState.history.length;
    document.getElementById('stat-start-num').innerText = gameState.startNumber;
    document.getElementById('stat-score').innerText = '0';
    document.getElementById('modal-game-over').classList.remove('hidden');
}
