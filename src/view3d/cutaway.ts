import { glassPanes, wallSolids, type Aabb } from "../model/geometry.ts";
import type { Room, WallId } from "../model/types.ts";

/**
 * Display-only cutaway. The room data and the plan stay at full height.
 * The 3D view shortens the two walls nearest the camera so the floor reads
 * like a study model. Openings are not moved; a front wall is only clipped.
 */
export const CUTAWAY_HEIGHT_RATIO = 0.3;

export type FrontPair = readonly [WallId, WallId];

export function cutawayHeight(room: Room): number {
  return room.height * CUTAWAY_HEIGHT_RATIO;
}

/**
 * One north/south wall and one east/west wall, chosen from where the camera
 * sits. A previous pair is kept until the camera is clearly past the centre,
 * so the cut does not flicker while orbiting along a boundary.
 */
export function frontWalls(
  room: Room,
  camera: { x: number; z: number },
  previous: FrontPair | null = null,
): FrontPair {
  const midX = room.width / 2;
  const midZ = room.depth / 2;
  const holdX = room.width * 0.08;
  const holdZ = room.depth * 0.08;
  let northSouth: "north" | "south" = camera.z >= midZ ? "north" : "south";
  let eastWest: "east" | "west" = camera.x >= midX ? "east" : "west";
  if (previous) {
    const heldNS = previous[0] === "north" || previous[0] === "south" ? previous[0] : northSouth;
    const heldEW = previous[1] === "east" || previous[1] === "west" ? previous[1] : eastWest;
    northSouth = heldNS;
    eastWest = heldEW;
    if (heldNS === "south" && camera.z > midZ + holdZ) northSouth = "north";
    if (heldNS === "north" && camera.z < midZ - holdZ) northSouth = "south";
    if (heldEW === "east" && camera.x < midX - holdX) eastWest = "west";
    if (heldEW === "west" && camera.x > midX + holdX) eastWest = "east";
  }
  return [northSouth, eastWest];
}

function classify(room: Room, box: Aabb): WallId | null {
  const eps = 0.03;
  if (box.max[2] <= eps) return "south";
  if (box.min[2] >= room.depth - eps) return "north";
  if (box.max[0] <= eps) return "west";
  if (box.min[0] >= room.width - eps) return "east";
  const centerX = (box.min[0] + box.max[0]) / 2;
  const centerZ = (box.min[2] + box.max[2]) / 2;
  const distance: Record<WallId, number> = {
    south: Math.abs(centerZ),
    north: Math.abs(centerZ - room.depth),
    west: Math.abs(centerX),
    east: Math.abs(centerX - room.width),
  };
  let nearest: WallId = "south";
  for (const wall of ["north", "east", "west"] as const) {
    if (distance[wall] < distance[nearest]) nearest = wall;
  }
  return nearest;
}

function clipTop(box: Aabb, cut: number): Aabb | null {
  if (box.min[1] >= cut - 1e-6) return null;
  if (box.max[1] <= cut + 1e-6) {
    return { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], box.max[1], box.max[2]] };
  }
  return { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], cut, box.max[2]] };
}

/** Copies of the wall solids. Front walls are shortened. The originals are not changed. */
export function presentationSolids(room: Room, front: readonly WallId[]): Aabb[] {
  const cut = cutawayHeight(room);
  const shown: Aabb[] = [];
  for (const box of wallSolids(room)) {
    const wall = classify(room, box);
    if (wall && front.includes(wall)) {
      const clipped = clipTop(box, cut);
      if (clipped) shown.push(clipped);
    } else {
      shown.push({
        min: [box.min[0], box.min[1], box.min[2]],
        max: [box.max[0], box.max[1], box.max[2]],
      });
    }
  }
  return shown;
}

/** Glass follows the same clip. A window above a lowered wall is omitted until that wall is at the back. */
export function presentationGlass(room: Room, front: readonly WallId[]): Aabb[] {
  const cut = cutawayHeight(room);
  const shown: Aabb[] = [];
  for (const pane of glassPanes(room)) {
    const wall = classify(room, pane);
    if (wall && front.includes(wall)) {
      const clipped = clipTop(pane, cut);
      if (clipped) shown.push(clipped);
    } else {
      shown.push(pane);
    }
  }
  return shown;
}
