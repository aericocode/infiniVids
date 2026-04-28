/**
 * InfiniVids - Per-Video Fullscreen
 * Fullscreen mode for individual videos with global playback controls
 * Performance optimized: pauses other videos, moves (not clones) the active video
 */

const Fullscreen = {
    isActive: false,
    activeIndex: null,
    hideControlsTimeout: null,
    
    // Saved state for restoration
    savedState: {
        wasPlaying: false,
        videoStates: [], // { index, currentTime, wasPlaying }
        originalParent: null,
        originalNextSibling: null
    },
    
    /**
     * Initialize fullscreen system
     */
    init() {
        this.createOverlay();
        this.bindEvents();
    },
    
    /**
     * Create the fullscreen overlay element
     */
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'videoFullscreenOverlay';
        overlay.className = 'video-fullscreen-overlay';
        overlay.innerHTML = `
            <div class="fullscreen-video-container" id="fullscreenVideoContainer"></div>
            
            <div class="fullscreen-controls" id="fullscreenControlsOverlay">
                <div class="fullscreen-top">
                    <span class="fullscreen-title" id="fullscreenTitle">Video</span>
                    <button class="fullscreen-exit-btn" id="fullscreenExitBtn" title="Exit fullscreen (Esc)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                        </svg>
                    </button>
                </div>
                
                <div class="fullscreen-bottom">
                    <div class="fullscreen-progress-row">
                        <span class="fullscreen-time" id="fullscreenCurrentTime">00:00</span>
                        <div class="fullscreen-progress-bar" id="fullscreenProgressBar">
                            <div class="fullscreen-progress-fill" id="fullscreenProgressFill"></div>
                        </div>
                        <span class="fullscreen-time" id="fullscreenDuration">00:00</span>
                    </div>
                    
                    <div class="fullscreen-buttons">
                        <button class="fs-ctrl-btn" id="fsSeekBack10" title="-10s">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6"/>
                            </svg>
                            <span>10</span>
                        </button>
                        <button class="fs-ctrl-btn" id="fsSeekBack5" title="-5s">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6"/>
                            </svg>
                            <span>5</span>
                        </button>
                        <button class="fs-ctrl-btn fs-play-btn" id="fsPlayBtn" title="Play/Pause (Space)">
                            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                            </svg>
                        </button>
                        <button class="fs-ctrl-btn" id="fsSeekFwd5" title="+5s">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6"/>
                            </svg>
                            <span>5</span>
                        </button>
                        <button class="fs-ctrl-btn" id="fsSeekFwd10" title="+10s">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6"/>
                            </svg>
                            <span>10</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    },
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Exit button
        document.getElementById('fullscreenExitBtn').addEventListener('click', () => this.exit());
        
        // Click on overlay background to exit
        document.getElementById('videoFullscreenOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'videoFullscreenOverlay' || e.target.id === 'fullscreenVideoContainer') {
                this.exit();
            }
        });
        
        // Play/pause - only affects this video in fullscreen
        document.getElementById('fsPlayBtn').addEventListener('click', () => this.togglePlay());
        
        // Seek buttons - only affect this video
        document.getElementById('fsSeekBack10').addEventListener('click', () => this.seekVideo(-10));
        document.getElementById('fsSeekBack5').addEventListener('click', () => this.seekVideo(-5));
        document.getElementById('fsSeekFwd5').addEventListener('click', () => this.seekVideo(5));
        document.getElementById('fsSeekFwd10').addEventListener('click', () => this.seekVideo(10));
        
        // Progress bar click
        document.getElementById('fullscreenProgressBar').addEventListener('click', (e) => {
            this.seekToPosition(e);
        });
        
        // Mouse move to show/hide controls
        const overlay = document.getElementById('videoFullscreenOverlay');
        overlay.addEventListener('mousemove', () => this.showControls());
        
        // Keep controls visible when hovering them
        const controls = document.getElementById('fullscreenControlsOverlay');
        controls.addEventListener('mouseenter', () => {
            clearTimeout(this.hideControlsTimeout);
        });
        controls.addEventListener('mouseleave', () => {
            this.scheduleHideControls();
        });
        
        // Keyboard handler for fullscreen
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    this.exit();
                    break;
                case ' ':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seekVideo(-5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.seekVideo(5);
                    break;
                case 'j':
                case 'J':
                    this.seekVideo(-10);
                    break;
                case 'l':
                case 'L':
                    this.seekVideo(10);
                    break;
            }
        });
        
        // Double-click video to exit
        document.getElementById('fullscreenVideoContainer').addEventListener('dblclick', () => {
            this.exit();
        });
        
        // Single click to play/pause
        document.getElementById('fullscreenVideoContainer').addEventListener('click', (e) => {
            if (e.detail === 1) {
                // Use timeout to avoid triggering on double-click
                setTimeout(() => {
                    if (!this._exitingFromDoubleClick) {
                        this.togglePlay();
                    }
                    this._exitingFromDoubleClick = false;
                }, 200);
            } else if (e.detail === 2) {
                this._exitingFromDoubleClick = true;
            }
        });
    },
    
    /**
     * Enter fullscreen for a specific video slot
     */
    enter(index) {
        const slot = State.videoSlots[index];
        if (!slot || !slot.loaded) return;
        
        this.isActive = true;
        this.activeIndex = index;
        
        const video = document.getElementById(`video-${index}`);
        const overlay = document.getElementById('videoFullscreenOverlay');
        const container = document.getElementById('fullscreenVideoContainer');
        const label = document.getElementById(`label-${index}`);
        
        // Save global play state
        this.savedState.wasPlaying = State.isPlaying;
        this.savedState.videoStates = [];
        
        // Determine which video is the audio source
        const audioSourceIndex = State.audioMode === 'single' ? State.activeAudioSlot : null;
        
        // Pause and save state of other videos (except audio source)
        State.videoSlots.forEach((s, i) => {
            if (s.loaded && i !== index) {
                const v = document.getElementById(`video-${i}`);
                const isAudioSource = (State.audioMode === 'single' && i === audioSourceIndex);
                
                this.savedState.videoStates.push({
                    index: i,
                    currentTime: v.currentTime,
                    wasPlaying: !v.paused,
                    isAudioSource: isAudioSource
                });
                
                // Don't pause the audio source - keep it playing for audio
                // But we can hide it since we don't need the video picture
                if (!isAudioSource) {
                    v.pause();
                }
            }
        });
        
        // Save the video's original location in DOM
        this.savedState.originalParent = video.parentElement;
        this.savedState.originalNextSibling = video.nextSibling;
        
        // Set title
        document.getElementById('fullscreenTitle').textContent = label.textContent;
        
        // Move the actual video element to fullscreen container
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        video.style.objectFit = 'contain';
        container.appendChild(video);
        
        // Show overlay with animation
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Update local play state tracking
        this._isPlaying = !video.paused;
        
        // Update UI
        this.updatePlayButton();
        this.updateProgress();
        this.showControls();
        
        // Start progress update loop
        this.startUpdateLoop();
    },
    
    /**
     * Exit fullscreen
     */
    exit() {
        if (!this.isActive) return;
        
        const overlay = document.getElementById('videoFullscreenOverlay');
        const video = document.getElementById(`video-${this.activeIndex}`);
        
        // Stop update loop
        this.stopUpdateLoop();
        
        // Move video back to its original location
        if (video && this.savedState.originalParent) {
            // Reset video styles
            video.style.width = '';
            video.style.height = '';
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            video.style.objectFit = '';
            
            // Insert back into original position
            if (this.savedState.originalNextSibling) {
                this.savedState.originalParent.insertBefore(video, this.savedState.originalNextSibling);
            } else {
                this.savedState.originalParent.appendChild(video);
            }
        }
        
        // Hide overlay
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // Restore other videos
        this.savedState.videoStates.forEach(state => {
            const v = document.getElementById(`video-${state.index}`);
            if (v) {
                // Sync time if in sync mode (audio source stayed in sync already)
                if (!State.isDesynced && video && !state.isAudioSource) {
                    const otherSlot = State.videoSlots[state.index];
                    const offset = parseFloat(document.getElementById(`offset-${state.index}`).value) || 0;
                    
                    // Calculate where this video should be based on fullscreen video's time
                    let targetTime = video.currentTime + offset;
                    if (State.isLooping && otherSlot.duration > 0) {
                        targetTime = targetTime % otherSlot.duration;
                    }
                    v.currentTime = Math.max(0, Math.min(otherSlot.duration, targetTime));
                }
                
                // Only resume if we're currently playing - ignore what state was before fullscreen
                if (this._isPlaying && !state.isAudioSource) {
                    v.play().catch(() => {});
                }
            }
        });
        
        // Also pause the audio source if we're paused
        const audioSourceIndex = State.audioMode === 'single' ? State.activeAudioSlot : null;
        if (!this._isPlaying && audioSourceIndex !== null && audioSourceIndex !== this.activeIndex) {
            const audioVideo = document.getElementById(`video-${audioSourceIndex}`);
            if (audioVideo) {
                audioVideo.pause();
            }
        }
        
        // Update global state
        State.isPlaying = this._isPlaying;
        document.getElementById('playBtn').innerHTML = State.isPlaying ? '⏸ Pause' : '▶ Play';
        
        // Update master time from the fullscreen video
        if (!State.isDesynced && video) {
            const offset = parseFloat(document.getElementById(`offset-${this.activeIndex}`).value) || 0;
            State.masterTime = video.currentTime - offset;
            updateProgressDisplay(State.masterTime);
        }
        
        clearTimeout(this.hideControlsTimeout);
        this.isActive = false;
        this.activeIndex = null;
        this.savedState = {
            wasPlaying: false,
            videoStates: [],
            originalParent: null,
            originalNextSibling: null
        };
    },
    
    /**
     * Toggle play/pause for the fullscreen video (and audio source)
     */
    _isPlaying: false,
    
    togglePlay() {
        if (this.activeIndex === null) return;
        
        const video = document.getElementById(`video-${this.activeIndex}`);
        if (!video) return;
        
        // Also get the audio source video if different
        const audioSourceIndex = State.audioMode === 'single' ? State.activeAudioSlot : null;
        const audioVideo = (audioSourceIndex !== null && audioSourceIndex !== this.activeIndex) 
            ? document.getElementById(`video-${audioSourceIndex}`) 
            : null;
        
        if (video.paused) {
            video.play().catch(() => {});
            if (audioVideo) audioVideo.play().catch(() => {});
            this._isPlaying = true;
        } else {
            video.pause();
            if (audioVideo) audioVideo.pause();
            this._isPlaying = false;
        }
        
        this.updatePlayButton();
    },
    
    /**
     * Seek the fullscreen video by seconds (and audio source)
     */
    seekVideo(seconds) {
        if (this.activeIndex === null) return;
        
        const video = document.getElementById(`video-${this.activeIndex}`);
        const slot = State.videoSlots[this.activeIndex];
        if (!video || !slot) return;
        
        const newTime = Math.max(0, Math.min(slot.duration, video.currentTime + seconds));
        video.currentTime = newTime;
        
        // Also seek the audio source video if different
        const audioSourceIndex = State.audioMode === 'single' ? State.activeAudioSlot : null;
        if (audioSourceIndex !== null && audioSourceIndex !== this.activeIndex) {
            const audioVideo = document.getElementById(`video-${audioSourceIndex}`);
            const audioSlot = State.videoSlots[audioSourceIndex];
            if (audioVideo && audioSlot) {
                const offset = parseFloat(document.getElementById(`offset-${audioSourceIndex}`).value) || 0;
                let audioTime = newTime + offset;
                if (State.isLooping && audioSlot.duration > 0) {
                    audioTime = audioTime % audioSlot.duration;
                }
                audioVideo.currentTime = Math.max(0, Math.min(audioSlot.duration, audioTime));
            }
        }
        
        showToast(`${seconds > 0 ? '+' : ''}${seconds}s`);
    },
    
    /**
     * Seek to position on progress bar (and audio source)
     */
    seekToPosition(e) {
        if (this.activeIndex === null) return;
        
        const slot = State.videoSlots[this.activeIndex];
        if (!slot) return;
        
        const bar = document.getElementById('fullscreenProgressBar');
        const rect = bar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const targetTime = percent * slot.duration;
        
        const video = document.getElementById(`video-${this.activeIndex}`);
        const newTime = Math.max(0, Math.min(slot.duration, targetTime));
        video.currentTime = newTime;
        
        // Also seek the audio source video if different
        const audioSourceIndex = State.audioMode === 'single' ? State.activeAudioSlot : null;
        if (audioSourceIndex !== null && audioSourceIndex !== this.activeIndex) {
            const audioVideo = document.getElementById(`video-${audioSourceIndex}`);
            const audioSlot = State.videoSlots[audioSourceIndex];
            if (audioVideo && audioSlot) {
                const offset = parseFloat(document.getElementById(`offset-${audioSourceIndex}`).value) || 0;
                let audioTime = newTime + offset;
                if (State.isLooping && audioSlot.duration > 0) {
                    audioTime = audioTime % audioSlot.duration;
                }
                audioVideo.currentTime = Math.max(0, Math.min(audioSlot.duration, audioTime));
            }
        }
    },
    
    /**
     * Progress update loop
     */
    updateLoopId: null,
    
    startUpdateLoop() {
        const update = () => {
            if (!this.isActive) return;
            
            this.updateProgress();
            this.updatePlayButton();
            
            this.updateLoopId = requestAnimationFrame(update);
        };
        
        this.updateLoopId = requestAnimationFrame(update);
    },
    
    stopUpdateLoop() {
        if (this.updateLoopId) {
            cancelAnimationFrame(this.updateLoopId);
            this.updateLoopId = null;
        }
    },
    
    /**
     * Update progress bar and time display
     */
    updateProgress() {
        if (this.activeIndex === null) return;
        
        const video = document.getElementById(`video-${this.activeIndex}`);
        const slot = State.videoSlots[this.activeIndex];
        
        if (!video || !slot) return;
        
        const currentTime = video.currentTime;
        const duration = slot.duration;
        
        const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
        document.getElementById('fullscreenProgressFill').style.width = `${Math.min(100, percent)}%`;
        document.getElementById('fullscreenCurrentTime').textContent = formatTime(currentTime);
        document.getElementById('fullscreenDuration').textContent = formatTime(duration);
    },
    
    /**
     * Update play button state
     */
    updatePlayButton() {
        const video = this.activeIndex !== null ? document.getElementById(`video-${this.activeIndex}`) : null;
        const isPlaying = video ? !video.paused : false;
        
        const playIcon = document.querySelector('#fsPlayBtn .play-icon');
        const pauseIcon = document.querySelector('#fsPlayBtn .pause-icon');
        
        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
        
        this._isPlaying = isPlaying;
    },
    
    /**
     * Show controls
     */
    showControls() {
        const controls = document.getElementById('fullscreenControlsOverlay');
        const overlay = document.getElementById('videoFullscreenOverlay');
        
        controls.classList.add('visible');
        overlay.classList.remove('cursor-hidden');
        
        this.scheduleHideControls();
    },
    
    /**
     * Schedule hiding controls
     */
    scheduleHideControls() {
        clearTimeout(this.hideControlsTimeout);
        
        this.hideControlsTimeout = setTimeout(() => {
            if (this.isActive) {
                const controls = document.getElementById('fullscreenControlsOverlay');
                const overlay = document.getElementById('videoFullscreenOverlay');
                controls.classList.remove('visible');
                overlay.classList.add('cursor-hidden');
            }
        }, 3000);
    }
};

// Global function to enter fullscreen for a slot
function enterVideoFullscreen(index) {
    Fullscreen.enter(index);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Fullscreen.init();
});

// Export to global scope
window.Fullscreen = Fullscreen;
window.enterVideoFullscreen = enterVideoFullscreen;
