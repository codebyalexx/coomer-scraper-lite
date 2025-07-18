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
      if (response.statusCode !== 200) {
        return reject(
          new Error(
            `Failed to get '${url} /// ${filename}' (${response.statusCode})`
          )
        );
      }

      /** Download process */
      fs.mkdirSync(outputPath, { recursive: true });
      const fileStream = fs.createWriteStream(outputFilePath);

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        setTimeout(() => {
          fileStream.close(() => resolve());
        }, 300);
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
