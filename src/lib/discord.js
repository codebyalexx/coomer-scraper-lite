import { Client, GatewayIntentBits } from "discord.js";
import logger from "./logger.js";
import { getArtistProfile } from "./coomer-api.js";
import prisma from "./prisma.js";

export async function discord() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
  });

  client.once("ready", () => {
    logger.info(`✅ Connected to Discord API as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content;

    const regex = /https?:\/\/(?:www\.)?coomer\.su(?:\/\S*)?/gi;
    const matches = content.match(regex);

    if (matches) {
      let added = 0;
      let notAdded = 0;

      logger.info(`Received ${matches.length} links from Discord`);
      for (const url of matches) {
        try {
          const urlObj = new URL(url);
          const artistURL = `${urlObj.origin}${urlObj.pathname}`;
          let priority = false;
          if (url.search.length > 0) {
            priority = true;
          }
          const artist = await prisma.artist.findUnique({
            where: {
              url: artistURL,
            },
          });
          if (artist) {
            logger.info(`Artist ${url} already exists`);
            notAdded++;
            continue;
          }
          logger.info(`Importing ${url} from Discord...`);
          const artistDetails = await getArtistProfile(artistURL);
          await prisma.artist.create({
            data: {
              url: artistURL,
              name: artistDetails.name,
              identifier: artistDetails.id,
              service: artistDetails.service,
              isException: priority,
            },
          });
          added++;
        } catch (e) {
          logger.error(
            `Failed to import ${url} from Discord, error: ${
              e.message || "no error message"
            }`
          );
          notAdded++;
        }
      }
      await message.react("✅");
      logger.info(
        `Added ${added} artists, ${notAdded} already exists OR error`
      );
      await message.reply(
        `Added ${added} artists, ${notAdded} already exists OR error`
      );
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}
