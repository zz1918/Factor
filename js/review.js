/*
 * Review mode: animated step-by-step playback of a saved game record, with a
 * number-trend line chart (raw or log scale) that can be scrubbed by clicking.
 */

const REVIEW_CHART_PADDING = 12;

let reviewState = {
    storageKey: null,
    record: null,
    currentIndex: 0,
    playing: false,
    intervalId: null,
    speed: 2,
    logScale: false
};

let reviewChartListenerAttached = false;

function openReview(storageKey, recordId) {
    const record = findHistoryRecord(storageKey, recordId);
    if (!record) {
        showToast('Could not find that game record.', 'error');
        return;
    }
    stopReviewPlayback();
    reviewState.storageKey = storageKey;
    reviewState.record = record;
    reviewState.currentIndex = 0;
    reviewState.playing = false;
    reviewState.logScale = false;
    reviewState.speed = 2;

    document.getElementById('review-log-toggle').innerText = 'Show log(number)';
    document.getElementById('review-speed-slider').value = reviewState.speed;
    document.getElementById('review-speed-label').innerText = `${reviewState.speed} moves/sec`;
    document.getElementById('review-progress-slider').max = record.totalMoves;
    document.getElementById('review-progress-slider').value = 0;
    updateReviewPlayButtonIcon();

    renderReviewHeader();
    attachReviewChartClickHandler();
    showScreen('screen-review');
    renderReviewFrame(false);
}

function renderReviewHeader() {
    const record = reviewState.record;
    document.getElementById('review-title').innerText = `${record.mode} Battle Review`;
    document.getElementById('review-players').innerText = record.players.map(p => p.name).join(' vs ');
    document.getElementById('review-meta').innerText =
        `Start ${record.startNumber} \u00b7 Max steps ${record.maxSteps} \u00b7 ${record.totalMoves} moves \u00b7 ${formatHistoryTimestamp(record.finishedAt)}`;
    document.getElementById('review-score-badges').innerHTML = renderScoreBadges(record);
}

function currentReviewValue(index) {
    const record = reviewState.record;
    if (index <= 0) return record.startNumber;
    return record.moves[index - 1].to;
}

function renderReviewFrame(blink) {
    const record = reviewState.record;
    const index = reviewState.currentIndex;
    const value = currentReviewValue(index);

    document.getElementById('review-current-number').innerText = value.toString();
    document.getElementById('review-progress-slider').value = index;
    document.getElementById('review-step-label').innerText = `${index} / ${record.totalMoves}`;

    const captionEl = document.getElementById('review-move-caption');
    const optionsGrid = document.getElementById('review-options-grid');
    optionsGrid.innerHTML = '';

    if (index === 0) {
        captionEl.innerText = 'Initial number. Press play or step forward to begin.';
    } else {
        const move = record.moves[index - 1];
        const playerName = record.players[move.playerIndex] ? record.players[move.playerIndex].name : `Player ${move.playerIndex + 1}`;
        const actionText = move.action === 'multiplyAdd' ? '\u00d7 3 + 1' : `- ${move.factor}`;
        captionEl.innerText = `Move ${index}/${record.totalMoves}: ${playerName} played ${actionText} \u2192 ${move.to}`;

        move.options.forEach((option, optIndex) => {
            const isChosen = optIndex === move.chosenIndex;
            const box = document.createElement('div');
            box.className = `p-3 rounded-xl border text-center font-mono text-xs sm:text-sm transition ${
                isChosen ? 'border-accent-emerald bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-900/50 text-slate-400'
            }${isChosen && blink ? ' choice-blink' : ''}`;
            box.innerHTML = option.type === 'multiplyAdd'
                ? '<div>&times; 3 + 1</div>'
                : `<div>${option.value}</div><div class="text-[10px] opacity-70">-${option.value}</div>`;
            optionsGrid.appendChild(box);
        });
    }

    drawReviewChart();
}

function updateReviewPlayButtonIcon() {
    const btn = document.getElementById('review-play-button');
    if (!btn) return;
    btn.innerHTML = reviewState.playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

function reviewTick() {
    if (!reviewState.record) return;
    if (reviewState.currentIndex >= reviewState.record.totalMoves) {
        stopReviewPlayback();
        return;
    }
    reviewState.currentIndex++;
    renderReviewFrame(true);
}

function scheduleReviewInterval() {
    if (reviewState.intervalId) clearInterval(reviewState.intervalId);
    reviewState.intervalId = setInterval(reviewTick, 1000 / reviewState.speed);
}

function toggleReviewPlayback() {
    if (reviewState.playing) {
        stopReviewPlayback();
    } else {
        startReviewPlayback();
    }
}

function startReviewPlayback() {
    if (!reviewState.record) return;
    if (reviewState.currentIndex >= reviewState.record.totalMoves) reviewState.currentIndex = 0;
    reviewState.playing = true;
    updateReviewPlayButtonIcon();
    scheduleReviewInterval();
}

function stopReviewPlayback() {
    if (reviewState.intervalId) {
        clearInterval(reviewState.intervalId);
        reviewState.intervalId = null;
    }
    reviewState.playing = false;
    updateReviewPlayButtonIcon();
}

function reviewStepForward() {
    if (!reviewState.record) return;
    stopReviewPlayback();
    if (reviewState.currentIndex < reviewState.record.totalMoves) {
        reviewState.currentIndex++;
        renderReviewFrame(true);
    }
}

function reviewStepBackward() {
    if (!reviewState.record) return;
    stopReviewPlayback();
    if (reviewState.currentIndex > 0) {
        reviewState.currentIndex--;
        renderReviewFrame(false);
    }
}

function scrubReview(value) {
    if (!reviewState.record) return;
    stopReviewPlayback();
    reviewState.currentIndex = Math.max(0, Math.min(reviewState.record.totalMoves, parseInt(value, 10) || 0));
    renderReviewFrame(false);
}

function updateReviewSpeed(value) {
    reviewState.speed = Math.max(0.5, Number(value));
    document.getElementById('review-speed-label').innerText = `${reviewState.speed} moves/sec`;
    if (reviewState.playing) scheduleReviewInterval();
}

function toggleReviewLogScale() {
    reviewState.logScale = !reviewState.logScale;
    document.getElementById('review-log-toggle').innerText = reviewState.logScale ? 'Show raw number' : 'Show log(number)';
    drawReviewChart();
}

/** Number(bigint) loses low-bit precision above 2^53 but stays accurate enough for chart trends. */
function reviewValueSeries() {
    const record = reviewState.record;
    const series = new Array(record.totalMoves + 1);
    series[0] = Number(record.startNumber);
    for (let i = 0; i < record.moves.length; i++) series[i + 1] = Number(record.moves[i].to);
    return reviewState.logScale ? series.map(v => (v > 0 ? Math.log(v) : 0)) : series;
}

function reviewChartGeometry(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const plotWidth = Math.max(1, width - REVIEW_CHART_PADDING * 2);
    const plotHeight = Math.max(1, height - REVIEW_CHART_PADDING * 2);
    return { width, height, plotWidth, plotHeight };
}

function drawReviewChart() {
    const canvas = document.getElementById('review-chart');
    if (!canvas || !reviewState.record) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height, plotWidth, plotHeight } = reviewChartGeometry(canvas);

    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const series = reviewValueSeries();
    const minValue = Math.min(...series);
    const maxValue = Math.max(...series);
    const range = maxValue - minValue || 1;

    const xForIndex = i => REVIEW_CHART_PADDING + (series.length > 1 ? (i / (series.length - 1)) * plotWidth : plotWidth / 2);
    const yForValue = v => REVIEW_CHART_PADDING + plotHeight - ((v - minValue) / range) * plotHeight;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(REVIEW_CHART_PADDING, REVIEW_CHART_PADDING + plotHeight);
    ctx.lineTo(REVIEW_CHART_PADDING + plotWidth, REVIEW_CHART_PADDING + plotHeight);
    ctx.stroke();

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((value, i) => {
        const x = xForIndex(i);
        const y = yForValue(value);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const markerX = xForIndex(reviewState.currentIndex);
    const markerY = yForValue(series[reviewState.currentIndex]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.beginPath();
    ctx.moveTo(markerX, REVIEW_CHART_PADDING);
    ctx.lineTo(markerX, REVIEW_CHART_PADDING + plotHeight);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
    ctx.fill();
}

function attachReviewChartClickHandler() {
    const canvas = document.getElementById('review-chart');
    if (!canvas) return;
    if (!reviewChartListenerAttached) {
        canvas.addEventListener('click', event => {
            if (!reviewState.record) return;
            const rect = canvas.getBoundingClientRect();
            const { plotWidth } = reviewChartGeometry(canvas);
            const clickX = event.clientX - rect.left - REVIEW_CHART_PADDING;
            const fraction = Math.max(0, Math.min(1, clickX / plotWidth));
            const index = Math.round(fraction * reviewState.record.totalMoves);
            stopReviewPlayback();
            reviewState.currentIndex = index;
            renderReviewFrame(false);
        });
        window.addEventListener('resize', () => {
            if (reviewState.record) drawReviewChart();
        });
        reviewChartListenerAttached = true;
    }
}

function reviewGoBack() {
    stopReviewPlayback();
    showScreen('screen-load');
    renderLoadScreen();
}
