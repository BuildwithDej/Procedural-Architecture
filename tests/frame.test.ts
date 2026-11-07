import { describe, expect, it } from "vitest";
import { presets } from "../src/model/examples.ts";
import { validateRoom } from "../src/model/parse.ts";
import type { Room } from "../src/model/types.ts";
import {
  PROJECTION,
  contentCorners,
  frameOrthographic,
  orthoBounds,
  projectToNdc,
  type Vec3,
} from "../src/view3d/frame.ts";

function requireExample(): Room {
  const room = presets[0]?.room;
  if (!room) throw new Error("example missing");
  return room;
}

function roomCorners(room: Room): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [0, room.width]) {
    for (const y of [0, room.height]) {
      for (const z of [0, room.depth]) corners.push([x, y, z]);
    }
  }
  return corners;
}

describe("orthographic frame", () => {
  it("uses parallel projection", () => {
    expect(PROJECTION).toBe("orthographic");
    const room = requireExample();
    const aspect = 16 / 9;
    const frame = frameOrthographic(room, aspect);
    const eye: Vec3 = [
      frame.position[0] - frame.target[0],
      frame.position[1] - frame.target[1],
      frame.position[2] - frame.target[2],
    ];
    const shifted: Vec3 = [2.2 + eye[0], 0.4 + eye[1], 1.1 + eye[2]];
    const origin = projectToNdc([2.2, 0.4, 1.1], frame, aspect);
    const parallel = projectToNdc(shifted, frame, aspect);
    expect(parallel.x).toBeCloseTo(origin.x);
    expect(parallel.y).toBeCloseTo(origin.y);
  });

  it("fits the example, tiny, and huge rooms in wide, square, and tall views", () => {
    const bare = validateRoom({
      id: "bare",
      name: "Bare",
      width: 0.4,
      depth: 0.4,
      height: 0.4,
      doors: [],
      windows: [],
    });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    const rooms = [...presets.map((preset) => preset.room), bare.room];
    for (const room of rooms) {
      for (const aspect of [16 / 9, 1, 0.72]) {
        const frame = frameOrthographic(room, aspect);
        expect(frame.near).toBeGreaterThan(0);
        expect(frame.far).toBeGreaterThan(frame.near);
        expect(frame.minDistance).toBeLessThan(frame.maxDistance);
        expect(
          [frame.frustumHeight, frame.near, frame.far, ...frame.position, ...frame.target].every(
            Number.isFinite,
          ),
        ).toBe(true);
        const projected = [...roomCorners(room), ...contentCorners(room)].map((corner) =>
          projectToNdc(corner, frame, aspect),
        );
        for (const point of projected) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
        }
        expect(projected.some((point) => Math.abs(point.x) > 0.45 || Math.abs(point.y) > 0.45)).toBe(
          true,
        );
      }
    }
  });

  it("changes the frustum aspect on resize and keeps zoom as a separate scale", () => {
    const room = requireExample();
    const wide = frameOrthographic(room, 2);
    const tall = frameOrthographic(room, 0.5);
    const wideBounds = orthoBounds(wide.frustumHeight, 2);
    const tallBounds = orthoBounds(tall.frustumHeight, 0.5);
    expect((wideBounds.right - wideBounds.left) / (wideBounds.top - wideBounds.bottom)).toBeCloseTo(2);
    expect((tallBounds.right - tallBounds.left) / (tallBounds.top - tallBounds.bottom)).toBeCloseTo(0.5);
    const corner: Vec3 = [room.width, room.height, room.depth];
    const fitted = projectToNdc(corner, wide, 2, 1);
    const zoomed = projectToNdc(corner, wide, 2, 2);
    expect(zoomed.x).toBeCloseTo(fitted.x * 2);
    expect(zoomed.y).toBeCloseTo(fitted.y * 2);
  });
});
