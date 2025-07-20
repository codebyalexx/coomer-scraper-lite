import path from "path";
import fs from "fs";
import redisClient from "../../lib/redis.js";
import { fileMimeByFilename, fileTypeByFilename } from "../../lib/utils.js";

const getArtists = async (req, res) => {
  try {
    const artists = await prisma.artist.findMany({
      include: {
        posts: true,
        files: true,
      },
    });
    res.status(200).json(
      artists.map((artist) => ({
        ...artist,
        posts: artist.posts.length,
        files: artist.files.length,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getArtist = async (req, res) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        posts: true,
        files: true,
      },
    });
    if (!artist) {
      return res.status(404).json({ error: "Artist not found" });
    }
    res.status(200).json(artist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getArtistFile = async (req, res) => {
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
    }

    if (fileType === "video") {
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
    }

    return res.status(500).json({ error: "File type not supported" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { getArtists, getArtist, getArtistFile };
