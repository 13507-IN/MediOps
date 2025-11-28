import express from "express";
const router = express.Router();

router.post("/patient-upload", (req, res) => {

    // AUTH CHECK
const secret = req.headers["x-agent-secret"];
if (secret !== process.env.AGENT_SECRET) {
  return res.status(401).json({ success: false, message: "Unauthorized agent" });
}

   const hospitalId = req.headers["x-hospital-id"];
  const filename = req.headers["x-original-filename"];

  console.log("Received patient upload:", filename, "from:", hospitalId);

  res.json({ success: true });
});

router.post("/resource-upload", (req, res) => {

    // AUTH CHECK
const secret = req.headers["x-agent-secret"];
if (secret !== process.env.AGENT_SECRET) {
  return res.status(401).json({ success: false, message: "Unauthorized agent" });
}

  const hospitalId = req.headers["x-hospital-id"];
  const filename = req.headers["x-original-filename"];

  console.log("Received patient upload:", filename, "from:", hospitalId);

  res.json({ success: true });
});

export default router;
