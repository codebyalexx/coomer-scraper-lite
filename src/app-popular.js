import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { validation } from "./lib/validation.js";

import { getAllPopularPostsByDate, getPostContent } from "./lib/coomer-api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";
import redisClient from "./lib/redis.js";
import { discord } from "./lib/discord.js";
import prisma from "./lib/prisma.js";
import { startApiServer } from "./api/server.js";

let date = new Date();

async function main() {
  let nodl = process.argv.includes("--nodl");

  if (nodl) {
    console.log("Download disabled.");
    return;
  }

  const dayPosts = await getAllPopularPostsByDate(date, "day");

  console.log(
    `Starting scraper loop with ${dayPosts.length} popular posts of ${date.toISOString().split("T")[0]}.`,
  );

  let postsProcessed = 0;
  let totalFilesCount = 0;

  try {
    const postLimit = pLimit(4);

    const postTasks = dayPosts.posts.map((post) =>
      postLimit(async () => {
        try {
          const postContent = await getPostContent(
            `https://coomer.st/${post.service}/user/${post.user}`,
            post.id,
          );

          let attachments = [];
          if (postContent?.post?.attachments)
            attachments = [...attachments, ...postContent.post.attachments];
          if (postContent?.videos)
            attachments = [...attachments, ...postContent.videos];

          let postDB = await prisma.popularPost.findFirst({
            where: {
              identifier: `${post.id}+${post.user}`,
            },
          });

          if (!postDB)
            postDB = await prisma.popularPost.create({
              data: {
                identifier: `${post.id}+${post.user}`,
              },
            });

          const parsedAttachments = attachments.map((attachment) => {
            return {
              url: `https://coomer.st/data${attachment.path}`,
              path: "/data" + attachment.path,
              filename: attachment.name,
              outputPath: path.join(process.env.DOWNLOAD_DIR, "_popular_"),
              outputFilename: attachment.name,
              outputFilePath: path.join(
                process.env.DOWNLOAD_DIR,
                "_popular_",
                attachment.name,
              ),
              artistIdentifier: post.user,
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
                  return;
                }

                let fileDB = await prisma.popularFile.findFirst({
                  where: {
                    filename: attachment.filename,
                    postId: postDB.id,
                  },
                });

                if (fileDB) {
                  return;
                }

                await downloadFile(attachment, 0, null);

                await prisma.popularFile.create({
                  data: {
                    url: attachment.url,
                    filename: attachment.filename,
                    postId: postDB.id,
                  },
                });

                totalFilesCount++;
                completedAttachments++;
              } catch (e) {
                completedAttachments++;
                console.error(
                  `Failed to download attachment ${
                    attachment.filename
                  }, error: ${e.message || "no error message"}`,
                );
              }
            }),
          );

          await Promise.all(attachmentTasks);

          // Complete post progress
          postsProcessed++;
        } catch (e) {
          postsProcessed++;
          console.error(
            `Failed to process post ${post.id}, error: ${
              e.message || "no error message"
            }`,
          );
        }
      }),
    );

    await Promise.all(postTasks);

    console.log(
      `Finished processing ${postsProcessed} posts. Processed ${totalFilesCount} files!`,
      e,
    );
  } catch (e) {
    console.error(
      `Failed to process daily posts, error: ${
        e.message || "no error message"
      }`,
      e,
      dayPosts,
    );
  }

  console.log(`DONE FOR ${date.toISOString().split("T")[0]}`);

  date = new Date(date);
  date.setDate(date.getDate() - 1);

  setTimeout(() => main(), 1000);
}

discord();
main();
startApiServer();
validation.run();
