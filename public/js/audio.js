/**
 * InfiniVids - Audio Controls
 * Volume, muting, and audio mode management
 */

function updateAudioMode() {
    State.audioMode = document.getElementById('audioMode').value;
    updateAudioIndicators();
    applyAudioSettings();
}

function setActiveAudio(index) {
    if (State.audioMode === 'all') {
        document.getElementById('audioMode').value = 'single';
        State.audioMode = 'single';
    }
    State.activeAudioSlot = index;
    updateAudioIndicators();
    applyAudioSettings();
    showToast(`Audio: Video ${index + 1}`);
}

function updateAudioIndicators() {
    State.videoSlots.forEach((slot, i) => {
        const wrapper = document.getElementById(`videoWrapper-${i}`);
        if (wrapper) {
            wrapper.classList.toggle('audio-active', 
                State.audioMode === 'single' && i === State.activeAudioSlot);
        }
    });
}

function applyAudioSettings() {
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            const video = document.getElementById(`video-${i}`);
            if (State.audioMode === 'single') {
                video.muted = (i !== State.activeAudioSlot) || slot.muted;
                video.volume = i === State.activeAudioSlot ? State.masterVolume * slot.volume : 0;
            } else {
                video.muted = slot.muted;
                video.volume = State.masterVolume * slot.volume;
            }
        }
    });
}

function updateMasterVolume() {
    State.masterVolume = document.getElementById('masterVolume').value / 100;
    document.getElementById('volumeDisplay').textContent = `${Math.round(State.masterVolume * 100)}%`;
    applyAudioSettings();
}

function updateIndividualVolume(index) {
    State.videoSlots[index].volume = document.getElementById(`volume-${index}`).value / 100;
    applyAudioSettings();
}

function toggleMute(index) {
    State.videoSlots[index].muted = !State.videoSlots[index].muted;
    document.getElementById(`muteBtn-${index}`).textContent = State.videoSlots[index].muted ? '🔇' : '🔈';
    applyAudioSettings();
}

// Export to global scope
window.updateAudioMode = updateAudioMode;
window.setActiveAudio = setActiveAudio;
window.updateAudioIndicators = updateAudioIndicators;
window.applyAudioSettings = applyAudioSettings;
window.updateMasterVolume = updateMasterVolume;
window.updateIndividualVolume = updateIndividualVolume;
window.toggleMute = toggleMute;
