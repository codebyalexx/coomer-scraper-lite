import path from "path";
import fs from "fs";

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

    const filePath = path.join(
      "/app/downloads/",
      file.artist.identifier,
      file.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on the disk" });
    }

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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { getArtists, getArtist, getArtistFile };
