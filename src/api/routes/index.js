import express from "express";
import helloWorldRoutes from "./hello-world.routes.js";
import artistRoutes from "./artist.routes.js";

const router = new express.Router();

router.use("/hello-world", helloWorldRoutes);
router.use("/artists", artistRoutes);

export default router;
