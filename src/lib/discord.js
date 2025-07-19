import { Client, GatewayIntentBits } from "discord.js";
import logger from "./logger.js";

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
      logger.info("Received", matches.length, "links from Discord");
      for (const url of matches) {
        logger.info("Importing", url);
      }
      await message.react("✅");
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}
