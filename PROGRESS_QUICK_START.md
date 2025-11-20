# Progress Display System - Quick Start Guide

## What You Get

A clean, real-time terminal progress display that shows:
- Overall download statistics
- Per-artist progress
- Per-post progress
- Per-file download progress with file sizes
- Color-coded status indicators
- Active download count

## Installation

Already installed! The required dependencies (`cli-progress` and `cli-color`) are in your `package.json`.

## Running with Progress Display

The progress display is **automatically enabled** when you run the scraper:

```bash
npm run dev
```

## What You'll See

```
📊 Overall Progress      │ ████████████░░░░░░░░░░░░░░░░░░ │  45% │ ✓15 ✗2 ↓3 ⊘8
⬇  Artist: ArtistName    │ ███████████████░░░░░░░░░░░░░░░ │  67% │ 10/15 posts
↓  Post abc12345...      │ ██████████████████████░░░░░░░░ │  80% │ 4/5 files
↓  image_001.jpg         │ ███████████████████░░░░░░░░░░ │  85% │ 2.3MB/2.7MB
✓  video_002.mp4         │ ██████████████████████████████ │ 100% │ 15.8MB/15.8MB
```

### Legend:
- `📊` = Overall statistics
- `⬇` = Currently processing
- `↓` = Currently downloading
- `✓` = Successfully completed
- `✗` = Failed
- `⊘` = Skipped (already exists)

### Summary Statistics (shown on the overall progress bar):
- `✓15` = 15 files completed successfully
- `✗2` = 2 files failed
- `↓3` = 3 files currently downloading
- `⊘8` = 8 files skipped

## Disabling Progress Display

If you prefer the old console.log style output, you can disable the progress display:

Edit `src/app.js` and change:

```javascript
const progressManager = getProgressManager({ enabled: true });
```

to:

```javascript
const progressManager = getProgressManager({ enabled: false });
```

## Key Features

### 1. Automatic Cleanup
Progress bars automatically disappear after completion, keeping your terminal clean.

### 2. Real-time Updates
Download progress updates as bytes are received (for files with known sizes).

### 3. Concurrency Aware
Shows exactly what's downloading right now (respects your p-limit settings of 2 posts and 4 files per post).

### 4. Error Visibility
Failed downloads stay visible longer so you can see what went wrong.

### 5. Fail-Safe
If the progress display has any issues, your downloads continue unaffected.

### 6. Clean Logging
Messages are logged without disrupting the progress bars.

## Common Scenarios

### Fast Downloads
If files download very quickly, you might see progress bars appear and disappear rapidly. This is normal!

### Large Files
Large video files will show detailed byte-by-byte progress:
```
↓  large_video.mp4       │ ████████░░░░░░░░░░░░░░░░░░░░░░ │  35% │ 125.3MB/358.2MB
```

### Skipped Files
Already downloaded files appear briefly as skipped:
```
⊘  existing_file.jpg     │ ██████████████████████████████ │ 100%
```

### Errors
Failed downloads are shown in red and stay visible for 3 seconds:
```
✗  failed_file.jpg       │ ████░░░░░░░░░░░░░░░░░░░░░░░░░░ │  15%
```

## Statistics

At the end of each scraper cycle, you'll see summary statistics:

```
Scraper cycle complete! Total files: 150, Completed: 142, Failed: 3, Skipped: 5
```

## Performance Impact

Minimal! Progress bars update only 5 times per second to keep overhead low.

## Troubleshooting

### Progress bars not showing?
1. Make sure you have the dependencies:
   ```bash
   npm install
   ```
2. Check that progress is enabled in `src/app.js`

### Terminal looks weird?
Some older terminals might not support all features. Try a modern terminal like:
- Windows Terminal (Windows)
- iTerm2 (macOS)
- GNOME Terminal (Linux)

### Want to see raw logs instead?
Set `enabled: false` in the progress manager initialization.

## More Information

See `PROGRESS_SYSTEM_DOCUMENTATION.md` for:
- Complete API reference
- Advanced usage examples
- Integration guides
- Architecture details

## Questions?

The progress system is designed to "just work" without any configuration. If you run into issues:
1. Try disabling it (`enabled: false`)
2. Check if downloads still work (they should!)
3. Review the full documentation
