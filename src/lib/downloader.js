import fs from "fs";
import https from "https";
import { URL } from "url";

export function downloadFile(attachment, redirectCount = 0) {
  const { url, path, filename, outputPath, outputFilename, outputFilePath } =
    attachment;
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outputFilePath)) return resolve();

    if (redirectCount > 1) {
      return reject(new Error("Too many redirects"));
    }

    console.log(">", url);

    const request = https.get(url, (response) => {
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

      if (response.statusCode !== 200) {
        return reject(
          new Error(
            `Failed to get '${url} /// ${filename}' (${response.statusCode})`
          )
        );
      }

      fs.mkdirSync(outputPath, { recursive: true });

      if (fs.existsSync(outputFilePath)) return resolve();

      const fileStream = fs.createWriteStream(outputFilePath);
      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        const fileProgress = (downloadedSize / totalSize) * 100;
        //console.log(">>> " + filename + " " + fileProgress.toFixed(2) + "%");
      });

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => resolve());
      });

      request.on("error", (err) => {
        fs.unlink(outputFilePath, () => reject(err));
      });

      fileStream.on("error", (err) => {
        fs.unlink(outputFilePath, () => reject(err));
      });
    });
  });
}
