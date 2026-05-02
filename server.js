/**
 * InfiniVids local export server.
 *
 * - Serves the static app from ./public
 * - POST /export: multipart upload (videos[] + optional beatbar_frames[] PNGs + meta JSON)
 *                 -> ffmpeg encode -> mp4
 *
 * Run: node server.js  (then open http://localhost:5174)
 */
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
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

// PNG frames go in a `frames/` subdir of the scratch dir so we can rename
// them to a clean sequential pattern without colliding with video filenames.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const root = req.scratchDir ?? (req.scratchDir = fs.mkdtempSync(path.join(TMP_ROOT, 'job-')));
      if (file.fieldname === 'beatbar_frames') {
        const framesDir = req.framesDir ?? (req.framesDir = path.join(root, 'frames'));
        fs.mkdirSync(framesDir, { recursive: true });
        cb(null, framesDir);
      } else {
        cb(null, root);
      }
    },
    filename: (_req, file, cb) => {
      // Multer assigns a unique name per file; we rename PNGs after upload to
      // the ffmpeg sequential pattern. Videos keep a timestamped safe name.
      if (file.fieldname === 'beatbar_frames') {
        // Preserve client-supplied name (frame_NNNNNN.png). Client guarantees
        // padding/uniqueness; sanitize defensively.
        const safe = file.originalname.replace(/[^\w.\-]/g, '_');
        cb(null, safe);
      } else {
        const safe = file.originalname.replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}-${safe}`);
      }
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

app.use(express.static(PUBLIC_DIR));

/**
 * POST /export
 * multipart/form-data:
 *   videos:          File[]                  (in stack order, bottom -> top)
 *   beatbar_frames:  File[] (optional)       (PNGs, named frame_NNNNNN.png in order)
 *   meta:            JSON string {
 *     filename, fps, width, height, durationSec,
 *     blend: 'plus-lighter' | 'normal',
 *     opacities: number[],
 *     audioMode: 'single' | 'all',
 *     activeAudioIndex: number,
 *     volumes: number[],
 *     hasBeatBar?: boolean,
 *     beatBarFrameCount?: number,
 *   }
 *
 * Response: ndjson — {type:'progress',pct} | {type:'done',filename} | {type:'error',message}
 */
app.post('/export',
  upload.fields([
    { name: 'videos',         maxCount: 24 },
    { name: 'beatbar_frames', maxCount: 100000 }, // ~55min @ 30fps
  ]),
  async (req, res) => {
    const scratch = req.scratchDir;
    const cleanup = () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {} };

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const send = (obj) => res.write(JSON.stringify(obj) + '\n');

    try {
      const videos = req.files?.videos || [];
      const frames = req.files?.beatbar_frames || [];

      if (!videos.length) throw new Error('No videos uploaded.');
      const meta = JSON.parse(req.body.meta);
      if (!meta) throw new Error('Missing meta.');
      if (videos.length !== meta.opacities.length) {
        throw new Error(`Mismatch: ${videos.length} files vs ${meta.opacities.length} opacities.`);
      }

      const inputPaths = videos.map((f) => f.path);

      // Process beat bar frames (if any). Multer preserves the sanitized
      // originalname (frame_NNNNNN.png). We sort by name and rename to a
      // gap-free sequence so ffmpeg's %06d pattern always finds them, even
      // if any frame indices were skipped client-side.
      let pngFramesDir = null;
      let pngFramesCount = 0;
      if (frames.length) {
        if (!req.framesDir) throw new Error('Frames uploaded but no framesDir.');
        // Sort by stored filename (= sanitized client name = frame_NNNNNN.png)
        const sorted = [...frames].sort((a, b) =>
          a.filename.localeCompare(b.filename, 'en', { numeric: true })
        );
        // Two-pass rename to a clean frame_NNNNNN.png sequence.
        // Pass 1: temp names to avoid colliding with already-correct names.
        const tmpDir = req.framesDir;
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i].path;
          const tmp = path.join(tmpDir, `__t_${i}.png`);
          fs.renameSync(cur, tmp);
        }
        // Pass 2: temp -> sequential
        for (let i = 0; i < sorted.length; i++) {
          const tmp = path.join(tmpDir, `__t_${i}.png`);
          const final = path.join(tmpDir, `frame_${String(i + 1).padStart(6, '0')}.png`);
          fs.renameSync(tmp, final);
        }
        pngFramesDir = tmpDir;
        pngFramesCount = sorted.length;
      }

      console.log(`[/export] videos=${videos.length} pngFrames=${pngFramesCount} blend=${meta.blend}`);

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
        pngFramesDir,
        pngFramesCount,
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
  }
);

app.use('/exports', express.static(OUT_DIR));

app.listen(PORT, () => {
  console.log(`InfiniVids server: http://localhost:${PORT}`);
  console.log(`Exported videos save to: ${OUT_DIR}`);
});
