function showScreen(screenId) {
    if (screenId !== 'screen-game' && aiTimeoutId) {
        clearTimeout(aiTimeoutId);
        aiTimeoutId = null;
    }
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
    document.getElementById('quick-actions').classList.toggle('hidden', screenId !== 'screen-game');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function selectGameMode(mode) {
    if (mode === 'PvP') {
        startGame(mode, []);
        return;
    }
    pendingGameMode = mode;
    pendingAiTypes = mode === 'PvE' ? ['random'] : ['random', 'random'];
    renderAiSelection();
    showScreen('screen-ai-select');
}

function renderAiSelection() {
    const container = document.getElementById('ai-select-options');
    const count = pendingGameMode === 'EvE' ? 2 : 1;
    document.getElementById('ai-select-description').innerText = count === 2
        ? 'Choose a strategy for each AI bot.'
        : 'Choose the strategy used by the AI opponent.';
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const options = Object.keys(AI_STRATEGIES).map(type => {
            const strategy = AI_STRATEGIES[type];
            const selected = pendingAiTypes[i] === type ? ' checked' : '';
            return `<option value="${type}"${selected}>${strategy.name}</option>`;
        }).join('');
        container.innerHTML += `
            <label class="block text-sm font-semibold text-slate-300">
                ${count === 2 ? `AI Bot ${i + 1}` : 'AI Opponent'}
                <select data-ai-index="${i}" class="mt-2 w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500">
                    ${options}
                </select>
                <span class="block text-xs text-slate-500 mt-2" id="ai-description-${i}">${getAiStrategy(pendingAiTypes[i]).description}</span>
            </label>`;
    }

    container.querySelectorAll('select').forEach(select => {
        select.onchange = () => {
            const index = parseInt(select.dataset.aiIndex, 10);
            pendingAiTypes[index] = select.value;
            document.getElementById(`ai-description-${index}`).innerText = getAiStrategy(select.value).description;
        };
    });
}

function confirmAiSelection() {
    startGame(pendingGameMode, pendingAiTypes);
}

function setSettingPreset(val) {
    document.getElementById('setting-start-number').value = val;
}

function confirmExitToMenu() {
    if (confirm('Are you sure you want to return to the main menu? Progress might be lost if unsaved.')) {
        showScreen('screen-main-menu');
    }
}

function handleExit() {
    showToast('Close tab or browser to exit game window.', 'info');
}

window.onload = function() {
    loadSavedSettings();
    showScreen('screen-main-menu');
};
