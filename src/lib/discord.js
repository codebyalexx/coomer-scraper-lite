import { Client, GatewayIntentBits } from "discord.js";
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
    console.log(`✅ Connected to Discord API as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content;

    const regex = /https?:\/\/(?:www\.)?coomer\.st(?:\/\S*)?/gi;
    const matches = content.match(regex);
    let emsg = null;

    if (matches) {
      let added = 0;
      let notAdded = 0;

      console.log(`Received ${matches.length} links from Discord`);
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
            console.log(`Artist ${url} already exists`);
            notAdded++;
            continue;
          }
          console.log(`Importing ${url} from Discord...`);
          const artistDetails = await getArtistProfile(artistURL);
          await prisma.artist.create({
            data: {
              url: artistURL,
              name: artistDetails.name,
              identifier: artistDetails.id,
              service: artistDetails.service,
              isException: false,
            },
          });
          added++;
        } catch (e) {
          console.error(
            `Failed to import ${url} from Discord, error: ${
              e.message || "no error message"
            }`
          );
          emsg = e.message;
          notAdded++;
        }
      }
      console.log(
        `Added ${added} artists, ${notAdded} already exists OR error`
      );
    }
    if (emsg) {
      await message.react("❌");
      console.log(`Failed to import X from Discord, error: ${emsg}`);
      await message.reply(`Failed to import X from Discord, error: ${emsg}`);
    } else {
      await message.react("✅");
      await message.reply(`Added ${added} artists, ${notAdded} already exists`);
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}
