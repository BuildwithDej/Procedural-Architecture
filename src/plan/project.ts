import { formatMetres } from "../model/format.ts";
import {
  WALL_THICKNESS_M,
  doorSwingXZ,
  pointOnWall,
  wallSolids,
  windowSymbolXZ,
  type Aabb,
} from "../model/geometry.ts";
import type { Room } from "../model/types.ts";

/** Preferred plan cut, metres above the floor. Lowered for short rooms. */
export const PREFERRED_PLAN_CUT_M = 1.2;

export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanGraphic {
  viewBox: { x: number; y: number; width: number; height: number };
  fontSize: number;
  cutHeight: number;
  floor: PlanRect;
  walls: PlanRect[];
  swings: PlanPoint[][];
  leaves: PlanSegment[];
  windows: PlanSegment[];
  dimensions: Array<{
    axis: "width" | "depth";
    label: string;
    segments: PlanSegment[];
    labelAt: PlanPoint;
  }>;
  north: { tail: PlanPoint; tip: PlanPoint; labelAt: PlanPoint };
  corners: {
    southwest: PlanPoint;
    southeast: PlanPoint;
    northwest: PlanPoint;
    northeast: PlanPoint;
  };
}

export function planCutHeight(room: Room): number {
  if (room.height >= PREFERRED_PLAN_CUT_M + 0.05) return PREFERRED_PLAN_CUT_M;
  return room.height / 2;
}

/** Plan coordinates: +x east, +y down the screen, so north is up. */
function finite(value: number): number {
  return value === 0 ? 0 : value;
}

export function worldToPlan(x: number, z: number): PlanPoint {
  return { x: finite(x), y: finite(-z) };
}

export function aabbToPlanRect(box: Aabb): PlanRect {
  return {
    x: box.min[0],
    y: -box.max[2],
    width: box.max[0] - box.min[0],
    height: box.max[2] - box.min[2],
  };
}

function crossesCut(box: Aabb, cut: number): boolean {
  return box.min[1] < cut && box.max[1] > cut;
}

function addPoint(points: PlanPoint[], point: PlanPoint): void {
  points.push(point);
}

function expand(points: PlanPoint[], pad: number): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/**
 * Empty-room plan. A horizontal slice of the same wall solids the 3D view
 * builds. No furniture and no extra partitions.
 */
export function projectPlan(room: Room): PlanGraphic {
  const cut = planCutHeight(room);
  const span = Math.max(room.width, room.depth);
  const font = span * 0.082;
  const gap = Math.max(span * 0.16, WALL_THICKNESS_M + span * 0.08);
  const walls = wallSolids(room).filter((box) => crossesCut(box, cut)).map(aabbToPlanRect);
  const floor: PlanRect = { x: 0, y: -room.depth, width: room.width, height: room.depth };
  const openDoors = room.doors.filter((door) => door.height > cut);
  const swings = openDoors.map((door) =>
    doorSwingXZ(door, room).map((point) => worldToPlan(point.x, point.z)),
  );
  const leaves = openDoors.map((door) => {
    const hinge = pointOnWall(room, door.wall, door.position, 0);
    const arc = doorSwingXZ(door, room);
    const open = arc[arc.length - 1] ?? hinge;
    const start = worldToPlan(hinge.x, hinge.z);
    const end = worldToPlan(open.x, open.z);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  });
  const windows = room.windows
    .filter((window) => window.sill < cut && window.sill + window.height > cut)
    .flatMap((window) =>
      windowSymbolXZ(room, window).map((line) => {
        const start = worldToPlan(line.x1, line.z1);
        const end = worldToPlan(line.x2, line.z2);
        return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      }),
    );

  const widthLabel = formatMetres(room.width);
  const depthLabel = formatMetres(room.depth);
  const widthY = WALL_THICKNESS_M + gap;
  const depthX = room.width + WALL_THICKNESS_M + gap;
  const dimensions: PlanGraphic["dimensions"] = [
    {
      axis: "width",
      label: widthLabel,
      labelAt: { x: room.width / 2, y: widthY + font * 0.95 },
      segments: dimensionSegments(0, widthY, room.width, widthY, font),
    },
    {
      axis: "depth",
      label: depthLabel,
      labelAt: { x: depthX + font * 2.4, y: -room.depth / 2 },
      segments: dimensionSegments(depthX, 0, depthX, -room.depth, font),
    },
  ];

  const northTip = worldToPlan(room.width / 2, room.depth + WALL_THICKNESS_M + gap * 0.85);
  const northTail = worldToPlan(room.width / 2, room.depth + WALL_THICKNESS_M + gap * 0.35);
  const north = {
    tail: northTail,
    tip: northTip,
    labelAt: { x: northTip.x, y: northTip.y - font * 0.9 },
  };

  const points: PlanPoint[] = [
    worldToPlan(0, 0),
    worldToPlan(room.width, 0),
    worldToPlan(0, room.depth),
    worldToPlan(room.width, room.depth),
    north.labelAt,
    north.tip,
  ];
  for (const wall of walls) {
    addPoint(points, { x: wall.x, y: wall.y });
    addPoint(points, { x: wall.x + wall.width, y: wall.y + wall.height });
  }
  for (const dimension of dimensions) {
    addPoint(points, dimension.labelAt);
    for (const segment of dimension.segments) {
      addPoint(points, { x: segment.x1, y: segment.y1 });
      addPoint(points, { x: segment.x2, y: segment.y2 });
    }
    const textWidth = dimension.label.length * font * 0.52;
    addPoint(points, {
      x: dimension.labelAt.x - textWidth / 2,
      y: dimension.labelAt.y,
    });
    addPoint(points, {
      x: dimension.labelAt.x + textWidth / 2,
      y: dimension.labelAt.y,
    });
  }

  return {
    viewBox: expand(points, font * 0.85),
    fontSize: font,
    cutHeight: cut,
    floor,
    walls,
    swings,
    leaves,
    windows,
    dimensions,
    north,
    corners: {
      southwest: worldToPlan(0, 0),
      southeast: worldToPlan(room.width, 0),
      northwest: worldToPlan(0, room.depth),
      northeast: worldToPlan(room.width, room.depth),
    },
  };
}

function dimensionSegments(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  font: number,
): PlanSegment[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const arrow = Math.min(length * 0.045, font * 0.55);
  const px = -uy;
  const py = ux;
  const segments: PlanSegment[] = [{ x1, y1, x2, y2 }];
  for (const tip of [
    { x: x1, y: y1, dir: -1 },
    { x: x2, y: y2, dir: 1 },
  ]) {
    const neckX = tip.x - ux * tip.dir * arrow;
    const neckY = tip.y - uy * tip.dir * arrow;
    segments.push({
      x1: tip.x,
      y1: tip.y,
      x2: neckX + px * arrow * 0.38,
      y2: neckY + py * arrow * 0.38,
    });
    segments.push({
      x1: tip.x,
      y1: tip.y,
      x2: neckX - px * arrow * 0.38,
      y2: neckY - py * arrow * 0.38,
    });
  }
  return segments;
}
