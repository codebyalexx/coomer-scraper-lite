export function fileTypeByFilename(filename) {
  const extension = filename.split(".").pop() || "";
  switch (extension) {
    case "png":
      return "image";
    case "jpg":
      return "image";
    case "jpeg":
      return "image";
    case "gif":
      return "image";
    case "webp":
      return "image";
    case "mp4":
      return "video";
    case "webm":
      return "video";
    case "mkv":
      return "video";
    case "mp3":
      return "audio";
    case "wav":
      return "audio";
    default:
      return "unknown";
  }
}

export function fileMimeByFilename(filename) {
  const extension = filename.split(".").pop() || "";
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/mkv";
    case "mp3":
      return "audio/mp3";
    case "wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}
