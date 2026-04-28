/**
 * InfiniVids - Global State
 * Centralized state management for the application
 */

const State = {
    videoSlots: [],
    isPlaying: false,
    isLooping: true,
    isDesynced: false,  // NEW: Desync mode flag
    masterVolume: 1,
    audioMode: 'single',
    activeAudioSlot: 0,
    scalingMode: 'native',
    duration: 0,
    overlayTimeouts: {},
    gridConfig: { cols: 2, rows: 2 },
    dragCounter: 0,
    masterTime: 0,
    resizing: null,
    isStacked: false,
    stackBlend: 'normal',
    stackOpacity: 1.0,
    stackBias: -0.7,
    stackBlend: 'plus-lighter',
};

// Make state globally accessible
window.State = State;
