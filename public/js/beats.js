/**
 * InfiniVids - Beat Detection & Visualization
 * Ported from beatbar.user.js for local file analysis.
 *
 * Public API:
 *   toggleBeats()           - global on/off
 *   ensureBeatsForSlot(i)   - analyze slot i if not cached
 *   moveBeatBarTo(slotIdx)  - relocate overlay to a different video
 *   onActiveAudioChanged(i) - call when audio source switches
 */

const PRESETS = {
    kick:  { bandLow: 40,  bandHigh: 120, minBpm: 80,  maxBpm: 180, sensitivity: 1.5,  avgWindow: 1.0, q: 1.5 },
    snare: { bandLow: 150, bandHigh: 300, minBpm: 60,  maxBpm: 160, sensitivity: 1.6,  avgWindow: 0.8, q: 1.5 },
    broad: { bandLow: 30,  bandHigh: 500, minBpm: 100, maxBpm: 280, sensitivity: 1.35, avgWindow: 0.4, q: 1.0 },
};

const BEAT_CONFIG = {
    preset: 'kick',
    lookahead: 5,
    tickLeadMs: 30,
    overlayHeight: 90,
    overlayOffsetBottom: 70,
    playheadXFrac: 0.2,
};

// Per-slot beat data: { slotIndex: { beats, bpm, file: File } }
const beatCache = new Map();

const BeatBarState = {
    enabled: false,
    activeSlot: -1,        // which slot the bar is currently rendered on
    overlay: null,
    canvas: null,
    ctx: null,
    statusEl: null,
    rafId: null,
    lastBeatIdx: -1,
    pulses: new Map(),
    smoothTime: 0,
    lastVideoTime: 0,
    lastVideoTimeAt: 0,
    analyzing: new Set(),  // slot indices currently analyzing
};

// ========== Public toggle ==========

function toggleBeats() {
    BeatBarState.enabled = !BeatBarState.enabled;
    const btn = document.getElementById('beatsBtn');
    if (btn) btn.classList.toggle('active', BeatBarState.enabled);

    if (BeatBarState.enabled) {
        const target = pickActiveAudioSlot();
        if (target < 0) {
            showToast('Load a video first');
            BeatBarState.enabled = false;
            if (btn) btn.classList.remove('active');
            return;
        }
        showBeatBar(target);
    } else {
        hideBeatBar();
    }
}

// ========== Active slot resolution ==========

function pickActiveAudioSlot() {
    // Single audio mode: find the slot currently unmuted
    // All audio mode: use lastInteractedSlot or first loaded slot
    const slots = State.videoSlots;
    if (!slots || !slots.length) return -1;

    if (State.audioMode === 'all') {
        // Use last-clicked / focused slot if tracked, else first loaded
        if (State.lastActiveAudioSlot != null && slots[State.lastActiveAudioSlot]?.loaded) {
            return State.lastActiveAudioSlot;
        }
        const firstLoaded = slots.findIndex(s => s.loaded);
        return firstLoaded;
    }

    // single mode: find unmuted video
    for (let i = 0; i < slots.length; i++) {
        const v = document.getElementById(`video-${i}`);
        if (v && !v.muted && slots[i].loaded) return i;
    }
    // fallback: first loaded
    return slots.findIndex(s => s.loaded);
}

function onActiveAudioChanged(slotIndex) {
    State.lastActiveAudioSlot = slotIndex;
    if (BeatBarState.enabled && slotIndex >= 0) {
        showBeatBar(slotIndex);
    }
}

// ========== Show / hide / move ==========

async function showBeatBar(slotIndex) {
    if (slotIndex < 0) return;
    const slot = State.videoSlots[slotIndex];
    if (!slot || !slot.loaded) return;

    if (!BeatBarState.overlay) createBeatOverlay();

    BeatBarState.activeSlot = slotIndex;
    BeatBarState.lastBeatIdx = -1;
    BeatBarState.pulses.clear();

    attachOverlayToSlot(slotIndex);

    const cached = beatCache.get(slotIndex);
    if (cached) {
        setBeatStatus(`${cached.beats.length} beats · ${cached.bpm.toFixed(1)} BPM`, 'ok');
        scheduleBeatStatusClear();
        startBeatRenderLoop();
        return;
    }

    // Analyze
    setBeatStatus('Analyzing audio…', 'busy');
    startBeatRenderLoop(); // start drawing the empty bar immediately

    try {
        const result = await analyzeSlot(slotIndex);
        if (BeatBarState.activeSlot !== slotIndex) return; // user moved on
        beatCache.set(slotIndex, result);
        setBeatStatus(`${result.beats.length} beats · ${result.bpm.toFixed(1)} BPM`, 'ok');
        scheduleBeatStatusClear();
    } catch (e) {
        console.error('[beats] analysis failed', e);
        setBeatStatus(`Failed: ${e.message}`, 'err');
    }
}

function hideBeatBar() {
    BeatBarState.activeSlot = -1;
    if (BeatBarState.rafId) cancelAnimationFrame(BeatBarState.rafId);
    BeatBarState.rafId = null;
    if (BeatBarState.overlay) {
        BeatBarState.overlay.style.display = 'none';
    }
}

function attachOverlayToSlot(slotIndex) {
    const wrapper = document.getElementById(`videoWrapper-${slotIndex}`);
    if (!wrapper || !BeatBarState.overlay) return;

    // In stack mode, overlay must sit above all video layers
    if (State.isStacked) {
        // Append to videoContainer so it spans the stacked area, with very high z-index
        document.getElementById('videoContainer').appendChild(BeatBarState.overlay);
        BeatBarState.overlay.style.position = 'absolute';
        BeatBarState.overlay.style.left = '0';
        BeatBarState.overlay.style.right = '0';
        BeatBarState.overlay.style.bottom = `${BEAT_CONFIG.overlayOffsetBottom}px`;
        BeatBarState.overlay.style.top = '';
        BeatBarState.overlay.style.height = `${BEAT_CONFIG.overlayHeight}px`;
        BeatBarState.overlay.style.zIndex = '9999';
    } else {
        // Per-video: append inside the wrapper
        wrapper.appendChild(BeatBarState.overlay);
        BeatBarState.overlay.style.position = 'absolute';
        BeatBarState.overlay.style.left = '0';
        BeatBarState.overlay.style.right = '0';
        BeatBarState.overlay.style.bottom = `${BEAT_CONFIG.overlayOffsetBottom}px`;
        BeatBarState.overlay.style.top = '';
        BeatBarState.overlay.style.height = `${BEAT_CONFIG.overlayHeight}px`;
        BeatBarState.overlay.style.zIndex = '50';
    }
    BeatBarState.overlay.style.display = '';
    resizeBeatCanvas();
}

// ========== Overlay creation ==========

function createBeatOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'beatbar-overlay';
    overlay.innerHTML = `
        <canvas class="beatbar-canvas"></canvas>
        <div class="beatbar-status"></div>
    `;
    BeatBarState.overlay = overlay;
    BeatBarState.canvas = overlay.querySelector('.beatbar-canvas');
    BeatBarState.ctx = BeatBarState.canvas.getContext('2d');
    BeatBarState.statusEl = overlay.querySelector('.beatbar-status');

    window.addEventListener('resize', resizeBeatCanvas, { passive: true });
}

function resizeBeatCanvas() {
    const c = BeatBarState.canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        BeatBarState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
}

function setBeatStatus(text, kind) {
    if (!BeatBarState.statusEl) return;
    BeatBarState.statusEl.textContent = text;
    BeatBarState.statusEl.className = 'beatbar-status' + (kind ? ` beatbar-status--${kind}` : '');
}

function scheduleBeatStatusClear() {
    setTimeout(() => setBeatStatus('', 'idle'), 2500);
}

// ========== Analysis ==========

async function analyzeSlot(slotIndex) {
    if (BeatBarState.analyzing.has(slotIndex)) {
        throw new Error('Already analyzing');
    }
    BeatBarState.analyzing.add(slotIndex);
    try {
        const slot = State.videoSlots[slotIndex];
        const file = slot.sourceFile;
        if (!file) throw new Error('No file on slot');

        const arrayBuffer = await file.arrayBuffer();
        return await analyzeAudioBuffer(arrayBuffer, BEAT_CONFIG.preset);
    } finally {
        BeatBarState.analyzing.delete(slotIndex);
    }
}

async function analyzeAudioBuffer(arrayBuffer, presetKey) {
    const p = PRESETS[presetKey] || PRESETS.kick;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let decoded;
    try {
        decoded = await ctx.decodeAudioData(arrayBuffer);
    } finally {
        ctx.close();
    }

    const offline = new OfflineAudioContext(1, decoded.length, decoded.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    const hp1 = offline.createBiquadFilter(); hp1.type='highpass'; hp1.frequency.value=p.bandLow;  hp1.Q.value=p.q;
    const hp2 = offline.createBiquadFilter(); hp2.type='highpass'; hp2.frequency.value=p.bandLow;  hp2.Q.value=p.q;
    const lp1 = offline.createBiquadFilter(); lp1.type='lowpass';  lp1.frequency.value=p.bandHigh; lp1.Q.value=p.q;
    const lp2 = offline.createBiquadFilter(); lp2.type='lowpass';  lp2.frequency.value=p.bandHigh; lp2.Q.value=p.q;
    src.connect(hp1).connect(hp2).connect(lp1).connect(lp2).connect(offline.destination);
    src.start(0);
    const filtered = await offline.startRendering();

    const minGapMs = (60 / p.maxBpm) * 1000;
    const beats = detectBeats(filtered, {
        sensitivity: p.sensitivity,
        minGapMs,
        avgWindowSec: p.avgWindow,
    });
    return { beats, bpm: estimateBpm(beats) };
}

function detectBeats(audioBuffer, opts) {
    const { sensitivity, minGapMs, avgWindowSec } = opts;
    const sr = audioBuffer.sampleRate;
    const data = audioBuffer.getChannelData(0);
    const frameSize = 1024, hop = 512;
    const numFrames = Math.floor((data.length - frameSize) / hop);
    const energy = new Float32Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
        let sum = 0;
        const start = i * hop;
        for (let j = 0; j < frameSize; j++) {
            const v = data[start + j];
            sum += v * v;
        }
        energy[i] = Math.sqrt(sum / frameSize);
    }

    const onset = new Float32Array(numFrames);
    for (let i = 1; i < numFrames; i++) {
        const d = energy[i] - energy[i - 1];
        onset[i] = d > 0 ? d : 0;
    }

    const windowFrames = Math.round((sr / hop) * avgWindowSec);
    const minGapFrames = Math.round((minGapMs / 1000) * (sr / hop));
    const beats = [];
    let lastBeat = -Infinity;

    for (let i = 1; i < numFrames - 1; i++) {
        const w0 = Math.max(0, i - windowFrames);
        const w1 = Math.min(numFrames, i + windowFrames);
        let avg = 0;
        for (let k = w0; k < w1; k++) avg += energy[k];
        avg /= (w1 - w0);

        const e = energy[i];
        if (e > avg * sensitivity &&
            e > energy[i - 1] &&
            e >= energy[i + 1] &&
            onset[i] > 0 &&
            i - lastBeat > minGapFrames) {
            beats.push((i * hop) / sr);
            lastBeat = i;
        }
    }
    return beats;
}

function estimateBpm(beats) {
    if (beats.length < 4) return 0;
    const ivs = [];
    for (let i = 1; i < beats.length; i++) ivs.push(beats[i] - beats[i - 1]);
    ivs.sort((a, b) => a - b);
    const med = ivs[Math.floor(ivs.length / 2)];
    return med ? 60 / med : 0;
}

// ========== Render loop ==========

function startBeatRenderLoop() {
    if (BeatBarState.rafId) cancelAnimationFrame(BeatBarState.rafId);
    const tick = (now) => {
        if (!BeatBarState.enabled || BeatBarState.activeSlot < 0) return;
        updateBeatSmoothTime(now);
        checkBeatsPassed();
        drawBeatBar(now);
        BeatBarState.rafId = requestAnimationFrame(tick);
    };
    BeatBarState.rafId = requestAnimationFrame(tick);
}

function updateBeatSmoothTime(nowPerf) {
    const v = document.getElementById(`video-${BeatBarState.activeSlot}`);
    if (!v) return;
    if (v.paused || v.seeking) {
        BeatBarState.smoothTime = v.currentTime;
        BeatBarState.lastVideoTime = v.currentTime;
        BeatBarState.lastVideoTimeAt = nowPerf;
        return;
    }
    if (v.currentTime !== BeatBarState.lastVideoTime) {
        BeatBarState.lastVideoTime = v.currentTime;
        BeatBarState.lastVideoTimeAt = nowPerf;
    }
    const dt = (nowPerf - BeatBarState.lastVideoTimeAt) / 1000;
    const rate = v.playbackRate || 1;
    BeatBarState.smoothTime = BeatBarState.lastVideoTime + dt * rate;
    if (v.duration && BeatBarState.smoothTime > v.duration) {
        BeatBarState.smoothTime = v.duration;
    }
}

function checkBeatsPassed() {
    const data = beatCache.get(BeatBarState.activeSlot);
    if (!data) return;
    const beats = data.beats;
    const lead = (BEAT_CONFIG.tickLeadMs || 0) / 1000;
    const t = BeatBarState.smoothTime + lead;

    if (BeatBarState.lastBeatIdx >= 0 && beats[BeatBarState.lastBeatIdx] > t + 0.1) {
        let lo = 0, hi = beats.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (beats[mid] <= t) lo = mid + 1; else hi = mid;
        }
        BeatBarState.lastBeatIdx = lo - 1;
    }
    let idx = BeatBarState.lastBeatIdx + 1;
    while (idx < beats.length && beats[idx] <= t) {
        BeatBarState.pulses.set(idx, { startTime: performance.now() });
        idx++;
    }
    BeatBarState.lastBeatIdx = idx - 1;
}

function drawBeatBar(now) {
    const ctx = BeatBarState.ctx;
    const canvas = BeatBarState.canvas;
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    // Card background
    const pad = 4, radius = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, radius);
    ctx.fill();
    ctx.stroke();

    // Centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(pad + 4, h / 2);
    ctx.lineTo(w - pad - 4, h / 2);
    ctx.stroke();

    const data = beatCache.get(BeatBarState.activeSlot);
    if (!data || !data.beats.length) return;

    const beats = data.beats;
    const t = BeatBarState.smoothTime;
    const lookahead = BEAT_CONFIG.lookahead;
    const playheadX = w * BEAT_CONFIG.playheadXFrac;
    const lookbehind = lookahead * (BEAT_CONFIG.playheadXFrac / (1 - BEAT_CONFIG.playheadXFrac));
    const pxPerSec = (w - playheadX) / lookahead;

    // Playhead
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 6);
    ctx.lineTo(playheadX, h - 6);
    ctx.stroke();

    const baseR = Math.max(7, Math.min(11, h * 0.1));
    const pulseR = baseR + 12;

    const firstT = t - lookbehind - 0.2;
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] < firstT) lo = mid + 1; else hi = mid;
    }

    for (let i = lo; i < beats.length; i++) {
        const bt = beats[i];
        const dt = bt - t;
        if (dt > lookahead + 0.2) break;

        const x = playheadX + dt * pxPerSec;
        const y = h / 2;

        const pulse = BeatBarState.pulses.get(i);
        let radius = baseR;
        let glow = 0;
        if (pulse) {
            const age = (now - pulse.startTime) / 1000;
            const LIFE = 0.4;
            if (age > LIFE) {
                BeatBarState.pulses.delete(i);
            } else {
                const k = 1 - (age / LIFE);
                radius = baseR + k * (pulseR - baseR);
                glow = k;
            }
        }

        if (glow > 0) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, radius + 18);
            g.addColorStop(0, `rgba(122,168,255,${glow * 0.55})`);
            g.addColorStop(1, 'rgba(122,168,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, radius + 18, 0, Math.PI * 2);
            ctx.fill();
        }

        const isPast = dt < -0.02;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isPast ? '#9ef0df' : '#7aa8ff';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Export to global scope
window.toggleBeats = toggleBeats;
window.onActiveAudioChanged = onActiveAudioChanged;
window.BeatBarState = BeatBarState;
