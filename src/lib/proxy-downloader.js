/**
 * Proxy Downloader
 *
 * Each proxy has its own downloader instance that:
 * - Manages independent concurrency limits (post & attachment)
 * - Processes tasks from the shared queue
 * - Handles retries and errors
 * - Integrates with Redis for deduplication and locking
 */

import fs from "fs";
import https from "https";
import { URL } from "url";
import pLimit from "p-limit";
import redisClient from "./redis.js";
import { getHttpsAgent } from "./http-agent-factory.js";
import { getConcurrencyConfig } from "./proxy-config.js";

/**
 * ProxyDownloader - Manages downloads for a single proxy
 */
export class ProxyDownloader {
  /**
   * Initialize a proxy downloader
   *
   * @param {string} proxyId - Unique proxy identifier (e.g., "localhost", "proxy1:3128")
   * @param {Object} proxy - Proxy configuration
   * @param {Object} taskQueue - Shared TaskQueue instance
   * @param {Object} options - Additional options
   */
  constructor(proxyId, proxy, taskQueue, options = {}) {
    this.proxyId = proxyId;
    this.proxy = proxy;
    this.taskQueue = taskQueue;

    // Get concurrency configuration
    const config = getConcurrencyConfig();

    // Initialize concurrency limiters for this proxy
    this.postLimit = pLimit(config.postLimit);
    this.attachmentLimit = pLimit(config.attachmentLimit);

    // Store configuration
    this.downloadTimeout = config.downloadTimeout;
    this.maxRedirects = config.maxRedirects;
    this.skipCacheTTL = config.skipCacheTTL;
    this.maxRetries = config.maxRetries;
    this.retryBackoffMultiplier = config.retryBackoffMultiplier;
    this.retryBaseDelay = config.retryBaseDelay;

    // Statistics tracking
    this.stats = {
      successCount: 0,
      failureCount: 0,
      skipCount: 0,
      totalTime: 0,
      activeDownloads: 0,
    };

    this.isRunning = false;
    this.logger = options.logger || console;
  }

  /**
   * Log message with proxy prefix
   */
  log(level, message) {
    const prefix = `[${this.proxyId}]`;
    if (this.logger[level]) {
      this.logger[level](`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Download a single file attachment
   * Core download logic with retry support
   *
   * @param {Object} attachment - Attachment to download
   * @param {number} redirectCount - Current redirect count
   * @param {number} attemptCount - Current attempt count
   * @returns {Promise<Object>} Result object { success, fileSize, proxyId }
   */
  async downloadFile(attachment, redirectCount = 0, attemptCount = 0) {
    const { url, filename, outputPath, outputFilePath } = attachment;
    const taskId = outputFilePath;

    return new Promise(async (resolve, reject) => {
      try {
        // Check if file exists locally
        if (fs.existsSync(outputFilePath)) {
          this.log("info", `File already exists: ${filename}`);
          await this.taskQueue.markCompleted(taskId, { alreadyExisted: true });
          return resolve({ success: true, cached: true, proxyId: this.proxyId });
        }

        // Check Redis skip cache
        const skipKey = await redisClient.get(`skip-download-2:${outputFilePath}`);
        if (skipKey) {
          this.log("warn", `File marked as skipped in Redis: ${filename}`);
          await this.taskQueue.markCompleted(taskId, { skippedInRedis: true });
          return resolve({ success: true, skipped: true, proxyId: this.proxyId });
        }

        // Acquire lock on file
        const lockAcquired = await this.taskQueue.acquireLock(taskId, this.proxyId);
        if (!lockAcquired) {
          const inProgressProxy = await this.taskQueue.getInProgressProxy(taskId);
          this.log("info", `File is being downloaded by ${inProgressProxy || 'another proxy'}: ${filename}`);
          return resolve({ success: false, lockedByOther: true, proxyId: this.proxyId });
        }

        // Mark as in-progress
        await this.taskQueue.markInProgress(taskId, this.proxyId);

        // Handle redirects limit
        if (redirectCount > this.maxRedirects) {
          throw new Error("Too many redirects");
        }

        // Get appropriate HTTPS agent
        const agent = getHttpsAgent(this.proxy);

        // Make HTTPS request
        const request = https.get(url, { agent }, (response) => {
          // Handle redirects
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            const redirectUrl = new URL(response.headers.location, url).href;
            response.destroy();

            return this.downloadFile(
              { ...attachment, url: redirectUrl },
              redirectCount + 1,
              attemptCount
            )
              .then(resolve)
              .catch(reject);
          }

          // Handle non-200/304 responses
          if (response.statusCode !== 200 && response.statusCode !== 304) {
            throw new Error(
              `HTTP ${response.statusCode} for ${filename}`
            );
          }

          // Set timeout
          const timeout = setTimeout(async () => {
            request.destroy();
            response.destroy();

            // Clean up partial file
            if (fs.existsSync(outputFilePath)) {
              fs.unlinkSync(outputFilePath);
            }

            // Mark in Redis skip cache
            await redisClient.set(`skip-download-2:${outputFilePath}`, "true", {
              expiration: this.skipCacheTTL,
            });

            await this.taskQueue.releaseLock(taskId, this.proxyId);
            reject(new Error("Download timeout"));
          }, this.downloadTimeout);

          // Create output directory and file stream
          try {
            fs.mkdirSync(outputPath, { recursive: true });
          } catch (e) {
            // Directory might already exist
          }

          const fileStream = fs.createWriteStream(outputFilePath);

          // Pipe response to file
          response.pipe(fileStream);

          // Handle successful completion
          fileStream.on("finish", () => {
            clearTimeout(timeout);
            setTimeout(() => {
              fileStream.close(() => {
                resolve({
                  success: true,
                  fileSize: fs.statSync(outputFilePath).size,
                  proxyId: this.proxyId,
                });
              });
            }, 300);
          });

          // Handle request errors
          request.on("error", (err) => {
            clearTimeout(timeout);
            response.destroy();
            if (fs.existsSync(outputFilePath)) {
              try {
                fs.unlinkSync(outputFilePath);
              } catch (e) {
                // File might already be deleted
              }
            }
            reject(err);
          });

          // Handle file stream errors
          fileStream.on("error", (err) => {
            clearTimeout(timeout);
            request.destroy();
            if (fs.existsSync(outputFilePath)) {
              try {
                fs.unlinkSync(outputFilePath);
              } catch (e) {
                // File might already be deleted
              }
            }
            reject(err);
          });
        });

        // Handle request errors
        request.on("error", (err) => {
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    })
    .then(async (result) => {
      // Success: mark as completed
      await this.taskQueue.markCompleted(taskId, {
        fileSize: result.fileSize,
        downloadedByProxy: this.proxyId,
      });
      await this.taskQueue.releaseLock(taskId, this.proxyId);
      this.stats.successCount++;
      return result;
    })
    .catch(async (error) => {
      // Failure handling with retry logic
      if (attemptCount < this.maxRetries) {
        const delay = this.retryBaseDelay * Math.pow(this.retryBackoffMultiplier, attemptCount);
        this.log("warn", `Download failed for ${filename}, retrying in ${delay}ms (attempt ${attemptCount + 1}/${this.maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.downloadFile(attachment, redirectCount, attemptCount + 1);
      }

      // Final failure: mark in queue and Redis
      await this.taskQueue.markFailed(taskId, error.message, this.proxyId);
      this.stats.failureCount++;

      this.log("error", `Download failed permanently for ${filename}: ${error.message}`);

      throw error;
    });
  }

  /**
   * Process a batch of attachments with attachment-level concurrency
   *
   * @param {Array<Object>} attachments - Array of attachments to download
   * @returns {Promise<Array>} Results array
   */
  async downloadAttachmentBatch(attachments) {
    const results = [];

    const tasks = attachments.map((attachment) =>
      this.attachmentLimit(async () => {
        try {
          const result = await this.downloadFile(attachment);
          results.push({ success: true, ...result });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      })
    );

    await Promise.all(tasks);
    return results;
  }

  /**
   * Process a batch of posts with post-level concurrency
   *
   * @param {Array<Object>} posts - Posts with their attachments
   * @param {Function} postProcessor - Async function to process post (prepare attachments, etc.)
   * @returns {Promise<Object>} Statistics of processing
   */
  async downloadPostBatch(posts, postProcessor) {
    const batchStats = {
      totalPosts: posts.length,
      processedPosts: 0,
      totalFiles: 0,
      successFiles: 0,
      failedFiles: 0,
    };

    const postTasks = posts.map((post) =>
      this.postLimit(async () => {
        try {
          const attachments = await postProcessor(post);
          const results = await this.downloadAttachmentBatch(attachments);

          batchStats.processedPosts++;
          batchStats.totalFiles += attachments.length;

          results.forEach(result => {
            if (result.success) {
              batchStats.successFiles++;
            } else {
              batchStats.failedFiles++;
            }
          });
        } catch (error) {
          this.log("error", `Failed to process post: ${error.message}`);
        }
      })
    );

    await Promise.all(postTasks);
    return batchStats;
  }

  /**
   * Get proxy statistics
   */
  getStats() {
    return {
      proxyId: this.proxyId,
      ...this.stats,
      isPending: this.postLimit.pendingCount,
      isAttachmentPending: this.attachmentLimit.pendingCount,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      successCount: 0,
      failureCount: 0,
      skipCount: 0,
      totalTime: 0,
      activeDownloads: 0,
    };
  }
}

export default ProxyDownloader;
