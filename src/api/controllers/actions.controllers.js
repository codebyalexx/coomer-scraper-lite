import { seed as seedInstance } from "../../lib/seed.js";

const seed = async (req, res) => {
  if (seedInstance.started) {
    return res.status(400).json({ message: "Seeding is already in progress" });
  }
  seedInstance.run();
  res.status(200).json({ message: "Seeding started" });
};

export { seed };
