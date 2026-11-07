import type { Door, Room, WallId, WindowOpening } from "./types.ts";

/** Drawn wall thickness, outside the interior faces. Not a room measurement. */
export const WALL_THICKNESS_M = 0.12;

/** Side walls tuck this far into the north and south walls so the corner does not flicker. */
const CORNER_TUCK_M = 0.01;

export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

export function alongDirection(wall: WallId): { x: number; z: number } {
  return wall === "east" || wall === "west" ? { x: 0, z: 1 } : { x: 1, z: 0 };
}

export function inwardDirection(wall: WallId): { x: number; z: number } {
  switch (wall) {
    case "south":
      return { x: 0, z: 1 };
    case "north":
      return { x: 0, z: -1 };
    case "west":
      return { x: 1, z: 0 };
    case "east":
      return { x: -1, z: 0 };
  }
}

export function wallOrigin(room: Room, wall: WallId): { x: number; z: number } {
  switch (wall) {
    case "south":
      return { x: 0, z: 0 };
    case "north":
      return { x: 0, z: room.depth };
    case "west":
      return { x: 0, z: 0 };
    case "east":
      return { x: room.width, z: 0 };
  }
}

/** A point on a wall. `outward` is metres outside the interior face. */
export function pointOnWall(
  room: Room,
  wall: WallId,
  along: number,
  outward: number,
): { x: number; z: number } {
  const origin = wallOrigin(room, wall);
  const alongAxis = alongDirection(wall);
  const inward = inwardDirection(wall);
  return {
    x: origin.x + alongAxis.x * along - inward.x * outward,
    z: origin.z + alongAxis.z * along - inward.z * outward,
  };
}

function pushBox(
  out: Aabb[],
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  if (maxX - minX <= 1e-6 || maxY - minY <= 1e-6 || maxZ - minZ <= 1e-6) return;
  out.push({
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  });
}

function cut(span: [number, number], holes: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [span];
  for (const [holeStart, holeEnd] of holes) {
    const next: Array<[number, number]> = [];
    for (const [start, end] of parts) {
      if (holeEnd <= start + 1e-9 || holeStart >= end - 1e-9) {
        next.push([start, end]);
        continue;
      }
      if (holeStart > start + 1e-9) next.push([start, Math.min(holeStart, end)]);
      if (holeEnd < end - 1e-9) next.push([Math.max(holeEnd, start), end]);
    }
    parts = next.filter(([start, end]) => end - start > 1e-6);
  }
  return parts;
}

interface VerticalPiece {
  y0: number;
  y1: number;
}

function piecesForOpening(
  room: Room,
  opening: Door | WindowOpening,
): VerticalPiece[] {
  const pieces: VerticalPiece[] = [];
  if ("sill" in opening) {
    pieces.push({ y0: 0, y1: opening.sill });
    pieces.push({ y0: opening.sill + opening.height, y1: room.height });
  } else {
    pieces.push({ y0: opening.height, y1: room.height });
  }
  return pieces;
}

function addLongWall(
  out: Aabb[],
  room: Room,
  wall: "north" | "south",
  openings: Array<Door | WindowOpening>,
): void {
  const z0 = wall === "south" ? -WALL_THICKNESS_M : room.depth;
  const z1 = wall === "south" ? 0 : room.depth + WALL_THICKNESS_M;
  const holes = openings.map((opening) => [opening.position, opening.position + opening.width] as [number, number]);
  const spans = cut([-WALL_THICKNESS_M, room.width + WALL_THICKNESS_M], holes);
  for (const [start, end] of spans) {
    pushBox(out, start, 0, z0, end, room.height, z1);
  }
  for (const opening of openings) {
    for (const piece of piecesForOpening(room, opening)) {
      pushBox(out, opening.position, piece.y0, z0, opening.position + opening.width, piece.y1, z1);
    }
  }
}

function addSideWall(
  out: Aabb[],
  room: Room,
  wall: "east" | "west",
  openings: Array<Door | WindowOpening>,
): void {
  const x0 = wall === "west" ? -WALL_THICKNESS_M : room.width;
  const x1 = wall === "west" ? 0 : room.width + WALL_THICKNESS_M;
  const along0 = -CORNER_TUCK_M;
  const along1 = room.depth + CORNER_TUCK_M;
  const holes = openings.map((opening) => [opening.position, opening.position + opening.width] as [number, number]);
  const spans = cut([along0, along1], holes);
  for (const [start, end] of spans) {
    pushBox(out, x0, 0, start, x1, room.height, end);
  }
  for (const opening of openings) {
    for (const piece of piecesForOpening(room, opening)) {
      pushBox(
        out,
        x0,
        piece.y0,
        opening.position,
        x1,
        piece.y1,
        opening.position + opening.width,
      );
    }
  }
}

function openingsOn(room: Room, wall: WallId): Array<Door | WindowOpening> {
  return [...room.doors, ...room.windows].filter((opening) => opening.wall === wall);
}

/** Solid wall pieces. Openings are the missing intervals, not extra objects. */
export function wallSolids(room: Room): Aabb[] {
  const solids: Aabb[] = [];
  addLongWall(solids, room, "south", openingsOn(room, "south"));
  addLongWall(solids, room, "north", openingsOn(room, "north"));
  addSideWall(solids, room, "west", openingsOn(room, "west"));
  addSideWall(solids, room, "east", openingsOn(room, "east"));
  return solids;
}

export function glassPanes(room: Room): Aabb[] {
  const panes: Aabb[] = [];
  const inset = 0.02;
  const thin = 0.008;
  for (const window of room.windows) {
    const y0 = window.sill;
    const y1 = window.sill + window.height;
    const along0 = window.position;
    const along1 = window.position + window.width;
    if (window.wall === "south" || window.wall === "north") {
      const z = window.wall === "south" ? inset : room.depth - inset;
      pushBox(panes, along0, y0, z - thin / 2, along1, y1, z + thin / 2);
    } else {
      const x = window.wall === "west" ? inset : room.width - inset;
      pushBox(panes, x - thin / 2, y0, along0, x + thin / 2, y1, along1);
    }
  }
  return panes;
}

export function pointInAabb(box: Aabb, x: number, y: number, z: number, eps = 1e-6): boolean {
  return (
    x >= box.min[0] - eps &&
    x <= box.max[0] + eps &&
    y >= box.min[1] - eps &&
    y <= box.max[1] + eps &&
    z >= box.min[2] - eps &&
    z <= box.max[2] + eps
  );
}

export function doorSwingXZ(door: Door, room: Room, steps = 16): Array<{ x: number; z: number }> {
  const along = alongDirection(door.wall);
  const inward = inwardDirection(door.wall);
  const hinge = pointOnWall(room, door.wall, door.position, 0);
  const start = Math.atan2(along.z, along.x);
  const cross = along.x * inward.z - along.z * inward.x;
  const sweep = cross > 0 ? Math.PI / 2 : -Math.PI / 2;
  const points: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + sweep * (i / steps);
    points.push({
      x: hinge.x + Math.cos(angle) * door.width,
      z: hinge.z + Math.sin(angle) * door.width,
    });
  }
  return points;
}

export function windowSymbolXZ(
  room: Room,
  window: WindowOpening,
): Array<{ x1: number; z1: number; x2: number; z2: number }> {
  return [0.35, 0.65].map((fraction) => {
    const start = pointOnWall(room, window.wall, window.position, WALL_THICKNESS_M * fraction);
    const end = pointOnWall(
      room,
      window.wall,
      window.position + window.width,
      WALL_THICKNESS_M * fraction,
    );
    return { x1: start.x, z1: start.z, x2: end.x, z2: end.z };
  });
}
