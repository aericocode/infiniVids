# 🎬 InfiniVids

A synchronized multi-video player that runs entirely in your browser. Play, sync, compare, and **stack-blend** multiple videos with precise control.

**[Launch InfiniVids](https://aericocode.github.io/infiniVids/)** — no install, no uploads, just open and drop your videos

> The hosted version supports everything **except export**. To export stacked videos to MP4, run the local version (see [Local Setup](#local-setup-with-export)).

## Features

- **Synchronized Playback** — Play, pause, and seek multiple videos together
- **Stack Mode** — Blend multiple videos into one composite with adjustable opacity bias and blend modes (`plus-lighter`, `normal`)
- **MP4 Export** *(local only)* — Export stacked compositions to MP4 via native ffmpeg
- **Desync Mode** — Let each video play independently with its own timeline
- **Infinite Looping** — Shorter videos loop seamlessly while longer ones continue
- **Per-Video Fullscreen** — Expand any video to fullscreen with playback controls
- **Multi-Video Drag & Drop** — Drop multiple videos at once to auto-fill slots
- **Flexible Layout** — Auto-grid or preset layouts (1×1 up to 6×4), resize individual panels
- **Audio Control** — Mix all audio together, or select a single video as the audio source
- **Per-Video Offset** — Fine-tune sync with +/- second offsets
- **Variable Speed** — 0.25× to 2× playback speed
- **Frame Stepping** — Navigate frame-by-frame for precision
- **Keyboard Shortcuts** — Full keyboard control

## Getting Started

1. Open the [hosted version](https://aericocode.github.io/infiniVids/) (or `index.html` locally)
2. Drop video files onto the slots, or click the 📁 button to browse
3. Press Play or hit Space to start playback

### Loading Videos

- **Single video**: Drop onto any slot or click 📁
- **Multiple videos**: Drop multiple files at once — they auto-fill available slots
- **Replace video**: Drop onto an occupied slot to replace it
- **Need more slots**: Adjust the number input in the ribbon, or just drop more videos than you have slots

### Layout Options

| Preset | Grid |
|--------|------|
| Auto | Automatically calculates best fit |
| 1×1 | Single video |
| 2×2 | 4 videos |
| 3×3 | 9 videos |
| 4×4 | 16 videos |
| ... | Up to 6×4 (24 videos) |

### Stack Mode

Click **⧉ Stack** (or press `S`) with 2+ videos loaded to composite them into a single blended view.

- **Bias slider**: Shifts opacity weight toward the bottom or top of the stack
- **Blend mode**:
  - `plus-lighter` — additive blending, bright areas accumulate
  - `normal` — standard alpha compositing, top layers obscure those below
- **Export** *(local only)*: With stack mode active and 2+ videos loaded, click ⬇ Export to render the composition to MP4

### Audio Modes

- **Single**: One video plays audio (green border). Click 🔊 on any video to switch, or press 1-9.
- **All**: All videos play audio simultaneously, mixed together.

### Sync vs Desync

- **Sync Mode** (default): All videos share a timeline. Seeking moves all videos together.
- **Desync Mode**: Each video plays independently. Toggle with the ⚡ Desync button or press D.

### Per-Video Fullscreen

Click ⛶ on any video to expand it fullscreen:
- Other videos pause to save resources
- Press Esc or double-click to exit
- All videos sync to the new position when exiting

### Video Offset

Each video has an offset control (visible on hover):
- **Positive offset**: Video plays ahead of the timeline
- **Negative offset**: Video plays behind the timeline
- Useful for syncing videos that were recorded at different start times

## Keyboard Shortcuts

| Action | Key |
|--------|-----|
| Play / Pause | Space |
| Seek -5s / +5s | ← → |
| Seek -10s / +10s | J / L |
| Frame step | , / . |
| Volume up / down | ↑ ↓ |
| Mute | M |
| Toggle Loop | R |
| Toggle Desync | D |
| Toggle Stack | S |
| Browser Fullscreen | F |
| Audio to Video 1-9 | 1-9 |
| Close modal / Exit fullscreen | Esc |

## Local Setup (with Export)

Export to MP4 requires running InfiniVids locally so it can spawn a native `ffmpeg` process. Browsers can't do this on their own, which is why the hosted version is view-only.

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **ffmpeg on your PATH** — verify with:
  ```bash
  ffmpeg -version
  ```
  Install via [ffmpeg.org/download](https://ffmpeg.org/download.html), `brew install ffmpeg`, `apt install ffmpeg`, `winget install ffmpeg`, etc.

  Alternatively, set `FFMPEG_PATH` to point at a specific binary.

### Install & Run

```bash
git clone https://github.com/aericocode/infiniVids.git
cd infiniVids
npm install
npm start
```

Then open <http://localhost:5174>.

Exported MP4s are written to `./exports/`.

### Configuration

Environment variables:

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `5174` | HTTP port |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary |

## Privacy & Security

- **100% Local** — All video processing happens in your browser (or, for export, on your local machine)
- **No Uploads to Third Parties** — Your videos never leave your device
- **Offline Ready** — Works without internet once loaded
- **No Tracking** — Zero analytics, no cookies, no external requests

The hosted version on Deno Deploy serves only static files; it never receives your video data.

## Tips

- **Performance**: Fewer videos = smoother playback. Use fullscreen mode for intensive viewing.
- **Large files**: Videos play directly from disk via browser APIs — no size limits beyond your RAM.
- **Sync issues**: Use the offset controls to fine-tune if videos drift slightly.
- **Export quality**: Default is `-preset fast -crf 18`. Edit `src/exporter.js` to tune for your use case.

---

Made with 🌿 by [aericode](https://ko-fi.com/aericode)