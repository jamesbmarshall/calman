const ical = require("node-ical");

/**
 * Fetch and parse an ICS feed, returning busy blocks for the next `days` days.
 * Each block is { start: Date, end: Date, summary: string }.
 */
async function fetchBusyBlocks(icsUrl, days = 30) {
  const data = await ical.async.fromURL(icsUrl);
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + days);

  const blocks = [];

  for (const [, event] of Object.entries(data)) {
    if (event.type !== "VEVENT") continue;

    // Skip cancelled events
    if (event.status && event.status.toUpperCase() === "CANCELLED") continue;

    // Skip events marked as free (transparent)
    if (
      event.transparency &&
      event.transparency.toUpperCase() === "TRANSPARENT"
    )
      continue;

    // Handle recurring events
    if (event.rrule) {
      const occurrences = event.rrule.between(now, horizon, true);
      const duration = event.end - event.start;

      for (const occ of occurrences) {
        const start = new Date(occ);
        const end = new Date(start.getTime() + duration);

        // Check for EXDATE exclusions
        if (event.exdate) {
          const excluded = Object.values(event.exdate).some(
            (ex) => new Date(ex).getTime() === start.getTime()
          );
          if (excluded) continue;
        }

        blocks.push({
          start,
          end,
          summary: event.summary || "Busy",
        });
      }
    }

    // Handle single (or each occurrence already expanded by the provider)
    const start = new Date(event.start);
    const end = new Date(event.end);

    if (!event.rrule && end > now && start < horizon) {
      blocks.push({ start, end, summary: event.summary || "Busy" });
    }
  }

  // Sort by start time
  blocks.sort((a, b) => a.start - b.start);
  return blocks;
}

module.exports = { fetchBusyBlocks };
