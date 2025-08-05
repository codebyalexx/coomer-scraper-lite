import axios from "axios";
import fs from "fs";

export function storeAndDelete(attachment, storage) {
  return new Promise((resolve, reject) => {
    const { url, path, filename, outputPath, outputFilename, outputFilePath } =
      attachment;
    const { host, port } = storage;

    const target = `http://${host}:${port}/api/upload`;

    axios
      .post(target, fs.createReadStream(outputFilePath), {
        headers: {
          "Content-Type": "application/octet-stream",
          "x-filename": filename,
          "x-artist": attachment.artistIdentifier,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .then((res) => {
        if (!res.data.success) {
          return reject(new Error(res.data.error));
        }
        fs.unlink(outputFilePath, () => resolve());
      })
      .catch(reject);
  });
}
