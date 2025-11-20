/**
 * Enhanced Downloader with Multi-Proxy Support
 *
 * Provides both:
 * 1. Legacy single-function interface: downloadFile() - for backward compatibility
 * 2. New multi-proxy interface: downloadWithOrchestrator() - for new functionality
 *
 * This maintains full compatibility with existing code while enabling new features.
 */

import fs from "fs";
import https from "https";
import { URL } from "url";
import redisClient from "./redis.js";
import { ProxyOrchestrator } from "./proxy-orchestrator.js";
import { getProxyId } from "./proxy-config.js";

/**
 * Global orchestrator instance (lazy initialized)
 */
let globalOrchestrator = null;
let orchestratorInitPromise = null;

/**
 * Get or initialize global orchestrator
 */
export async function getGlobalOrchestrator(options = {}) {
  if (globalOrchestrator && globalOrchestrator.isInitialized) {
    return globalOrchestrator;
  }

  if (orchestratorInitPromise) {
    return orchestratorInitPromise;
  }

  orchestratorInitPromise = (async () => {
    if (!globalOrchestrator) {
      globalOrchestrator = new ProxyOrchestrator(options);
    }

    await globalOrchestrator.initialize();
    return globalOrchestrator;
  })();

  return orchestratorInitPromise;
}

/**
 * Legacy download function for backward compatibility
 * Works with or without proxy system enabled
 *
 * @param {Object} attachment - Attachment to download
 * @param {number} redirectCount - Redirect count tracking
 * @returns {Promise<void>}
 */
export async function downloadFile(attachment, redirectCount = 0) {
  const { url, path, filename, outputPath, outputFilename, outputFilePath } =
    attachment;

  return new Promise(async (resolve, reject) => {
    if (fs.existsSync(outputFilePath)) return resolve();

    const skipKey = await redisClient.get(`skip-download-2:${outputFilePath}`);
    if (skipKey) return reject(new Error("File skipped"));

    if (redirectCount > 1) {
      return reject(new Error("Too many redirects"));
    }

    const request = https.get(url, (response) => {
      /** Redirection handler */
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const redirectUrl = new URL(response.headers.location, url).href;
        response.destroy();
        return downloadFile(
          { ...attachment, url: redirectUrl },
          redirectCount + 1
        )
          .then(resolve)
          .catch(reject);
      }

      /** Fails handler */
      if (response.statusCode !== 200 && response.statusCode !== 304) {
        return reject(
          new Error(
            `Failed to get '${url} /// ${filename}' (${response.statusCode})`
          )
        );
      }

      /** Timeout */
      const timeout = setTimeout(async () => {
        if (!redisClient || !outputFilePath) return;
        if (fs.existsSync(outputFilePath)) {
          fs.unlinkSync(outputFilePath);
        }
        await redisClient.set(`skip-download-2:${outputFilePath}`, "true", {
          expiration: 60 * 60 * 1,
        });

        return reject(new Error("Time exceeded, trying later."));
      }, 1000 * 60 * 10);

      /** Download process */
      fs.mkdirSync(outputPath, { recursive: true });
      const fileStream = fs.createWriteStream(outputFilePath);

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        clearTimeout(timeout);
        setTimeout(() => {
          fileStream.close(() => resolve());
        }, 300);
      });
      request.on("error", (err) => {
        clearTimeout(timeout);
        fs.unlink(outputFilePath, () => reject(err));
      });
      fileStream.on("error", (err) => {
        clearTimeout(timeout);
        fs.unlink(outputFilePath, () => reject(err));
      });
    });
  });
}

/**
 * Multi-proxy enabled download function
 * Automatically routes downloads through proxy orchestrator
 *
 * @param {Object} attachment - Attachment to download
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Result object { success, fileSize, proxyId }
 */
export async function downloadFileWithProxy(attachment, options = {}) {
  try {
    const orchestrator = await getGlobalOrchestrator(options);

    // Select a proxy downloader
    const downloader = orchestrator.selectProxyDownloader();
    if (!downloader) {
      throw new Error("No available proxies for download");
    }

    // Download through proxy
    const result = await downloader.downloadFile(attachment);
    return result;

  } catch (error) {
    // Fallback to legacy download on orchestrator error
    console.warn(`[Downloader] Orchestrator download failed, falling back to legacy: ${error.message}`);

    try {
      await downloadFile(attachment);
      return {
        success: true,
        fallback: true,
      };
    } catch (legacyError) {
      throw new Error(`Download failed: ${legacyError.message}`);
    }
  }
}

/**
 * Batch download posts with proxy support
 *
 * @param {Array<Object>} posts - Posts with attachments
 * @param {Function} postProcessor - Function to prepare attachments from post
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Batch download statistics
 */
export async function downloadPostBatchWithProxy(posts, postProcessor, options = {}) {
  try {
    const orchestrator = await getGlobalOrchestrator(options);

    // Use orchestrator for batch download
    const result = await orchestrator.downloadPostBatch(posts, postProcessor);
    return result;

  } catch (error) {
    console.error(`[Downloader] Batch download failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get orchestrator statistics
 */
export async function getOrchestratorStats() {
  try {
    const orchestrator = await getGlobalOrchestrator();
    return orchestrator.getStats();
  } catch (error) {
    console.error(`Failed to get orchestrator stats: ${error.message}`);
    return null;
  }
}

/**
 * Get proxy health status
 */
export async function getProxyHealth() {
  try {
    const orchestrator = await getGlobalOrchestrator();
    return orchestrator.getProxyHealth();
  } catch (error) {
    console.error(`Failed to get proxy health: ${error.message}`);
    return null;
  }
}

/**
 * Shutdown orchestrator gracefully
 */
export async function shutdownOrchestrator() {
  if (globalOrchestrator && globalOrchestrator.isInitialized) {
    await globalOrchestrator.shutdown();
  }
}

// Export for use in other modules
export { ProxyOrchestrator };
