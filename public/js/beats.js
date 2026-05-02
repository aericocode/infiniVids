/**
 * InfiniVids - Beat Detection & Visualization
 * Live preview is canvas-based.
 * Export pre-renders the bar to a PNG sequence (cross-browser, alpha-safe,
 * no codec dependencies).
 */

const PRESETS = {
    kick:  { bandLow: 40,  bandHigh: 120, minBpm: 80,  maxBpm: 180, sensitivity: 1.5,  avgWindow: 1.0, q: 1.5 },
    snare: { bandLow: 150, bandHigh: 300, minBpm: 60,  maxBpm: 160, sensitivity: 1.6,  avgWindow: 0.8, q: 1.5 },
    broad: { bandLow: 30,  bandHigh: 500, minBpm: 100, maxBpm: 280, sensitivity: 1.35, avgWindow: 0.4, q: 1.0 },
};

const BEAT_CONFIG = {
    preset: 'broad',
    lookahead: 5,
    tickLeadMs: 30,
    overlayHeight: 90,
    overlayOffsetBottom: 70,
    playheadXFrac: 0.5,
    barSize: 'medium',
    sensitivity: 1.0,         // user-facing multiplier; higher = more beats detected
};

// Sizes mirror the userscript. Small/medium/large/xl are bottom-anchored
// fixed-height bars; 'full' is a tall centered overlay (no background card,
// hollow ring dots) that spans most of the video height.
const BAR_SIZES = {
    small:  { height: 60,  baseR: 5,  pulseExtra: 8  },
    medium: { height: 90,  baseR: 8,  pulseExtra: 12 },
    large:  { height: 130, baseR: 12, pulseExtra: 18 },
    xl:     { height: 180, baseR: 16, pulseExtra: 22 },
    full:   { height: null, baseR: null, pulseExtra: 12 }, // see resolveFullDims()
};

// Past-beat fade (seconds) — beats fade out after passing playhead.
const PAST_FADE_SEC = 1.2;
const PULSE_LIFE_SEC = 0.4;

const beatCache = new Map();

const BeatBarState = {
    enabled: false,
    activeSlot: -1,
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
    analyzing: new Set(),
};

// Cache key includes preset + sensitivity — anything that affects detection.
function cacheParams() {
    return `${BEAT_CONFIG.preset}@s${BEAT_CONFIG.sensitivity.toFixed(2)}`;
}

// ========== Public toggle ==========

function toggleBeats() {
    BeatBarState.enabled = !BeatBarState.enabled;
    const btn = document.getElementById('beatsBtn');
    const controls = document.getElementById('beatsControls');
    if (btn) btn.classList.toggle('active', BeatBarState.enabled);
    if (controls) controls.style.display = BeatBarState.enabled ? '' : 'none';

    if (BeatBarState.enabled) {
        const target = pickActiveAudioSlot();
        if (target < 0) {
            showToast('Load a video first');
            BeatBarState.enabled = false;
            if (btn) btn.classList.remove('active');
            if (controls) controls.style.display = 'none';
            return;
        }
        showBeatBar(target);
    } else {
        hideBeatBar();
    }
}

function pickActiveAudioSlot() {
    const slots = State.videoSlots;
    if (!slots || !slots.length) return -1;

    if (State.audioMode === 'all') {
        if (State.lastActiveAudioSlot != null && slots[State.lastActiveAudioSlot]?.loaded) {
            return State.lastActiveAudioSlot;
        }
        return slots.findIndex(s => s.loaded);
    }

    for (let i = 0; i < slots.length; i++) {
        const v = document.getElementById(`video-${i}`);
        if (v && !v.muted && slots[i].loaded) return i;
    }
    return slots.findIndex(s => s.loaded);
}

function onActiveAudioChanged(slotIndex) {
    State.lastActiveAudioSlot = slotIndex;
    if (BeatBarState.enabled && slotIndex >= 0) {
        showBeatBar(slotIndex);
    }
}

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
    if (cached && cached.params === cacheParams()) {
        setBeatStatus(`${cached.beats.length} beats · ${cached.bpm.toFixed(1)} BPM`, 'ok');
        scheduleBeatStatusClear();
        startBeatRenderLoop();
        return;
    }

    setBeatStatus('Analyzing audio…', 'busy');
    startBeatRenderLoop();

    try {
        const result = await analyzeSlot(slotIndex);
        if (BeatBarState.activeSlot !== slotIndex) return;
        beatCache.set(slotIndex, { ...result, params: cacheParams() });
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
    const isFull = BEAT_CONFIG.barSize === 'full';
    const wrapper = document.getElementById(`videoWrapper-${slotIndex}`);
    if (!wrapper || !BeatBarState.overlay) return;

    BeatBarState.overlay.classList.toggle('beatbar-overlay--full', isFull);

    if (State.isStacked) {
        document.getElementById('videoContainer').appendChild(BeatBarState.overlay);
        BeatBarState.overlay.style.position = 'absolute';
        BeatBarState.overlay.style.left = '0';
        BeatBarState.overlay.style.right = '0';
        BeatBarState.overlay.style.zIndex = '9999';
    } else {
        wrapper.appendChild(BeatBarState.overlay);
        BeatBarState.overlay.style.position = 'absolute';
        BeatBarState.overlay.style.left = '0';
        BeatBarState.overlay.style.right = '0';
        BeatBarState.overlay.style.zIndex = '50';
    }

    if (isFull) {
        // Centered tall band: ~70% of container height, vertically centered.
        BeatBarState.overlay.style.top = '15%';
        BeatBarState.overlay.style.bottom = '';
        BeatBarState.overlay.style.height = '70%';
    } else {
        const h = BAR_SIZES[BEAT_CONFIG.barSize]?.height || BAR_SIZES.medium.height;
        BeatBarState.overlay.style.height = `${h}px`;
        BeatBarState.overlay.style.bottom = `${BEAT_CONFIG.overlayOffsetBottom}px`;
        BeatBarState.overlay.style.top = '';
    }
    BeatBarState.overlay.style.display = '';
    resizeBeatCanvas();
}

function resetBeatBarLayout() {
    if (!BeatBarState.enabled || BeatBarState.activeSlot < 0) return;
    attachOverlayToSlot(BeatBarState.activeSlot);
    if (BeatBarState.canvas) {
        BeatBarState.canvas.width = 0;
        BeatBarState.canvas.height = 0;
    }
    requestAnimationFrame(resizeBeatCanvas);
}

function setBeatPreset(preset) {
    BEAT_CONFIG.preset = preset;
    beatCache.clear();
    if (BeatBarState.enabled && BeatBarState.activeSlot >= 0) {
        showBeatBar(BeatBarState.activeSlot);
    }
}

function setBeatLookahead(seconds) {
    BEAT_CONFIG.lookahead = parseFloat(seconds);
}

function setBeatSize(size) {
    if (!BAR_SIZES[size]) return;
    BEAT_CONFIG.barSize = size;
    if (BeatBarState.enabled && BeatBarState.activeSlot >= 0) {
        resetBeatBarLayout();
    }
}

function setBeatPlayheadPos(frac) {
    BEAT_CONFIG.playheadXFrac = parseFloat(frac);
}

// Sensitivity multiplier: 0.5–3.0. Higher = more beats. Clears cache and
// re-analyzes so the new value takes effect.
function setBeatSensitivity(mult) {
    const v = Math.max(0.5, Math.min(3.0, parseFloat(mult) || 1.0));
    if (v === BEAT_CONFIG.sensitivity) return;
    BEAT_CONFIG.sensitivity = v;
    beatCache.clear();
    if (BeatBarState.enabled && BeatBarState.activeSlot >= 0) {
        showBeatBar(BeatBarState.activeSlot);
    }
}

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
    const sensMult = BEAT_CONFIG.sensitivity || 1.0;
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
    // Lower threshold = more beats. User slider is intuitive (higher = more
    // sensitive = more beats), so divide preset sensitivity by the multiplier.
    const effectiveSensitivity = p.sensitivity / sensMult;
    const beats = detectBeats(filtered, {
        sensitivity: effectiveSensitivity,
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

function invalidateBeatsForSlot(slotIndex) {
    beatCache.delete(slotIndex);
    if (BeatBarState.enabled && BeatBarState.activeSlot === slotIndex) {
        BeatBarState.lastBeatIdx = -1;
        BeatBarState.pulses.clear();
        showBeatBar(slotIndex);
    }
}

// ========== Pure renderer (used by both live + export) ==========

/**
 * @param {boolean} isFull - When true, renders 'full' style: no background
 *                           card, hollow ring dots, vertical playhead tick.
 *                           Dot radii derived from bar height instead of
 *                           the size preset.
 */
function drawBeatBarFrame(ctx, w, h, t, beats, pulses, now, autoCreatePulses, isFull) {
    if (!isFull) {
        const pad = 4, radius = 8;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, radius);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(pad + 4, h / 2);
        ctx.lineTo(w - pad - 4, h / 2);
        ctx.stroke();
    }

    if (!beats || !beats.length) return;

    if (autoCreatePulses) {
        for (let i = 0; i < beats.length; i++) {
            if (beats[i] <= t && beats[i] > t - 0.05 && !pulses.has(i)) {
                pulses.set(i, { startTime: now });
            }
            if (beats[i] > t + 0.1) break;
        }
    }

    const lookahead = BEAT_CONFIG.lookahead;
    const playheadX = w * BEAT_CONFIG.playheadXFrac;
    const lookbehind = lookahead * (BEAT_CONFIG.playheadXFrac / (1 - BEAT_CONFIG.playheadXFrac));
    const pxPerSec = (w - playheadX) / lookahead;

    // Sizing: full mode derives from canvas height, others from size preset.
    let baseR, pulseR;
    if (isFull) {
        baseR = Math.max(10, Math.min(20, h * 0.06));
        pulseR = baseR + 12;
    } else {
        const sizeCfg = BAR_SIZES[BEAT_CONFIG.barSize] || BAR_SIZES.medium;
        baseR = sizeCfg.baseR;
        pulseR = baseR + sizeCfg.pulseExtra;
    }

    // Playhead. Full = short vertical tick centered on dot strip; others = full-height line.
    if (isFull) {
        const halfStripH = baseR * 1.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, h / 2 - halfStripH);
        ctx.lineTo(playheadX, h / 2 + halfStripH);
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 6);
        ctx.lineTo(playheadX, h - 6);
        ctx.stroke();
    }

    const firstT = t - lookbehind - 0.2;
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] < firstT) lo = mid + 1; else hi = mid;
    }

    const dotAlpha = isFull ? 0.75 : 1.0;
    const glowMult = isFull ? 0.35 : 0.55;

    for (let i = lo; i < beats.length; i++) {
        const bt = beats[i];
        const dt = bt - t;
        if (dt > lookahead + 0.2) break;

        const x = playheadX + dt * pxPerSec;
        const y = h / 2;

        // Past-beat fade.
        let fade = 1;
        if (dt < 0) {
            fade = 1 - Math.min(1, -dt / PAST_FADE_SEC);
            if (fade <= 0) continue;
        }

        const pulse = pulses.get(i);
        let radius = baseR;
        let glow = 0;
        if (pulse) {
            const age = (now - pulse.startTime) / 1000;
            if (age > PULSE_LIFE_SEC) {
                pulses.delete(i);
            } else {
                const k = 1 - (age / PULSE_LIFE_SEC);
                radius = baseR + k * (pulseR - baseR);
                glow = k;
            }
        }

        if (glow > 0) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, radius + 18);
            g.addColorStop(0, `rgba(122,168,255,${glow * glowMult * fade})`);
            g.addColorStop(1, 'rgba(122,168,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, radius + 18, 0, Math.PI * 2);
            ctx.fill();
        }

        const isPast = dt < -0.02;

        ctx.save();
        ctx.globalAlpha = fade * dotAlpha;

        if (isFull) {
            const dotColor = isPast ? '#9ef0df' : '#7aa8ff';
            // Faint center fill independent of dotAlpha.
            ctx.save();
            ctx.globalAlpha = fade * 0.15;
            ctx.fillStyle = dotColor;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            // Solid border.
            ctx.lineWidth = 2;
            ctx.strokeStyle = dotColor;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Standard: dark halo + filled dot + drop line.
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = isPast ? '#9ef0df' : '#7aa8ff';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

function drawBeatBar(now) {
    const ctx = BeatBarState.ctx;
    const canvas = BeatBarState.canvas;
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);
    const data = beatCache.get(BeatBarState.activeSlot);
    const beats = data?.beats || [];
    const isFull = BEAT_CONFIG.barSize === 'full';
    drawBeatBarFrame(ctx, w, h, BeatBarState.smoothTime, beats, BeatBarState.pulses, now, false, isFull);
}

// ========== Export rendering: PNG sequence ==========

/**
 * Compute the band of the export canvas where the bar is drawn.
 * - Standard sizes: bottom-anchored at overlayOffsetBottom, fixed height.
 * - Full: 70% of height, vertically centered (matches userscript).
 */
function resolveBarBand(width, height) {
    if (BEAT_CONFIG.barSize === 'full') {
        const barH = Math.round(height * 0.70);
        const barY = Math.round((height - barH) / 2);
        return { barH, barY, isFull: true };
    }
    const sizeCfg = BAR_SIZES[BEAT_CONFIG.barSize] || BAR_SIZES.medium;
    const barH = sizeCfg.height;
    const barY = Math.max(0, height - barH - BEAT_CONFIG.overlayOffsetBottom);
    return { barH, barY, isFull: false };
}

/**
 * Render the beat bar to a sequence of PNG Blobs, one per export frame.
 * The frames are full-resolution, transparent everywhere except where the bar
 * is drawn. ffmpeg consumes them with `-framerate $fps -i frame_%06d.png`,
 * which preserves alpha natively across all browsers and ffmpeg builds.
 *
 * @returns {AsyncGenerator<{index:number, blob:Blob, total:number}>}
 */
async function* renderBeatBarPngSequence({ width, height, fps, durationSec, slotIndex, onProgress }) {
    const data = beatCache.get(slotIndex);
    if (!data || !data.beats.length) {
        console.warn('[beats export] no beats for slot', slotIndex);
        return;
    }

    const beats = data.beats;
    const { barH, barY, isFull } = resolveBarBand(width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const pulses = new Map();
    const totalFrames = Math.ceil(durationSec * fps);

    for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        const syntheticNow = (f * 1000) / fps;

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(0, barY);
        drawBeatBarFrame(ctx, width, barH, t, beats, pulses, syntheticNow, true, isFull);
        ctx.restore();

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
            throw new Error(`Failed to create PNG for frame ${f}`);
        }

        if (onProgress && (f & 31) === 0) {
            onProgress(f / totalFrames);
        }

        yield { index: f, blob, total: totalFrames };
    }

    if (onProgress) onProgress(1);
}

// Export to global scope
window.toggleBeats = toggleBeats;
window.onActiveAudioChanged = onActiveAudioChanged;
window.BeatBarState = BeatBarState;
window.invalidateBeatsForSlot = invalidateBeatsForSlot;
window.resetBeatBarLayout = resetBeatBarLayout;
window.renderBeatBarPngSequence = renderBeatBarPngSequence;
window.beatCache = beatCache;

window.setBeatPreset = setBeatPreset;
window.setBeatLookahead = setBeatLookahead;
window.setBeatSize = setBeatSize;
window.setBeatPlayheadPos = setBeatPlayheadPos;
window.setBeatSensitivity = setBeatSensitivity;
