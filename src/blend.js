/**
 * Build an ffmpeg -filter_complex graph that mirrors InfiniVids' CSS stacking.
 *
 *   blend='plus-lighter'  -> RGB pre-multiplied by opacity, then summed via
 *                            blend=all_mode=addition. Mirrors CSS plus-lighter.
 *   blend='normal'        -> Alpha-attenuated layers composited via overlay
 *                            (standard src-over).
 *
 * Pixel format note: blend/overlay are reliable on `gbrp` (planar RGB) /
 * `gbrap` (with alpha). Going through `rgba` produces channel-loss artefacts
 * on some ffmpeg builds (magenta-only output). Stay in planar RGB the whole
 * compositing chain; convert to yuv420p only at the end.
 */

export function buildFilterComplex(opts) {
  const { inputPaths, width: W, height: H, blend, opacities } = opts;
  const N = inputPaths.length;
  if (N < 2) throw new Error('Stack export requires 2 or more videos.');
  if (opacities.length !== N) throw new Error('opacities length must equal inputs length.');

  const lines = [];

  if (blend === 'plus-lighter') {
    // Pre-multiply RGB by per-layer opacity, then sum.
    // colorchannelmixer rr/gg/bb scale the diagonal of the color matrix,
    // which is exactly "multiply RGB by k" — no alpha trickery needed.
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

    let prev = 'v0';
    for (let i = 1; i < N; i++) {
      const out = i === N - 1 ? 'voutRGB' : `bl${i}`;
      lines.push(`[${prev}][v${i}]blend=all_mode=addition:shortest=0[${out}]`);
      prev = out;
    }
    lines.push(`[voutRGB]format=yuv420p[vout]`);

  } else if (blend === 'normal') {
    // Alpha-attenuate each layer, then overlay top-down.
    for (let i = 0; i < N; i++) {
      const a = clamp01(opacities[i]).toFixed(4);
      lines.push(
        `[${i}:v]` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1,format=gbrap,colorchannelmixer=aa=${a}` +
        `[v${i}]`
      );
    }
    let prev = 'v0';
    for (let i = 1; i < N; i++) {
      const out = i === N - 1 ? 'voutRGB' : `ov${i}`;
      lines.push(`[${prev}][v${i}]overlay=eof_action=pass:format=auto[${out}]`);
      prev = out;
    }
    lines.push(`[voutRGB]format=yuv420p[vout]`);

  } else {
    throw new Error(`Unsupported blend mode: ${blend}`);
  }

  lines.push(...buildAudioLines(opts));
  return lines.join(';');
}

function buildAudioLines(opts) {
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
