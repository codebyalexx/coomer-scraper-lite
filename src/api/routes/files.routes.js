import express from "express";
import {
  getFileData,
  getFileStream,
  setFileMetadata,
  getVideoThumbnail,
  getFiles,
} from "../controllers/files.controllers.js";

const router = express.Router();

router.get("/", getFiles);
router.get("/:id", getFileData);
router.get("/:id/stream", getFileStream);
router.post("/:id/metadata", setFileMetadata);
router.get("/:id/thumbnail", getVideoThumbnail);

export default router;
