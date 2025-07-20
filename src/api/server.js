import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/index.js";
import logger from "../lib/logger.js";

// Init
dotenv.config();
const app = express();
const PORT = process.env.API_PORT || 3000;

// Middlewares
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// Api Routes
app.use("/api", routes);

// Start Server
const startApiServer = () => {
  app.listen(PORT, () => {
    logger.info(`🚀 API Server is running on http://localhost:${PORT}`);
  });
};

export { startApiServer };
