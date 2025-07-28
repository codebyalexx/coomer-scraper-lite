import prisma from "../../lib/prisma.js";
import path from "path";
import fs from "fs";
import { fileTypeByFilename } from "../../lib/utils.js";
import redisClient from "../../lib/redis.js";
import logger from "../../lib/logger.js";

export const getFileData = async (req, res) => {
  try {
    const file = await prisma.file.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        artist: true,
        metadata: true,
        post: true,
      },
    });
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    res.status(200).json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getFileStream = async (req, res) => {
  try {
    const file = await prisma.file.findUnique({
      where: {
        artistId: req.params.id,
        id: req.params.fileId,
      },
      include: {
        artist: true,
      },
    });
    if (!file) {
      return res.status(404).json({ error: "File not found on the database" });
    }

    const fileType = fileTypeByFilename(file.filename);
    const filePath = path.join(
      "/app/downloads/",
      file.artist.identifier,
      file.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on the disk" });
    }

    if (fileType === "image") {
      res.sendFile(filePath, (err) => {
        if (err) {
          logger.error(
            `Failed to send file ${filePath}: ${
              err.message || "no error message"
            }`
          );
          return res.status(500).json({ error: "Failed to send file" });
        }
      });
    } else if (fileType === "video") {
      const cacheKey = `video:meta:${file.id}`;
      let meta;

      const cachedMeta = await redisClient.get(cacheKey);

      if (cachedMeta) {
        meta = JSON.parse(cachedMeta);
      } else {
        const stat = fs.statSync(filePath);
        meta = {
          filePath: filePath,
          fileSize: stat.size,
        };
        await redisClient.set(cacheKey, JSON.stringify(meta));
      }

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : meta.fileSize - 1;

        if (start >= meta.fileSize) {
          return res.status(416).send("Requested range not satisfiable");
        }

        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(meta.filePath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${meta.fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": fileMimeByFilename(file.filename),
        };
        res.writeHead(206, head);
        return fileStream.pipe(res);
      } else {
        const head = {
          "Content-Length": meta.fileSize,
          "Content-Type": fileMimeByFilename(file.filename),
          "Accept-Ranges": "bytes",
        };
        res.writeHead(200, head);
        fs.createReadStream(meta.filePath).pipe(res);
      }
    } else return res.status(500).json({ error: "File type not supported" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getVideoThumbnail = async (req, res) => {
  try {
    const file = await prisma.file.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        artist: true,
      },
    });
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileType = fileTypeByFilename(file.filename);
    if (fileType !== "video") {
      return res.status(400).json({ error: "File is not a video" });
    }

    const thumbnailPath = path.join(
      "/app/downloads/",
      file.artist.identifier,
      `${file.filename}.thumbnail.jpg`
    );
    const videoPath = path.join(
      "/app/downloads/",
      file.artist.identifier,
      file.filename
    );

    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(thumbnailPath);
    }

    const ffmpegCmd = `ffmpeg -ss 00:00:01 -i "${videoPath}" -frames:v 1 -q:v 2 "${thumbnailPath}"`;
    exec(ffmpegCmd, (error) => {
      if (error) {
        logger.error(`Failed to generate thumbnail: ${error.message}`);
        return res.status(500).json({ error: "Failed to generate thumbnail" });
      }
      return res.sendFile(thumbnailPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const setFileMetadata = async (req, res) => {
  try {
    const file = await prisma.file.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        metadata: true,
      },
    });
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    if (file.metadata) {
      return res.status(400).json({ error: "Metadata already exists" });
    }
    const metadata = await prisma.fileMetadata.create({
      data: {
        type: req.body.type,
        width: req.body.width,
        height: req.body.height,
        duration: req.body.duration || undefined,
        fileId: file.id,
      },
    });
    res.status(200).json(metadata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
