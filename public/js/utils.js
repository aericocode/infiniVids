/**
 * InfiniVids - Utility Functions
 */

function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 1500);
}

function showShortcuts() {
    document.getElementById('shortcutsModal').classList.add('visible');
}

function hideShortcuts(event) {
    if (event.target.id === 'shortcutsModal') {
        document.getElementById('shortcutsModal').classList.remove('visible');
    }
}

function showInfo() {
    document.getElementById('infoModal').classList.add('visible');
}

function hideInfo(event) {
    if (event.target.id === 'infoModal' || event.target.classList.contains('modal-close')) {
        document.getElementById('infoModal').classList.remove('visible');
    }
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen();
    }
}

function screenshotAll() {
    let count = 0;
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            const video = document.getElementById(`video-${i}`);
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            const link = document.createElement('a');
            link.download = `video-${i + 1}-screenshot.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            count++;
        }
    });
    if (count) showToast(`${count} screenshot(s) saved`);
}

// Export to global scope
window.formatTime = formatTime;
window.showToast = showToast;
window.showShortcuts = showShortcuts;
window.hideShortcuts = hideShortcuts;
window.showInfo = showInfo;
window.hideInfo = hideInfo;
window.toggleFullscreen = toggleFullscreen;
window.screenshotAll = screenshotAll;
