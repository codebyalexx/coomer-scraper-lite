import winston from "winston";

class FunctionCallTransport extends winston.Transport {
  constructor(opts) {
    super(opts);

    if (!opts || typeof opts.onError !== "function") {
      throw new Error("The onError option should be a function");
    }
    this.onError = opts.onError;
  }

  log(info, callback) {
    if (info.level === "error") {
      const webhookURL =
        "https://discord.com/api/webhooks/1396276924677886072/YdWFTlkc2y6uqujJTkkSLu2WIVIObb0-PKCgq9unZUkYVVBbvbeY0NfF3Id0By_-TUQB";

      const payload = {
        content: info.message,
      };

      fetch(webhookURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }
    callback();
  }
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "downloader-script" },
  transports: [
    new FunctionCallTransport({
      onError: (error) => {
        console.error("Error in FunctionCallTransport:", error);
      },
    }),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

export default logger;
