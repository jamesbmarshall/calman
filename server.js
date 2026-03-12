const express = require("express");
const path = require("path");
const { getAvailability } = require("./src/availability");

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  icsUrl: process.env.ICS_URL,
  workStart: process.env.WORK_START || "10:00",
  workEnd: process.env.WORK_END || "16:00",
  workDays: (process.env.WORK_DAYS || "1,2,3,4,5").split(",").map(Number),
  bufferMinutes: parseInt(process.env.BUFFER_MINUTES, 10) || 10,
};

if (!config.icsUrl) {
  console.error("ERROR: ICS_URL environment variable is required");
  process.exit(1);
}

// Block crawlers on all responses
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/availability", async (req, res) => {
  const duration = parseInt(req.query.duration, 10) || 30;
  const allowed = [30, 60, 90];
  const minDuration = allowed.includes(duration) ? duration : 30;

  try {
    const availability = await getAvailability({ ...config, minDuration });
    res.json({ availability, minDuration });
  } catch (err) {
    console.error("Failed to fetch availability:", err.message);
    res.status(502).json({ error: "Unable to fetch calendar data" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`calman listening on port ${PORT}`);
});
