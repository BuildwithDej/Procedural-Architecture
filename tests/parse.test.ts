import { describe, expect, it } from "vitest";
import { presets } from "../src/model/examples.ts";
import { applyDimensionText, validateRoom } from "../src/model/parse.ts";
import type { Room } from "../src/model/types.ts";

const example = presets[0]?.room;
const tiny = presets[1]?.room;
const huge = presets[2]?.room;

function requireRoom(room: Room | undefined, name: string): Room {
  if (!room) throw new Error(`${name} preset is missing`);
  return room;
}

describe("example rooms", () => {
  it("loads the documented example bedroom", () => {
    const room = requireRoom(example, "example");
    expect(room).toMatchObject({
      id: "example-bedroom",
      name: "Example bedroom",
      width: 4.2,
      depth: 3.6,
      height: 2.7,
    });
    expect(room.doors).toEqual([
      { wall: "south", position: 0.3, width: 0.9, height: 2.1 },
    ]);
    expect(room.windows).toEqual([
      { wall: "north", position: 1.2, width: 1.5, sill: 0.9, height: 1.2 },
    ]);
  });

  it("loads the tiny and huge demonstration rooms", () => {
    expect(requireRoom(tiny, "tiny")).toMatchObject({ width: 1.8, depth: 1.5, height: 2.2 });
    expect(requireRoom(huge, "huge")).toMatchObject({ width: 40, depth: 25, height: 8 });
  });
});

describe("validateRoom", () => {
  it("rejects a non-object", () => {
    const result = validateRoom(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/object/);
  });

  it("rejects negative, zero, NaN, and Infinity dimensions", () => {
    const room = requireRoom(example, "example");
    for (const width of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateRoom({ ...room, width });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some((issue) => issue.field === "width")).toBe(true);
    }
  });

  it("rejects a door that runs past the wall", () => {
    const room = requireRoom(example, "example");
    const result = validateRoom({
      ...room,
      doors: [{ wall: "south", position: 3.8, width: 0.9, height: 2.1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/past the end/);
  });

  it("rejects a door taller than the room", () => {
    const room = requireRoom(example, "example");
    const result = validateRoom({ ...room, height: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => /taller than the room/.test(issue.message))).toBe(true);
  });

  it("rejects a window whose head is above the ceiling", () => {
    const room = requireRoom(example, "example");
    const result = validateRoom({
      ...room,
      windows: [{ wall: "north", position: 1, width: 1, sill: 2, height: 1.2 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/above the ceiling/);
  });

  it("rejects overlapping openings", () => {
    const room = requireRoom(example, "example");
    const result = validateRoom({
      ...room,
      windows: [{ wall: "south", position: 0.8, width: 1, sill: 0.9, height: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => /overlap/.test(issue.message))).toBe(true);
  });

  it("accepts an empty room with no openings", () => {
    const result = validateRoom({
      id: "bare",
      name: "Bare room",
      width: 0.4,
      depth: 0.4,
      height: 0.4,
      doors: [],
      windows: [],
    });
    expect(result.ok).toBe(true);
  });
});

describe("applyDimensionText", () => {
  it("parses decimals, comma decimals, and a trailing separator", () => {
    const room = requireRoom(example, "example");
    const decimal = applyDimensionText(room, { width: "5.5", depth: "3.60", height: "2.70" });
    const comma = applyDimensionText(room, { width: "5,5", depth: "3,6", height: "2,7" });
    const partial = applyDimensionText(room, { width: "5.", depth: "3.6", height: "2.7" });
    expect(decimal.ok && decimal.room.width).toBe(5.5);
    expect(comma.ok && comma.room.width).toBe(5.5);
    expect(partial.ok && partial.room.width).toBe(5);
  });

  it("explains negative, empty, text, and non-finite input", () => {
    const room = requireRoom(example, "example");
    const negative = applyDimensionText(room, { width: "-2", depth: "3.6", height: "2.7" });
    const empty = applyDimensionText(room, { width: "4.2", depth: "", height: "2.7" });
    const text = applyDimensionText(room, { width: "abc", depth: "3.6", height: "2.7" });
    const infinite = applyDimensionText(room, { width: "Infinity", depth: "3.6", height: "2.7" });
    const overflow = applyDimensionText(room, { width: "1e309", depth: "3.6", height: "2.7" });
    expect(negative.ok).toBe(false);
    expect(empty.ok).toBe(false);
    expect(text.ok).toBe(false);
    expect(infinite.ok).toBe(false);
    expect(overflow.ok).toBe(false);
    if (!negative.ok) expect(negative.issues[0]?.message).toMatch(/greater than zero/);
    if (!empty.ok) expect(empty.issues[0]?.message).toMatch(/empty/);
    if (!text.ok) expect(text.issues[0]?.message).toMatch(/not a number/);
    if (!infinite.ok) expect(infinite.issues[0]?.message).toMatch(/finite/);
    if (!overflow.ok) expect(overflow.issues[0]?.message).toMatch(/finite/);
  });

  it("keeps the openings and rejects a width the door no longer fits", () => {
    const room = requireRoom(example, "example");
    const result = applyDimensionText(room, { width: "1", depth: "3.6", height: "2.7" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/south wall/);
  });
});
