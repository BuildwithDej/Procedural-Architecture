import { partBounds, unionBounds } from "./bounds.ts";
import { cylinderX, roundedBox, transformPart } from "./mesh.ts";
import type { Aabb, MeshPart } from "./types.ts";

/** Carcass members share this thickness. Doors are leaves, not carcass, and stay at their own thickness. */
export const CARCASS_THICKNESS_M = 0.018;
export const DOOR_THICKNESS_M = 0.02;
export const PLINTH_M = 0.08;
/** Shelf stops short of the door so the leaf can close. This does not change usable depth. */
export const SHELF_SETBACK_M = 0.012;

/**
 * Prototype limits so a request can be built as joinery.
 * They are not a bedroom code, a Butler County profile, or a room solver.
 */
export const WARDROBE_LIMITS = {
  bayCount: { min: 1, max: 4 },
  bayWidthM: { min: 0.42, max: 0.65 },
  usableDepthM: { min: 0.52, max: 0.68 },
  heightM: { min: 1.9, max: 2.4 },
  drawerCount: { min: 2, max: 5 },
  minDrawerFaceM: 0.14,
  railHeightM: { min: 1.05, max: 1.85 },
  minShelfGapM: 0.16,
} as const;

export type StorageSection =
  | { kind: "hanging"; railHeightM: number }
  | { kind: "shelves"; shelfHeightsM: readonly number[] }
  | { kind: "drawers"; drawerCount: number }
  | { kind: "hanging-and-drawers"; railHeightM: number; drawerCount: number };

export interface WardrobeRequest {
  id: string;
  bayCount: number;
  bayWidthM: number;
  usableDepthM: number;
  heightM: number;
  sections: readonly StorageSection[];
}

export interface DoorEnvelope {
  bayIndex: number;
  hinge: "left";
  widthM: number;
  thicknessM: number;
  openAngleDeg: 90;
  sweepRadiusM: number;
  closed: Aabb;
  open: Aabb;
}

export interface WardrobeModel {
  id: string;
  request: WardrobeRequest;
  carcassThicknessM: number;
  usableDepthM: number;
  overallWidthM: number;
  exteriorDepthM: number;
  heightM: number;
  /** Closed carcass. The door swing is the access envelope, not this box. */
  footprint: Aabb;
  visualBounds: Aabb;
  doors: DoorEnvelope[];
  partsClosed: MeshPart[];
  partsOpen: MeshPart[];
}

export type WardrobeDecision =
  | { ok: true; model: WardrobeModel }
  | { ok: false; errors: string[]; alternatives: WardrobeRequest[] };

export const WARDROBE_THREE_BAY: WardrobeRequest = {
  id: "three-bay-hang-shelf-drawers",
  bayCount: 3,
  bayWidthM: 0.5,
  usableDepthM: 0.56,
  heightM: 2.1,
  sections: [
    { kind: "hanging", railHeightM: 1.58 },
    { kind: "shelves", shelfHeightsM: [0.48, 0.9, 1.32, 1.72] },
    { kind: "hanging-and-drawers", railHeightM: 1.62, drawerCount: 2 },
  ],
};

export const WARDROBE_TWO_BAY: WardrobeRequest = {
  id: "two-bay-hang-drawers",
  bayCount: 2,
  bayWidthM: 0.58,
  usableDepthM: 0.6,
  heightM: 2.0,
  sections: [
    { kind: "hanging", railHeightM: 1.5 },
    { kind: "drawers", drawerCount: 4 },
  ],
};

export function overallWidthM(request: Pick<WardrobeRequest, "bayCount" | "bayWidthM">): number {
  return CARCASS_THICKNESS_M * 2 + request.bayWidthM * request.bayCount + CARCASS_THICKNESS_M * (request.bayCount - 1);
}

export function exteriorDepthM(usableDepthM: number): number {
  return CARCASS_THICKNESS_M + usableDepthM + DOOR_THICKNESS_M;
}

interface Interior {
  floor: number;
  ceiling: number;
  height: number;
}

function interiorOf(heightM: number): Interior {
  const floor = PLINTH_M + CARCASS_THICKNESS_M;
  const ceiling = heightM - CARCASS_THICKNESS_M;
  return { floor, ceiling, height: ceiling - floor };
}

function collectErrors(request: WardrobeRequest): string[] {
  const errors: string[] = [];
  const limits = WARDROBE_LIMITS;
  if (!Number.isInteger(request.bayCount)) errors.push("Bay count has to be a whole number.");
  if (request.bayCount < limits.bayCount.min || request.bayCount > limits.bayCount.max) {
    errors.push(`Bay count ${request.bayCount} is outside ${limits.bayCount.min}–${limits.bayCount.max}.`);
  }
  if (request.sections.length !== request.bayCount) {
    errors.push(`This request has ${request.sections.length} storage sections for ${request.bayCount} bays.`);
  }
  checkRange(errors, "Bay width", request.bayWidthM, limits.bayWidthM.min, limits.bayWidthM.max);
  checkRange(errors, "Usable depth", request.usableDepthM, limits.usableDepthM.min, limits.usableDepthM.max);
  checkRange(errors, "Height", request.heightM, limits.heightM.min, limits.heightM.max);
  if (errors.length === 0) {
    const interior = interiorOf(request.heightM);
    request.sections.forEach((section, index) => checkSection(errors, section, index, interior));
  }
  return errors;
}

export function validateWardrobe(request: WardrobeRequest): { ok: true } | { ok: false; errors: string[]; alternatives: WardrobeRequest[] } {
  const errors = collectErrors(request);
  if (errors.length === 0) return { ok: true };
  const alternative = suggest(request);
  const alternatives = alternative && collectErrors(alternative).length === 0 ? [alternative] : [];
  return { ok: false, errors, alternatives };
}

function checkRange(errors: string[], label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value)) {
    errors.push(`${label} is not a finite number.`);
    return;
  }
  if (value < min || value > max) errors.push(`${label} ${value} m is outside ${min}–${max} m. It was not changed to force a fit.`);
}

function checkSection(errors: string[], section: StorageSection, index: number, interior: Interior): void {
  const bay = `Bay ${index + 1}`;
  if (section.kind === "hanging" || section.kind === "hanging-and-drawers") {
    const rail = section.railHeightM;
    const railMax = Math.min(WARDROBE_LIMITS.railHeightM.max, interior.ceiling - 0.08);
    if (rail < WARDROBE_LIMITS.railHeightM.min || rail > railMax) {
      errors.push(`${bay} rail at ${rail} m does not sit in the hanging range. It was left as requested.`);
    }
  }
  if (section.kind === "shelves") {
    const heights = [...section.shelfHeightsM].sort((a, b) => a - b);
    if (heights.length === 0) errors.push(`${bay} asks for shelves but lists none.`);
    heights.forEach((height, shelfIndex) => {
      if (height < interior.floor + 0.08 || height > interior.ceiling - 0.04) {
        errors.push(`${bay} shelf ${shelfIndex + 1} at ${height} m is outside the interior.`);
      }
      const previous = heights[shelfIndex - 1];
      if (previous !== undefined && height - previous < WARDROBE_LIMITS.minShelfGapM) {
        errors.push(`${bay} shelves are closer than ${WARDROBE_LIMITS.minShelfGapM} m.`);
      }
    });
  }
  if (section.kind === "drawers" || section.kind === "hanging-and-drawers") {
    const count = section.drawerCount;
    if (!Number.isInteger(count) || count < WARDROBE_LIMITS.drawerCount.min || count > WARDROBE_LIMITS.drawerCount.max) {
      errors.push(`${bay} drawer count ${count} is outside ${WARDROBE_LIMITS.drawerCount.min}–${WARDROBE_LIMITS.drawerCount.max}.`);
    }
    const zone = section.kind === "drawers" ? interior.height : section.railHeightM - 0.4 - interior.floor;
    if (Number.isFinite(zone) && count > 0 && zone / count < WARDROBE_LIMITS.minDrawerFaceM) {
      errors.push(`${bay} cannot give ${count} drawers a face of ${WARDROBE_LIMITS.minDrawerFaceM} m without dropping the rail or the depth.`);
    }
  }
}

function suggest(request: WardrobeRequest): WardrobeRequest | null {
  const limits = WARDROBE_LIMITS;
  const bayCount = clampInt(request.bayCount, limits.bayCount.min, limits.bayCount.max);
  const bayWidthM = clamp(request.bayWidthM, limits.bayWidthM.min, limits.bayWidthM.max);
  const usableDepthM = clamp(request.usableDepthM, limits.usableDepthM.min, limits.usableDepthM.max);
  const heightM = clamp(request.heightM, limits.heightM.min, limits.heightM.max);
  const interior = interiorOf(heightM);
  let sections = request.sections.slice(0, bayCount).map((section) => {
    const sectionErrors: string[] = [];
    checkSection(sectionErrors, section, 0, interior);
    return sectionErrors.length === 0 ? section : fixSection(section, interior);
  });
  while (sections.length < bayCount) sections.push({ kind: "hanging", railHeightM: Math.min(1.55, interior.ceiling - 0.12) });
  if (sections.length !== bayCount) return null;
  return {
    id: `${request.id}-alternative`,
    bayCount,
    bayWidthM,
    usableDepthM,
    heightM,
    sections,
  };
}

function fixSection(section: StorageSection, interior: Interior): StorageSection {
  const railMax = Math.min(WARDROBE_LIMITS.railHeightM.max, interior.ceiling - 0.08);
  const rail = (value: number) => clamp(value, WARDROBE_LIMITS.railHeightM.min, railMax);
  if (section.kind === "hanging") return { kind: "hanging", railHeightM: rail(section.railHeightM) };
  if (section.kind === "shelves") {
    const count = Math.max(1, section.shelfHeightsM.length);
    const start = interior.floor + 0.12;
    const end = interior.ceiling - 0.08;
    const step = count === 1 ? 0 : (end - start) / (count - 1);
    const shelfHeightsM = Array.from({ length: count }, (_, index) => start + step * index);
    return { kind: "shelves", shelfHeightsM };
  }
  const count = clampInt(section.drawerCount, WARDROBE_LIMITS.drawerCount.min, WARDROBE_LIMITS.drawerCount.max);
  if (section.kind === "drawers") return { kind: "drawers", drawerCount: count };
  return { kind: "hanging-and-drawers", drawerCount: count, railHeightM: rail(Math.max(section.railHeightM, interior.floor + 0.4 + count * WARDROBE_LIMITS.minDrawerFaceM + 0.05)) };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function buildWardrobe(request: WardrobeRequest): WardrobeModel {
  const decision = validateWardrobe(request);
  if (!decision.ok) throw new Error(decision.errors.join(" "));
  const width = overallWidthM(request);
  const depth = exteriorDepthM(request.usableDepthM);
  const interior = interiorOf(request.heightM);
  const closed: MeshPart[] = [];
  const carcass = carcassParts(request, width, depth);
  closed.push(...carcass);

  const doors: DoorEnvelope[] = [];
  const doorParts: MeshPart[] = [];
  const openDoors: MeshPart[] = [];
  for (let index = 0; index < request.bayCount; index += 1) {
    const section = request.sections[index];
    if (!section) continue;
    const bayLeft = -width / 2 + CARCASS_THICKNESS_M + index * (request.bayWidthM + CARCASS_THICKNESS_M);
    closed.push(...bayInterior(request, section, index, bayLeft, interior));
    const door = doorPart(request, index, bayLeft);
    doorParts.push(door.closed, door.pull);
    openDoors.push(door.open, door.openPull);
    doors.push(door.envelope);
  }
  const partsClosed = [...closed, ...doorParts];
  const partsOpen = [...closed, ...openDoors];
  return {
    id: request.id,
    request,
    carcassThicknessM: CARCASS_THICKNESS_M,
    usableDepthM: request.usableDepthM,
    overallWidthM: width,
    exteriorDepthM: depth,
    heightM: request.heightM,
    footprint: {
      min: [-width / 2, 0, 0],
      max: [width / 2, request.heightM, depth],
    },
    visualBounds: unionBounds(partsClosed),
    doors,
    partsClosed,
    partsOpen,
  };
}

export function decideWardrobe(request: WardrobeRequest): WardrobeDecision {
  const check = validateWardrobe(request);
  if (!check.ok) return check;
  return { ok: true, model: buildWardrobe(request) };
}

function carcassParts(request: WardrobeRequest, width: number, depth: number): MeshPart[] {
  const side = {
    width: CARCASS_THICKNESS_M,
    height: request.heightM - PLINTH_M,
    depth,
    radius: 0.002,
    curveSegments: 1,
  };
  const y = PLINTH_M + side.height / 2;
  const parts: MeshPart[] = [
    roundedBox("wardrobe-plinth", "timberDark", {
      width: width - 0.028,
      height: PLINTH_M,
      depth: depth - 0.04,
      radius: 0.004,
      curveSegments: 1,
      center: [0, PLINTH_M / 2, depth / 2 - 0.01],
    }),
    roundedBox("wardrobe-side-left", "timber", { ...side, center: [-width / 2 + CARCASS_THICKNESS_M / 2, y, depth / 2] }),
    roundedBox("wardrobe-side-right", "timber", { ...side, center: [width / 2 - CARCASS_THICKNESS_M / 2, y, depth / 2] }),
    roundedBox("wardrobe-top", "timber", {
      width: width - CARCASS_THICKNESS_M * 2,
      height: CARCASS_THICKNESS_M,
      depth,
      radius: 0,
      center: [0, request.heightM - CARCASS_THICKNESS_M / 2, depth / 2],
    }),
    roundedBox("wardrobe-bottom", "timber", {
      width: width - CARCASS_THICKNESS_M * 2,
      height: CARCASS_THICKNESS_M,
      depth: CARCASS_THICKNESS_M + request.usableDepthM,
      radius: 0,
      center: [0, PLINTH_M + CARCASS_THICKNESS_M / 2, (CARCASS_THICKNESS_M + request.usableDepthM) / 2],
    }),
    roundedBox("wardrobe-back", "timberDark", {
      width: width - CARCASS_THICKNESS_M * 2,
      height: request.heightM - PLINTH_M - CARCASS_THICKNESS_M,
      depth: CARCASS_THICKNESS_M,
      radius: 0,
      center: [0, PLINTH_M + (request.heightM - PLINTH_M) / 2, CARCASS_THICKNESS_M / 2],
    }),
  ];
  for (let index = 0; index < request.bayCount - 1; index += 1) {
    const x = -width / 2 + CARCASS_THICKNESS_M + (index + 1) * request.bayWidthM + index * CARCASS_THICKNESS_M + CARCASS_THICKNESS_M / 2;
    parts.push(
      roundedBox(`wardrobe-partition-${index}`, "timber", {
        width: CARCASS_THICKNESS_M,
        height: interiorOf(request.heightM).height,
        depth: CARCASS_THICKNESS_M + request.usableDepthM,
        radius: 0,
        center: [x, (interiorOf(request.heightM).floor + interiorOf(request.heightM).ceiling) / 2, (CARCASS_THICKNESS_M + request.usableDepthM) / 2],
      }),
    );
  }
  return parts;
}

function bayInterior(
  request: WardrobeRequest,
  section: StorageSection,
  index: number,
  bayLeft: number,
  interior: Interior,
): MeshPart[] {
  const parts: MeshPart[] = [];
  const centerX = bayLeft + request.bayWidthM / 2;
  const shelfDepth = request.usableDepthM - SHELF_SETBACK_M;
  const z = CARCASS_THICKNESS_M + shelfDepth / 2;
  if (section.kind === "shelves") {
    section.shelfHeightsM.forEach((height, shelfIndex) => {
      parts.push(
        roundedBox(`wardrobe-bay-${index}-shelf-${shelfIndex}`, "timber", {
          width: request.bayWidthM,
          height: CARCASS_THICKNESS_M,
          depth: shelfDepth,
          radius: 0,
          center: [centerX, height, z],
        }),
      );
    });
  }
  if (section.kind === "hanging" || section.kind === "hanging-and-drawers") {
    parts.push(
      cylinderX(
        `wardrobe-bay-${index}-rail`,
        "metalDark",
        [centerX, section.railHeightM, CARCASS_THICKNESS_M + request.usableDepthM * 0.42],
        0.012,
        request.bayWidthM - 0.06,
      ),
    );
  }
  if (section.kind === "drawers" || section.kind === "hanging-and-drawers") {
    const zoneTop = section.kind === "drawers" ? interior.ceiling - 0.02 : section.railHeightM - 0.4;
    const zone = zoneTop - interior.floor;
    const face = zone / section.drawerCount;
    for (let drawer = 0; drawer < section.drawerCount; drawer += 1) {
      const drawerY = interior.floor + face * drawer + face / 2;
      parts.push(
        roundedBox(`wardrobe-bay-${index}-drawer-${drawer}`, "timber", {
          width: request.bayWidthM - 0.02,
          height: face - 0.012,
          depth: shelfDepth * 0.92,
          radius: 0.003,
          curveSegments: 1,
          center: [centerX, drawerY, CARCASS_THICKNESS_M + shelfDepth * 0.46],
        }),
      );
    }
  }
  return parts;
}

function doorPart(
  request: WardrobeRequest,
  index: number,
  bayLeft: number,
): { closed: MeshPart; pull: MeshPart; open: MeshPart; openPull: MeshPart; envelope: DoorEnvelope } {
  const gap = 0.003;
  const left = bayLeft + gap;
  const right = bayLeft + request.bayWidthM - gap;
  const width = right - left;
  const bottom = PLINTH_M + 0.006;
  const top = request.heightM - CARCASS_THICKNESS_M - 0.004;
  const height = top - bottom;
  const z0 = CARCASS_THICKNESS_M + request.usableDepthM;
  const center: [number, number, number] = [left + width / 2, bottom + height / 2, z0 + DOOR_THICKNESS_M / 2];
  const closed = roundedBox(`wardrobe-door-${index}`, "timber", {
    width,
    height,
    depth: DOOR_THICKNESS_M,
    radius: 0.004,
    curveSegments: 2,
    center,
  });
  const pull = roundedBox(`wardrobe-door-${index}-pull`, "metalDark", {
    width: 0.012,
    height: 0.18,
    depth: 0.01,
    radius: 0.003,
    curveSegments: 2,
    center: [right - 0.045, bottom + height * 0.55, z0 + DOOR_THICKNESS_M + 0.004],
  });
  const hinge: [number, number, number] = [left, 0, z0 + DOOR_THICKNESS_M];
  const openDoor = transformPart(closed, { pivot: hinge, yaw: -Math.PI / 2 });
  const openPull = transformPart(pull, { pivot: hinge, yaw: -Math.PI / 2 });
  return {
    closed,
    pull,
    open: { ...openDoor, name: `wardrobe-door-${index}-open` },
    openPull: { ...openPull, name: `wardrobe-door-${index}-pull-open` },
    envelope: {
      bayIndex: index,
      hinge: "left",
      widthM: width,
      thicknessM: DOOR_THICKNESS_M,
      openAngleDeg: 90,
      sweepRadiusM: width,
      closed: unionBounds([closed, pull]),
      open: unionBounds([openDoor, openPull]),
    },
  };
}

export function shelfDepthM(part: MeshPart): number {
  const box = partBounds(part);
  return box.max[2] - box.min[2];
}
