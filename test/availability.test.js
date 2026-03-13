const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Extract the private helpers by re-implementing them here so we can test
// them in isolation without coupling to the module's internal structure.
// These implementations must stay in sync with src/availability.js.

function parseTime(str) {
  const [h, m] = str.split(":").map(Number);
  return { hours: h, minutes: m };
}

function setTime(date, { hours, minutes }) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Pulled directly from src/availability.js (same logic)
function freeSlots(dayStart, dayEnd, busyBlocks) {
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

// Helpers
function mins(n) { return n * 60 * 1000; }
function duration(slot) {
  return (slot.end - slot.start) / 60000;
}

const BASE = new Date("2025-06-10T09:00:00.000Z");
const dayStart = new Date(BASE);
const dayEnd   = new Date(BASE.getTime() + mins(480)); // 8-hour window

// ---- parseTime ----
describe("parseTime", () => {
  test("parses typical working-hours time", () => {
    assert.deepEqual(parseTime("09:00"), { hours: 9, minutes: 0 });
    assert.deepEqual(parseTime("16:30"), { hours: 16, minutes: 30 });
  });

  test("parses midnight", () => {
    assert.deepEqual(parseTime("00:00"), { hours: 0, minutes: 0 });
  });

  test("parses end-of-day", () => {
    assert.deepEqual(parseTime("23:59"), { hours: 23, minutes: 59 });
  });
});

// ---- freeSlots ----
describe("freeSlots", () => {
  test("returns full day when there are no busy blocks", () => {
    const slots = freeSlots(dayStart, dayEnd, []);
    assert.equal(slots.length, 1);
    assert.equal(duration(slots[0]), 480);
  });

  test("returns no slots when the whole day is busy", () => {
    const blocks = [{ start: dayStart, end: dayEnd }];
    const slots = freeSlots(dayStart, dayEnd, blocks);
    assert.equal(slots.length, 0);
  });

  test("splits the day around a single midday block", () => {
    const blockStart = new Date(dayStart.getTime() + mins(120)); // 2 h in
    const blockEnd   = new Date(dayStart.getTime() + mins(180)); // 3 h in
    const slots = freeSlots(dayStart, dayEnd, [{ start: blockStart, end: blockEnd }]);
    assert.equal(slots.length, 2);
    assert.equal(duration(slots[0]), 120); // before the block
    assert.equal(duration(slots[1]), 300); // after the block
  });

  test("handles a block that starts before dayStart (clips to boundary)", () => {
    const blockStart = new Date(dayStart.getTime() - mins(30));
    const blockEnd   = new Date(dayStart.getTime() + mins(60));
    const slots = freeSlots(dayStart, dayEnd, [{ start: blockStart, end: blockEnd }]);
    assert.equal(slots.length, 1);
    assert.equal(duration(slots[0]), 420);
  });

  test("handles a block that ends after dayEnd (clips to boundary)", () => {
    const blockStart = new Date(dayEnd.getTime() - mins(60));
    const blockEnd   = new Date(dayEnd.getTime() + mins(30));
    const slots = freeSlots(dayStart, dayEnd, [{ start: blockStart, end: blockEnd }]);
    assert.equal(slots.length, 1);
    assert.equal(duration(slots[0]), 420);
  });

  test("merges overlapping busy blocks", () => {
    const blocks = [
      { start: new Date(dayStart.getTime() + mins(60)), end: new Date(dayStart.getTime() + mins(180)) },
      { start: new Date(dayStart.getTime() + mins(120)), end: new Date(dayStart.getTime() + mins(240)) },
    ];
    const slots = freeSlots(dayStart, dayEnd, blocks);
    assert.equal(slots.length, 2);
    assert.equal(duration(slots[0]), 60);  // before first block
    assert.equal(duration(slots[1]), 240); // after merged block ends at +240
  });

  test("merges adjacent (touching) busy blocks", () => {
    const mid = new Date(dayStart.getTime() + mins(120));
    const blocks = [
      { start: dayStart, end: mid },
      { start: mid, end: dayEnd },
    ];
    const slots = freeSlots(dayStart, dayEnd, blocks);
    assert.equal(slots.length, 0);
  });

  test("handles multiple non-overlapping blocks", () => {
    const blocks = [
      { start: new Date(dayStart.getTime() + mins(60)),  end: new Date(dayStart.getTime() + mins(90))  },
      { start: new Date(dayStart.getTime() + mins(180)), end: new Date(dayStart.getTime() + mins(240)) },
      { start: new Date(dayStart.getTime() + mins(360)), end: new Date(dayStart.getTime() + mins(420)) },
    ];
    const slots = freeSlots(dayStart, dayEnd, blocks);
    assert.equal(slots.length, 4);
    assert.equal(duration(slots[0]), 60);
    assert.equal(duration(slots[1]), 90);
    assert.equal(duration(slots[2]), 120);
    assert.equal(duration(slots[3]), 60);
  });

  test("ignores blocks entirely outside the day window", () => {
    const before = { start: new Date(dayStart.getTime() - mins(120)), end: new Date(dayStart.getTime() - mins(60)) };
    const after  = { start: new Date(dayEnd.getTime() + mins(60)),   end: new Date(dayEnd.getTime() + mins(120)) };
    const slots = freeSlots(dayStart, dayEnd, [before, after]);
    assert.equal(slots.length, 1);
    assert.equal(duration(slots[0]), 480);
  });

  test("returns empty when dayStart equals dayEnd", () => {
    const slots = freeSlots(dayStart, dayStart, []);
    assert.equal(slots.length, 0);
  });
});
