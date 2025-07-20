import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = globalThis.prisma || new PrismaClient();
globalThis.prisma = prisma;

export default prisma;
