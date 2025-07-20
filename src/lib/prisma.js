import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/index.js";

dotenv.config();

const prisma = globalThis.prisma || new PrismaClient();
globalThis.prisma = prisma;

export default prisma;
