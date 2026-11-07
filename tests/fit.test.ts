import { describe, expect, it } from "vitest";
import { wallSolids } from "../src/model/geometry.ts";
import { presets } from "../src/model/examples.ts";
import { validateRoom } from "../src/model/parse.ts";
import type { WallId } from "../src/model/types.ts";
import { FEATURE_WALL, MOUNT_CLEARANCE_M, PLACEHOLDER_FOOT_CLEARANCE_M, PLACEHOLDER_SIDE_CLEARANCE_M, buildBedroomSet } from "../src/library/bedroomSet.ts";
import { partBounds } from "../src/library/bounds.ts";
import { mapAabb } from "../src/library/fit.ts";
import { transformPart } from "../src/library/mesh.ts";
import { bedLayout } from "../src/library/bedroomSet.ts";
import { computerContained, buildDesk } from "../src/library/desk.ts";
import {
  defaultFitRequest,
  fitFurniture,
  FITS_ROOM,
  moduleCenters,
  wallLength,
} from "../src/library/fit.ts";
import { mattressSize } from "../src/library/mattressSizes.ts";
import { WARDROBE_THREE_BAY } from "../src/library/wardrobe.ts";

const tiny = presets[1]?.room;
const example = presets[0]?.room;

describe("desk computer", () => {
  it("keeps the monitor, keyboard, and mouse on the top", () => {
    const desk = buildDesk();
    expect(computerContained(desk.parts)).toBe(true);
    expect(desk.computer.screen).toBe("blank-panel");
  });
});

describe("furniture fit", () => {
  it("places the queen set in the fits bedroom and repeats the same answer", () => {
    const request = defaultFitRequest(FITS_ROOM, "north");
    const first = fitFurniture(request);
    const second = fitFurniture(request);
    expect(first.ok).toBe(true);
    expect(first.unplaced).toEqual([]);
    expect(first.placed.map((item) => item.id)).toEqual(["bed", "desk", "wardrobe"]);
    expect(first.placed.find((item) => item.id === "desk")?.wall).toBe("south");
    expect(first.placed.find((item) => item.id === "wardrobe")?.wall).toBe("west");
    expect(first.placed.find((item) => item.id === "desk")?.alongCenterM).toBeCloseTo(
      first.placed.find((item) => item.id === "bed")?.alongCenterM ?? 0,
      2,
    );
    expect(first.placed.map((item) => [item.id, item.wall, item.alongCenterM])).toEqual(
      second.placed.map((item) => [item.id, item.wall, item.alongCenterM]),
    );
    const bed = first.placed[0];
    expect(bed?.wall).toBe("north");
    const layout = bedLayout("queen");
    expect(bed?.footprint.max[0] - (bed?.footprint.min[0] ?? 0)).toBeGreaterThan(layout.bedGroupWidthM - 0.05);
    expect(mattressSize("queen").widthM).toBeCloseTo(1.524, 8);
  });

  it("refuses the tiny room and does not invent a moved opening", () => {
    if (!tiny) throw new Error("tiny missing");
    const result = fitFurniture(defaultFitRequest(tiny, "north"));
    expect(result.ok).toBe(false);
    expect(result.placed).toEqual([]);
    expect(result.unplaced.map((item) => item.id)).toEqual(["bed", "desk", "wardrobe"]);
    expect(result.conflicts.join(" ")).not.toMatch(/move the (door|window)/i);
    expect(result.alternatives).toEqual([]);
  });

  it("keeps the example bedroom honest when the bed group does not fit", () => {
    if (!example) throw new Error("example missing");
    const result = fitFurniture(defaultFitRequest(example, "north"));
    expect(result.ok).toBe(false);
    expect(result.placed.some((item) => item.id === "bed")).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
    for (const alternative of result.alternatives) {
      const trial = fitFurniture(alternative.request, { alternatives: false });
      expect(trial.placed.some((item) => item.id === "bed")).toBe(true);
      expect(trial.mattressId).toBe("queen");
      expect(alternative.request.room.doors).toEqual(example.doors);
      expect(alternative.request.room.windows).toEqual(example.windows);
    }
  });

  it("offers only bed walls that actually place the bed", () => {
    const result = fitFurniture(defaultFitRequest(FITS_ROOM, "south"));
    expect(result.placed.some((item) => item.id === "bed")).toBe(false);
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alternative of result.alternatives) {
      const trial = fitFurniture(alternative.request, { alternatives: false });
      expect(trial.placed.some((item) => item.id === "bed")).toBe(true);
      expect(alternative.request.mattressId).toBe(result.mattressId);
      expect(alternative.request.wardrobe).toBe(WARDROBE_THREE_BAY);
      expect(alternative.request.room.windows[0]?.position).toBe(FITS_ROOM.windows[0]?.position);
    }
    const north = result.alternatives.find((item) => item.request.bedWall === "north");
    expect(north).toBeTruthy();
  });

  it("rejects non-finite and does not search a huge room forever", () => {
    const broken = validateRoom({
      id: "bad",
      name: "Bad",
      width: Number.NaN,
      depth: 4,
      height: 2.7,
      doors: [],
      windows: [],
    });
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      const result = fitFurniture({
        ...defaultFitRequest(FITS_ROOM),
        room: { ...FITS_ROOM, width: Number.POSITIVE_INFINITY },
      });
      expect(result.ok).toBe(false);
      expect(result.placed).toEqual([]);
    }
    const huge = presets[2]?.room;
    if (!huge) throw new Error("huge missing");
    const started = Date.now();
    const result = fitFurniture(defaultFitRequest(huge, "north"));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.placed.some((item) => item.id === "bed")).toBe(true);
    expect(result.placed[0]?.alongCenterM).toBeCloseTo(wallLength(huge, "north") / 2, 5);
  });

  it("trims panel modules at openings without stretching them", () => {
    const centers = moduleCenters(4.2, FEATURE_WALL.moduleWidthM, FEATURE_WALL.gapM, [[1.2, 2.7]]);
    expect(centers.length).toBeGreaterThan(0);
    expect(new Set(centers.map(() => FEATURE_WALL.moduleWidthM)).size).toBe(1);
    for (const center of centers) {
      const left = center - FEATURE_WALL.moduleWidthM / 2;
      const right = center + FEATURE_WALL.moduleWidthM / 2;
      expect(right).toBeLessThanOrEqual(4.2 + 1e-6);
      expect(left).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.min(right, 2.7) - Math.max(left, 1.2)).toBeLessThanOrEqual(0.001);
    }
  });

  it("uses the placeholder clearances as product choices", () => {
    expect(PLACEHOLDER_SIDE_CLEARANCE_M).toBe(0.6);
    expect(PLACEHOLDER_FOOT_CLEARANCE_M).toBe(0.9);
  });

  it("mounts the feature wall in the room on every wall, clear of the wall solid", () => {
    const room = {
      id: "mount",
      name: "Mount",
      width: 8,
      depth: 8,
      height: 3,
      doors: [],
      windows: [],
    };
    const model = buildBedroomSet("queen");
    const panel = model.parts.find((part) => part.name === "wall-panel-0");
    const band = model.parts.find((part) => part.name === "wall-band");
    if (!panel || !band) throw new Error("panel missing");
    for (const wall of ["north", "east", "south", "west"] as const) {
      const result = fitFurniture(defaultFitRequest(room, wall), { alternatives: false });
      const placed = result.placed.find((item) => item.id === "bed");
      expect(placed, wall).toBeTruthy();
      if (!placed) continue;
      const panelBox = mapAabb(partBounds(transformPart(panel, { yaw: placed.yaw, translate: placed.origin })), 0, [0, 0, 0]);
      const bandBox = mapAabb(partBounds(transformPart(band, { yaw: placed.yaw, translate: placed.origin })), 0, [0, 0, 0]);
      const gap = gapInside(wall, room, panelBox);
      expect(gap, wall).toBeGreaterThan(0.0005);
      expect(gap, wall).toBeCloseTo(MOUNT_CLEARANCE_M, 2);
      expect(depthIntoRoom(wall, panelBox), wall).toBeCloseTo(FEATURE_WALL.thicknessM, 2);
      expect(gapInside(wall, room, bandBox), wall).toBeGreaterThan(gap);
      for (const solid of wallSolids(room)) {
        expect(strictOverlap(panelBox, solid), wall).toBe(false);
        expect(strictOverlap(bandBox, solid), wall).toBe(false);
      }
    }
  });
});

function gapInside(wall: WallId, room: { width: number; depth: number }, box: { min: number[]; max: number[] }): number {
  switch (wall) {
    case "south":
      return box.min[2] ?? 0;
    case "north":
      return room.depth - (box.max[2] ?? 0);
    case "west":
      return box.min[0] ?? 0;
    case "east":
      return room.width - (box.max[0] ?? 0);
  }
}

function depthIntoRoom(wall: WallId, box: { min: number[]; max: number[] }): number {
  switch (wall) {
    case "south":
      return (box.max[2] ?? 0) - (box.min[2] ?? 0);
    case "north":
      return (box.max[2] ?? 0) - (box.min[2] ?? 0);
    case "west":
      return (box.max[0] ?? 0) - (box.min[0] ?? 0);
    case "east":
      return (box.max[0] ?? 0) - (box.min[0] ?? 0);
  }
}

function strictOverlap(
  a: { min: number[]; max: number[] },
  b: { min: readonly number[]; max: readonly number[] },
): boolean {
  return (
    (a.min[0] ?? 0) < (b.max[0] ?? 0) - 0.0002 &&
    (a.max[0] ?? 0) > (b.min[0] ?? 0) + 0.0002 &&
    (a.min[1] ?? 0) < (b.max[1] ?? 0) - 0.0002 &&
    (a.max[1] ?? 0) > (b.min[1] ?? 0) + 0.0002 &&
    (a.min[2] ?? 0) < (b.max[2] ?? 0) - 0.0002 &&
    (a.max[2] ?? 0) > (b.min[2] ?? 0) + 0.0002
  );
}
