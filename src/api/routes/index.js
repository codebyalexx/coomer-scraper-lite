import express from "express";
import helloWorldRoutes from "./hello-world.routes.js";
import artistRoutes from "./artist.routes.js";
import actionsRoutes from "./actions.routes.js";

const router = new express.Router();

router.use("/hello-world", helloWorldRoutes);
router.use("/artists", artistRoutes);
router.use("/actions", actionsRoutes);

export default router;
