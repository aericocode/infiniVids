/**
 * Spawn ffmpeg with a stack-blend filter graph and stream progress.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildFilterComplex } from './blend.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * @param {object} opts
 * @param {string[]} opts.inputPaths       Stack order: bottom -> top
 * @param {string}   opts.outPath
 * @param {number}   opts.width
 * @param {number}   opts.height
 * @param {number}   opts.fps
 * @param {number}   opts.durationSec
 * @param {'plus-lighter'|'normal'} opts.blend
 * @param {number[]} opts.opacities
 * @param {'single'|'all'} opts.audioMode
 * @param {number}   opts.activeAudioIndex
 * @param {number[]} opts.volumes
 * @param {string|null} [opts.pngFramesDir]   Optional dir of frame_%06d.png files.
 *                                            Added as an extra ffmpeg input
 *                                            after the stack videos so blend.js
 *                                            can overlay it on the result.
 * @param {number}   [opts.pngFramesCount]    Number of PNG frames (informational).
 * @param {(pct:number)=>void} [opts.onProgress]
 */
export async function runExport(opts) {
  // blend.js takes a `hasBeatBar` flag to know whether to emit the overlay
  // chain. Derive it from pngFramesDir so the rest of opts stays clean.
  const hasBeatBar = !!opts.pngFramesDir;
  const args = buildArgs({ ...opts, hasBeatBar });
  if (process.env.DEBUG_FFMPEG) {
    console.log('[ffmpeg]', FFMPEG, args.join(' '));
  }
  return await run(FFMPEG, args, opts.durationSec, opts.onProgress);
}

function buildArgs(opts) {
  const { inputPaths, outPath, fps, durationSec, pngFramesDir, hasBeatBar } = opts;

  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-y'];

  // Stack videos: loop indefinitely so shorter videos repeat.
  for (const p of inputPaths) {
    args.push('-stream_loop', '-1', '-i', p);
  }

  // Beat bar PNG sequence: framerate must match output fps so ffmpeg consumes
  // exactly one PNG per output frame. -framerate goes BEFORE -i.
  if (pngFramesDir) {
    const pattern = path.join(pngFramesDir, 'frame_%06d.png');
    args.push('-framerate', String(fps), '-i', pattern);
  }

  const filter = buildFilterComplex({ ...opts, hasBeatBar });

  args.push(
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '[aout]',
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-t', String(durationSec),
    outPath,
  );
  return args;
}

function run(cmd, args, durationSec, onProgress) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let stderr = '';
    p.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onProgress) {
        const m = s.match(/time=(\d+):(\d+):([\d.]+)/);
        if (m) {
          const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
          onProgress(Math.min(0.99, sec / durationSec));
        }
      }
    });
    p.on('close', (code) => {
      if (code === 0 && onProgress) onProgress(1);
      resolve({ code, stderr });
    });
    p.on('error', (e) => resolve({ code: -1, stderr: String(e) }));
  });
}
