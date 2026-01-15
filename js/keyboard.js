/**
 * InfiniVids - Keyboard Shortcuts
 */

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        
        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft': 
                e.preventDefault(); 
                seek(-5); 
                break;
            case 'ArrowRight': 
                e.preventDefault(); 
                seek(5); 
                break;
            case 'ArrowUp':
                e.preventDefault();
                document.getElementById('masterVolume').value = 
                    Math.min(100, parseInt(document.getElementById('masterVolume').value) + 5);
                updateMasterVolume();
                break;
            case 'ArrowDown':
                e.preventDefault();
                document.getElementById('masterVolume').value = 
                    Math.max(0, parseInt(document.getElementById('masterVolume').value) - 5);
                updateMasterVolume();
                break;
            case 'j': 
            case 'J': 
                seek(-10); 
                break;
            case 'l': 
            case 'L': 
                seek(10); 
                break;
            case ',': 
                stepFrame(-1); 
                break;
            case '.': 
                stepFrame(1); 
                break;
            case 'm': 
            case 'M':
                const vol = document.getElementById('masterVolume');
                if (State.masterVolume > 0) {
                    vol.dataset.prevVolume = vol.value;
                    vol.value = 0;
                } else {
                    vol.value = vol.dataset.prevVolume || 100;
                }
                updateMasterVolume();
                showToast(State.masterVolume > 0 ? 'Unmuted' : 'Muted');
                break;
            case 'r': 
            case 'R': 
                toggleLoop(); 
                break;
            case 'd':
            case 'D':
                toggleDesync();
                break;
            case 'f': 
            case 'F': 
                toggleFullscreen(); 
                break;
            case 'Escape':
                document.getElementById('shortcutsModal').classList.remove('visible');
                document.getElementById('infoModal').classList.remove('visible');
                break;
            case '1': case '2': case '3': case '4': case '5':
            case '6': case '7': case '8': case '9':
                const num = parseInt(e.key) - 1;
                if (num < State.videoSlots.length) setActiveAudio(num);
                break;
        }
    });
}

// Export to global scope
window.initKeyboardShortcuts = initKeyboardShortcuts;
