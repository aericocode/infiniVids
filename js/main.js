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

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
