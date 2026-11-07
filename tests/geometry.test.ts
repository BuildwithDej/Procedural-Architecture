import { describe, expect, it } from "vitest";
import { presets } from "../src/model/examples.ts";
import {
  WALL_THICKNESS_M,
  pointInAabb,
  pointOnWall,
  wallSolids,
} from "../src/model/geometry.ts";
import { validateRoom } from "../src/model/parse.ts";
import type { Room } from "../src/model/types.ts";
import { dimensionGuides, dimensionOffset } from "../src/view3d/dimensions.ts";

const example = presets[0]?.room;

function room(): Room {
  if (!example) throw new Error("example missing");
  return example;
}

describe("wall solids", () => {
  it("keeps the interior empty and opens the door and window", () => {
    const solids = wallSolids(room());
    expect(solids.every((box) => [box.min, box.max].flat().every(Number.isFinite))).toBe(true);
    expect(solids.some((box) => pointInAabb(box, 2.1, 1.35, 1.8))).toBe(false);

    const door = pointOnWall(room(), "south", 0.75, WALL_THICKNESS_M / 2);
    expect(solids.some((box) => pointInAabb(box, door.x, 1.05, door.z))).toBe(false);
    expect(solids.some((box) => pointInAabb(box, 0.15, 1, door.z))).toBe(true);
    expect(solids.some((box) => pointInAabb(box, door.x, 2.4, door.z))).toBe(true);

    const window = pointOnWall(room(), "north", 1.95, WALL_THICKNESS_M / 2);
    expect(solids.some((box) => pointInAabb(box, window.x, 1.5, window.z))).toBe(false);
    expect(solids.some((box) => pointInAabb(box, window.x, 0.4, window.z))).toBe(true);
  });

  it("opens the tiny room window on the east wall", () => {
    const tiny = presets[1]?.room;
    if (!tiny) throw new Error("tiny missing");
    const pane = pointOnWall(tiny, "east", 0.55, WALL_THICKNESS_M / 2);
    expect(wallSolids(tiny).some((box) => pointInAabb(box, pane.x, 1.1, pane.z))).toBe(false);
  });

  it("stays finite for the huge room and a very small closed room", () => {
    const huge = presets[2]?.room;
    if (!huge) throw new Error("huge missing");
    const bare = validateRoom({
      id: "bare",
      name: "Bare",
      width: 0.05,
      depth: 0.05,
      height: 0.05,
      doors: [],
      windows: [],
    });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    for (const current of [huge, bare.room]) {
      const solids = wallSolids(current);
      expect(solids.length).toBeGreaterThan(0);
      expect(solids.every((box) => [box.min, box.max].flat().every(Number.isFinite))).toBe(true);
    }
  });
});

describe("dimension guides", () => {
  it("measures the interior width and depth outside the walls", () => {
    const guides = dimensionGuides(room());
    const width = guides.find((guide) => guide.axis === "width");
    const depth = guides.find((guide) => guide.axis === "depth");
    expect(width?.label).toBe("4.20 m");
    expect(depth?.label).toBe("3.60 m");
    const offset = dimensionOffset(4.2);
    expect(width?.segments.some((segment) => segment.from[0] === 0 && segment.from[2] === -offset)).toBe(true);
    expect(width?.segments.some((segment) => segment.to[0] === 4.2 && segment.to[2] === -offset)).toBe(true);
    expect(depth?.segments.some((segment) => segment.from[0] === 4.2 + offset && segment.from[2] === 0)).toBe(true);
    expect(depth?.segments.some((segment) => segment.to[0] === 4.2 + offset && segment.to[2] === 3.6)).toBe(true);
  });

  it("stays finite for tiny and huge rooms", () => {
    for (const preset of presets) {
      for (const guide of dimensionGuides(preset.room)) {
        expect(guide.label.length).toBeGreaterThan(0);
        for (const segment of guide.segments) {
          expect([...segment.from, ...segment.to].every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});
