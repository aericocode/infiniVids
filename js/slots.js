/**
 * InfiniVids - Video Slot Management
 * Creating, loading, removing video slots and drag/drop handling
 */

function addVideoSlot() {
    const index = State.videoSlots.length;
    const container = document.getElementById('videoContainer');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `videoWrapper-${index}`;
    wrapper.dataset.index = index;
    wrapper.innerHTML = `
        <div class="video-content ${State.scalingMode}" id="content-${index}">
            <div class="video-placeholder" id="placeholder-${index}" onclick="triggerFileInput(${index})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M10 9l5 3-5 3V9z"/>
                </svg>
                <span>Drop video or click 📁</span>
            </div>
            <video id="video-${index}" style="display:none;"
                   ontimeupdate="handleTimeUpdate(${index})"
                   onloadedmetadata="handleMetadata(${index})"
                   onended="handleEnded(${index})"></video>
        </div>
        <div class="video-overlay" id="overlay-${index}"
             onmouseenter="showOverlay(${index})"
             onmousemove="showOverlay(${index})"
             onmouseleave="scheduleHideOverlay(${index})">
            <div class="overlay-top">
                <span class="video-label" id="label-${index}">Video ${index + 1}</span>
                <div class="overlay-buttons">
                    <button onclick="enterVideoFullscreen(${index}); event.stopPropagation();" title="Fullscreen">⛶</button>
                    <button onclick="setActiveAudio(${index}); event.stopPropagation();" title="Set audio source">🔊</button>
                    <button onclick="toggleMute(${index}); event.stopPropagation();" id="muteBtn-${index}" title="Mute">🔈</button>
                    <button onclick="triggerFileInput(${index}); event.stopPropagation();" title="Load">📁</button>
                    <button onclick="removeVideo(${index}); event.stopPropagation();" title="Clear">✕</button>
                </div>
            </div>
            
            <!-- Individual Progress Bar (for desync mode) -->
            <div class="individual-progress" id="individualProgress-${index}" style="display: none;">
                <span class="individual-time" id="individualTime-${index}">00:00 / 00:00</span>
                <div class="individual-progress-bar" onclick="seekToIndividual(event, ${index}); event.stopPropagation();">
                    <div class="individual-progress-fill" id="individualProgressFill-${index}"></div>
                </div>
                <div class="individual-seek-buttons">
                    <button onclick="seekIndividual(${index}, -5); event.stopPropagation();" title="-5s">-5</button>
                    <button onclick="seekIndividual(${index}, 5); event.stopPropagation();" title="+5s">+5</button>
                </div>
            </div>
            
            <div class="overlay-bottom">
                <label>Offset:</label>
                <input type="number" id="offset-${index}" value="0" step="0.1" 
                       onchange="updateOffset(${index})" 
                       onclick="event.stopPropagation()"
                       title="Sync offset (+ ahead, - behind)">
                <span class="offset-display" id="offsetDisplay-${index}">in sync</span>
                <label>Vol:</label>
                <input type="range" id="volume-${index}" min="0" max="100" value="100"
                       oninput="updateIndividualVolume(${index})"
                       onclick="event.stopPropagation()">
            </div>
        </div>
        <div class="resize-handle" id="resize-${index}"
             onmousedown="startResize(event, ${index})" style="display:none !important;"></div>
        <input type="file" class="file-input" id="fileInput-${index}" 
               accept="video/*" multiple onchange="handleFileInputChange(${index}, this.files)">
    `;
    
    // Add drag handlers to the wrapper
    wrapper.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.add('drag-over');
    });
    
    wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        wrapper.classList.add('drag-over');
    });
    
    wrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!wrapper.contains(e.relatedTarget)) {
            wrapper.classList.remove('drag-over');
        }
    });
    
    wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.remove('drag-over');
        document.body.classList.remove('dragging-file');
        State.dragCounter = 0;
        
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
        if (files.length > 0) {
            // Load first video into this slot, distribute rest to available slots
            loadMultipleVideos(files, index);
        }
    });
    
    container.appendChild(wrapper);
    
    State.videoSlots.push({
        index,
        video: null,
        loaded: false,
        offset: 0,
        volume: 1,
        muted: false,
        gridSpan: { col: 1, row: 1 },
        duration: 0
    });
    
    document.getElementById('videoCount').value = State.videoSlots.length;
    recalculateLayout();
    
    // Update desync UI for new slot
    if (State.isDesynced) {
        const individualProgress = document.getElementById(`individualProgress-${index}`);
        if (individualProgress) {
            individualProgress.style.display = 'flex';
        }
    }
    
    return index;
}

/**
 * Load multiple videos into slots, starting at preferredStartIndex
 * - First video always goes to preferredStartIndex (replacing if occupied)
 * - Remaining videos go to empty slots first
 * - Only create new slots if no empty slots remain
 */
function loadMultipleVideos(files, preferredStartIndex = null) {
    if (!files || files.length === 0) return;
    
    const videoFiles = Array.isArray(files) ? files : Array.from(files);
    let loadedCount = 0;
    
    for (const file of videoFiles) {
        let targetIndex = -1;
        
        // First file always goes to the preferred slot (replacing existing)
        if (loadedCount === 0 && preferredStartIndex !== null) {
            targetIndex = preferredStartIndex;
        }
        
        // For subsequent files, find first available empty slot
        if (targetIndex === -1) {
            targetIndex = State.videoSlots.findIndex(slot => !slot.loaded);
        }
        
        // If no empty slots, add a new one
        if (targetIndex === -1) {
            targetIndex = addVideoSlot();
        }
        
        // Load the video
        loadVideo(targetIndex, file);
        loadedCount++;
    }
    
    if (loadedCount > 1) {
        showToast(`Loaded ${loadedCount} videos`);
    }
}

/**
 * Handle file input change (supports multiple files)
 */
function handleFileInputChange(index, files) {
    if (!files || files.length === 0) return;
    
    const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
    if (videoFiles.length === 0) return;
    
    if (videoFiles.length === 1) {
        // Single file - load directly into this slot
        loadVideo(index, videoFiles[0]);
    } else {
        // Multiple files - use multi-load logic
        loadMultipleVideos(videoFiles, index);
    }
    
    // Reset the input so the same files can be selected again
    document.getElementById(`fileInput-${index}`).value = '';
}

function showOverlay(index) {
    const overlay = document.getElementById(`overlay-${index}`);
    overlay.classList.add('visible');
    if (State.overlayTimeouts[index]) clearTimeout(State.overlayTimeouts[index]);
}

function scheduleHideOverlay(index) {
    State.overlayTimeouts[index] = setTimeout(() => {
        document.getElementById(`overlay-${index}`).classList.remove('visible');
    }, 2500);
}

function updateVideoCount() {
    const newCount = parseInt(document.getElementById('videoCount').value);
    const currentCount = State.videoSlots.length;
    
    if (newCount > currentCount) {
        for (let i = currentCount; i < newCount; i++) addVideoSlot();
        recalculateLayout();
    } else if (newCount < currentCount) {
        // Preserve playback state
        const wasPlaying = State.isPlaying;
        const savedMasterTime = State.masterTime;
        
        // Pause all before removing
        if (wasPlaying) {
            State.videoSlots.forEach((slot, i) => {
                if (slot.loaded) {
                    document.getElementById(`video-${i}`).pause();
                }
            });
            State.isPlaying = false;
        }
        
        // Remove slots from the end
        for (let i = currentCount - 1; i >= newCount; i--) {
            const wrapper = document.getElementById(`videoWrapper-${i}`);
            if (wrapper) wrapper.remove();
            State.videoSlots.splice(i, 1);
        }
        
        document.getElementById('videoCount').value = State.videoSlots.length;
        recalculateLayout();
        
        // Recalculate duration
        updateDuration();
        
        // Clamp masterTime if needed
        State.masterTime = Math.min(savedMasterTime, State.duration > 0 ? State.duration : savedMasterTime);
        
        // Restore playback
        if (wasPlaying) {
            State.isPlaying = true;
            document.getElementById('playBtn').innerHTML = '⏸ Pause';
        }
        if (!State.isDesynced) {
            setAllVideosTime(State.masterTime);
        } else if (wasPlaying) {
            // Resume playing all videos in desync mode
            State.videoSlots.forEach((slot, i) => {
                if (slot.loaded) {
                    document.getElementById(`video-${i}`).play().catch(() => {});
                }
            });
        }
    }
}

function removeVideoSlot(index) {
    // Preserve playback state
    const wasPlaying = State.isPlaying;
    const savedMasterTime = State.masterTime;
    
    // Pause all videos first
    if (wasPlaying) {
        State.videoSlots.forEach((slot, i) => {
            if (slot.loaded) {
                document.getElementById(`video-${i}`).pause();
            }
        });
    }
    
    const wrapper = document.getElementById(`videoWrapper-${index}`);
    if (wrapper) wrapper.remove();
    State.videoSlots.splice(index, 1);
    
    document.getElementById('videoContainer').innerHTML = '';
    
    // Rebuild remaining slots with new indices
    const oldSlots = [...State.videoSlots];
    State.videoSlots = [];
    
    oldSlots.forEach((slot) => {
        const newIndex = addVideoSlot();
        if (slot.loaded && slot.video) {
            const video = document.getElementById(`video-${newIndex}`);
            const placeholder = document.getElementById(`placeholder-${newIndex}`);
            const label = document.getElementById(`label-${newIndex}`);
            
            video.src = slot.video.src;
            video.style.display = 'block';
            placeholder.style.display = 'none';
            label.textContent = `${newIndex + 1}: ${slot.video.dataset?.name || `Video ${newIndex + 1}`}`;
            
            State.videoSlots[newIndex].loaded = true;
            State.videoSlots[newIndex].video = video;
            State.videoSlots[newIndex].duration = slot.duration;
        }
    });
    
    document.getElementById('videoCount').value = State.videoSlots.length;
    recalculateLayout();
    
    // Recalculate duration based on remaining videos
    updateDuration();
    
    // Clamp masterTime if it exceeds new duration
    State.masterTime = Math.min(savedMasterTime, State.duration > 0 ? State.duration : savedMasterTime);
    
    // Restore playback state after a brief delay to let videos load
    setTimeout(() => {
        if (wasPlaying) {
            State.isPlaying = true;
            document.getElementById('playBtn').innerHTML = '⏸ Pause';
        }
        if (!State.isDesynced) {
            setAllVideosTime(State.masterTime);
        } else if (wasPlaying) {
            State.videoSlots.forEach((slot, i) => {
                if (slot.loaded) {
                    document.getElementById(`video-${i}`).play().catch(() => {});
                }
            });
        }
    }, 100);
}

function removeVideo(index) {
    // Preserve playback state
    const wasPlaying = State.isPlaying;
    const savedMasterTime = State.masterTime;
    const wasLongest = State.videoSlots[index].duration === State.duration;
    
    const video = document.getElementById(`video-${index}`);
    const placeholder = document.getElementById(`placeholder-${index}`);
    const label = document.getElementById(`label-${index}`);
    
    // Pause this video first
    if (video) video.pause();
    
    video.src = '';
    video.style.display = 'none';
    placeholder.style.display = 'flex';
    label.textContent = `Video ${index + 1}`;
    
    State.videoSlots[index].loaded = false;
    State.videoSlots[index].video = null;
    State.videoSlots[index].duration = 0;
    
    // Reset individual progress bar
    const progressFill = document.getElementById(`individualProgressFill-${index}`);
    const timeDisplay = document.getElementById(`individualTime-${index}`);
    if (progressFill) progressFill.style.width = '0%';
    if (timeDisplay) timeDisplay.textContent = '00:00 / 00:00';
    
    // Recalculate duration based on remaining videos
    updateDuration();
    
    // If we removed the longest video, clamp masterTime to new duration
    if (wasLongest && State.duration > 0 && !State.isDesynced) {
        State.masterTime = Math.min(savedMasterTime, State.duration);
        setAllVideosTime(State.masterTime);
    }
    
    // Update progress display
    if (!State.isDesynced) {
        updateProgressDisplay(State.masterTime);
    }
}

function triggerFileInput(index) {
    document.getElementById(`fileInput-${index}`).click();
}

function loadVideo(index, file) {
    if (!file) return;
    
    const video = document.getElementById(`video-${index}`);
    const placeholder = document.getElementById(`placeholder-${index}`);
    const label = document.getElementById(`label-${index}`);
    
    const url = URL.createObjectURL(file);
    video.src = url;
    video.style.display = 'block';
    placeholder.style.display = 'none';
    
    // Let CSS handle truncation dynamically based on available space
    label.textContent = `${index + 1}: ${file.name}`;
    
    // Store original filename for reference
    video.dataset.name = file.name;
    
    State.videoSlots[index].loaded = true;
    State.videoSlots[index].video = video;
    
    video.playbackRate = parseFloat(document.getElementById('playbackSpeed').value);
    video.loop = State.isLooping;
    updateIndividualVolume(index);
    
    showToast(`Loaded: ${file.name}`);
}

function handleMetadata(index) {
    const video = document.getElementById(`video-${index}`);
    State.videoSlots[index].video = video;
    State.videoSlots[index].duration = video.duration;
    updateDuration();
    updateAudioMode();
    
    if (State.isDesynced) {
        // In desync mode, start from beginning and autoplay if currently playing
        video.currentTime = 0;
        updateIndividualProgress(index);
        
        if (State.isPlaying) {
            video.play().catch(() => {});
        }
    } else {
        // Sync this video to current master time
        const offset = parseFloat(document.getElementById(`offset-${index}`).value) || 0;
        const videoDuration = video.duration;
        
        if (videoDuration > 0) {
            let targetTime = State.masterTime + offset;
            if (State.isLooping && targetTime >= videoDuration) {
                targetTime = targetTime % videoDuration;
            } else if (targetTime >= videoDuration) {
                targetTime = videoDuration - 0.01;
            }
            video.currentTime = Math.max(0, targetTime);
        }
        
        if (State.isPlaying) {
            video.play().catch(() => {});
        }
    }
}

function updateOffset(index) {
    const input = document.getElementById(`offset-${index}`);
    const display = document.getElementById(`offsetDisplay-${index}`);
    const offset = parseFloat(input.value) || 0;
    State.videoSlots[index].offset = offset;
    
    if (offset > 0) {
        display.textContent = `+${offset}s ahead`;
        display.style.color = '#4ade80';
    } else if (offset < 0) {
        display.textContent = `${offset}s behind`;
        display.style.color = '#fbbf24';
    } else {
        display.textContent = 'in sync';
        display.style.color = '#aaa';
    }
    
    if (!State.isDesynced) {
        setAllVideosTime(State.masterTime);
    }
}

// Global drag handlers
function setupGlobalDragHandlers() {
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        State.dragCounter++;
        if (e.dataTransfer.types.includes('Files')) {
            document.body.classList.add('dragging-file');
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        State.dragCounter--;
        if (State.dragCounter === 0) {
            document.body.classList.remove('dragging-file');
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        State.dragCounter = 0;
        document.body.classList.remove('dragging-file');
        
        // Only handle if not dropped on a specific wrapper (wrapper handles its own drops)
        const wrapper = e.target.closest('.video-wrapper');
        if (!wrapper && e.dataTransfer.files.length > 0) {
            const videoFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
            if (videoFiles.length > 0) {
                loadMultipleVideos(videoFiles);
            }
        }
    });
}

// Export to global scope
window.addVideoSlot = addVideoSlot;
window.loadMultipleVideos = loadMultipleVideos;
window.handleFileInputChange = handleFileInputChange;
window.showOverlay = showOverlay;
window.scheduleHideOverlay = scheduleHideOverlay;
window.updateVideoCount = updateVideoCount;
window.removeVideoSlot = removeVideoSlot;
window.removeVideo = removeVideo;
window.triggerFileInput = triggerFileInput;
window.loadVideo = loadVideo;
window.handleMetadata = handleMetadata;
window.updateOffset = updateOffset;
window.setupGlobalDragHandlers = setupGlobalDragHandlers;
