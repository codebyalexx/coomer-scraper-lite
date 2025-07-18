import fs from "fs";
import path from "path";
import {
  getAllArtistPosts,
  getArtistProfile,
  getPostContent,
} from "./lib/api.js";
import { downloadFile } from "./lib/downloader.js";
import pLimit from "p-limit";

const artists = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/artists.json"), "utf-8")
);
const uniqueArtists = [...new Set(artists)];

async function main() {
  for (const artist of uniqueArtists) {
    try {
      const profile = await getArtistProfile(artist);

      console.log(">> Now processing " + profile.name + "...");
      const posts = await getAllArtistPosts(artist);
      console.log(">> Found " + posts.length + " posts");

      const selectedPosts = posts.length > 150 ? posts.slice(0, 150) : posts;

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
                path: "/data/" + attachment.path,
                filename: attachment.name,
                outputPath: path.join(
                  "/mnt/freebox/app/cs-v2/downloads/",
                  profile.id
                ),
                outputFilename: attachment.name,
                outputFilePath: path.join(
                  "/mnt/freebox/app/cs-v2/downloads/",
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
}

main();
