import prisma from "../../lib/prisma.js";

const getArtists = async (req, res) => {
  const offset = parseInt(req.query.offset, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 16;
  try {
    const artists = await prisma.artist.findMany({
      include: {
        posts: true,
        files: true,
      },
      skip: offset,
      take: limit,
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
  const fileOffset = parseInt(req.query.fileOffset, 10) || 0;
  const fileLimit = parseInt(req.query.fileLimit, 10) || 24;
  const postOffset = parseInt(req.query.postOffset, 10) || 0;
  const postLimit = parseInt(req.query.postLimit, 10) || 12;

  try {
    const storage = await prisma.storage.findFirst({});
    let handshakeSuccess = false;

    if (storage) {
      const storageHandshake = await fetch(
        `http://${storage.host}:${storage.port}/handshake`,
        {
          method: "GET",
        }
      );

      if (storageHandshake.ok) {
        handshakeSuccess = true;
      } else {
        console.error(
          `Handshake failed with storage server ${storage.host}:${storage.port}, retrying...`
        );
      }
    }

    const artist = await prisma.artist.findUnique({
      where: {
        id: req.params.id,
        ...(handshakeSuccess ? {} : { storageId: null }),
      },
      include: {
        posts: {
          skip: postOffset,
          take: postLimit,
        },
        files: {
          include: {
            metadata: true,
          },
          skip: fileOffset,
          take: fileLimit,
        },
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

export { getArtists, getArtist };
