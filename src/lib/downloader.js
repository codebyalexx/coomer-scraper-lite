import fs from "fs";
import https from "https";
import { URL } from "url";
import redisClient from "./redis.js";
import axios from "axios";

export async function downloadFile(
  attachment,
  redirectCount = 0,
  storage = null
) {
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
          redirectCount + 1,
          storage
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
        await redisClient.set(`skip-download-2:${outputFilePath}`, "true", {
          expiration: 60 * 60 * 1,
        });
        if (!storage && fs.existsSync(outputFilePath)) {
          fs.unlinkSync(outputFilePath);
        }
        return reject(new Error("Time exceeded, trying later."));
      }, 1000 * 60 * 4);

      if (storage) {
        const { host, port } = storage;
        const target = `http://${host}:${port}/api/upload`;

        axios
          .post(target, response, {
            headers: {
              "Content-Type": "application/octet-stream",
              "x-filename": filename,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          })
          .then((res) => {
            clearTimeout(timeout);
            if (res.data.success) return resolve();
            reject(new Error("Remote upload failed"));
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });

        request.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } else {
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
      }
    });
  });
}
