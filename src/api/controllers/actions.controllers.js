import { seed as seedInstance } from "../../lib/seed.js";
import { validation as validationInstance } from "../../lib/validation.js";

export const seed = async (req, res) => {
  if (seedInstance.started) {
    return res.status(400).json({ message: "Seeding is already in progress" });
  }
  seedInstance.run();
  res.status(200).json({ message: "Seeding started" });
};

export const validate = async (req, res) => {
  if (validationInstance.started) {
    return res
      .status(400)
      .json({ message: "Validation is already in progress" });
  }

  validationInstance.run();

  res.status(200).json({ message: "Validation started" });
};
