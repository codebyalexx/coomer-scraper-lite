import express from "express";
import { getArtists } from "../controllers/artist.controllers.js";

const router = express.Router();

router.get("/", getArtists);

export default router;
