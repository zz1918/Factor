function updateUI() {
    const numDisplay = document.getElementById('current-number-display');
    numDisplay.classList.add('scale-110');
    numDisplay.innerText = gameState.currentNumber;
    setTimeout(() => numDisplay.classList.remove('scale-110'), 200);

    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    document.getElementById('current-player-name').innerText = activePlayer.name;
    document.getElementById('game-mode-badge').innerText = `${gameState.mode} Mode`;

    const avatar = document.getElementById('player-avatar');
    avatar.className = `w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl font-bold ${activePlayer.color}`;
    avatar.innerHTML = `<i class="fa-solid ${activePlayer.icon}"></i>`;

    renderFactors();
    renderHistory();
}

function renderFactors() {
    const grid = document.getElementById('factors-grid');
    grid.innerHTML = '';

    const factors = getProperFactors(gameState.currentNumber);
    document.getElementById('factor-count').innerText = factors.length;
    const isCurrentAi = gameState.players[gameState.currentPlayerIndex].isAi;

    factors.forEach(factor => {
        const btn = document.createElement('button');
        btn.className = `factor-btn p-4 rounded-xl glass-panel text-center border border-slate-700/80 font-mono font-bold text-lg hover:border-accent-cyan hover:text-accent-cyan transition flex flex-col items-center justify-center ${
            isCurrentAi || gameState.isGameOver ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`;
        btn.innerHTML = `<span class="text-xl text-white">${factor}</span><span class="text-[10px] text-slate-400 font-sans font-normal mt-0.5">-${factor}</span>`;

        if (!isCurrentAi && !gameState.isGameOver) {
            btn.onclick = () => makeMove(factor);
            btn.onmouseenter = () => showPreview(factor);
            btn.onmouseleave = hidePreview;
        }
        grid.appendChild(btn);
    });
}

function showPreview(factor) {
    document.getElementById('preview-calculation').innerText =
        `${gameState.currentNumber} - ${factor} = ${gameState.currentNumber - factor}`;
    document.getElementById('math-preview').classList.remove('opacity-0');
}

function hidePreview() {
    document.getElementById('math-preview').classList.add('opacity-0');
}

function renderHistory() {
    const list = document.getElementById('move-history-list');
    document.getElementById('move-count').innerText = `${gameState.history.length} Moves`;

    if (!gameState.history.length) {
        list.innerHTML = '<div class="text-slate-500 text-xs text-center py-4 italic">Game started. Awaiting first move...</div>';
        return;
    }

    list.innerHTML = gameState.history.map((item, idx) => `
        <div class="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2"><span class="text-slate-500 w-4">#${gameState.history.length - idx}</span><span class="font-bold text-slate-200">${item.player}</span></div>
            <div class="text-slate-400">${item.from} <span class="text-accent-rose">- ${item.factor}</span> = <span class="text-accent-cyan font-bold">${item.to}</span></div>
        </div>
    `).join('');
}

function toggleBotStatus(show, text = '') {
    const botStatus = document.getElementById('bot-status');
    if (show) {
        document.getElementById('bot-status-text').innerText = text;
        botStatus.classList.remove('hidden');
    } else {
        botStatus.classList.add('hidden');
    }
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').innerText = msg;
    document.getElementById('toast-icon').className = type === 'error'
        ? 'fa-solid fa-circle-exclamation text-accent-rose'
        : 'fa-solid fa-circle-info text-accent-cyan';
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}
