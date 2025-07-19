import { Client, GatewayIntentBits } from "discord.js";

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
    console.log(`✅ Connected to Discord API as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content;

    const regex = /https?:\/\/(?:www\.)?coomer\.su(?:\/\S*)?/gi;
    const matches = content.match(regex);

    if (matches) {
      console.log("Received", matches.length, "links from Discord");
      for (const url of matches) {
        console.log("Importing", url);
      }
      await message.react("✅");
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}
