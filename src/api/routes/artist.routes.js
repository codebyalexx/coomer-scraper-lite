import express from "express";
import { getArtist, getArtists } from "../controllers/artist.controllers.js";

const router = express.Router();

router.get("/", getArtists);
router.get("/:id", getArtist);

export default router;
