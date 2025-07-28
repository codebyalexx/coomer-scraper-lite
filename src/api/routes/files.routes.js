import express from "express";
import {
  getFileData,
  getFileStream,
  setFileMetadata,
} from "../controllers/files.controllers.js";

const router = express.Router();

router.get("/:id", getFileData);
router.get("/:id/stream", getFileStream);
router.post("/:id/metadata", setFileMetadata);

export default router;
