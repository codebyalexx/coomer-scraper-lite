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
    console.log("level", info.level);
    if (info.level === 0) {
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
    } else if (info.level === 2) {
      const webhookURL =
        "https://discord.com/api/webhooks/1400771919174959165/-OOG1iE5xf2kFydycU9k-TY_UwF-kAysEaid5Nmj-x9Av6APXUMCfTWlNbaW-jdduoJ9";

      const payload = {
        embeds: [
          {
            title: "new log",
            description:
              "```json\n" + JSON.stringify(info.message, null, 2) + "\n```",
            color: 0x3498db,
            timestamp: new Date().toISOString(),
          },
        ],
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
  levels: {
    error: 0,
    warn: 1,
    info: 2,
  },
  colorize: false,
  level: "info",
  format: winston.format.combine(winston.format.json()),
  defaultMeta: { service: "downloader-script" },
  transports: [
    new FunctionCallTransport({
      onError: (error) => {
        console.error("Error in FunctionCallTransport:", error);
      },
    }),
    new winston.transports.File({ filename: "error.log", level: 0 }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      level: "info",
      format: winston.format.combine(winston.format.simple()),
    }),
  ],
});

export default logger;
