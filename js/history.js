/*
 * Load screen rendering: lists the in-progress saved game, completed player
 * games (PvP/PvE), and completed AI battles/training replays. Each list item
 * shows a per-player score badge and opens review mode when clicked.
 */

function formatHistoryTimestamp(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch (e) {
        return iso;
    }
}

function scoreColorClass(score) {
    if (score > 0) return 'text-accent-emerald';
    if (score < 0) return 'text-accent-rose';
    return 'text-slate-300';
}

/** Renders one small badge per player showing their final score for a record. */
function renderScoreBadges(record) {
    return record.players.map((player, idx) => {
        const score = record.scores[idx] || 0;
        const isWinner = record.winnerIndex === idx;
        return `<span class="px-2 py-1 rounded-lg bg-slate-950/60 border ${isWinner ? 'border-accent-emerald/60' : 'border-slate-700'} font-mono text-[11px] ${scoreColorClass(score)}">${score > 0 ? '+' : ''}${score}</span>`;
    }).join('');
}

function renderHistoryList(containerId, storageKey, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const list = getHistoryList(storageKey).slice().reverse(); // newest first
    if (!list.length) {
        container.innerHTML = `<div class="text-slate-500 text-xs text-center py-6 italic">${emptyMessage}</div>`;
        return;
    }
    container.innerHTML = list.map(record => `
        <button onclick="openReview('${storageKey}', '${record.id}')" class="w-full p-4 rounded-xl bg-slate-800/70 border border-slate-700 hover:border-brand-500/70 transition text-left flex items-center justify-between gap-3">
            <div class="min-w-0">
                <div class="flex items-center gap-2 text-sm font-bold text-slate-100 truncate">
                    <span class="px-2 py-0.5 rounded-full bg-slate-900/70 border border-slate-700 text-[10px] uppercase tracking-wider text-slate-400 shrink-0">${record.mode}</span>
                    <span class="truncate">${record.players.map(p => p.name).join(' vs ')}</span>
                </div>
                <div class="text-xs text-slate-500 mt-1 truncate">Start ${record.startNumber} &middot; ${record.totalMoves} moves &middot; ${formatHistoryTimestamp(record.finishedAt)}</div>
            </div>
            <div class="flex gap-1.5 shrink-0">${renderScoreBadges(record)}</div>
        </button>
    `).join('');
}

function renderLoadScreen() {
    const hasSavedGame = !!localStorage.getItem(STORAGE_KEY_SAVED_GAME);
    const continueSection = document.getElementById('load-continue-section');
    if (continueSection) continueSection.classList.toggle('hidden', !hasSavedGame);

    renderHistoryList('load-player-history-list', STORAGE_KEY_PLAYER_HISTORY, 'No completed PvP/PvE games yet.');
    renderHistoryList('load-ai-history-list', STORAGE_KEY_AI_BATTLE_HISTORY, 'No completed AI battles or training replays yet.');
}

function openLoadScreen() {
    showScreen('screen-load');
    renderLoadScreen();
}
