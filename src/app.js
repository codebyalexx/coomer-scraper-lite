import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";

fs.rmSync(path.join(process.cwd(), "combined.log"));
fs.rmSync(path.join(process.cwd(), "error.log"));

import { getAllArtistPosts, getPostContent } from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import redisClient from "./lib/redis.js";
import { discord } from "./lib/discord.js";
import cliProgress from "cli-progress";
import colors from "cli-color";
import logger from "./lib/logger.js";
import prisma from "./lib/prisma.js";

async function main() {
  const nodl = process.argv.includes("--nodl");

  if (nodl) {
    console.log("Download disabled.");
    return;
  }

  const postSelectionLimitIncrease = 10;
  let postSelectionLimit = 150;

  const uniqueArtists = await prisma.artist.findMany();

  const postSelectionLimitKey = await redisClient.get("post-selection-limit");
  if (postSelectionLimitKey)
    postSelectionLimit = parseInt(postSelectionLimitKey);

  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: "{bar} | {artistName} | {value}/{total} {progressLabel}",
    fps: 30,
  });

  const globalProgress = multibar.create(uniqueArtists.length, 0, {
    artistName: colors.green("GLOBAL PROGRESS"),
    progressLabel: "artists",
  });

  for (const artist of uniqueArtists) {
    try {
      const artistBar = multibar.create(1, 0, {
        artistName: colors.yellow(artist.name),
        progressLabel: "posts",
      });

      const posts = await getAllArtistPosts(artist.url);

      let selectedPosts =
        posts.length > postSelectionLimit
          ? posts.slice(0, postSelectionLimit)
          : posts;

      artistBar.setTotal(selectedPosts.length);

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
              attachments = [...attachments, ...postContent.post.attachments];
            if (postContent?.videos)
              attachments = [...attachments, ...postContent.videos];

            logger.info(
              `Found ${attachments.length} attachments for post ${post.id}`
            );

            const parsedAttachments = attachments.map((attachment) => {
              return {
                url: `https://coomer.su/data${attachment.path}`,
                path: "/data" + attachment.path,
                filename: attachment.name,
                outputPath: path.join("/app/downloads/", artist.identifier),
                outputFilename: attachment.name,
                outputFilePath: path.join(
                  "/app/downloads/",
                  artist.identifier,
                  attachment.name
                ),
              };
            });

            const attachmentLimit = pLimit(2);

            const attachmentTasks = parsedAttachments.map((attachment) =>
              attachmentLimit(async () => {
                try {
                  logger.info(`Downloading attachment ${attachment.filename}`);
                  await downloadFile(attachment);
                } catch (e) {
                  logger.error(
                    `Failed to download attachment ${
                      attachment.filename
                    }, error: ${e.message || "no error message"}`
                  );
                }
              })
            );

            await Promise.all(attachmentTasks);
          } catch (e) {
            logger.error(
              `Failed to process post ${post.id}, error: ${
                e.message || "no error message"
              }`
            );
          } finally {
            artistBar.increment();
          }
        })
      );

      await Promise.all(postTasks);

      multibar.remove(artistBar);
    } catch (e) {
      logger.error(
        `Failed to process artist ${artist.name}, error: ${
          e.message || "no error message"
        }`
      );
    } finally {
      globalProgress.increment();
    }
  }

  // Loop increasing post selection limit
  postSelectionLimit += postSelectionLimitIncrease;
  await redisClient.set("post-selection-limit", postSelectionLimit);
  main();
}

discord();
main();
