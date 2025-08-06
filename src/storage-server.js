import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { pipeline } from "stream";
import express from "express";
import prisma from "./lib/prisma.js";

const app = express();
const uploadDir = path.join(process.env.STORAGE_V_PATH, "downloads");
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

  fs.mkdirSync(path.join(uploadDir, artist), { recursive: true });
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

app.get("/handshake", (req, res) => {
  res.json({ success: true });
});

app.listen(PORT, async () => {
  console.log(`Storage server running on port ${PORT}`);

  let storage = await prisma.storage.findFirst({
    where: {
      name: process.env.STORAGE_V_NAME,
      host: process.env.STORAGE_V_HOST,
      port: parseInt(process.env.STORAGE_V_PORT),
    },
  });

  if (!storage) {
    storage = await prisma.storage.create({
      data: {
        name: process.env.STORAGE_V_NAME,
        host: process.env.STORAGE_V_HOST,
        port: parseInt(process.env.STORAGE_V_PORT),
      },
    });

    console.log("Storage server created");
  } else {
    console.log("Storage server found, isOK");
  }

  console.log("Storage server ready");
});
