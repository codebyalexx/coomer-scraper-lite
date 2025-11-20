import cliProgress from "cli-progress";
import cliColor from "cli-color";

/**
 * ProgressManager - A clean, visually appealing terminal progress display
 * for tracking downloads across posts and attachments.
 *
 * Features:
 * - Per-artist, per-post, and per-attachment progress tracking
 * - Real-time updates without terminal flooding
 * - Concurrent download awareness
 * - Error handling and retry display
 * - Fail-safe design - downloads continue even if display fails
 */
class ProgressManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.multibar = null;
    this.bars = new Map();
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      activeDownloads: 0,
      totalBytes: 0,
      downloadedBytes: 0,
    };

    if (this.enabled) {
      this.initializeMultibar();
    }
  }

  initializeMultibar() {
    try {
      this.multibar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: this.formatBar.bind(this),
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        fps: 5,
        stream: process.stdout,
        gracefulExit: true,
        autopadding: true,
        barsize: 30,
      }, cliProgress.Presets.shades_grey);

      // Create summary bar
      this.summaryBar = this.multibar.create(100, 0, {
        type: 'summary',
        label: 'Overall Progress',
      });

    } catch (error) {
      console.error('Failed to initialize progress display:', error.message);
      this.enabled = false;
    }
  }

  formatBar(options, params, payload) {
    try {
      const percentage = Math.floor((params.value / params.total) * 100) || 0;
      const progressBar = options.barCompleteString.substr(0, Math.round(params.progress * options.barsize));
      const emptyBar = options.barIncompleteString.substr(0, options.barsize - progressBar.length);

      // Color coding based on type and status
      let statusColor = cliColor.cyan;
      let statusSymbol = '⬇';

      if (payload.type === 'summary') {
        statusColor = cliColor.magentaBright;
        statusSymbol = '📊';
      } else if (payload.status === 'completed') {
        statusColor = cliColor.green;
        statusSymbol = '✓';
      } else if (payload.status === 'failed') {
        statusColor = cliColor.red;
        statusSymbol = '✗';
      } else if (payload.status === 'downloading') {
        statusColor = cliColor.yellow;
        statusSymbol = '↓';
      } else if (payload.status === 'skipped') {
        statusColor = cliColor.gray;
        statusSymbol = '⊘';
      }

      // Format file size
      const formatSize = (bytes) => {
        if (!bytes || bytes === 0) return '---';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
      };

      // Build the display string based on type
      if (payload.type === 'summary') {
        return (
          statusSymbol + ' ' +
          statusColor(payload.label.padEnd(20)) +
          ' │ ' +
          cliColor.cyan(progressBar + emptyBar) +
          ' │ ' +
          cliColor.whiteBright(percentage.toString().padStart(3) + '%') +
          ' │ ' +
          cliColor.green('✓' + this.stats.completedFiles) + ' ' +
          cliColor.red('✗' + this.stats.failedFiles) + ' ' +
          cliColor.yellow('↓' + this.stats.activeDownloads) + ' ' +
          cliColor.gray('⊘' + this.stats.skippedFiles)
        );
      } else if (payload.type === 'artist') {
        return (
          statusSymbol + ' ' +
          statusColor(payload.label.padEnd(20)) +
          ' │ ' +
          cliColor.cyan(progressBar + emptyBar) +
          ' │ ' +
          cliColor.whiteBright(percentage.toString().padStart(3) + '%') +
          ' │ ' +
          `${params.value}/${params.total} posts`
        );
      } else if (payload.type === 'post') {
        return (
          statusSymbol + ' ' +
          statusColor(payload.label.padEnd(20)) +
          ' │ ' +
          cliColor.cyan(progressBar + emptyBar) +
          ' │ ' +
          cliColor.whiteBright(percentage.toString().padStart(3) + '%') +
          ' │ ' +
          `${params.value}/${params.total} files`
        );
      } else if (payload.type === 'file') {
        const sizeInfo = payload.totalBytes ? formatSize(payload.downloadedBytes) + '/' + formatSize(payload.totalBytes) : '';
        return (
          statusSymbol + ' ' +
          statusColor(payload.label.substring(0, 25).padEnd(25)) +
          ' │ ' +
          cliColor.cyan(progressBar + emptyBar) +
          ' │ ' +
          cliColor.whiteBright(percentage.toString().padStart(3) + '%') +
          (sizeInfo ? ' │ ' + sizeInfo : '')
        );
      }

      return progressBar + emptyBar;
    } catch (error) {
      // Fail-safe: return simple progress bar
      return `${params.value}/${params.total}`;
    }
  }

  /**
   * Start tracking an artist
   */
  startArtist(artistId, artistName, totalPosts) {
    if (!this.enabled) return null;

    try {
      const barId = `artist-${artistId}`;
      const bar = this.multibar.create(totalPosts, 0, {
        type: 'artist',
        label: `Artist: ${artistName}`,
        status: 'downloading',
      });

      this.bars.set(barId, {
        bar,
        type: 'artist',
        completed: 0,
        total: totalPosts,
      });

      return barId;
    } catch (error) {
      console.error('Failed to start artist progress:', error.message);
      return null;
    }
  }

  /**
   * Update artist progress
   */
  updateArtist(barId, completed) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.completed = completed;
        barData.bar.update(completed);
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Complete artist progress
   */
  completeArtist(barId) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.bar.update(barData.total, { status: 'completed' });
        // Remove bar after a short delay
        setTimeout(() => {
          if (this.multibar && barData.bar) {
            this.multibar.remove(barData.bar);
            this.bars.delete(barId);
          }
        }, 2000);
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Start tracking a post
   */
  startPost(postId, postLabel, totalAttachments) {
    if (!this.enabled) return null;

    try {
      const barId = `post-${postId}`;
      const bar = this.multibar.create(totalAttachments, 0, {
        type: 'post',
        label: postLabel,
        status: 'downloading',
      });

      this.bars.set(barId, {
        bar,
        type: 'post',
        completed: 0,
        total: totalAttachments,
      });

      return barId;
    } catch (error) {
      console.error('Failed to start post progress:', error.message);
      return null;
    }
  }

  /**
   * Update post progress
   */
  updatePost(barId, completed) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.completed = completed;
        barData.bar.update(completed);
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Complete post progress
   */
  completePost(barId) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.bar.update(barData.total, { status: 'completed' });
        // Remove bar after a short delay
        setTimeout(() => {
          if (this.multibar && barData.bar) {
            this.multibar.remove(barData.bar);
            this.bars.delete(barId);
          }
        }, 1500);
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Start tracking a file download
   */
  startFile(fileId, filename, totalBytes = 0) {
    if (!this.enabled) return null;

    try {
      const barId = `file-${fileId}`;
      const bar = this.multibar.create(totalBytes || 100, 0, {
        type: 'file',
        label: filename,
        status: 'downloading',
        totalBytes,
        downloadedBytes: 0,
      });

      this.bars.set(barId, {
        bar,
        type: 'file',
        completed: 0,
        total: totalBytes || 100,
        filename,
      });

      this.stats.totalFiles++;
      this.stats.activeDownloads++;
      this.updateSummary();

      return barId;
    } catch (error) {
      console.error('Failed to start file progress:', error.message);
      return null;
    }
  }

  /**
   * Update file download progress
   */
  updateFile(barId, downloadedBytes, totalBytes) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        const progress = totalBytes ? downloadedBytes : (downloadedBytes / 100) * 100;
        barData.bar.update(downloadedBytes, {
          totalBytes,
          downloadedBytes,
        });

        // Update global stats
        const bytesDiff = downloadedBytes - (barData.downloadedBytes || 0);
        this.stats.downloadedBytes += bytesDiff;
        barData.downloadedBytes = downloadedBytes;
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Mark file as completed
   */
  completeFile(barId) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.bar.update(barData.total, { status: 'completed' });
        this.stats.completedFiles++;
        this.stats.activeDownloads--;

        // Remove bar after a short delay
        setTimeout(() => {
          if (this.multibar && barData.bar) {
            this.multibar.remove(barData.bar);
            this.bars.delete(barId);
          }
        }, 1000);

        this.updateSummary();
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Mark file as failed
   */
  failFile(barId, errorMessage = '') {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.bar.update(barData.bar.value, { status: 'failed' });
        this.stats.failedFiles++;
        this.stats.activeDownloads--;

        // Keep failed bars visible longer
        setTimeout(() => {
          if (this.multibar && barData.bar) {
            this.multibar.remove(barData.bar);
            this.bars.delete(barId);
          }
        }, 3000);

        this.updateSummary();
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Mark file as skipped (already exists or cached)
   */
  skipFile(barId) {
    if (!this.enabled || !barId) return;

    try {
      const barData = this.bars.get(barId);
      if (barData) {
        barData.bar.update(barData.total, { status: 'skipped' });
        this.stats.skippedFiles++;
        this.stats.activeDownloads--;

        // Remove skipped bars quickly
        setTimeout(() => {
          if (this.multibar && barData.bar) {
            this.multibar.remove(barData.bar);
            this.bars.delete(barId);
          }
        }, 500);

        this.updateSummary();
      }
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Update summary bar
   */
  updateSummary() {
    if (!this.enabled || !this.summaryBar) return;

    try {
      const total = this.stats.totalFiles || 1;
      const completed = this.stats.completedFiles + this.stats.failedFiles + this.stats.skippedFiles;
      const percentage = Math.floor((completed / total) * 100);

      this.summaryBar.update(percentage);
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Log a message without disrupting progress bars
   */
  log(message, level = 'info') {
    if (!this.enabled) {
      console.log(message);
      return;
    }

    try {
      // Stop multibar temporarily to print message
      if (this.multibar) {
        this.multibar.stop();
      }

      const colors = {
        info: cliColor.cyan,
        success: cliColor.green,
        warning: cliColor.yellow,
        error: cliColor.red,
      };

      const color = colors[level] || cliColor.white;
      console.log(color(message));

      // Restart multibar
      if (this.multibar) {
        this.multibar.start();
      }
    } catch (error) {
      console.log(message);
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Stop and cleanup all progress bars
   */
  stop() {
    if (!this.enabled) return;

    try {
      if (this.multibar) {
        this.multibar.stop();
      }
      this.bars.clear();
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      activeDownloads: 0,
      totalBytes: 0,
      downloadedBytes: 0,
    };

    if (this.summaryBar) {
      this.summaryBar.update(0);
    }
  }
}

// Singleton instance
let progressManagerInstance = null;

/**
 * Get or create the global progress manager instance
 */
export function getProgressManager(options = {}) {
  if (!progressManagerInstance) {
    progressManagerInstance = new ProgressManager(options);
  }
  return progressManagerInstance;
}

/**
 * Create a new progress manager instance (for testing or special use cases)
 */
export function createProgressManager(options = {}) {
  return new ProgressManager(options);
}

export default ProgressManager;
