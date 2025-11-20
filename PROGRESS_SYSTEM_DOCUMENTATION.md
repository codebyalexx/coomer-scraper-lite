# Terminal Progress Display System Documentation

## Overview

The terminal progress display system provides real-time, visually appealing feedback for download operations in the Node.js scraper. It tracks progress at multiple levels (artists, posts, and individual files) without interfering with the core download logic.

## Features

- **Multi-level Progress Tracking**: Artist → Post → File hierarchy
- **Real-time Updates**: Progress bars update dynamically as downloads proceed
- **Concurrency-Aware**: Handles multiple simultaneous downloads (respects p-limit settings)
- **Visual Feedback**: Color-coded status indicators and symbols
- **Error Handling**: Clear display of failed, completed, and skipped downloads
- **Fail-Safe Design**: Downloads continue even if progress display encounters errors
- **Clean Terminal Output**: Updates in-place without flooding the terminal
- **Cross-Platform**: Works on Linux, macOS, and Windows terminals

## Architecture

### Components

1. **ProgressManager** (`src/lib/progress-manager.js`)
   - Central progress tracking and display management
   - Singleton pattern for global access
   - Multi-bar interface using `cli-progress` library

2. **Downloader Integration** (`src/lib/downloader.js`)
   - Tracks individual file download progress
   - Reports bytes downloaded and total size
   - Handles skip/fail/complete states

3. **App Integration** (`src/app.js`)
   - Manages artist and post level progress
   - Coordinates overall download workflow
   - Displays statistics and summaries

## Usage

### Basic Usage

```javascript
import { getProgressManager } from './lib/progress-manager.js';

// Initialize (typically done once at app start)
const progressManager = getProgressManager({ enabled: true });

// Track an artist
const artistBarId = progressManager.startArtist(artistId, 'Artist Name', totalPosts);
progressManager.updateArtist(artistBarId, completedPosts);
progressManager.completeArtist(artistBarId);

// Track a post
const postBarId = progressManager.startPost(postId, 'Post Label', totalAttachments);
progressManager.updatePost(postBarId, completedAttachments);
progressManager.completePost(postBarId);

// Track a file download
const fileBarId = progressManager.startFile(fileId, 'filename.jpg', totalBytes);
progressManager.updateFile(fileBarId, downloadedBytes, totalBytes);
progressManager.completeFile(fileBarId);

// Handle errors
progressManager.failFile(fileBarId, 'Error message');

// Skip files (already exists)
progressManager.skipFile(fileBarId);

// Log messages without disrupting progress bars
progressManager.log('Message here', 'info'); // levels: info, success, warning, error

// Get statistics
const stats = progressManager.getStats();
console.log(stats.completedFiles, stats.failedFiles, stats.activeDownloads);

// Reset statistics (between cycles)
progressManager.reset();

// Stop and cleanup
progressManager.stop();
```

### Configuration

```javascript
// Enable/disable progress display
const progressManager = getProgressManager({ 
  enabled: true // Set to false to disable visual progress
});
```

### Disabling Progress Display

To disable the progress display entirely:

```javascript
const progressManager = getProgressManager({ enabled: false });
```

When disabled, all progress methods become no-ops, and `progressManager.log()` falls back to `console.log()`.

## Display Format

### Progress Bar Format

```
📊 Overall Progress      │ ████████████░░░░░░░░░░░░░░░░░░ │  45% │ ✓15 ✗2 ↓3 ⊘8
⬇  Artist: ArtistName    │ ███████████████░░░░░░░░░░░░░░░ │  67% │ 10/15 posts
↓  Post abc12345...      │ ██████████████████████░░░░░░░░ │  80% │ 4/5 files
↓  image_001.jpg         │ ███████████████████████░░░░░░░ │  85% │ 2.3MB/2.7MB
✓  video_002.mp4         │ ██████████████████████████████ │ 100% │ 15.8MB/15.8MB
```

### Status Symbols

- `📊` Summary/Overall progress
- `⬇` Active artist processing
- `↓` Active download
- `✓` Completed successfully
- `✗` Failed
- `⊘` Skipped (already exists or cached)

### Color Coding

- **Cyan**: Active/downloading
- **Green**: Completed successfully
- **Red**: Failed/error
- **Yellow**: In progress
- **Gray**: Skipped
- **Magenta**: Summary information

## Statistics Tracking

The progress manager maintains global statistics:

```javascript
{
  totalFiles: 0,        // Total files queued for download
  completedFiles: 0,    // Successfully downloaded
  failedFiles: 0,       // Failed downloads
  skippedFiles: 0,      // Already exist or cached
  activeDownloads: 0,   // Currently downloading
  totalBytes: 0,        // Total bytes to download
  downloadedBytes: 0    // Bytes downloaded so far
}
```

## Integration with Existing Code

### Concurrency Limits

The progress system respects existing `p-limit` concurrency settings:

```javascript
const postLimit = pLimit(2);      // Max 2 posts processed simultaneously
const attachmentLimit = pLimit(4); // Max 4 files downloaded per post
```

Progress bars appear/disappear as tasks start/complete within these limits.

### Redis Caching

The progress system works seamlessly with Redis-based caching:

- Files marked as skipped in Redis are reported as skipped
- Download timeouts are tracked and shown as failures
- No interference with cache logic

## Error Handling

### Fail-Safe Design

All progress methods include try-catch blocks. If the progress display encounters an error:

1. The error is logged (if possible)
2. The method returns gracefully
3. Downloads continue unaffected
4. The application does not crash

### Example

```javascript
try {
  progressManager.updateFile(barId, bytes, total);
} catch (error) {
  // Fails silently - downloads continue
}
```

## Performance Considerations

### Update Throttling

Progress bars update at 5 FPS by default to balance responsiveness and performance:

```javascript
fps: 5  // Updates 5 times per second
```

### Bar Cleanup

Progress bars are automatically removed after completion:

- Skipped files: 500ms delay
- Completed files: 1000ms delay
- Failed files: 3000ms delay (visible longer for debugging)
- Posts: 1500ms delay
- Artists: 2000ms delay

## Troubleshooting

### Progress bars not showing

1. Check if progress is enabled:
   ```javascript
   const progressManager = getProgressManager({ enabled: true });
   ```

2. Verify dependencies are installed:
   ```bash
   npm install cli-progress cli-color
   ```

### Progress bars flickering

This is normal with very fast downloads. Adjust cleanup delays if needed by modifying the `setTimeout` values in `progress-manager.js`.

### Terminal output garbled

Some terminal emulators may not fully support ANSI escape sequences. The progress system will attempt to fall back gracefully.

### Progress bars remain after completion

Bars auto-remove after delays. If they persist, call:
```javascript
progressManager.stop();
```

## Advanced Usage

### Custom Progress Manager Instance

For testing or special use cases, create a separate instance:

```javascript
import { createProgressManager } from './lib/progress-manager.js';

const customManager = createProgressManager({ enabled: true });
```

### Logging Without Disruption

To log messages while progress bars are active:

```javascript
progressManager.log('Important message', 'warning');
```

This temporarily stops the multi-bar, prints the message, then restarts it.

## API Reference

### ProgressManager Methods

#### `startArtist(artistId, artistName, totalPosts)`
Start tracking an artist's progress.
- Returns: `barId` (string) or `null`

#### `updateArtist(barId, completedPosts)`
Update artist progress counter.

#### `completeArtist(barId)`
Mark artist as completed and schedule bar removal.

#### `startPost(postId, postLabel, totalAttachments)`
Start tracking a post's progress.
- Returns: `barId` (string) or `null`

#### `updatePost(barId, completedAttachments)`
Update post progress counter.

#### `completePost(barId)`
Mark post as completed and schedule bar removal.

#### `startFile(fileId, filename, totalBytes)`
Start tracking a file download.
- Returns: `barId` (string) or `null`

#### `updateFile(barId, downloadedBytes, totalBytes)`
Update file download progress.

#### `completeFile(barId)`
Mark file as completed successfully.

#### `failFile(barId, errorMessage)`
Mark file as failed.

#### `skipFile(barId)`
Mark file as skipped.

#### `log(message, level)`
Log a message without disrupting progress bars.
- `level`: 'info', 'success', 'warning', 'error'

#### `getStats()`
Get current statistics object.

#### `reset()`
Reset all statistics to zero.

#### `stop()`
Stop and cleanup all progress bars.

## Example: Complete Integration

```javascript
import { getProgressManager } from './lib/progress-manager.js';
import { downloadFile } from './lib/downloader.js';
import pLimit from 'p-limit';

async function downloadArtist(artist, posts) {
  const progressManager = getProgressManager({ enabled: true });
  const artistBarId = progressManager.startArtist(artist.id, artist.name, posts.length);
  
  const postLimit = pLimit(2);
  let completedPosts = 0;
  
  const postTasks = posts.map(post => postLimit(async () => {
    const attachments = await fetchAttachments(post.id);
    const postBarId = progressManager.startPost(post.id, `Post ${post.id}`, attachments.length);
    
    const attachmentLimit = pLimit(4);
    let completedAttachments = 0;
    
    const attachmentTasks = attachments.map(attachment => attachmentLimit(async () => {
      const fileBarId = progressManager.startFile(
        attachment.id,
        attachment.filename,
        attachment.size
      );
      
      try {
        await downloadFile(attachment, 0, fileBarId);
        completedAttachments++;
        progressManager.updatePost(postBarId, completedAttachments);
      } catch (error) {
        progressManager.log(`Failed: ${attachment.filename}`, 'error');
        completedAttachments++;
        progressManager.updatePost(postBarId, completedAttachments);
      }
    }));
    
    await Promise.all(attachmentTasks);
    progressManager.completePost(postBarId);
    completedPosts++;
    progressManager.updateArtist(artistBarId, completedPosts);
  }));
  
  await Promise.all(postTasks);
  progressManager.completeArtist(artistBarId);
  
  const stats = progressManager.getStats();
  progressManager.log(
    `Artist complete! Files: ${stats.completedFiles}, Failed: ${stats.failedFiles}`,
    'success'
  );
}
```

## Dependencies

- `cli-progress`: ^3.12.0 - Multi-bar progress display
- `cli-color`: ^2.0.4 - Terminal color output

Both are already installed in your project's `package.json`.

## Support

For issues or questions:
1. Check this documentation
2. Review `src/lib/progress-manager.js` source code
3. Test with `enabled: false` to isolate progress display issues
4. Check terminal compatibility for ANSI escape sequences

## Future Enhancements

Potential improvements:
- Bandwidth tracking (MB/s)
- ETA (estimated time remaining)
- Proxy-specific progress tracking
- Progress persistence across restarts
- Web-based progress dashboard
