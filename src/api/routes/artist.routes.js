import express from "express";
import {
  getArtist,
  getArtists,
  setArtistException,
} from "../controllers/artist.controllers.js";

const router = express.Router();

router.get("/", getArtists);
router.get("/:id", getArtist);
router.post("/:id/exception", setArtistException);

export default router;
