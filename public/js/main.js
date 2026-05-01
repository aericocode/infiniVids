/**
 * InfiniVids - Main Initialization
 * Application entry point
 */

function init() {
    const count = parseInt(document.getElementById('videoCount').value);
    State.videoSlots = [];
    
    // Apply initial master volume from slider (browser may remember previous value)
    updateMasterVolume();
    
    for (let i = 0; i < count; i++) {
        addVideoSlot();
    }
    
    updateAudioIndicators();
    recalculateLayout();
    
    // Setup event listeners
    window.addEventListener('resize', recalculateLayout);
    setupGlobalDragHandlers();
    initResizeHandlers();
    initKeyboardShortcuts();
    
    console.log('InfiniVids initialized');
}

function resetBeatBarLayout() {
    if (!BeatBarState.enabled || BeatBarState.activeSlot < 0) return;
    // Re-attach to current target (handles stack ↔ grid swap) and force canvas resize
    attachOverlayToSlot(BeatBarState.activeSlot);
    // Force a fresh DPR transform — clear existing then re-measure
    if (BeatBarState.canvas) {
        BeatBarState.canvas.width = 0;
        BeatBarState.canvas.height = 0;
    }
    requestAnimationFrame(resizeBeatCanvas);
}

function toggleStack() {
    State.isStacked = !State.isStacked;
    const btn       = document.getElementById('stackBtn');
    const controls  = document.getElementById('stackControls');
    const exportBtn = document.getElementById('exportBtn');

    if (typeof resetBeatBarLayout === 'function') {
        requestAnimationFrame(resetBeatBarLayout);
    }

    if (State.isStacked) {
        btn.classList.add('active');
        controls.style.display = 'flex';
        if (exportBtn) exportBtn.style.display = '';
        document.body.classList.add('stack-mode');
        applyStackLayout();
        showToast('Stack mode ON');
    } else {
        btn.classList.remove('active');
        controls.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
        document.body.classList.remove('stack-mode');
        exitStackLayout();
        recalculateLayout();
        showToast('Stack mode OFF');
    }
}


// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', init);

window.toggleStack = toggleStack;
window.resetBeatBarLayout = resetBeatBarLayout;
