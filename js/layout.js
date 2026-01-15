/**
 * InfiniVids - Layout Management
 * Grid layout calculation and video resizing
 */

function recalculateLayout() {
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
        }
    });
}

function applyLayoutPreset() {
    recalculateLayout();
}

function updateScalingMode() {
    State.scalingMode = document.getElementById('scalingMode').value;
    State.videoSlots.forEach((slot, i) => {
        document.getElementById(`content-${i}`).className = `video-content ${State.scalingMode}`;
    });
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

// Export to global scope
window.recalculateLayout = recalculateLayout;
window.applyLayoutPreset = applyLayoutPreset;
window.updateScalingMode = updateScalingMode;
window.startResize = startResize;
window.doResize = doResize;
window.stopResize = stopResize;
window.initResizeHandlers = initResizeHandlers;
