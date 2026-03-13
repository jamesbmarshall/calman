const express = require("express");
const path = require("path");
const { getAvailability } = require("./src/availability");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Config ---
const config = {
  icsUrl: process.env.ICS_URL,
  workStart: process.env.WORK_START || "10:00",
  workEnd: process.env.WORK_END || "16:00",
  workDays: (process.env.WORK_DAYS || "1,2,3,4,5").split(",").map(Number),
  bufferMinutes: parseInt(process.env.BUFFER_MINUTES, 10) || 10,
  displayName: process.env.DISPLAY_NAME || "",
  days: parseInt(process.env.LOOKAHEAD_DAYS, 10) || 30,
};

// --- Startup validation ---
const errors = [];

if (!config.icsUrl) {
  errors.push("ICS_URL is required");
}

const timePattern = /^\d{2}:\d{2}$/;
if (!timePattern.test(config.workStart)) {
  errors.push(`WORK_START must be in HH:MM format, got: "${config.workStart}"`);
}
if (!timePattern.test(config.workEnd)) {
  errors.push(`WORK_END must be in HH:MM format, got: "${config.workEnd}"`);
}

for (const d of config.workDays) {
  if (isNaN(d) || d < 0 || d > 6) {
    errors.push(`WORK_DAYS must contain values 0–6, got: "${process.env.WORK_DAYS}"`);
    break;
  }
}

if (isNaN(config.bufferMinutes) || config.bufferMinutes < 0) {
  errors.push(`BUFFER_MINUTES must be a non-negative integer, got: "${process.env.BUFFER_MINUTES}"`);
}

if (isNaN(config.days) || config.days < 1) {
  errors.push(`LOOKAHEAD_DAYS must be a positive integer, got: "${process.env.LOOKAHEAD_DAYS}"`);
}

if (errors.length > 0) {
  for (const err of errors) console.error(`ERROR: ${err}`);
  process.exit(1);
}

console.log(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// --- Cache ---
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = {}; // keyed by minDuration

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key, data) {
  cache[key] = { data, ts: Date.now() };
}

// --- Middleware ---
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

// --- Routes ---
app.get("/api/availability", async (req, res) => {
  const duration = parseInt(req.query.duration, 10) || 30;
  const allowed = [30, 60, 90];
  const minDuration = allowed.includes(duration) ? duration : 30;

  const cached = getCached(minDuration);
  if (cached) {
    return res.json({ availability: cached, minDuration });
  }

  try {
    const availability = await getAvailability({ ...config, minDuration });
    setCached(minDuration, availability);
    res.json({ availability, minDuration });
  } catch (err) {
    console.error("Failed to fetch availability:", err.message);
    res.status(502).json({ error: "Unable to fetch calendar data" });
  }
});

app.get("/api/config", (req, res) => {
  res.json({ displayName: config.displayName });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`calman listening on port ${PORT}`);
});
