import { describe, expect, it } from "vitest";
import { pointInAabb, wallSolids } from "../src/model/geometry.ts";
import { presets } from "../src/model/examples.ts";
import { projectPlan } from "../src/plan/project.ts";
import type { Room } from "../src/model/types.ts";
import {
  CUTAWAY_HEIGHT_RATIO,
  cutawayHeight,
  frontWalls,
  presentationSolids,
} from "../src/view3d/cutaway.ts";

function example(): Room {
  const room = presets[0]?.room;
  if (!room) throw new Error("example missing");
  return room;
}

describe("display cutaway", () => {
  it("does not change the full-height solids or the plan", () => {
    const room = example();
    const full = wallSolids(room);
    const tallestBefore = Math.max(...full.map((box) => box.max[1]));
    presentationSolids(room, ["south", "east"]);
    expect(Math.max(...full.map((box) => box.max[1]))).toBe(tallestBefore);
    expect(tallestBefore).toBe(room.height);
    expect(projectPlan(room).cutHeight).toBe(1.2);
    expect(room.height).toBe(2.7);
    expect(room.doors[0]?.height).toBe(2.1);
  });

  it("shortens only the two front walls", () => {
    const room = example();
    const cut = cutawayHeight(room);
    expect(cut).toBeCloseTo(room.height * CUTAWAY_HEIGHT_RATIO);
    const shown = presentationSolids(room, ["south", "east"]);
    expect(shown.some((box) => pointInAabb(box, 2, room.height * 0.8, -0.06))).toBe(false);
    expect(shown.some((box) => pointInAabb(box, room.width + 0.06, room.height * 0.8, 1.5))).toBe(false);
    expect(shown.some((box) => pointInAabb(box, 2, room.height * 0.8, room.depth + 0.06))).toBe(true);
    expect(shown.some((box) => pointInAabb(box, -0.06, room.height * 0.8, 1.5))).toBe(true);
    expect(shown.some((box) => pointInAabb(box, 0.15, cut * 0.5, -0.06))).toBe(true);
    expect(shown.some((box) => pointInAabb(box, 0.75, cut * 0.5, -0.06))).toBe(false);
  });

  it("picks the walls nearest the camera and holds them across the centre line", () => {
    const room = example();
    const fromSouthEast = frontWalls(room, { x: room.width + 2, z: -2 });
    expect(fromSouthEast).toEqual(["south", "east"]);
    const wobble = frontWalls(
      room,
      { x: room.width / 2 - room.width * 0.02, z: room.depth / 2 + room.depth * 0.02 },
      fromSouthEast,
    );
    expect(wobble).toEqual(["south", "east"]);
    const fromNorthWest = frontWalls(room, { x: -2, z: room.depth + 2 }, fromSouthEast);
    expect(fromNorthWest).toEqual(["north", "west"]);
  });
});
