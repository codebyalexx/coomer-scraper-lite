import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { validation } from "./lib/validation.js";

import {
  getAllArtistPosts,
  getArtistProfile,
  getPostContent,
} from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import redisClient from "./lib/redis.js";
import { discord } from "./lib/discord.js";
import prisma from "./lib/prisma.js";
import { startApiServer } from "./api/server.js";
import { getProgressManager } from "./lib/progress-manager.js";

async function main() {
  let nodl = process.argv.includes("--nodl");

  if (nodl) {
    console.log("Download disabled.");
    return;
  }

  // Initialize progress manager
  const progressManager = getProgressManager({ enabled: true });

  let cachedPostSelectionLimit = await redisClient.get(
    "post-selection-limit-v2",
  );
  let postSelectionLimit = 50;

  if (cachedPostSelectionLimit) {
    postSelectionLimit = parseInt(cachedPostSelectionLimit);
  }

  progressManager.log(`Post selection limit: ${postSelectionLimit}`, "info");

  const uniqueArtists = await prisma.artist.findMany({
    orderBy: [{ isException: "desc" }, { posts: { _count: "asc" } }],
  });

  const postSelectionLimitKey = await redisClient.get(
    "post-selection-limit-v2",
  );
  if (postSelectionLimitKey)
    postSelectionLimit = parseInt(postSelectionLimitKey);

  progressManager.log(
    `Starting scraper loop with ${uniqueArtists.length} artists.`,
    "info",
  );

  let artistsProcessed = 0;
  for (const artist of uniqueArtists) {
    try {
      const artistProfile = await getArtistProfile(artist.url);
      const posts = await getAllArtistPosts(
        artist.url,
        artistProfile.post_count,
      );

      let selectedPosts =
        posts.length > postSelectionLimit
          ? posts.slice(0, postSelectionLimit)
          : posts;

      // If it's an exception artist, we process 2x more posts
      if (artist.isException) {
        let selectedPosts =
          posts.length > postSelectionLimit * 2
            ? posts.slice(0, postSelectionLimit * 2)
            : posts;
      }

      progressManager.log(
        `Processing ${selectedPosts.length} posts for artist ${artist.name} (${artistsProcessed}/${uniqueArtists.length}).`,
        "info",
      );

      // Start artist progress tracking
      const artistBarId = progressManager.startArtist(
        artist.id,
        artist.name,
        selectedPosts.length,
      );

      const postLimit = pLimit(4);

      let totalFilesCount = 0;
      let completedPosts = 0;

      const postTasks = selectedPosts.map((post) =>
        postLimit(async () => {
          try {
            const postContent = await getPostContent(artist.url, post.id);

            let attachments = [];
            if (postContent?.post?.attachments)
              attachments = [...attachments, ...postContent.post.attachments];
            if (postContent?.videos)
              attachments = [...attachments, ...postContent.videos];

            // Start post progress tracking
            const postBarId = progressManager.startPost(
              post.id,
              `Post ${post.id.substring(0, 8)}...`,
              attachments.length,
            );

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
                artistIdentifier: artist.identifier,
              };
            });

            const attachmentLimit = pLimit(2);

            let completedAttachments = 0;

            const attachmentTasks = parsedAttachments.map((attachment) =>
              attachmentLimit(async () => {
                let fileBarId = null;
                try {
                  // Check if file already exists
                  if (fs.existsSync(attachment.outputFilePath)) {
                    completedAttachments++;
                    progressManager.updatePost(postBarId, completedAttachments);
                    return;
                  }

                  let fileDB = await prisma.file.findFirst({
                    where: {
                      filename: attachment.filename,
                      postId: postDB.id,
                      artistId: artist.id,
                    },
                  });

                  if (fileDB) {
                    completedAttachments++;
                    progressManager.updatePost(postBarId, completedAttachments);
                    return;
                  }

                  // Start file progress tracking
                  fileBarId = progressManager.startFile(
                    `${post.id}-${attachment.filename}`,
                    attachment.filename,
                    0,
                  );

                  await downloadFile(attachment, 0, fileBarId);

                  // await storeAndDelete(attachment, storage);

                  await prisma.file.create({
                    data: {
                      url: attachment.url,
                      filename: attachment.filename,
                      postId: postDB.id,
                      artistId: artist.id,
                    },
                  });

                  totalFilesCount++;
                  completedAttachments++;
                  progressManager.updatePost(postBarId, completedAttachments);
                } catch (e) {
                  completedAttachments++;
                  progressManager.updatePost(postBarId, completedAttachments);
                  progressManager.log(
                    `Failed to download attachment ${
                      attachment.filename
                    }, error: ${e.message || "no error message"}`,
                    "error",
                  );
                }
              }),
            );

            await Promise.all(attachmentTasks);

            // Complete post progress
            progressManager.completePost(postBarId);
            completedPosts++;
            progressManager.updateArtist(artistBarId, completedPosts);
          } catch (e) {
            completedPosts++;
            progressManager.updateArtist(artistBarId, completedPosts);
            progressManager.log(
              `Failed to process post ${post.id}, error: ${
                e.message || "no error message"
              }`,
              "error",
            );
          }
        }),
      );

      await Promise.all(postTasks);

      // Complete artist progress
      progressManager.completeArtist(artistBarId);

      progressManager.log(
        `Finished processing ${selectedPosts.length} posts for artist ${artist.name} (${artistsProcessed}/${uniqueArtists.length}). Processed ${totalFilesCount} files!`,
        "success",
      );

      artistsProcessed++;
    } catch (e) {
      progressManager.log(
        `Failed to process artist ${artist.name}, error: ${
          e.message || "no error message"
        }`,
        "error",
      );
    }
  }

  // Show final statistics
  const stats = progressManager.getStats();
  progressManager.log(
    `\nScraper cycle complete! Total files: ${stats.totalFiles}, Completed: ${stats.completedFiles}, Failed: ${stats.failedFiles}, Skipped: ${stats.skippedFiles}`,
    "success",
  );

  // Reset stats for next cycle
  progressManager.reset();

  // Loop increasing post selection limit
  let postSelectionLimitIncrease = 10;
  let maxPostSelectionLimit = 250;
  postSelectionLimit += postSelectionLimitIncrease;
  if (postSelectionLimit < maxPostSelectionLimit)
    await redisClient.set("post-selection-limit-v2", postSelectionLimit);
  setTimeout(() => main(), 15000);
}

discord();
main();
startApiServer();
validation.run();
