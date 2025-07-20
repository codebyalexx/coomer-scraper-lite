import express from "express";
import { seed } from "../controllers/actions.controllers.js";

const router = express.Router();

router.get("/seed", seed);

export default router;
