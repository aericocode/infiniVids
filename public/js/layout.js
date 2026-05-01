/**
 * InfiniVids - Layout Management
 * Grid layout calculation and video resizing
 */

function applyStackLayout() {
    const container = document.getElementById('videoContainer');
    container.style.gridTemplateColumns = '1fr';
    container.style.gridTemplateRows = '1fr';

    State.videoSlots.forEach((slot, i) => {
        const wrapper = document.getElementById(`videoWrapper-${i}`);
        if (!wrapper) return;
        wrapper.style.gridColumn = '';
        wrapper.style.gridRow = '';
        wrapper.style.gridArea = '1 / 1 / 2 / 2';

        // Force video element to fill viewport (let scaling mode control objectFit)
        const video = document.getElementById(`video-${i}`);
        if (video) {
            video.style.width = '100%';
            video.style.height = '100%';
        }
    });

    applyStackStyles();
}

function exitStackLayout() {
    State.videoSlots.forEach((slot, i) => {
        const wrapper = document.getElementById(`videoWrapper-${i}`);
        if (!wrapper) return;
        wrapper.style.gridArea = '';
        wrapper.style.opacity = '';
        wrapper.style.mixBlendMode = '';
        wrapper.style.zIndex = '';

        const video = document.getElementById(`video-${i}`);
        if (video) {
            video.style.width = '';
            video.style.height = '';
        }
    });
    document.getElementById('videoContainer').style.background = '';
}

function applyStackStyles() {
    // Use any slot that has a wrapper rendered, not just .loaded
    const activeSlots = State.videoSlots
        .map((s, i) => ({ s, i }))
        .filter(x => document.getElementById(`videoWrapper-${x.i}`));

    const n = activeSlots.length || 1;
    const bias = State.stackBias;
    const blend = State.stackBlend || 'plus-lighter';
    const isAdditive = blend === 'plus-lighter' || blend === 'screen' || blend === 'lighten';

    activeSlots.forEach(({ s, i }, stackPos) => {
        // stackPos 0 = bottom, n-1 = top
        const pos = n === 1 ? 0.5 : stackPos / (n - 1);
        let alpha;

        if (isAdditive) {
            // Additive blend: weights sum to ~1 across stack
            // bias > 0 favors top, bias < 0 favors bottom
            const weight = 1 + bias * (2 * pos - 1);
            alpha = (weight / n) * State.stackOpacity;
        } else {
            // Normal blend: each layer must be transparent enough to reveal below
            // 1/(stackPos+1) gives equal visual contribution per layer
            const baseAlpha = 1 / (stackPos + 1);
            const biasAdjust = 1 + bias * (2 * pos - 1);
            alpha = baseAlpha * biasAdjust * State.stackOpacity;
        }

        const wrapper = document.getElementById(`videoWrapper-${i}`);
        if (!wrapper) return;
        wrapper.style.opacity = Math.max(0, Math.min(1, alpha));
        wrapper.style.mixBlendMode = blend;
        wrapper.style.zIndex = stackPos + 1;
        // wrapper.style.background = 'transparent';
    });

    document.getElementById('videoContainer').style.background = '#000';
}

function updateStackBias(value) {
    State.stackBias = parseFloat(value);
    const v = State.stackBias;
    const label = Math.abs(v) < 0.05 ? 'Equal'
        : v > 0 ? `Top +${Math.round(v * 100)}%`
        : `Bot +${Math.round(-v * 100)}%`;
    const el = document.getElementById('stackBiasVal');
    if (el) el.textContent = label;
    if (State.isStacked) applyStackStyles();
}

function updateStackBlend(value) {
    State.stackBlend = value;
    if (State.isStacked) applyStackStyles();
}

function updateStackOpacity(value) {
    State.stackOpacity = parseFloat(value);
    const el = document.getElementById('stackOpacityVal');
    if (el) el.textContent = Math.round(value * 100) + '%';
    if (State.isStacked) applyStackStyles();
}

function recalculateLayout() {
    if (State.isStacked) {
        applyStackLayout();
        return;
    }

    const container = document.getElementById('videoContainer');
    const count = State.videoSlots.length;
    if (count === 0) return;

    const preset = document.getElementById('layoutPreset').value;
    let cols, rows;

    if (preset === 'auto') {
        const rect = container.getBoundingClientRect();
        const aspectRatio = rect.width / rect.height;
        cols = Math.max(1, Math.round(Math.sqrt(count * aspectRatio)));
        rows = Math.max(1, Math.ceil(count / cols));
        while (cols > 1 && (cols - 1) * rows >= count) cols--;
        while (rows > 1 && cols * (rows - 1) >= count) rows--;
    } else {
        [cols, rows] = preset.split('x').map(Number);
    }

    State.gridConfig = { cols, rows };
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    State.videoSlots.forEach((slot, i) => {
        const wrapper = document.getElementById(`videoWrapper-${i}`);
        if (wrapper) {
            wrapper.style.gridColumn = `span ${slot.gridSpan.col}`;
            wrapper.style.gridRow = `span ${slot.gridSpan.row}`;
            wrapper.style.gridArea = '';
        }
    });
}

function applyLayoutPreset() {
    recalculateLayout();
}

// function updateScalingMode() {
//     State.scalingMode = document.getElementById('scalingMode').value;
//     State.videoSlots.forEach((slot, i) => {
//         document.getElementById(`content-${i}`).className = `video-content ${State.scalingMode}`;
//     });
// }



function toggleScalingMode() {
    const next = State.scalingMode === 'native' ? 'fill' : 'native';
    State.scalingMode = next;
    State.videoSlots.forEach((_, i) => {
        const el = document.getElementById(`content-${i}`);
        if (el) el.className = `video-content ${next}`;
    });
    const btn = document.getElementById('scaleToggleBtn');
    if (btn) btn.textContent = next === 'native' ? '⤢ Fit' : '⤡ Fill';
}

function toggleAudioMode() {
    const next = State.audioMode === 'single' ? 'all' : 'single';
    State.audioMode = next;
    // call your existing audio update logic
    if (typeof updateAudioMode === 'function') updateAudioMode();
    const btn = document.getElementById('audioToggleBtn');
    if (btn) btn.textContent = next === 'single' ? '🔉 Single' : '🔊 All';
}

// Resize handling
function startResize(event, index) {
    event.preventDefault();
    event.stopPropagation();

    const wrapper = document.getElementById(`videoWrapper-${index}`);
    const container = document.getElementById('videoContainer');
    const containerRect = container.getBoundingClientRect();

    wrapper.classList.add('resizing');
    State.resizing = {
        index,
        startX: event.clientX,
        startY: event.clientY,
        cellWidth: containerRect.width / State.gridConfig.cols,
        cellHeight: containerRect.height / State.gridConfig.rows
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

function doResize(event) {
    if (!State.resizing) return;

    const deltaX = event.clientX - State.resizing.startX;
    const deltaY = event.clientY - State.resizing.startY;

    const colSpan = Math.max(1, Math.min(State.gridConfig.cols,
        Math.round((State.resizing.cellWidth + deltaX) / State.resizing.cellWidth)));
    const rowSpan = Math.max(1, Math.min(State.gridConfig.rows,
        Math.round((State.resizing.cellHeight + deltaY) / State.resizing.cellHeight)));

    State.videoSlots[State.resizing.index].gridSpan = { col: colSpan, row: rowSpan };

    const wrapper = document.getElementById(`videoWrapper-${State.resizing.index}`);
    wrapper.style.gridColumn = `span ${colSpan}`;
    wrapper.style.gridRow = `span ${rowSpan}`;
}

function stopResize() {
    if (State.resizing) {
        document.getElementById(`videoWrapper-${State.resizing.index}`).classList.remove('resizing');
    }
    State.resizing = null;
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
}

function initResizeHandlers() {
    document.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('resize-handle')) {
            const wrapper = e.target.closest('.video-wrapper');
            if (wrapper) {
                const index = parseInt(wrapper.dataset.index);
                State.videoSlots[index].gridSpan = { col: 1, row: 1 };
                wrapper.style.gridColumn = 'span 1';
                wrapper.style.gridRow = 'span 1';
                showToast('Size reset');
            }
        }
    });
}

/**
 * Compute per-layer opacities for export, mirroring applyStackStyles().
 * Returns array indexed by slot position (0 = bottom of stack).
 * Only includes loaded slots in the calculation.
 */
function computeStackOpacities() {
    const activeSlots = State.videoSlots
        .map((s, i) => ({ s, i }))
        .filter(x => x.s.loaded);

    const n = activeSlots.length;
    if (n === 0) return [];

    const bias = State.stackBias || 0;
    const blend = State.stackBlend || 'plus-lighter';
    const opacity = State.stackOpacity ?? 1;
    const isAdditive = blend === 'plus-lighter' || blend === 'screen' || blend === 'lighten';

    return activeSlots.map(({ s, i }, stackPos) => {
        const pos = n === 1 ? 0.5 : stackPos / (n - 1);
        let alpha;

        if (isAdditive) {
            const weight = 1 + bias * (2 * pos - 1);
            alpha = (weight / n) * opacity;
        } else {
            const baseAlpha = 1 / (stackPos + 1);
            const biasAdjust = 1 + bias * (2 * pos - 1);
            alpha = baseAlpha * biasAdjust * opacity;
        }

        return {
            slotIndex: i,
            stackPos,
            opacity: Math.max(0, Math.min(1, alpha))
        };
    });
}

// Export to global scope
window.applyStackLayout = applyStackLayout;
window.exitStackLayout = exitStackLayout;
window.applyStackStyles = applyStackStyles;
window.updateStackBias = updateStackBias;
window.updateStackBlend = updateStackBlend;
window.updateStackOpacity = updateStackOpacity;
window.recalculateLayout = recalculateLayout;
window.applyLayoutPreset = applyLayoutPreset;
// window.updateScalingMode = updateScalingMode;
window.startResize = startResize;
window.doResize = doResize;
window.stopResize = stopResize;
window.initResizeHandlers = initResizeHandlers;
window.computeStackOpacities = computeStackOpacities;

window.toggleScalingMode = toggleScalingMode;
window.toggleAudioMode = toggleAudioMode;