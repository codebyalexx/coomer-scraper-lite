import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import {
  getAllArtistPosts,
  getArtistProfile,
  getPostContent,
} from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import redisClient from "./lib/redis.js";
import { discord } from "./lib/discord.js";
import cliProgress from "cli-progress";
import colors from "cli-color";
import logger from "./lib/logger.js";

const artists = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/artists.json"), "utf-8")
);
const uniqueArtists = [...new Set(artists)];

const artistsExceptions = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "data/artists-exceptions.json"),
    "utf-8"
  )
);

async function main() {
  const postSelectionLimitIncrease = 10;
  let postSelectionLimit = 150;

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
      const profile = await getArtistProfile(artist);

      const artistBar = multibar.create(1, 0, {
        artistName: colors.yellow(profile.name),
        progressLabel: "posts",
      });

      const posts = await getAllArtistPosts(artist);

      let selectedPosts =
        posts.length > postSelectionLimit
          ? posts.slice(0, postSelectionLimit)
          : posts;

      artistBar.setTotal(selectedPosts.length);

      if (artistsExceptions.includes(artist)) {
        selectedPosts = posts;
      }

      const postLimit = pLimit(4);

      const postTasks = selectedPosts.map((post) =>
        postLimit(async () => {
          try {
            const postContent = await getPostContent(artist, post.id);

            logger.info("post", post.id, "fetch OK");

            let attachments = [];
            if (postContent?.post?.attachments)
              attachments = [...attachments, ...postContent.post.attachments];
            if (postContent?.videos)
              attachments = [...attachments, ...postContent.videos];

            logger.info(
              "post",
              post.id,
              "found",
              attachments.length,
              "attachments"
            );

            const parsedAttachments = attachments.map((attachment) => {
              return {
                url: `https://coomer.su/data${attachment.path}`,
                path: "/data" + attachment.path,
                filename: attachment.name,
                outputPath: path.join("/app/downloads/", profile.id),
                outputFilename: attachment.name,
                outputFilePath: path.join(
                  "/app/downloads/",
                  profile.id,
                  attachment.name
                ),
              };
            });

            const attachmentLimit = pLimit(2);

            const attachmentTasks = parsedAttachments.map((attachment) =>
              attachmentLimit(async () => {
                try {
                  logger.info("attachment", attachment.filename);
                  await downloadFile(attachment);
                } catch (e) {
                  logger.error(
                    "attachment",
                    attachment.filename,
                    "failed, error:",
                    e
                  );
                }
              })
            );

            await Promise.all(attachmentTasks);
          } catch (e) {
            logger.error("post", post.id, "failed, error:", e);
          } finally {
            artistBar.increment();
          }
        })
      );

      await Promise.all(postTasks);

      multibar.remove(artistBar);
    } catch (e) {
      logger.error("artist", artist, "failed, error:", e);
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
