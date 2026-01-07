import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import {
  getAllArtistPosts,
  getArtistProfile,
  getPostContent,
} from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import prisma from "./lib/prisma.js";
import { getProgressManager } from "./lib/progress-manager.js";

function parseArtistUrl(url) {
  // Handle URL format: https://coomer.st/{service}/user/{username}
  // Example: https://coomer.st/onlyfans/user/thecatbnny

  let cleanUrl = url.trim();

  // Remove protocol if present
  cleanUrl = cleanUrl.replace(/^https?:\/\//, "");
  // Remove trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, "");
  // Remove leading slash
  cleanUrl = cleanUrl.replace(/^\//, "");

  const parts = cleanUrl.split("/");

  // Format: coomer.st/{service}/user/{username}
  if (parts.length < 4) {
    throw new Error(
      `Invalid artist URL: ${url}. Expected format: https://coomer.st/{service}/user/{username}`,
    );
  }

  const service = parts[1];
  const username = parts[3]; // parts[3] is the username after "/user/"

  return {
    service,
    username,
    url: `https://coomer.st/${service}/user/${username}`,
    identifier: `${service}_${username}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const urlArg = args.find((arg) => !arg.startsWith("--"));

  if (!urlArg) {
    console.error("Usage: node cli.js <artist_url>");
    console.error(
      "  artist_url: URL of the creator to download (e.g., https://coomer.st/onlyfans/username)",
    );
    process.exit(1);
  }

  const parsed = parseArtistUrl(urlArg);

  console.log(`Parsed artist URL:`);
  console.log(`  Service: ${parsed.service}`);
  console.log(`  Username: ${parsed.username}`);
  console.log(`  URL: ${parsed.url}`);
  console.log(`  Identifier: ${parsed.identifier}`);

  // Initialize progress manager
  const progressManager = getProgressManager({ enabled: true });

  let artist;

  // Check if artist already exists in database
  const existingArtist = await prisma.artist.findUnique({
    where: { url: parsed.url },
  });

  if (existingArtist) {
    console.log(
      `\nArtist found in database: ${existingArtist.name} (${existingArtist.id})`,
    );
    artist = existingArtist;
  } else {
    console.log(`\nArtist not found in database. Fetching profile...`);

    // Fetch artist profile from API
    const artistProfile = await getArtistProfile(parsed.url);

    // Create artist in database
    artist = await prisma.artist.create({
      data: {
        url: parsed.url,
        name: artistProfile.name || parsed.username,
        identifier: parsed.identifier,
        service: parsed.service,
        isException: true, // Download all posts for CLI usage
      },
    });

    console.log(`Created artist: ${artist.name} (${artist.id})`);
  }

  // Fetch artist profile (needed for post_count)
  const artistProfile = await getArtistProfile(artist.url);

  // Fetch ALL posts (no limit)
  const posts = await getAllArtistPosts(artist.url, artistProfile.post_count);

  console.log(`\nFound ${posts.length} posts to download.`);

  // Start artist progress tracking
  const artistBarId = progressManager.startArtist(
    artist.id,
    artist.name,
    posts.length,
  );

  const postLimit = pLimit(1);

  let totalFilesCount = 0;
  let completedPosts = 0;
  let failedPosts = 0;

  const postTasks = posts.map((post) =>
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
            outputPath: path.join(process.env.DOWNLOAD_DIR, artist.identifier),
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
        let failedAttachments = 0;

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
              failedAttachments++;
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
        failedPosts++;
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

  // Show final statistics
  const stats = progressManager.getStats();
  console.log(`\nDownload complete!`);
  console.log(`  Posts processed: ${completedPosts}/${posts.length}`);
  console.log(`  Posts failed: ${failedPosts}`);
  console.log(`  Total files downloaded: ${totalFilesCount}`);
  console.log(`  Completed files: ${stats.completedFiles}`);
  console.log(`  Failed files: ${stats.failedFiles}`);
  console.log(`  Skipped files: ${stats.skippedFiles}`);

  // Reset stats
  progressManager.reset();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
