import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import express from "express";

const app = express();
const uploadDir = path.join(process.cwd(), "downloads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const PORT = process.env.STORAGE_V_PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/upload", (req, res) => {
  const filename = req.headers["x-filename"];
  const artist = req.headers["x-artist"];
  if (!filename || !artist) {
    return res
      .status(400)
      .json({ success: false, error: "Missing filename or artist header" });
  }

  const destPath = path.join(uploadDir, artist, filename);

  const writeStream = fs.createWriteStream(destPath);
  pipeline(req, writeStream, (err) => {
    if (err) {
      console.error("Upload failed:", err);
      return res
        .status(500)
        .json({ success: false, error: "File write failed" });
    }
    return res.json({ success: true, filename });
  });
});

app.listen(PORT, () => {
  console.log(`Storage server running on port ${PORT}`);
});
