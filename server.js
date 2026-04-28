/**
 * InfiniVids local export server.
 *
 * - Serves the static app from ./public
 * - POST /export: multipart upload (videos[] + meta JSON) -> ffmpeg encode -> mp4
 *
 * Run: node server.js  (then open http://localhost:5174)
 */
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runExport } from './src/exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5174;
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const TMP_ROOT = path.resolve(__dirname, '.tmp-uploads');
const OUT_DIR = path.resolve(__dirname, 'exports');

fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const app = express();

// Per-request scratch dir, so cleanup is trivial.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = req.scratchDir ?? (req.scratchDir = fs.mkdtempSync(path.join(TMP_ROOT, 'job-')));
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // Keep extension; prefix with field index to preserve order.
      const safe = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB per file
});

app.use(express.static(PUBLIC_DIR));

/**
 * POST /export
 * multipart/form-data:
 *   videos: File[]      (in stack order, bottom -> top)
 *   meta:   JSON string {
 *     filename, fps, width, height, durationSec,
 *     blend: 'plus-lighter' | 'normal',
 *     opacities: number[],         // one per video, same order
 *     audioMode: 'single' | 'all',
 *     activeAudioIndex: number,    // index into videos[]
 *     volumes: number[],           // 0..1 per video, used when audioMode=all
 *   }
 *
 * Response: chunked text, newline-delimited JSON events.
 *   {type:'progress', pct}
 *   {type:'done', filename, downloadUrl}
 *   {type:'error', message}
 */
app.post('/export', upload.array('videos', 24), async (req, res) => {
  const scratch = req.scratchDir;
  const cleanup = () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {} };

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  try {
    if (!req.files?.length) throw new Error('No videos uploaded.');
    const meta = JSON.parse(req.body.meta);
    if (!meta) throw new Error('Missing meta.');
    if (req.files.length !== meta.opacities.length) {
      throw new Error(`Mismatch: ${req.files.length} files vs ${meta.opacities.length} opacities.`);
    }

    const inputPaths = req.files.map((f) => f.path);
    const safeName = String(meta.filename || `infini-${Date.now()}.mp4`)
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();
    const outName = safeName.toLowerCase().endsWith('.mp4') ? safeName : safeName + '.mp4';
    const outPath = path.join(OUT_DIR, outName);

    const result = await runExport({
      inputPaths,
      outPath,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      durationSec: meta.durationSec,
      blend: meta.blend,
      opacities: meta.opacities,
      audioMode: meta.audioMode,
      activeAudioIndex: meta.activeAudioIndex,
      volumes: meta.volumes,
      onProgress: (pct) => send({ type: 'progress', pct }),
    });

    if (result.code !== 0) {
      send({ type: 'error', message: result.stderr.trim().slice(-1000) || 'ffmpeg failed' });
    } else {
      send({ type: 'done', filename: outName });
    }
  } catch (err) {
    send({ type: 'error', message: err.message || String(err) });
  } finally {
    cleanup();
    res.end();
  }
});

// Serve finished exports if anyone wants to grab one via direct URL.
// (The export flow itself doesn't trigger downloads — files just land in ./exports/.)
app.use('/exports', express.static(OUT_DIR));

app.listen(PORT, () => {
  console.log(`InfiniVids server: http://localhost:${PORT}`);
  console.log(`Exported videos save to: ${OUT_DIR}`);
});
