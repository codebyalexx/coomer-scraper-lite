import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import readline from "readline";

import {
  getAllArtistPosts,
  getArtistProfile,
  getPostContent,
  getArtistDetailsFromURL,
} from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import prisma from "./lib/prisma.js";
import redisClient from "./lib/redis.js";
import { getProgressManager } from "./lib/progress-manager.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function downloadCreatorProfile(artistUrl) {
  console.log(`\nFetching profile for: ${artistUrl}\n`);

  const artistProfile = await getArtistProfile(artistUrl);
  const {
    service,
    id: artistId,
    name: artistName,
  } = getArtistDetailsFromURL(artistUrl);

  console.log(`Artist: ${artistProfile.name}`);
  console.log(`Total posts: ${artistProfile._data?.post_count || "unknown"}\n`);

  // Get or create artist in database
  let artistDB = await prisma.artist.findFirst({
    where: { url: artistUrl },
  });

  if (!artistDB) {
    artistDB = await prisma.artist.create({
      data: {
        url: artistUrl,
        name: artistProfile.name,
        identifier: artistId,
        service: service,
      },
    });
    console.log(`Created artist in database: ${artistDB.name}`);
  } else {
    console.log(`Using existing artist from database: ${artistDB.name}`);
  }

  const posts = await getAllArtistPosts(
    artistUrl,
    artistProfile._data?.post_count || 500,
  );
  console.log(`Found ${posts.length} posts to download.\n`);

  // Initialize progress manager
  const progressManager = getProgressManager({ enabled: true });

  const postLimit = pLimit(2);
  let totalFilesCount = 0;
  let completedPosts = 0;

  const artistBarId = progressManager.startArtist(
    artistDB.id,
    artistDB.name,
    posts.length,
  );

  const postTasks = posts.map((post) =>
    postLimit(async () => {
      try {
        const postContent = await getPostContent(artistUrl, post.id);

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

        // Get or create post in database
        let postDB = await prisma.post.findFirst({
          where: {
            identifier: post.id,
            artistId: artistDB.id,
          },
        });

        if (!postDB) {
          postDB = await prisma.post.create({
            data: {
              identifier: post.id,
              artistId: artistDB.id,
            },
          });
        }

        const parsedAttachments = attachments.map((attachment) => {
          return {
            url: `https://coomer.st/data${attachment.path}`,
            path: "/data" + attachment.path,
            filename: attachment.name,
            outputPath: path.join(
              process.env.DOWNLOAD_DIR,
              artistDB.identifier,
            ),
            outputFilename: attachment.name,
            outputFilePath: path.join(
              process.env.DOWNLOAD_DIR,
              artistDB.identifier,
              attachment.name,
            ),
            artistIdentifier: artistDB.identifier,
          };
        });

        const attachmentLimit = pLimit(4);
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
                  artistId: artistDB.id,
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

              await prisma.file.create({
                data: {
                  url: attachment.url,
                  filename: attachment.filename,
                  postId: postDB.id,
                  artistId: artistDB.id,
                },
              });

              totalFilesCount++;
              completedAttachments++;
              progressManager.updatePost(postBarId, completedAttachments);
            } catch (e) {
              completedAttachments++;
              progressManager.updatePost(postBarId, completedAttachments);
              console.log(`  Failed: ${attachment.filename} - ${e.message}`);
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
        console.log(`Failed to process post ${post.id}: ${e.message}`);
      }
    }),
  );

  await Promise.all(postTasks);

  // Complete artist progress
  progressManager.completeArtist(artistBarId);

  // Show final statistics
  const stats = progressManager.getStats();
  console.log(
    `\nDownload complete! Total files: ${stats.totalFiles}, Completed: ${stats.completedFiles}, Failed: ${stats.failedFiles}, Skipped: ${stats.skippedFiles}`,
  );

  progressManager.stop();
}

async function main() {
  console.log("=== Coomer Scraper Lite - CLI ===\n");

  const artistUrl = await askQuestion(
    "Enter creator URL (e.g., https://coomer.st/creator/fansly/user/12345): ",
  );

  if (!artistUrl.trim()) {
    console.log("No URL provided. Exiting.");
    rl.close();
    return;
  }

  try {
    await downloadCreatorProfile(artistUrl.trim());
  } catch (e) {
    console.error(`Error: ${e.message}`);
  }

  rl.close();
}

main();
