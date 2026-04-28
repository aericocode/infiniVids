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

    updateIndividualProgress(index);

    // Proactive loop in stack mode — native loop is unreliable with blend modes
    if (State.isStacked && State.isLooping && slot.duration > 0) {
        const video = document.getElementById(`video-${index}`);
        // Restart slightly before the true end to avoid the pause gap
        if (video.currentTime >= slot.duration - 0.15) {
            video.currentTime = 0;
            if (State.isPlaying && video.paused) {
                video.play().catch(() => {});
            }
            return;
        }
    }

    if (State.isDesynced) return;
    
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
    const percent = slot.duration > 0 ? (video.currentTime / slot.duration) * 100 : 0;
    const timeStr = `${formatTime(video.currentTime)} / ${formatTime(slot.duration)}`;

    const fill = document.getElementById(`individualProgressFill-${index}`);
    const time = document.getElementById(`individualTime-${index}`);
    if (fill) fill.style.width = `${Math.min(100, percent)}%`;
    if (time) time.textContent = timeStr;

    const stackedFill = document.getElementById(`stackedFill-${index}`);
    const stackedTime = document.getElementById(`stackedTime-${index}`);
    if (stackedFill) stackedFill.style.width = `${Math.min(100, percent)}%`;
    if (stackedTime) stackedTime.textContent = timeStr;
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
    if (!slot.loaded) return;

    if (State.isLooping) {
        const video = document.getElementById(`video-${index}`);

        // Force native loop on, belt-and-suspenders
        video.loop = true;

        // Manual restart regardless of State.isPlaying — if the video ended
        // while we thought we were playing, we want it back. If paused intentionally,
        // the pause call at the end keeps it paused.
        const wasPlaying = State.isPlaying || !video.paused;
        video.currentTime = 0;

        if (wasPlaying) {
            // Double-rAF to let the seek settle before play (Chromium quirk with blend modes)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    video.play().catch(() => {});
                });
            });
        }
        return;
    }

    // Not looping: stop when the longest video ends (sync mode only)
    if (!State.isDesynced) {
        let longestDuration = 0;
        State.videoSlots.forEach(s => {
            if (s.loaded && s.duration > longestDuration) longestDuration = s.duration;
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
    applyLoopAttribute();
    showToast(`Loop: ${State.isLooping ? 'ON' : 'OFF'}`);
}

function applyLoopAttribute() {
    // Native loop works in both sync and desync modes.
    // In sync mode, the longest video drives masterTime, shorter ones loop natively.
    // In desync mode, each video loops independently.
    State.videoSlots.forEach((slot, i) => {
        if (slot.loaded) {
            const video = document.getElementById(`video-${i}`);
            video.loop = State.isLooping;
        }
    });
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

    if (State.isDesynced) {
        progressGroup.classList.add('disabled');
        offsetInputs.forEach(input => input.style.display = 'none');
        offsetDisplays.forEach(display => display.style.display = 'none');

        if (State.isStacked) {
            showStackedProgressBars();
        } else {
            hideStackedProgressBars();
            State.videoSlots.forEach((slot, i) => {
                const p = document.getElementById(`individualProgress-${i}`);
                if (p) p.style.display = 'flex';
            });
        }
    } else {
        progressGroup.classList.remove('disabled');
        offsetInputs.forEach(input => input.style.display = '');
        offsetDisplays.forEach(display => display.style.display = '');
        hideStackedProgressBars();
        State.videoSlots.forEach((slot, i) => {
            const p = document.getElementById(`individualProgress-${i}`);
            if (p) p.style.display = 'none';
        });
    }
}

function showStackedProgressBars() {
    let overlay = document.getElementById('stackedProgressOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'stackedProgressOverlay';
        overlay.style.cssText = `
            position: absolute;
            left: 0; right: 0; 
            bottom: 50%;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: rgba(0, 0, 0, 0.2);
            z-index: 1000;
            pointer-events: none;
        `;
        document.getElementById('videoContainer').appendChild(overlay);
    }

    overlay.innerHTML = '';
    State.videoSlots.forEach((slot, i) => {
        if (!slot.loaded) return;
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            pointer-events: auto;
            color: #fff;
            font-size: 0.75rem;
        `;
        row.innerHTML = `
            <span style="min-width:120px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.9;">
                ${slot.video.dataset?.name || `Video ${i + 1}`}
            </span>
            <div class="progress-bar" id="stackedBar-${i}"
                 style="flex:1;height:8px;cursor:pointer;"
                 onclick="seekToIndividual(event, ${i})">
                <div class="progress-fill" id="stackedFill-${i}" style="width:0%;"></div>
            </div>
            <span id="stackedTime-${i}" style="min-width:90px;text-align:right;font-variant-numeric:tabular-nums;opacity:0.9;">
                00:00 / 00:00
            </span>
        `;
        overlay.appendChild(row);
    });

    initStackActivityTracking();
}

function hideStackedProgressBars() {
    const overlay = document.getElementById('stackedProgressOverlay');
    if (overlay) overlay.remove();
    clearTimeout(_stackActivityTimer);
    const container = document.getElementById('videoContainer');
    if (container) container.style.cursor = '';
}

let _stackActivityTimer = null;

function initStackActivityTracking() {
    const container = document.getElementById('videoContainer');
    if (container.dataset.activityBound) return;
    container.dataset.activityBound = '1';

    const onMove = () => {
        if (!(State.isStacked && State.isDesynced)) return;
        const overlay = document.getElementById('stackedProgressOverlay');
        if (overlay) overlay.style.opacity = '1';
        container.style.cursor = '';

        clearTimeout(_stackActivityTimer);
        _stackActivityTimer = setTimeout(() => {
            if (!(State.isStacked && State.isDesynced)) return;
            const o = document.getElementById('stackedProgressOverlay');
            if (o) o.style.opacity = '0';
            container.style.cursor = 'none';
        }, 2000);
    };

    const onLeave = () => {
        clearTimeout(_stackActivityTimer);
        const overlay = document.getElementById('stackedProgressOverlay');
        if (overlay) overlay.style.opacity = '0';
        container.style.cursor = '';
    };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
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

window.applyLoopAttribute = applyLoopAttribute;

window.showStackedProgressBars = showStackedProgressBars;
window.hideStackedProgressBars = hideStackedProgressBars;

window.initStackActivityTracking = initStackActivityTracking;