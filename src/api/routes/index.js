import express from "express";
import helloWorldRoutes from "./hello-world.routes.js";

const router = new express.Router();

router.use("/hello-world", helloWorldRoutes);

export default router;
