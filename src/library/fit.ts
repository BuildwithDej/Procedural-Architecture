import { doorSwingXZ, pointOnWall } from "../model/geometry.ts";
import { validateRoom } from "../model/parse.ts";
import type { Door, Room, WallId } from "../model/types.ts";
import { emptyAabb, expandAabb } from "./bounds.ts";
import type { Aabb } from "./types.ts";
import {
  bedLayout,
  FEATURE_WALL,
  PLACEHOLDER_FOOT_CLEARANCE_M,
  PLACEHOLDER_SIDE_CLEARANCE_M,
  type BedLayout,
} from "./bedroomSet.ts";
import { buildDesk, DESK_SPEC } from "./desk.ts";
import type { MattressSizeId } from "./mattressSizes.ts";
import { decideWardrobe, WARDROBE_THREE_BAY, type WardrobeModel, type WardrobeRequest } from "./wardrobe.ts";

const WALLS: readonly WallId[] = ["north", "east", "south", "west"];
/** Later pieces prefer the west wall, which stays full height in the standard south-east view. */
const LATER_WALLS: readonly WallId[] = ["west", "south", "east", "north"];
const END_MARGIN_M = 0.05;

export interface FitRequest {
  room: Room;
  bedWall: WallId;
  mattressId: MattressSizeId;
  panelling: "bedSurround" | "fullWall";
  wardrobe: WardrobeRequest;
}

export interface Placement {
  id: "bed" | "desk" | "wardrobe";
  wall: WallId;
  alongCenterM: number;
  yaw: number;
  origin: [number, number, number];
  footprint: Aabb;
}

export interface FitAlternative {
  id: string;
  label: string;
  /** Applied only after an explicit accept. Already checked by a second fit. */
  request: FitRequest;
}

export interface FitResult {
  ok: boolean;
  placed: Placement[];
  unplaced: Array<{ id: "bed" | "desk" | "wardrobe"; reason: string }>;
  conflicts: string[];
  alternatives: FitAlternative[];
  mattressId: MattressSizeId;
  panelling: "bedSurround" | "fullWall";
}

interface Obstacle {
  id: string;
  box: Aabb;
}

export function yawForWall(wall: WallId): number {
  switch (wall) {
    case "south":
      return 0;
    case "north":
      return Math.PI;
    case "east":
      return -Math.PI / 2;
    case "west":
      return Math.PI / 2;
  }
}

export function wallLength(room: Room, wall: WallId): number {
  return wall === "north" || wall === "south" ? room.width : room.depth;
}

export function intoRoomLength(room: Room, wall: WallId): number {
  return wall === "north" || wall === "south" ? room.depth : room.width;
}

function rotateY(x: number, z: number, yaw: number): [number, number] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, -x * sin + z * cos];
}

export function mapAabb(box: Aabb, yaw: number, origin: readonly [number, number, number]): Aabb {
  const out = emptyAabb();
  const xs = [box.min[0], box.max[0]];
  const ys = [box.min[1], box.max[1]];
  const zs = [box.min[2], box.max[2]];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const [rx, rz] = rotateY(x, z, yaw);
        expandAabb(out, rx + origin[0], y + origin[1], rz + origin[2]);
      }
    }
  }
  return out;
}

function overlaps(a: Aabb, b: Aabb, epsilon = 0.004): boolean {
  return (
    a.min[0] < b.max[0] - epsilon &&
    a.max[0] > b.min[0] + epsilon &&
    a.min[1] < b.max[1] - epsilon &&
    a.max[1] > b.min[1] + epsilon &&
    a.min[2] < b.max[2] - epsilon &&
    a.max[2] > b.min[2] + epsilon
  );
}

function insideRoom(box: Aabb, room: Room, slack = 0.03): boolean {
  return (
    box.min[0] >= -slack &&
    box.max[0] <= room.width + slack &&
    box.min[1] >= -slack &&
    box.max[1] <= room.height + slack &&
    box.min[2] >= -slack &&
    box.max[2] <= room.depth + slack
  );
}

function subtractIntervals(span: [number, number], blocks: readonly [number, number][]): Array<[number, number]> {
  let parts: Array<[number, number]> = [span];
  for (const [holeStart, holeEnd] of blocks) {
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

function openingBlocks(room: Room, wall: WallId, occupiedTop: number): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  for (const door of room.doors) {
    if (door.wall === wall && occupiedTop > 0) blocks.push([door.position, door.position + door.width]);
  }
  for (const window of room.windows) {
    if (window.wall !== wall) continue;
    const head = window.sill + window.height;
    if (occupiedTop > window.sill && head > 0) blocks.push([window.position, window.position + window.width]);
  }
  return blocks;
}

function swingBox(room: Room, door: Door): Aabb {
  const box = emptyAabb();
  const hinge = pointOnWall(room, door.wall, door.position, 0);
  expandAabb(box, hinge.x, 0, hinge.z);
  expandAabb(box, hinge.x, door.height, hinge.z);
  for (const point of doorSwingXZ(door, room, 8)) {
    expandAabb(box, point.x, 0, point.z);
    expandAabb(box, point.x, door.height, point.z);
  }
  return box;
}

function finiteRoom(room: Room): boolean {
  return [room.width, room.depth, room.height].every((value) => Number.isFinite(value) && value > 0);
}

export function fitFurniture(request: FitRequest, options: { alternatives?: boolean } = {}): FitResult {
  const withAlternatives = options.alternatives !== false;
  const checked = validateRoom(request.room);
  if (!checked.ok || !finiteRoom(request.room)) {
    const messages = checked.ok ? ["Room dimensions must be finite and positive."] : checked.issues.map((issue) => issue.message);
    return {
      ok: false,
      placed: [],
      unplaced: [
        { id: "bed", reason: messages[0] ?? "The room is not usable." },
        { id: "desk", reason: "The bed was not placed, so the desk was not tried." },
        { id: "wardrobe", reason: "The bed was not placed, so the wardrobe was not tried." },
      ],
      conflicts: messages,
      alternatives: [],
      mattressId: request.mattressId,
      panelling: request.panelling,
    };
  }
  const room = checked.room;
  const wardrobeDecision = decideWardrobe(request.wardrobe);
  if (!wardrobeDecision.ok) {
    return {
      ok: false,
      placed: [],
      unplaced: [
        { id: "bed", reason: "The wardrobe request is invalid, so nothing was moved to make it fit." },
        { id: "desk", reason: "Not tried." },
        { id: "wardrobe", reason: wardrobeDecision.errors.join(" ") },
      ],
      conflicts: wardrobeDecision.errors,
      alternatives: [],
      mattressId: request.mattressId,
      panelling: request.panelling,
    };
  }

  const layout = bedLayout(request.mattressId);
  const desk = buildDesk();
  const wardrobe = wardrobeDecision.model;
  const placed: Placement[] = [];
  const unplaced: FitResult["unplaced"] = [];
  const conflicts: string[] = [];
  const obstacles: Obstacle[] = room.doors.map((door) => ({ id: `door-${door.wall}`, box: swingBox(room, door) }));

  const bed = tryBed(room, request, layout, obstacles);
  if (bed.placement) {
    placed.push(bed.placement);
    obstacles.push({ id: "bed", box: bed.placement.footprint }, ...(bed.clearances ?? []).map((box, index) => ({ id: `bed-clearance-${index}`, box })));
  } else {
    unplaced.push({ id: "bed", reason: bed.reason });
    conflicts.push(bed.reason);
    unplaced.push(
      { id: "desk", reason: "The bed group was not placed, so the desk was left out." },
      { id: "wardrobe", reason: "The bed group was not placed, so the wardrobe was left out." },
    );
    return finish(request, placed, unplaced, conflicts, withAlternatives);
  }

  const deskTry = tryAgainstWalls(room, "desk", DESK_SPEC.topWidthM, desk.visualBounds, obstacles, 1.15);
  if (deskTry.placement) {
    placed.push(deskTry.placement);
    obstacles.push({ id: "desk", box: deskTry.placement.footprint });
  } else {
    unplaced.push({ id: "desk", reason: deskTry.reason });
    conflicts.push(deskTry.reason);
  }

  const wardrobeTry = tryWardrobe(room, wardrobe, obstacles);
  if (wardrobeTry.placement) placed.push(wardrobeTry.placement);
  else {
    unplaced.push({ id: "wardrobe", reason: wardrobeTry.reason });
    conflicts.push(wardrobeTry.reason);
  }

  return finish(request, placed, unplaced, conflicts, withAlternatives);
}

function finish(
  request: FitRequest,
  placed: Placement[],
  unplaced: FitResult["unplaced"],
  conflicts: string[],
  withAlternatives: boolean,
): FitResult {
  const bedPlaced = placed.some((item) => item.id === "bed");
  const alternatives = withAlternatives && !bedPlaced ? bedWallAlternatives(request) : [];
  return {
    ok: bedPlaced && conflicts.length === 0 && unplaced.length === 0,
    placed,
    unplaced,
    conflicts,
    alternatives,
    mattressId: request.mattressId,
    panelling: request.panelling,
  };
}

function bedWallAlternatives(request: FitRequest): FitAlternative[] {
  const alternatives: FitAlternative[] = [];
  for (const wall of WALLS) {
    if (wall === request.bedWall) continue;
    const next: FitRequest = { ...request, bedWall: wall };
    const trial = fitFurniture(next, { alternatives: false });
    if (!trial.placed.some((item) => item.id === "bed")) continue;
    if (trial.unplaced.some((item) => item.id === "bed")) continue;
    alternatives.push({
      id: `bed-on-${wall}`,
      label: `Put the bed on the ${wall} wall. Mattress, openings, and wardrobe sections stay as they are.`,
      request: next,
    });
  }
  const otherMode = request.panelling === "bedSurround" ? "fullWall" : "bedSurround";
  const modeRequest: FitRequest = { ...request, panelling: otherMode };
  const modeTrial = fitFurniture(modeRequest, { alternatives: false });
  if (modeTrial.placed.some((item) => item.id === "bed") && !modeTrial.unplaced.some((item) => item.id === "bed")) {
    alternatives.push({
      id: `panelling-${otherMode}`,
      label: `Keep the bed wall and use ${otherMode === "fullWall" ? "full wall" : "bed surround"} panelling.`,
      request: modeRequest,
    });
  }
  return alternatives;
}

function tryBed(
  room: Room,
  request: FitRequest,
  layout: BedLayout,
  obstacles: readonly Obstacle[],
): { placement: Placement | null; reason: string; clearances?: Aabb[] } {
  if (FEATURE_WALL.heightM > room.height + 1e-6) {
    return {
      placement: null,
      reason: `The feature wall is ${FEATURE_WALL.heightM} m and the room is ${room.height} m. It was not shortened to fit.`,
    };
  }
  const along = layout.bedGroupWidthM;
  const length = wallLength(room, request.bedWall);
  const into = intoRoomLength(room, request.bedWall);
  if (into + 1e-6 < layout.frameDepthM + PLACEHOLDER_FOOT_CLEARANCE_M) {
    return {
      placement: null,
      reason: `The ${request.bedWall} wall does not leave ${PLACEHOLDER_FOOT_CLEARANCE_M} m clear at the foot of the bed.`,
    };
  }
  const blocks = openingBlocks(room, request.bedWall, FEATURE_WALL.heightM);
  const free = subtractIntervals([0, length], blocks);
  const slot = chooseStart(free, along, PLACEHOLDER_SIDE_CLEARANCE_M, length);
  if (!slot) {
    const fitsWithoutClearance = free.some(([start, end]) => end - start >= along - 1e-6);
    const reason = fitsWithoutClearance
      ? `The bed group is ${along.toFixed(2)} m along the ${request.bedWall} wall, and the ${PLACEHOLDER_SIDE_CLEARANCE_M} m side clearance does not fit in a free stretch.`
      : `The bed group is ${along.toFixed(2)} m and does not fit on the ${request.bedWall} wall without covering a door or window.`;
    return { placement: null, reason };
  }
  const alongCenter = slot + along / 2;
  const yaw = yawForWall(request.bedWall);
  const origin = originOnWall(room, request.bedWall, alongCenter, -layout.frameDepthM / 2);
  const footprint = mapAabb(
    {
      min: [-along / 2, 0, -layout.frameDepthM / 2 - FEATURE_WALL.thicknessM],
      max: [along / 2, FEATURE_WALL.heightM, layout.frameDepthM / 2],
    },
    yaw,
    origin,
  );
  const foot = mapAabb(
    {
      min: [-layout.frameWidthM / 2, 0, layout.frameDepthM / 2],
      max: [layout.frameWidthM / 2, 1.2, layout.frameDepthM / 2 + PLACEHOLDER_FOOT_CLEARANCE_M],
    },
    yaw,
    origin,
  );
  if (!insideRoom(footprint, room) || !insideRoom(foot, room)) {
    return { placement: null, reason: `The bed group leaves the ${request.bedWall} side of the room once the foot clearance is included.` };
  }
  const hit = obstacles.find((obstacle) => overlaps(obstacle.box, footprint) || overlaps(obstacle.box, foot));
  if (hit) {
    return { placement: null, reason: `The bed group meets ${hit.id}. The opening was not moved.` };
  }
  const led = ledCrossesOpening(room, request.bedWall, alongCenter, along);
  if (led) return { placement: null, reason: led };
  return {
    placement: { id: "bed", wall: request.bedWall, alongCenterM: alongCenter, yaw, origin, footprint },
    reason: "",
    clearances: [foot],
  };
}

function ledCrossesOpening(room: Room, wall: WallId, alongCenter: number, length: number): string | null {
  const start = alongCenter - length / 2;
  const end = alongCenter + length / 2;
  if (start < -1e-6 || end > wallLength(room, wall) + 1e-6) {
    return "The LED run centred on the bed leaves the wall. It was not clipped.";
  }
  for (const opening of [...room.doors, ...room.windows]) {
    if (opening.wall !== wall) continue;
    const openingEnd = opening.position + opening.width;
    if (Math.min(end, openingEnd) - Math.max(start, opening.position) > 0.001) {
      return `The LED run centred on the bed crosses the ${opening.wall} ${"sill" in opening ? "window" : "door"}. The opening stays where it is.`;
    }
  }
  return null;
}

function chooseStart(
  free: readonly [number, number][],
  span: number,
  clearance: number,
  wallMidSource: number,
): number | null {
  const ready = free.filter(([start, end]) => end - start >= span + clearance * 2 - 1e-6);
  if (ready.length === 0) return null;
  const mid = wallMidSource / 2;
  const ranked = [...ready].sort((a, b) => {
    const da = Math.abs((a[0] + a[1]) / 2 - mid);
    const db = Math.abs((b[0] + b[1]) / 2 - mid);
    if (Math.abs(da - db) > 1e-9) return da - db;
    return a[0] - b[0];
  });
  const [start, end] = ranked[0] ?? [0, 0];
  const innerStart = start + clearance;
  const innerEnd = end - clearance;
  let at = (start + end) / 2 - span / 2;
  if (at < innerStart) at = innerStart;
  if (at + span > innerEnd) at = innerEnd - span;
  return at;
}

function originOnWall(room: Room, wall: WallId, along: number, outward: number): [number, number, number] {
  const point = pointOnWall(room, wall, along, outward);
  return [point.x, 0, point.z];
}

function tryAgainstWalls(
  room: Room,
  id: "desk",
  alongSpan: number,
  localBounds: Aabb,
  obstacles: readonly Obstacle[],
  occupiedTop: number,
): { placement: Placement | null; reason: string } {
  for (const wall of LATER_WALLS) {
    const found = placeOnWall(room, id, wall, alongSpan, 0, localBounds, obstacles, occupiedTop, END_MARGIN_M);
    if (found) return { placement: found, reason: "" };
  }
  return { placement: null, reason: `No wall has a free stretch for the ${id} without covering an opening or the bed.` };
}

function tryWardrobe(room: Room, model: WardrobeModel, obstacles: readonly Obstacle[]): { placement: Placement | null; reason: string } {
  if (model.heightM > room.height + 1e-6) {
    return { placement: null, reason: `The wardrobe is ${model.heightM} m tall and the room is ${room.height} m. It was not squashed.` };
  }
  const sweep = Math.max(...model.doors.map((door) => door.sweepRadiusM));
  const local: Aabb = {
    min: [-model.overallWidthM / 2, 0, 0],
    max: [model.overallWidthM / 2, model.heightM, model.exteriorDepthM + sweep],
  };
  for (const wall of LATER_WALLS) {
    const found = placeOnWall(room, "wardrobe", wall, model.overallWidthM, 0, local, obstacles, model.heightM, END_MARGIN_M);
    if (found) return { placement: found, reason: "" };
  }
  return { placement: null, reason: "No wall leaves room for the wardrobe and its open-door sweep." };
}

function placeOnWall(
  room: Room,
  id: "desk" | "wardrobe",
  wall: WallId,
  alongSpan: number,
  backOffset: number,
  localBounds: Aabb,
  obstacles: readonly Obstacle[],
  occupiedTop: number,
  margin: number,
): Placement | null {
  const length = wallLength(room, wall);
  const blocks = openingBlocks(room, wall, occupiedTop);
  const free = subtractIntervals([margin, Math.max(margin, length - margin)], blocks);
  const slots = rankedStarts(free, alongSpan, length);
  const yaw = yawForWall(wall);
  for (const start of slots) {
    const alongCenter = start + alongSpan / 2;
    const origin = originOnWall(room, wall, alongCenter, backOffset);
    const footprint = mapAabb(localBounds, yaw, origin);
    if (!insideRoom(footprint, room, 0.03)) continue;
    if (obstacles.some((obstacle) => overlaps(obstacle.box, footprint))) continue;
    return { id, wall, alongCenterM: alongCenter, yaw, origin, footprint };
  }
  return null;
}

function rankedStarts(free: readonly [number, number][], span: number, wallLengthM: number): number[] {
  const mid = wallLengthM / 2;
  const starts: Array<{ at: number; rank: number }> = [];
  for (const [start, end] of free) {
    if (end - start < span - 1e-6) continue;
    const low = start;
    const high = end - span;
    const center = (start + end) / 2 - span / 2;
    for (const at of [center, low, high]) {
      if (at < start - 1e-6 || at + span > end + 1e-6) continue;
      starts.push({ at, rank: Math.abs(at + span / 2 - mid) });
    }
  }
  starts.sort((a, b) => a.rank - b.rank || a.at - b.at);
  const unique: number[] = [];
  for (const start of starts) {
    if (unique.every((value) => Math.abs(value - start.at) > 1e-4)) unique.push(start.at);
  }
  return unique.slice(0, 3);
}

export function moduleCenters(wallLengthM: number, moduleWidthM: number, gapM: number, blocked: readonly [number, number][]): number[] {
  const centers: number[] = [];
  const pitch = moduleWidthM + gapM;
  if (!(moduleWidthM > 0) || !(wallLengthM > 0) || !Number.isFinite(wallLengthM)) return centers;
  let cursor = 0;
  let guard = 0;
  while (cursor + moduleWidthM <= wallLengthM + 1e-6 && guard < 10000) {
    const end = cursor + moduleWidthM;
    const hits = blocked.some(([start, stop]) => Math.min(end, stop) - Math.max(cursor, start) > 0.001);
    if (!hits) centers.push(cursor + moduleWidthM / 2);
    cursor += pitch;
    guard += 1;
  }
  return centers;
}

export const FITS_ROOM: Room = {
  id: "fits-bedroom",
  name: "Fits bedroom",
  width: 5,
  depth: 4.2,
  height: 2.7,
  doors: [{ wall: "south", position: 0.3, width: 0.9, height: 2.1 }],
  windows: [{ wall: "east", position: 0.4, width: 1.2, sill: 0.9, height: 1.2 }],
};

export function defaultFitRequest(room: Room, bedWall: WallId = "north"): FitRequest {
  return {
    room,
    bedWall,
    mattressId: "queen",
    panelling: "bedSurround",
    wardrobe: WARDROBE_THREE_BAY,
  };
}
