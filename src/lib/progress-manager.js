
import prisma from "./prisma.js";

/**
 * ProgressManager - Centralized progress tracking for API consumption
 */
class ProgressManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;

    // In-memory state for current processing
    this.currentState = {
      artists: new Map(), // Map<artistId, { ...artistInfo, posts: Map<postId, postInfo> }>
      errors: []
    };

    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      activeDownloads: 0,
      totalBytes: 0,
      downloadedBytes: 0,
    };
  }

  /**
   * Log a message (console only for now, can be extended)
   */
  log(message, level = 'info') {
    if (!this.enabled) return;

    // Only log specific events as requested
    // "Discord is connected" - handled in app.js usually
    // "Api is runinng" - handled in server.js
    // "Finished to process an artist" - kept
    // "Major errors" - kept

    // We will filter what we actually print in app.js logic, 
    // but here we can just pass through or store if needed.
    // For now, simple console.log for major events.

    const timestamp = new Date().toISOString();
    if (level === 'error' || level === 'success' || level === 'info') {
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Start tracking an artist
   */
  startArtist(artistId, artistName, totalPosts) {
    if (!this.enabled) return null;

    const artistObj = {
      id: artistId,
      name: artistName,
      totalPosts,
      processedPosts: 0,
      startTime: Date.now(),
      status: 'processing',
      posts: new Map()
    };

    this.currentState.artists.set(artistId, artistObj);
    return artistId;
  }

  /**
   * Update artist progress
   */
  updateArtist(artistId, completed) {
    if (!this.enabled || !artistId) return;
    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      artist.processedPosts = completed;
    }
  }

  /**
   * Complete artist progress
   */
  completeArtist(artistId) {
    if (!this.enabled || !artistId) return;
    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      artist.status = 'completed';
      artist.endTime = Date.now();
      // We might want to keep it in history or remove it. 
      // For "Current Progress", removing it after a while or keeping it until next cycle makes sense.
      // The user asked for "processing progress", so maybe remove it or mark completed.
      // Let's keep it for a bit or just mark it.
      this.currentState.artists.delete(artistId);
    }
  }

  /**
   * Start tracking a post
   */
  startPost(postId, postLabel, totalAttachments) {
    if (!this.enabled) return null;

    // Find which artist this post belongs to is tricky if we don't pass artistId.
    // However, usually we can find it or we change the signature.
    // In app.js: progressManager.startPost(post.id, ...) 
    // The previous implementation didn't link post to artist explicitly in the Map structure 
    // EXCEPT that multibar handled it visually.

    // To properly nest posts under artists for the API response:
    // "return an array for each artists it is processing, and for each artist there will be each posts"

    // We need to know the artistId. 
    // Existing call: const postBarId = progressManager.startPost(post.id, `Post ...`, attachments.length);
    // It does NOT pass artistId. 

    // I will iterate all artists to find if we can link it, or just keep a flat map of simple posts if strict hierarchy is hard without refactoring app.js.
    // BUT the requirement is specific: "for each artist there will be each posts".
    // I should update startPost signature in generic way or just store it.

    // Let's cheat slightly or check if I can modify app.js to pass artistId.
    // usage in app.js: progressManager.startPost(post.id, ...) inside the artist loop.
    // I can easily pass artistId in app.js.

    // For now, I'll store posts in a flat map but mapped to artistId if possible, 
    // OR just modify app.js to pass artistId.
    // Modifying app.js is part of the plan. I will add artistId to startPost.

    return { postId, postLabel, totalAttachments };
  }

  // Enhanced startPost to accept artistId
  startPostV2(artistId, postId, postLabel, totalAttachments) {
    if (!this.enabled) return null;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const postObj = {
        id: postId,
        label: postLabel,
        totalAttachments,
        processedAttachments: 0,
        startTime: Date.now(),
        status: 'processing',
        files: new Map()
      };
      artist.posts.set(postId, postObj);
      return { artistId, postId };
    }
    return null;
  }

  /**
   * Update post progress
   */
  updatePost(idObj, completed) {
    if (!this.enabled || !idObj) return;
    const { artistId, postId } = idObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        post.processedAttachments = completed;
      }
    }
  }

  /**
   * Complete post progress
   */
  completePost(idObj) {
    if (!this.enabled || !idObj) return;
    const { artistId, postId } = idObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      artist.posts.delete(postId); // Remove post when done to keep "current" clean? 
      // Or keep it marked completed? "return an array for each artists it is processing... and for each posts each files that are being downloaded"
      // If it's done, it's not "processing". 
      // I'll delete it to keep the response light and "current".
    }
  }

  /**
   * Start tracking a file
   */
  startFile(idObj, fileId, filename, totalBytes = 0) {
    if (!this.enabled || !idObj) return null;
    const { artistId, postId } = idObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        const fileObj = {
          id: fileId,
          filename,
          totalBytes,
          downloadedBytes: 0,
          startTime: Date.now(),
          status: 'downloading'
        };
        post.files.set(fileId, fileObj);

        this.stats.totalFiles++;
        this.stats.activeDownloads++;

        return { artistId, postId, fileId };
      }
    }
    return null;
  }

  /**
   * Update file
   */
  updateFile(fileIdObj, downloadedBytes, totalBytes) {
    if (!this.enabled || !fileIdObj) return;
    const { artistId, postId, fileId } = fileIdObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        const file = post.files.get(fileId);
        if (file) {
          const bytesDiff = downloadedBytes - file.downloadedBytes;
          this.stats.downloadedBytes += bytesDiff;

          file.downloadedBytes = downloadedBytes;
          file.totalBytes = totalBytes;
        }
      }
    }
  }

  /**
   * Complete file
   */
  completeFile(fileIdObj) {
    if (!this.enabled || !fileIdObj) return;
    const { artistId, postId, fileId } = fileIdObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        this.stats.completedFiles++;
        this.stats.activeDownloads--;
        post.files.delete(fileId); // Remove done file
      }
    }
  }

  failFile(fileIdObj, error) {
    if (!this.enabled || !fileIdObj) return;
    const { artistId, postId, fileId } = fileIdObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        // Add to global errors
        this.currentState.errors.push({
          type: 'file_download',
          artistName: artist.name,
          filename: post.files.get(fileId)?.filename,
          error: error?.message || error,
          time: new Date()
        });

        this.stats.failedFiles++;
        this.stats.activeDownloads--;
        post.files.delete(fileId);
      }
    }
  }

  skipFile(fileIdObj) {
    if (!this.enabled || !fileIdObj) return;
    const { artistId, postId, fileId } = fileIdObj;

    const artist = this.currentState.artists.get(artistId);
    if (artist) {
      const post = artist.posts.get(postId);
      if (post) {
        this.stats.skippedFiles++;
        this.stats.activeDownloads--;
        post.files.delete(fileId);
      }
    }
  }

  /**
   * Get Overall Stats from DB
   */
  async getOverallStats() {
    try {
      const [totalArtists, totalPosts, totalPopularPosts, totalFiles, totalPopularFiles] = await Promise.all([
        prisma.artist.count(),
        prisma.post.count(),
        prisma.popularPost.count(),
        prisma.file.count(),
        prisma.popularFile.count()
      ]);

      // Get per-artist stats
      const artists = await prisma.artist.findMany({
        include: {
          _count: {
            select: { posts: true, files: true }
          }
        }
      });

      const formattedArtists = artists.map(a => ({
        ...a,
        artistsPosts: a._count.posts,
        artistFiles: a._count.files,
        _count: undefined
      }));

      return {
        totalArtists,
        totalPosts: totalPosts + totalPopularPosts,
        totalFiles: totalFiles + totalPopularFiles,
        artists: formattedArtists
      };
    } catch (e) {
      console.error("Error fetching overall stats:", e);
      return null;
    }
  }

  /**
   * Get Current Progress
   */
  getCurrentProgress() {
    // transform Map to Array for JSON response
    const artistsArray = [];

    for (const [artistId, artist] of this.currentState.artists.entries()) {
      const postsArray = [];
      for (const [postId, post] of artist.posts.entries()) {
        const filesArray = [];
        for (const [fileId, file] of post.files.entries()) {
          filesArray.push(file);
        }
        postsArray.push({
          ...post,
          files: filesArray
        });
      }
      artistsArray.push({
        ...artist,
        posts: postsArray
      });
    }

    return {
      stats: this.stats,
      processing: artistsArray,
      errors: this.currentState.errors
    };
  }

  reset() {
    // Reset stats but maybe keep current processing? 
    // User logic says "Reset stats for next cycle" in app.js
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      activeDownloads: 0,
      totalBytes: 0,
      downloadedBytes: 0,
    };
    // We don't prefer clearing current processing if it's still running, but app.js calls this at end of cycle.
    this.currentState.artists.clear();
    this.currentState.errors = [];
  }
}

// Singleton
let progressManagerInstance = null;
export function getProgressManager(options = {}) {
  if (!progressManagerInstance) {
    progressManagerInstance = new ProgressManager(options);
  }
  return progressManagerInstance;
}

export default ProgressManager;
