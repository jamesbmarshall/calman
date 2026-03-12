const { fetchBusyBlocks } = require("./ics");

/**
 * Parse a "HH:MM" string into { hours, minutes }.
 */
function parseTime(str) {
  const [h, m] = str.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Set the time portion of a date to a given HH:MM.
 */
function setTime(date, { hours, minutes }) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Compute free slots for a given day, subtracting busy blocks.
 * Returns array of { start: Date, end: Date }.
 */
function freeSlots(dayStart, dayEnd, busyBlocks) {
  // Clip and sort busy blocks that overlap this day window
  const clipped = busyBlocks
    .map((b) => ({
      start: b.start < dayStart ? dayStart : b.start,
      end: b.end > dayEnd ? dayEnd : b.end,
    }))
    .filter((b) => b.start < dayEnd && b.end > dayStart)
    .sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = dayStart;

  for (const block of clipped) {
    if (block.start > cursor) {
      slots.push({ start: new Date(cursor), end: new Date(block.start) });
    }
    if (block.end > cursor) {
      cursor = new Date(block.end);
    }
  }

  if (cursor < dayEnd) {
    slots.push({ start: new Date(cursor), end: new Date(dayEnd) });
  }

  return slots;
}

/**
 * Main entry point: fetch ICS and compute availability.
 *
 * @param {object} config
 * @param {string} config.icsUrl - ICS feed URL
 * @param {string} config.workStart - "HH:MM"
 * @param {string} config.workEnd - "HH:MM"
 * @param {number[]} config.workDays - e.g. [1,2,3,4,5]
 * @param {number} config.minDuration - minimum slot duration in minutes
 * @param {number} config.days - lookahead days (default 14)
 * @returns {Promise<Array<{ date: string, dayLabel: string, slots: Array<{ start: string, end: string, duration: number }> }>>}
 */
async function getAvailability(config) {
  const {
    icsUrl,
    workStart,
    workEnd,
    workDays,
    minDuration = 30,
    bufferMinutes = 10,
    days = 30,
  } = config;

  const rawBlocks = await fetchBusyBlocks(icsUrl, days);

  // Pad each busy block so free slots have breathing room either side
  const bufferMs = bufferMinutes * 60000;
  const busyBlocks = rawBlocks.map((b) => ({
    ...b,
    start: new Date(b.start.getTime() - bufferMs),
    end: new Date(b.end.getTime() + bufferMs),
  }));
  const start = parseTime(workStart);
  const end = parseTime(workEnd);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);

    // Skip non-working days
    if (!workDays.includes(day.getDay())) continue;

    const dayStart = setTime(day, start);
    const dayEnd = setTime(day, end);

    // For today, don't show slots that have already passed
    const now = new Date();
    const effectiveStart = i === 0 && now > dayStart ? now : dayStart;
    if (effectiveStart >= dayEnd) continue;

    const slots = freeSlots(effectiveStart, dayEnd, busyBlocks)
      .map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        duration: Math.round((s.end - s.start) / 60000),
      }))
      .filter((s) => s.duration >= minDuration);

    if (slots.length === 0) continue;

    result.push({
      date: day.toISOString().slice(0, 10),
      dayLabel: formatDayLabel(day, i),
      slots,
    });
  }

  return result;
}

function formatDayLabel(date, offsetFromToday) {
  if (offsetFromToday === 0) return "Today";
  if (offsetFromToday === 1) return "Tomorrow";

  const dayName = date.toLocaleDateString("en-GB", { weekday: "long" });
  const dayNum = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${dayName} ${dayNum} ${month}`;
}

module.exports = { getAvailability };
