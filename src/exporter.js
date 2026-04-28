/**
 * Spawn ffmpeg with a stack-blend filter graph and stream progress.
 * Lean: no DB, no queue, no job IDs. One call = one encode.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
 * @param {number[]} opts.opacities        0..1 per input, same order
 * @param {'single'|'all'} opts.audioMode
 * @param {number}   opts.activeAudioIndex
 * @param {number[]} opts.volumes          0..1 per input, used when audioMode='all'
 * @param {(pct:number)=>void} [opts.onProgress]
 */
export async function runExport(opts) {
  const args = buildArgs(opts);
  return await run(FFMPEG, args, opts.durationSec, opts.onProgress);
}

function buildArgs(opts) {
  const {
    inputPaths, outPath, fps, durationSec,
  } = opts;

  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-y'];

  // Each input: loop indefinitely, then -t caps the global output below.
  // -stream_loop must come before -i. Loops handle "shorter videos loop while longer continue".
  for (const p of inputPaths) {
    args.push('-stream_loop', '-1', '-i', p);
  }

  const filter = buildFilterComplex(opts);

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
      // Final tick so the UI hits 100% before the 'done' event.
      if (code === 0 && onProgress) onProgress(1);
      resolve({ code, stderr });
    });
    p.on('error', (e) => resolve({ code: -1, stderr: String(e) }));
  });
}
