import prisma from "./prisma.js";
import redisClient from "./redis.js";
import { getAllArtistPosts } from "./coomer-api.js";
import path from "path";
import fs from "fs";
import pLimit from "p-limit";
import { getPostContent } from "./coomer-api.js";

class Seed {
  constructor() {
    this.started = false;
    this.value = 0;
    this.total = 0;
  }

  async run() {
    if (this.started) return;
    this.started = true;

    try {
      let postSelectionLimit = 150;
      const uniqueArtists = await prisma.artist.findMany();
      const postSelectionLimitKey = await redisClient.get(
        "post-selection-limit",
      );
      if (postSelectionLimitKey)
        postSelectionLimit = parseInt(postSelectionLimitKey);

      console.log(`Seeding started for ${uniqueArtists.length} artists`);

      for (const artist of uniqueArtists) {
        try {
          const posts = await getAllArtistPosts(artist.url);

          let selectedPosts =
            posts.length > postSelectionLimit
              ? posts.slice(0, postSelectionLimit)
              : posts;

          if (artist.isException) {
            selectedPosts = posts;
          }

          const postLimit = pLimit(4);

          const postTasks = selectedPosts.map((post) =>
            postLimit(async () => {
              try {
                const postContent = await getPostContent(artist.url, post.id);

                let attachments = [];
                if (postContent?.post?.attachments)
                  attachments = [
                    ...attachments,
                    ...postContent.post.attachments,
                  ];
                if (postContent?.videos)
                  attachments = [...attachments, ...postContent.videos];

                let postDB = await prisma.post.findFirst({
                  where: {
                    identifier: post.id,
                    artistId: artist.id,
                  },
                });

                if (!postDB)
                  postDB = await prisma.post.create({
                    data: {
                      identifier: post.id,
                      artistId: artist.id,
                    },
                  });

                const parsedAttachments = attachments.map((attachment) => {
                  return {
                    url: `https://coomer.st/data${attachment.path}`,
                    path: "/data" + attachment.path,
                    filename: attachment.name,
                    outputPath: path.join(
                      process.env.DOWNLOAD_DIR,
                      artist.identifier,
                    ),
                    outputFilename: attachment.name,
                    outputFilePath: path.join(
                      process.env.DOWNLOAD_DIR,
                      artist.identifier,
                      attachment.name,
                    ),
                  };
                });

                const attachmentLimit = pLimit(2);

                const attachmentTasks = parsedAttachments.map((attachment) =>
                  attachmentLimit(async () => {
                    try {
                      if (fs.existsSync(attachment.outputFilePath)) {
                        let fileDB = await prisma.file.findFirst({
                          where: {
                            filename: attachment.filename,
                            postId: postDB.id,
                            artistId: artist.id,
                          },
                        });

                        if (!fileDB)
                          fileDB = await prisma.file.create({
                            data: {
                              url: attachment.url,
                              filename: attachment.filename,
                              postId: postDB.id,
                              artistId: artist.id,
                            },
                          });
                      }
                    } catch (e) {
                      console.error(
                        `Failed to process seeding attachment ${
                          attachment.filename
                        }, error: ${e.message || "no error message"}`,
                      );
                    }
                  }),
                );

                await Promise.all(attachmentTasks);
              } catch (e) {
                console.error(
                  `Failed to process post seeding ${post.id}, error: ${
                    e.message || "no error message"
                  }`,
                );
              }
            }),
          );

          await Promise.all(postTasks);
        } catch (e) {
          console.error(
            `Failed to process artist seeding ${artist.name}, error: ${
              e.message || "no error message"
            }`,
          );
        }
      }
    } catch (error) {
      console.error(
        `Error occured while seeding: ${error.message || "no error message"}`,
      );
    }
  }
}

const seed = globalThis.seed || new Seed();
globalThis.seed = seed;

export { seed };
