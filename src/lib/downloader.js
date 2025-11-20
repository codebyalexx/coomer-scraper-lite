import fs from "fs";
import https from "https";
import { URL } from "url";
import redisClient from "./redis.js";
import { getProgressManager } from "./progress-manager.js";

export async function downloadFile(
  attachment,
  redirectCount = 0,
  progressBarId = null,
) {
  const { url, path, filename, outputPath, outputFilename, outputFilePath } =
    attachment;
  const progressManager = getProgressManager();

  return new Promise(async (resolve, reject) => {
    if (fs.existsSync(outputFilePath)) {
      // File already exists - skip
      if (progressBarId) {
        progressManager.skipFile(progressBarId);
      }
      return resolve();
    }

    const skipKey = await redisClient.get(`skip-download-2:${outputFilePath}`);
    if (skipKey) {
      if (progressBarId) {
        progressManager.skipFile(progressBarId);
      }
      return reject(new Error("File skipped"));
    }

    if (redirectCount > 1) {
      if (progressBarId) {
        progressManager.failFile(progressBarId);
      }
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
          redirectCount + 1,
          progressBarId,
        )
          .then(resolve)
          .catch(reject);
      }

      /** Fails handler */
      if (response.statusCode !== 200 && response.statusCode !== 304) {
        if (progressBarId) {
          progressManager.failFile(progressBarId);
        }
        return reject(
          new Error(
            `Failed to get '${url} /// ${filename}' (${response.statusCode})`,
          ),
        );
      }

      // Get content length for progress tracking
      const contentLength =
        parseInt(response.headers["content-length"], 10) || 0;
      let downloadedBytes = 0;

      /** Timeout */
      const timeout = setTimeout(
        async () => {
          if (!redisClient || !outputFilePath) return;
          if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
          }
          await redisClient.set(`skip-download-2:${outputFilePath}`, "true", {
            EX: 60 * 60 * 1,
          });

          if (progressBarId) {
            progressManager.failFile(progressBarId);
          }
          return reject(new Error("Time exceeded, trying later."));
        },
        1000 * 60 * 10,
      );

      /** Download process */
      fs.mkdirSync(outputPath, { recursive: true });
      const fileStream = fs.createWriteStream(outputFilePath);

      // Track download progress
      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (progressBarId && contentLength > 0) {
          progressManager.updateFile(
            progressBarId,
            downloadedBytes,
            contentLength,
          );
        }
      });

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        clearTimeout(timeout);
        if (progressBarId) {
          progressManager.completeFile(progressBarId);
        }
        setTimeout(() => {
          fileStream.close(() => resolve());
        }, 300);
      });
      request.on("error", (err) => {
        clearTimeout(timeout);
        if (progressBarId) {
          progressManager.failFile(progressBarId);
        }
        fs.unlink(outputFilePath, () => reject(err));
      });
      fileStream.on("error", (err) => {
        clearTimeout(timeout);
        if (progressBarId) {
          progressManager.failFile(progressBarId);
        }
        fs.unlink(outputFilePath, () => reject(err));
      });
    });
  });
}
