import express from "express";
import { validate } from "../controllers/actions.controllers.js";

const router = express.Router();

router.get("/validate", validate);

export default router;
