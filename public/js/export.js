/**
 * InfiniVids - Stack Export (server-backed)
 *
 * Replaces the old ffmpeg.wasm version. Uploads the source video files (the
 * actual File blobs the user dropped/picked) plus blend metadata to the local
 * server, which runs native ffmpeg and streams progress back as ndjson.
 *
 * When the beat bar is enabled, also streams a PNG sequence (one PNG per
 * frame) as the `beatbar_frames` field. PNGs preserve alpha natively across
 * all browsers and ffmpeg builds, sidestepping the WebM/VP9-alpha mess.
 *
 * Drop this file in alongside layout.js / slots.js / etc. The export button in
 * the ribbon already calls showExportModal() — no HTML changes needed.
 */

const ExportState = {
    cancelController: null, // AbortController for the in-flight fetch
};

// ─── UI ───────────────────────────────────────────────────────────────────────

function showExportModal() {
    const loadedSlots = State.videoSlots.filter(s => s.loaded);
    if (!State.isStacked || loadedSlots.length < 2) {
        showToast('Stack mode with 2+ loaded videos required');
        return;
    }
    // Sanity check that we still have the source File for each loaded slot.
    // If a video was loaded before we patched slots.js to keep sourceFile, bail.
    const missing = loadedSlots.filter(s => !s.sourceFile);
    if (missing.length) {
        showToast('One or more slots are missing source files — reload them and try again');
        return;
    }

    const nativeRes = getNativeResolution();
    const resOptions = buildResOptions(nativeRes);

    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const autoName = `infini-stack-${ts}.mp4`;

    // Beat bar checkbox is only meaningful if beats are currently active and
    // the active slot has cached beats. Otherwise hide the option entirely.
    const beatsAvailable = !!(
        window.BeatBarState?.enabled &&
        window.BeatBarState.activeSlot >= 0 &&
        window.beatCache?.get(window.BeatBarState.activeSlot)?.beats?.length
    );

    const modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.className = 'export-modal';
    modal.innerHTML = `
        <div class="export-content">
            <button class="modal-close" onclick="closeExportModal()">✕</button>
            <h2>⬇ Export Stack</h2>
            <p class="export-subtitle">${loadedSlots.length} videos · ${formatTime(State.duration)} · ${State.audioMode === 'all' ? 'mixed audio' : `audio from Video ${State.activeAudioSlot + 1}`}</p>

            <div class="export-fields">
                <div class="export-field">
                    <label>Filename</label>
                    <input type="text" id="exportFilename" value="${autoName}" spellcheck="false">
                </div>
                <div class="export-row">
                    <div class="export-field">
                        <label>FPS</label>
                        <select id="exportFps">
                            <option value="24">24</option>
                            <option value="30" selected>30</option>
                            <option value="60">60</option>
                        </select>
                    </div>
                    <div class="export-field">
                        <label>Resolution</label>
                        <select id="exportRes">${resOptions}</select>
                    </div>
                </div>

                <div class="export-field">
                    <label>Layer opacities (current bias / blend: ${State.stackBlend || 'plus-lighter'})</label>
                    <div class="export-opacity-table" id="exportOpacityTable">
                        ${buildOpacityTable(loadedSlots)}
                    </div>
                </div>

                ${beatsAvailable ? `
                <div class="export-field">
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportIncludeBeats" checked>
                        Include beat bar overlay
                    </label>
                </div>` : ''}
            </div>

            <div class="export-progress-area" id="exportProgressArea" style="display:none;">
                <div class="export-progress-label" id="exportProgressLabel">Processing…</div>
                <div class="export-progress-track">
                    <div class="export-progress-fill" id="exportProgressFill" style="width:0%"></div>
                </div>
                <div class="export-progress-sub" id="exportProgressSub"></div>
            </div>

            <div class="export-actions" id="exportActions">
                <button class="export-cancel-btn" onclick="closeExportModal()">Cancel</button>
                <button class="export-start-btn" id="exportStartBtn" onclick="startExport()">⬇ Export MP4</button>
            </div>
            <div class="export-actions" id="exportCancelArea" style="display:none;">
                <button class="export-cancel-btn" onclick="cancelExport()">✕ Cancel Export</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeExportModal(); });
}

function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.remove();
}

function buildResOptions(nativeRes) {
    const { w, h } = nativeRes;
    let html = `<option value="native">Native (${w}×${h})</option>`;
    if (h > 720)  html += `<option value="720">720p (${Math.round(w * 720 / h)}×720)</option>`;
    if (h > 1080) html += `<option value="1080">1080p (${Math.round(w * 1080 / h)}×1080)</option>`;
    return html;
}

function buildOpacityTable(loadedSlots) {
    const opacities = computeStackOpacities(); // from layout.js
    return loadedSlots.map((slot) => {
        const entry = opacities.find(o => o.slotIndex === slot.index);
        const pct = Math.round((entry?.opacity ?? 0) * 100);
        const name = (document.getElementById(`label-${slot.index}`)?.textContent || `Video ${slot.index + 1}`);
        return `<div class="export-opacity-row">
            <span class="export-opacity-name">${name}</span>
            <div class="export-opacity-bar-wrap">
                <div class="export-opacity-bar" style="width:${pct}%"></div>
            </div>
            <span class="export-opacity-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function getNativeResolution() {
    let w = 1920, h = 1080, found = false;
    State.videoSlots.forEach(slot => {
        if (!slot.loaded) return;
        const v = document.getElementById(`video-${slot.index}`);
        if (!v || !v.videoWidth) return;
        if (!found || v.videoWidth > w) {
            w = v.videoWidth;
            h = v.videoHeight;
            found = true;
        }
    });
    return { w, h };
}

function setExportProgress(pct, label, sub = '') {
    const fill   = document.getElementById('exportProgressFill');
    const lbl    = document.getElementById('exportProgressLabel');
    const sublbl = document.getElementById('exportProgressSub');
    if (fill)   fill.style.width = `${Math.round(pct * 100)}%`;
    if (lbl)    lbl.textContent = label;
    if (sublbl) sublbl.textContent = sub;
}

// ─── Export action ────────────────────────────────────────────────────────────

async function startExport() {
    const loadedSlots = State.videoSlots.filter(s => s.loaded);
    if (loadedSlots.length < 2) { showToast('Need 2+ videos'); return; }

    const filename = document.getElementById('exportFilename').value.trim() || `infini-stack-${Date.now()}.mp4`;
    const fps      = parseInt(document.getElementById('exportFps').value, 10);
    const resVal   = document.getElementById('exportRes').value;
    const nativeRes = getNativeResolution();
    const { outW, outH } = resolveOutputRes(resVal, nativeRes);

    // Stack order: slots in their natural order, bottom -> top, only loaded ones.
    // computeStackOpacities() already returns them in this order.
    const stackEntries = computeStackOpacities();
    const orderedSlots = stackEntries.map(e => State.videoSlots[e.slotIndex]);
    const opacities    = stackEntries.map(e => e.opacity);

    // Map active audio slot to the index *within the uploaded ordered list*.
    const activeAudioIndex = orderedSlots.findIndex(s => s.index === State.activeAudioSlot);
    const volumes = orderedSlots.map(s => s.muted ? 0 : (s.volume ?? 1));

    // Beat bar: only engage if checkbox exists, is checked, and we have beats.
    const beatsCheckbox = document.getElementById('exportIncludeBeats');
    const wantBeats = !!(
        beatsCheckbox?.checked &&
        window.BeatBarState?.enabled &&
        window.BeatBarState.activeSlot >= 0 &&
        window.beatCache?.get(window.BeatBarState.activeSlot)?.beats?.length
    );

    const meta = {
        filename,
        fps,
        width: outW,
        height: outH,
        durationSec: State.duration,
        blend: (State.stackBlend === 'normal') ? 'normal' : 'plus-lighter', // server only supports these two
        opacities,
        audioMode: State.audioMode === 'all' ? 'all' : 'single',
        activeAudioIndex: activeAudioIndex >= 0 ? activeAudioIndex : 0,
        volumes,
    };

    const form = new FormData();
    for (const s of orderedSlots) form.append('videos', s.sourceFile, s.sourceFile.name);

    // UI -> exporting state
    document.getElementById('exportProgressArea').style.display = 'block';
    document.getElementById('exportActions').style.display = 'none';
    document.getElementById('exportCancelArea').style.display = 'flex';
    setExportProgress(0, wantBeats ? 'Rendering beat bar…' : 'Processing…');

    // Pause player while encoding (browser playing the same files would be wasteful).
    const wasPlaying = State.isPlaying;
    if (wasPlaying) togglePlay();

    ExportState.cancelController = new AbortController();
    const signal = ExportState.cancelController.signal;

    try {
        // ─── PNG sequence render (only when beats requested) ──────────────
        // Rendered BEFORE the fetch starts, so progress UI reflects it.
        // Streams PNG blobs into the FormData as they're produced.
        let frameCount = 0;
        if (wantBeats) {
            for await (const { index, blob, total } of window.renderBeatBarPngSequence({
                width: outW,
                height: outH,
                fps,
                durationSec: State.duration,
                slotIndex: window.BeatBarState.activeSlot,
                onProgress: (p) => setExportProgress(p * 0.4, 'Rendering beat bar…', `${Math.round(p * 100)}%`),
            })) {
                if (signal.aborted) throw new DOMException('aborted', 'AbortError');
                // Pad index to 6 digits so multer-saved files sort correctly
                // and so the server can rename them to frame_%06d.png.
                const name = `frame_${String(index + 1).padStart(6, '0')}.png`;
                form.append('beatbar_frames', blob, name);
                frameCount++;
            }
            meta.hasBeatBar = true;
            meta.beatBarFrameCount = frameCount;
            setExportProgress(0.4, 'Uploading…');
        }

        form.append('meta', JSON.stringify(meta));

        const resp = await fetch('/export', {
            method: 'POST',
            body: form,
            signal,
        });
        if (!resp.ok || !resp.body) throw new Error(`Server returned ${resp.status}`);

        // When beats are on, ffmpeg phase covers 40-100%. Otherwise 0-100%.
        const ffStart = wantBeats ? 0.4 : 0;
        const ffSpan  = 1 - ffStart;

        await readNdjsonStream(resp.body, (evt) => {
            if (evt.type === 'progress') {
                const overall = ffStart + evt.pct * ffSpan;
                setExportProgress(overall, 'Encoding…', `${Math.round(overall * 100)}%`);
            } else if (evt.type === 'done') {
                setExportProgress(1, `✓ Saved to exports/${evt.filename}`);
                setTimeout(closeExportModal, 1800);
            } else if (evt.type === 'error') {
                throw new Error(evt.message);
            }
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            // Already handled in cancelExport.
        } else {
            console.error('Export failed', err);
            setExportProgress(0, `✕ ${err.message}`);
            document.getElementById('exportCancelArea').style.display = 'none';
            document.getElementById('exportActions').style.display = 'flex';
        }
    } finally {
        ExportState.cancelController = null;
        if (wasPlaying && !document.getElementById('exportModal')) togglePlay();
    }
}

function cancelExport() {
    if (ExportState.cancelController) ExportState.cancelController.abort();
    closeExportModal();
    showToast('Export cancelled');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveOutputRes(resVal, nativeRes) {
    if (resVal === 'native') {
        // Still ensure even (libx264).
        return { outW: even(nativeRes.w), outH: even(nativeRes.h) };
    }
    const targetH = parseInt(resVal, 10);
    const scale   = targetH / nativeRes.h;
    return { outW: even(Math.round(nativeRes.w * scale)), outH: even(targetH) };
}

function even(n) { return Math.round(n / 2) * 2; }

/**
 * Read an ndjson (newline-delimited JSON) stream from a fetch Response body
 * and call onEvent for each parsed object. Tolerates partial chunks.
 */
async function readNdjsonStream(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try { onEvent(JSON.parse(line)); }
            catch (e) { console.warn('Bad ndjson line:', line, e); }
        }
    }
    if (buf.trim()) {
        try { onEvent(JSON.parse(buf)); } catch {}
    }
}

// ─── Globals ─────────────────────────────────────────────────────────────────

window.showExportModal  = showExportModal;
window.closeExportModal = closeExportModal;
window.startExport      = startExport;
window.cancelExport     = cancelExport;
