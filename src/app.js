import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { validation } from "./lib/validation.js";

fs.rmSync(path.join(process.cwd(), "combined.log"));
fs.rmSync(path.join(process.cwd(), "error.log"));

import { getAllArtistPosts, getPostContent } from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import redisClient from "./lib/redis.js";
import { discord } from "./lib/discord.js";
import prisma from "./lib/prisma.js";
import { startApiServer } from "./api/server.js";
import { storeAndDelete } from "./lib/storage.js";
import { fileTypeByFilename } from "./lib/utils.js";

async function main() {
  let nodl = process.argv.includes("--nodl");

  if (nodl) {
    console.log("Download disabled.");
    return;
  }

  let postSelectionLimit = 150;

  const uniqueArtists = await prisma.artist.findMany({
    orderBy: [{ isException: "desc" }, { posts: { _count: "asc" } }],
  });

  const postSelectionLimitKey = await redisClient.get("post-selection-limit");
  if (postSelectionLimitKey)
    postSelectionLimit = parseInt(postSelectionLimitKey);

  console.log(`Starting scraper loop with ${uniqueArtists.length} artists.`);

  let artistsProcessed = 0;
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

      console.log(
        `Processing ${selectedPosts.length} posts for artist ${artist.name} (${artistsProcessed}/${uniqueArtists.length}).`
      );

      const postLimit = pLimit(2);

      let totalFilesCount = 0;

      const postTasks = selectedPosts.map((post) =>
        postLimit(async () => {
          try {
            const postContent = await getPostContent(artist.url, post.id);

            let attachments = [];
            if (postContent?.post?.attachments)
              attachments = [...attachments, ...postContent.post.attachments];
            if (postContent?.videos)
              attachments = [...attachments, ...postContent.videos];

            console.log(
              `Found ${attachments.length} attachments for post ${post.id}`
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
                outputPath: path.join("/app/downloads/", artist.identifier),
                outputFilename: attachment.name,
                outputFilePath: path.join(
                  "/app/downloads/",
                  artist.identifier,
                  attachment.name
                ),
                artistIdentifier: artist.identifier,
              };
            });

            const attachmentLimit = pLimit(4);

            const attachmentTasks = parsedAttachments.map((attachment) =>
              attachmentLimit(async () => {
                try {
                  if (fs.existsSync(attachment.outputFilePath)) return;

                  let fileDB = await prisma.file.findFirst({
                    where: {
                      filename: attachment.filename,
                      postId: postDB.id,
                      artistId: artist.id,
                    },
                  });

                  if (fileDB) return;

                  await downloadFile(attachment, 0);

                  // await storeAndDelete(attachment, storage);

                  await prisma.file.create({
                    data: {
                      url: attachment.url,
                      filename: attachment.filename,
                      postId: postDB.id,
                      artistId: artist.id,
                    },
                  });
                } catch (e) {
                  console.error(
                    `Failed to download attachment ${
                      attachment.filename
                    }, error: ${e.message || "no error message"}`
                  );
                }
              })
            );

            await Promise.all(attachmentTasks);
          } catch (e) {
            console.error(
              `Failed to process post ${post.id}, error: ${
                e.message || "no error message"
              }`
            );
          }
        })
      );

      await Promise.all(postTasks);

      console.log(
        `Finished processing ${selectedPosts.length} posts for artist ${artist.name} (${artistsProcessed}/${uniqueArtists.length}). Processed ${totalFilesCount} files!`
      );

      artistsProcessed++;
    } catch (e) {
      console.error(
        `Failed to process artist ${artist.name}, error: ${
          e.message || "no error message"
        }`
      );
    }
  }

  // Loop increasing post selection limit
  // postSelectionLimit += postSelectionLimitIncrease;
  //await redisClient.set("post-selection-limit", postSelectionLimit);
  main();
}

discord();
main();
startApiServer();
validation.run();
