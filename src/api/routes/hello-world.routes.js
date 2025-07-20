import express from "express";
import { helloWorld } from "../controllers/hello-world.controllers.js";

const router = express.Router();

router.get("/", helloWorld);

export default router;
