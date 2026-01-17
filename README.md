# 🎬 InfiniVids

A synchronized multi-video player that runs entirely in your browser. Play, sync, and compare multiple videos side-by-side with precise control.

**[Launch InfiniVids](https://aericocode.github.io/infiniVids/)** — no install, no uploads, just open and drop your videos

## Features

- **Synchronized Playback** — Play, pause, and seek multiple videos together
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

1. Open `index.html` in your browser
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
| Browser Fullscreen | F |
| Audio to Video 1-9 | 1-9 |
| Close modal / Exit fullscreen | Esc |

## Privacy & Security

- **100% Local** — All video processing happens in your browser
- **No Uploads** — Your videos never leave your device
- **Offline Ready** — Works without internet once loaded
- **No Tracking** — Zero analytics, no cookies, no external requests

## Tips

- **Performance**: Fewer videos = smoother playback. Use fullscreen mode for intensive viewing.
- **Large files**: Videos play directly from disk via browser APIs — no size limits beyond your RAM.
- **Sync issues**: Use the offset controls to fine-tune if videos drift slightly.

---

Made with ☕ by [aericode](https://ko-fi.com/aericode)
