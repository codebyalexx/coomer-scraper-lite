import { fileTypeByFilename } from "./utils.js";
import prisma from "./prisma.js";
import sharp from "sharp";
import { rmSync } from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

const TAKE = 10;

class Validation {
  constructor() {
    this.started = false;
    this.loop = 0;
  }

  run() {
    this.started = true;
    this.goLoop();
  }

  async goLoop() {
    console.log(`Validation loop ${this.loop}`);

    const files = await prisma.file.findMany({
      where: {
        validated: false,
        storage: null,
      },
      skip: this.loop * TAKE,
      take: TAKE,
      include: {
        artist: true,
      },
    });

    if (files.length === 0) {
      this.started = false;
      console.log("Validation finished");
      return;
    }

    for (const file of files) {
      const type = fileTypeByFilename(file.filename);
      const filePath = path.join(
        "/app/downloads/",
        file.artist.identifier,
        file.filename
      );

      if (!fs.existsSync(filePath)) {
        console.log(`File not found deleting : ${filePath}`);
        await prisma.file.delete({
          where: {
            id: file.id,
          },
        });
        continue;
      }

      if (type === "image") {
        if (await this.isImageCorrupt(filePath)) {
          console.log(`Image corrompue : ${file}`);
          await prisma.file.delete({
            where: {
              id: file.id,
            },
          });
          rmSync(filePath);
        } else {
          await prisma.file.update({
            where: {
              id: file.id,
            },
            data: {
              validated: true,
            },
          });
          rmSync(filePath);
        }
      } else if (type === "video") {
        if (await this.isVideoCorruptFull(filePath)) {
          console.log(`Vidéo corrompue : ${JSON.stringify(file)}`);
          await prisma.file.delete({
            where: {
              id: file.id,
            },
          });
          rmSync(filePath);
        } else {
          await prisma.file.update({
            where: {
              id: file.id,
            },
            data: {
              validated: true,
            },
          });
        }
      }
    }

    this.loop++;
    this.goLoop();
  }

  isVideoCorrupt(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        resolve(!!err);
      });
    });
  }

  isVideoCorruptFull(filePath) {
    return new Promise((resolve) => {
      exec(
        `ffmpeg -v error -i "${filePath}" -f null -`,
        (err, stdout, stderr) => {
          resolve(stderr.trim().length > 0);
        }
      );
    });
  }

  async isImageCorrupt(filePath) {
    try {
      await sharp(filePath).toBuffer({ resolveWithObject: false }); // force décodage complet
      return false; // lisible entièrement
    } catch (err) {
      return true; // problème lors du décodage
    }
  }
}

const validation = globalThis.validation || new Validation();
globalThis.validation = validation;

export { validation };
