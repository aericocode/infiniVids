/**
 * Build an ffmpeg -filter_complex graph that mirrors InfiniVids' CSS stacking.
 *
 *   blend='plus-lighter'  -> RGB pre-multiplied by opacity, summed via
 *                            blend=all_mode=addition. Mirrors CSS plus-lighter.
 *   blend='normal'        -> Alpha-attenuated layers composited via overlay.
 *
 * If `hasBeatBar` is true, an extra input (a PNG sequence at index N) is
 * overlaid on top of the stacked result before yuv420p conversion. PNGs are
 * RGBA-native, so we just `format=rgba` and overlay — no codec quirks.
 */

export function buildFilterComplex(opts) {
  const { inputPaths, width: W, height: H, blend, opacities, hasBeatBar } = opts;
  const N = inputPaths.length;

  if (opacities.length !== N) throw new Error('opacities length must equal inputs length.');

  const lines = [];

  if (blend === 'plus-lighter') {
    for (let i = 0; i < N; i++) {
      const a = clamp01(opacities[i]).toFixed(4);
      lines.push(
        `[${i}:v]` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1,format=gbrp,` +
        `colorchannelmixer=rr=${a}:gg=${a}:bb=${a}` +
        `[v${i}]`
      );
    }
    if (N === 1) {
      lines.push(`[v0]null[voutRGB]`);
    } else {
      let prev = 'v0';
      for (let i = 1; i < N; i++) {
        const out = i === N - 1 ? 'voutRGB' : `bl${i}`;
        lines.push(`[${prev}][v${i}]blend=all_mode=addition:shortest=0[${out}]`);
        prev = out;
      }
    }
  } else if (blend === 'normal') {
    // Alpha-attenuate each layer by its opacity, then overlay bottom -> top.
    for (let i = 0; i < N; i++) {
      const a = clamp01(opacities[i]).toFixed(4);
      lines.push(
        `[${i}:v]` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,` +
        `setsar=1,format=rgba,` +
        `colorchannelmixer=aa=${a}` +
        `[v${i}]`
      );
    }
    if (N === 1) {
      lines.push(`[v0]null[voutRGB]`);
    } else {
      let prev = 'v0';
      for (let i = 1; i < N; i++) {
        const out = i === N - 1 ? 'voutRGB' : `ov${i}`;
        lines.push(`[${prev}][v${i}]overlay=eof_action=pass:format=auto[${out}]`);
        prev = out;
      }
    }
  } else {
    throw new Error(`Unsupported blend mode: ${blend}`);
  }

  // Beat bar PNG sequence (optional). Input index is N (the inputs after the
  // stack videos in exporter.js's argv order). PNGs are RGBA-native, so the
  // overlay filter sees the alpha channel without any codec gymnastics —
  // this is the whole point of the PNG approach.
  if (hasBeatBar) {
    lines.push(`[${N}:v]format=rgba,scale=${W}:${H}[beats]`);
    lines.push(`[voutRGB][beats]overlay=eof_action=pass:format=auto[voutWithBeats]`);
    lines.push(`[voutWithBeats]format=yuv420p[vout]`);
  } else {
    lines.push(`[voutRGB]format=yuv420p[vout]`);
  }

  lines.push(...buildAudioLines(opts));
  return lines.join(';');
}

function buildAudioLines(opts) {
  // PNG sequence has no audio track, so the audio-input indices still map to
  // [0..N-1] regardless of whether hasBeatBar is set.
  const { audioMode, activeAudioIndex, volumes, inputPaths, durationSec } = opts;
  const N = inputPaths.length;
  const lines = [];

  if (audioMode === 'single') {
    const idx = clampInt(activeAudioIndex, 0, N - 1);
    lines.push(`[${idx}:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[aout]`);
    return lines;
  }

  let audible = 0;
  const labels = [];
  for (let i = 0; i < N; i++) {
    const v = clamp01(volumes?.[i] ?? 1);
    if (v <= 0) continue;
    audible++;
    labels.push(`[a${i}]`);
    lines.push(
      `[${i}:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS,volume=${v.toFixed(4)}[a${i}]`
    );
  }

  if (audible === 0) {
    lines.push(`anullsrc=r=44100:cl=stereo:duration=${durationSec.toFixed(3)}[aout]`);
  } else if (audible === 1) {
    lines.push(`${labels[0]}anull[aout]`);
  } else {
    lines.push(
      `${labels.join('')}amix=inputs=${audible}:duration=longest:dropout_transition=0:normalize=0[aout]`
    );
  }
  return lines;
}

function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
function clampInt(x, lo, hi) {
  const n = Math.round(Number(x) || 0);
  return Math.max(lo, Math.min(hi, n));
}
