import express from "express";
import {
  getArtist,
  getArtists,
  getArtistFile,
} from "../controllers/artist.controllers.js";

const router = express.Router();

router.get("/", getArtists);
router.get("/:id", getArtist);
router.get("/:id/filestream/:fileId", getArtistFile);

export default router;
