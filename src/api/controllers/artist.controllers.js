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

export { getArtists };
