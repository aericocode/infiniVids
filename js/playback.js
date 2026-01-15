/**
 * InfiniVids - Playback Controls
 * Play, pause, seek, and time synchronization
 */

function togglePlay() {
    State.isPlaying = !State.isPlaying;
    const btn = document.getElementById('playBtn');
    
    if (State.isPlaying) {
        btn.innerHTML = '⏸ Pause';
        if (State.isDesynced) {
            // In desync mode, just play all videos from their current positions
            State.videoSlots.forEach((slot, i) => {
                if (slot.loaded) {
                    const video = document.getElementById(`video-${i}`);
                    video.play().catch(() => {});
                }
            });
        } else {
            setAllVideosTime(State.masterTime);
        }
    } else {
        btn.innerHTML = '▶ Play';
        State.videoSlots.forEach((slot, i) => {
            if (slot.loaded) {
                document.getElementById(`video-${i}`).pause();
            }
        });
    }
}

function seek(seconds) {
    if (State.isDesynced) {
        // In desync mode, seek all videos by the same amount from their current positions
        State.videoSlots.forEach((slot, i) => {
            if (slot.loaded) {
                const video = document.getElementById(`video-${i}`);
                const newTime = Math.max(0, Math.min(slot.duration, video.currentTime + seconds));
                video.currentTime = newTime;
            }
        });
        showToast(`All videos: ${seconds > 0 ? '+' : ''}${seconds}s`);
    } else {
        const newTime = Math.max(0, Math.min(State.duration, State.masterTime + seconds));
        setAllVideosTime(newTime);
    }
}

function seekTo(event) {
    if (State.isDesynced) return; // Disabled in desync mode
    
    const bar = document.getElementById('progressBar');
    const rect = bar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const targetTime = percent * State.duration;
    setAllVideosTime(targetTime);
}

// Individual video seek (for desync mode)
function seekToIndividual(event, index) {
    if (!State.isDesynced) return;
    
    const slot = State.videoSlots[index];
    if (!slot.loaded) return;
    
    const bar = event.currentTarget;
    const rect = bar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const targetTime = percent * slot.duration;
    
    const video = document.getElementById(`video-${index}`);
    video.currentTime = Math.max(0, Math.min(slot.duration, targetTime));
}

// Individual video seek by seconds
function seekIndividual(index, seconds) {
    if (!State.isDesynced) return;
    
    const slot = State.videoSlots[index];
    if (!slot.loaded) return;
    
    const video = document.getElementById(`video-${index}`);
    const newTime = Math.max(0, Math.min(slot.duration, video.currentTime + seconds));
    video.currentTime = newTime;
}

function setAllVideosTime(time) {
    if (State.isDesynced) return; // Don't sync times in desync mode
    
    State.masterTime = time;
    
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            const video = document.getElementById(`video-${i}`);
            const offset = parseFloat(document.getElementById(`offset-${i}`).value) || 0;
            const videoDuration = slot.duration;
            
            if (videoDuration <= 0) return;
            
            let targetTime = time + offset;
            
            // Handle loop wrapping
            if (State.isLooping && targetTime >= videoDuration) {
                targetTime = targetTime % videoDuration;
            } else if (!State.isLooping && targetTime >= videoDuration) {
                targetTime = videoDuration - 0.01;
            }
            
            targetTime = Math.max(0, targetTime);
            video.currentTime = targetTime;
            
            // If we're supposed to be playing, make sure the video plays
            if (State.isPlaying && video.paused) {
                video.play().catch(() => {});
            }
        }
    });
    
    updateProgressDisplay(State.masterTime);
}

function syncAllVideos() {
    if (State.isDesynced) return;
    setAllVideosTime(State.masterTime);
}

function getCurrentTime() {
    return State.masterTime;
}

function updateMasterTimeFromVideos() {
    if (State.isDesynced) return;
    
    let longestIndex = -1;
    let longestDuration = 0;
    
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded && slot.duration > longestDuration) {
            longestDuration = slot.duration;
            longestIndex = i;
        }
    });
    
    if (longestIndex >= 0) {
        const video = document.getElementById(`video-${longestIndex}`);
        const offset = parseFloat(document.getElementById(`offset-${longestIndex}`).value) || 0;
        State.masterTime = video.currentTime - offset;
    }
}

function stepFrame(direction) {
    if (State.isPlaying) togglePlay();
    
    if (State.isDesynced) {
        // Step all videos by one frame
        State.videoSlots.forEach((slot, i) => {
            if (slot.loaded) {
                const video = document.getElementById(`video-${i}`);
                video.currentTime += direction * (1 / 30);
            }
        });
    } else {
        seek(direction * (1 / 30));
    }
    showToast(`Frame ${direction > 0 ? '+1' : '-1'}`);
}

function handleTimeUpdate(index) {
    const slot = State.videoSlots[index];
    if (!slot.loaded) return;
    
    // Always update individual progress bar if it exists
    updateIndividualProgress(index);
    
    if (State.isDesynced) {
        // In desync mode, don't update master time
        return;
    }
    
    let longestIndex = -1;
    let longestDuration = 0;
    
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded && slot.duration > longestDuration) {
            longestDuration = slot.duration;
            longestIndex = i;
        }
    });
    
    if (index === longestIndex) {
        const video = document.getElementById(`video-${index}`);
        const offset = parseFloat(document.getElementById(`offset-${index}`).value) || 0;
        State.masterTime = video.currentTime - offset;
        updateProgressDisplay(State.masterTime);
        
        // Handle looping for shorter videos
        if (State.isLooping) {
            State.videoSlots.forEach((slot, i) => {
                if (slot.loaded && i !== longestIndex) {
                    const otherVideo = document.getElementById(`video-${i}`);
                    const otherOffset = parseFloat(document.getElementById(`offset-${i}`).value) || 0;
                    const otherDuration = slot.duration;
                    
                    if (otherDuration > 0 && otherVideo.ended) {
                        const expectedTime = (State.masterTime + otherOffset) % otherDuration;
                        otherVideo.currentTime = expectedTime;
                        if (State.isPlaying) {
                            otherVideo.play().catch(() => {});
                        }
                    }
                }
            });
        }
    }
}

// Update individual video progress bar
function updateIndividualProgress(index) {
    const slot = State.videoSlots[index];
    if (!slot.loaded) return;
    
    const video = document.getElementById(`video-${index}`);
    const progressFill = document.getElementById(`individualProgressFill-${index}`);
    const timeDisplay = document.getElementById(`individualTime-${index}`);
    
    if (progressFill && timeDisplay) {
        const percent = slot.duration > 0 ? (video.currentTime / slot.duration) * 100 : 0;
        progressFill.style.width = `${Math.min(100, percent)}%`;
        timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(slot.duration)}`;
    }
}

function updateProgressDisplay(time) {
    if (State.isDesynced) return; // Don't update global progress in desync mode
    
    const percent = State.duration > 0 ? (time / State.duration) * 100 : 0;
    document.getElementById('progressFill').style.width = `${Math.min(100, percent)}%`;
    document.getElementById('timeDisplay').textContent = 
        `${formatTime(time)} / ${formatTime(State.duration)}`;
}

function handleEnded(index) {
    const slot = State.videoSlots[index];
    
    if (State.isDesynced) {
        // In desync mode, loop individually if looping is on
        if (State.isLooping && slot.loaded) {
            const video = document.getElementById(`video-${index}`);
            video.currentTime = 0;
            if (State.isPlaying) {
                video.play().catch(() => {});
            }
        }
        return;
    }
    
    if (State.isLooping && slot.loaded) {
        const video = document.getElementById(`video-${index}`);
        const offset = parseFloat(document.getElementById(`offset-${index}`).value) || 0;
        const videoDuration = slot.duration;
        
        if (videoDuration > 0) {
            const expectedTime = (State.masterTime + offset) % videoDuration;
            video.currentTime = expectedTime;
            if (State.isPlaying) {
                video.play().catch(() => {});
            }
        }
    } else if (!State.isLooping) {
        let longestDuration = 0;
        State.videoSlots.forEach(s => {
            if (s.loaded && s.duration > longestDuration) {
                longestDuration = s.duration;
            }
        });
        
        if (State.masterTime >= longestDuration - 0.1) {
            State.isPlaying = false;
            document.getElementById('playBtn').innerHTML = '▶ Play';
        }
    }
}

function updateSpeed() {
    const speed = parseFloat(document.getElementById('playbackSpeed').value);
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            document.getElementById(`video-${i}`).playbackRate = speed;
        }
    });
    showToast(`Speed: ${speed}×`);
}

function toggleLoop() {
    State.isLooping = !State.isLooping;
    document.getElementById('loopBtn').classList.toggle('active', State.isLooping);
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            document.getElementById(`video-${i}`).loop = State.isLooping;
        }
    });
    showToast(`Loop: ${State.isLooping ? 'ON' : 'OFF'}`);
}

function updateDuration() {
    State.duration = 0;
    State.videoSlots.forEach((slot) => {
        if (slot.loaded && slot.duration > State.duration) {
            State.duration = slot.duration;
        }
    });
}

// Toggle desync mode
function toggleDesync() {
    State.isDesynced = !State.isDesynced;
    const btn = document.getElementById('desyncBtn');
    btn.classList.toggle('active', State.isDesynced);
    
    // Update UI
    updateDesyncUI();
    
    if (State.isDesynced) {
        showToast('Desync: ON - Videos play independently');
    } else {
        // Snap all videos to longest duration timeline
        snapToSync();
        showToast('Sync: ON - Videos synchronized');
    }
}

// Update UI elements based on desync mode
function updateDesyncUI() {
    const progressGroup = document.querySelector('.progress-group');
    const offsetInputs = document.querySelectorAll('.overlay-bottom input[type="number"]');
    const offsetDisplays = document.querySelectorAll('.offset-display');
    const offsetLabels = document.querySelectorAll('.overlay-bottom label:first-child');
    
    if (State.isDesynced) {
        // Disable global progress bar
        progressGroup.classList.add('disabled');
        
        // Hide offset controls (not relevant in desync mode)
        offsetInputs.forEach(input => input.closest('.overlay-bottom')?.querySelector('label:first-child')?.parentElement && (input.style.display = 'none'));
        offsetDisplays.forEach(display => display.style.display = 'none');
        
        // Show individual progress bars
        State.videoSlots.forEach((slot, i) => {
            const individualProgress = document.getElementById(`individualProgress-${i}`);
            if (individualProgress) {
                individualProgress.style.display = 'flex';
            }
        });
    } else {
        // Enable global progress bar
        progressGroup.classList.remove('disabled');
        
        // Show offset controls
        offsetInputs.forEach(input => input.style.display = '');
        offsetDisplays.forEach(display => display.style.display = '');
        
        // Hide individual progress bars
        State.videoSlots.forEach((slot, i) => {
            const individualProgress = document.getElementById(`individualProgress-${i}`);
            if (individualProgress) {
                individualProgress.style.display = 'none';
            }
        });
    }
}

// Snap all videos back to sync when leaving desync mode
function snapToSync() {
    // Find the longest video
    let longestDuration = 0;
    State.videoSlots.forEach(slot => {
        if (slot.loaded && slot.duration > longestDuration) {
            longestDuration = slot.duration;
        }
    });
    
    State.duration = longestDuration;
    
    // Use current time of longest video as master time, or 0 if none loaded
    if (longestDuration > 0) {
        let longestIndex = State.videoSlots.findIndex(s => s.loaded && s.duration === longestDuration);
        if (longestIndex >= 0) {
            const video = document.getElementById(`video-${longestIndex}`);
            const offset = parseFloat(document.getElementById(`offset-${longestIndex}`).value) || 0;
            State.masterTime = video.currentTime - offset;
        }
    }
    
    // Sync all videos to master time
    setAllVideosTime(State.masterTime);
    updateProgressDisplay(State.masterTime);
}

// Export to global scope
window.togglePlay = togglePlay;
window.seek = seek;
window.seekTo = seekTo;
window.seekToIndividual = seekToIndividual;
window.seekIndividual = seekIndividual;
window.setAllVideosTime = setAllVideosTime;
window.syncAllVideos = syncAllVideos;
window.getCurrentTime = getCurrentTime;
window.updateMasterTimeFromVideos = updateMasterTimeFromVideos;
window.stepFrame = stepFrame;
window.handleTimeUpdate = handleTimeUpdate;
window.updateIndividualProgress = updateIndividualProgress;
window.updateProgressDisplay = updateProgressDisplay;
window.handleEnded = handleEnded;
window.updateSpeed = updateSpeed;
window.toggleLoop = toggleLoop;
window.updateDuration = updateDuration;
window.toggleDesync = toggleDesync;
window.updateDesyncUI = updateDesyncUI;
window.snapToSync = snapToSync;
