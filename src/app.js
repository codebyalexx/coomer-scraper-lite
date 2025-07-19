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

  for (const artist of uniqueArtists) {
    try {
      const profile = await getArtistProfile(artist);

      console.log(">> Now processing " + profile.name + "...");
      const posts = await getAllArtistPosts(artist);
      console.log(">> Found " + posts.length + " posts");

      let selectedPosts =
        posts.length > postSelectionLimit
          ? posts.slice(0, postSelectionLimit)
          : posts;

      if (artistsExceptions.includes(artist)) {
        selectedPosts = posts;
      }

      const postLimit = pLimit(4);

      const postTasks = selectedPosts.map((post) =>
        postLimit(async () => {
          try {
            const postContent = await getPostContent(artist, post.id);

            console.log("post", post.id, "fetch OK");

            let attachments = [];
            if (postContent?.post?.attachments)
              attachments = [...attachments, ...postContent.post.attachments];
            if (postContent?.videos)
              attachments = [...attachments, ...postContent.videos];

            console.log(
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
                  console.log("attachment", attachment.filename);
                  await downloadFile(attachment);
                } catch (e) {
                  console.error(
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
            console.error("post", post.id, "failed, error:", e);
          }
        })
      );

      await Promise.all(postTasks);
    } catch (e) {
      console.error("artist", artist, "failed, error:", e);
    }
  }

  // Loop increasing post selection limit
  postSelectionLimit += postSelectionLimitIncrease;
  await redisClient.set("post-selection-limit", postSelectionLimit);
  main();
}

discord();
main();
