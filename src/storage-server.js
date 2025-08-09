import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { pipeline } from "stream";
import express from "express";
import prisma from "./lib/prisma.js";
import { fileTypeByFilename } from "./lib/utils.js";
import { fileMimeByFilename } from "./lib/utils.js";

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

  console.log("Receiving file", filename, "for artist", artist);

  fs.mkdirSync(path.join(uploadDir, artist), { recursive: true });
  const destPath = path.join(uploadDir, artist, filename);

  if (fs.existsSync(destPath)) {
    console.log("File already exists, skipping");
    return res.json({ success: true, filename });
  }

  const writeStream = fs.createWriteStream(destPath);
  pipeline(req, writeStream, (err) => {
    if (err) {
      console.error("Upload failed:", err);
      return res
        .status(500)
        .json({ success: false, error: "File write failed" });
    }
    console.log("File", filename, "uploaded successfully for artist", artist);
    return res.json({ success: true, filename });
  });
});

app.get("/handshake", (req, res) => {
  res.json({ success: true });
});

app.get("/api/filestream/:id", async (req, res) => {
  try {
    // 1. Récupérer le fichier depuis la DB
    const file = await prisma.file.findUnique({
      where: { id: req.params.id },
      include: {
        artist: true,
        storage: true,
      },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found on the database" });
    }

    // 2. Construire le chemin local
    const filePath = path.join(
      uploadDir,
      file.artist.identifier,
      file.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on the disk" });
    }

    // 3. Déterminer le type (image / vidéo)
    const fileType = fileTypeByFilename(file.filename);

    console.log("File type:", fileType);
    console.log("File path:", filePath);

    if (fileType === "image") {
      const absolutePath = path.resolve(filePath);
      // Image → envoi complet
      res.setHeader("Content-Type", fileMimeByFilename(file.filename));
      fs.createReadStream(absolutePath).pipe(res);
    } else if (fileType === "video") {
      // 4. Vidéo → gestion du Range
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
          return res.status(416).send("Requested range not satisfiable");
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": fileMimeByFilename(file.filename),
        });

        return fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": fileMimeByFilename(file.filename),
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } else {
      return res.status(500).json({ error: "File type not supported" });
    }
  } catch (err) {
    console.error("Error in /api/filestream:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
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
