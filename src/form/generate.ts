import {
  MAX_BOUNDARY_VERTICES,
  dedupeClosed,
  dropCollinear,
  ensureCCW,
  insetPolygon,
  minEdgeLength,
  notchCorner,
  polygonArea,
  polygonInside,
  selfIntersects,
  setbackEdge,
  signedArea,
  triangulationCovers,
  type Vec,
} from "./polygon.ts";

/**
 * Sizes used to draw the shell. They are parametric design choices, not structure or code.
 */
export const FORM_DESIGN = {
  floorHeightM: 3.2,
  slabThicknessM: 0.28,
  wallThicknessM: 0.25,
  /** Smallest hollow this generator will keep after the walls. A design floor, not a regulation. */
  minInteriorAreaM2: 4,
} as const;

/**
 * What this version of the editor will accept. Not a zoning rule, a setback, or a claim that a
 * smaller or shorter site cannot hold a hollow floor.
 */
export const FORM_SUPPORT = {
  minSiteAreaM2: 18,
  minSiteEdgeM: 0.8,
  maxAbsCoordinateM: 500,
} as const;

export const FLOOR_COUNT_MIN = 1;
export const FLOOR_COUNT_MAX = 5;

/** Setback attempts per floor. Fixed so a bad outline cannot search without a bound. */
const SHAPE_TRIES = 6;

/** Floor plate. The polygon is the outer face of the walls, not a centerline. */
export interface SlabPlate {
  id: string;
  polygon: Vec[];
  elevationM: number;
  thicknessM: number;
}

/** One straight run of the perimeter wall, from the outer edge to the matching interior edge. */
export interface WallRun {
  id: string;
  edgeIndex: number;
  outer: [Vec, Vec];
  interior: [Vec, Vec];
  /** Top of the slab. The wall stands on the slab. */
  elevationM: number;
  /** Clear height from the slab top to the next level. */
  heightM: number;
  thicknessM: number;
}

/** Flat cap on the top plate. Hiding it is a view change; the cap stays in the data. */
export interface RoofCap {
  id: string;
  polygon: Vec[];
  elevationM: number;
  thicknessM: number;
}

export interface FloorShell {
  id: string;
  index: number;
  elevationM: number;
  heightM: number;
  slabThicknessM: number;
  wallThicknessM: number;
  outer: Vec[];
  interior: Vec[];
  slab: SlabPlate;
  walls: WallRun[];
  /** False when every smaller plate failed and this level repeats the one below. */
  stepped: boolean;
}

export interface BuildingForm {
  seed: number;
  floorCount: number;
  design: typeof FORM_DESIGN;
  support: typeof FORM_SUPPORT;
  /** One simple site ring. Metres, x east, y north. No holes. */
  site: Vec[];
  floors: FloorShell[];
  roof: RoofCap;
}

export type FormResult = { ok: true; form: BuildingForm } | { ok: false; issues: string[] };

export function validateFloorCount(value: unknown): { ok: true; floors: number } | { ok: false; issues: string[] } {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    return { ok: false, issues: ["Floor count must be a whole number from 1 to 5."] };
  }
  if (value < FLOOR_COUNT_MIN || value > FLOOR_COUNT_MAX) {
    return { ok: false, issues: [`Floor count must be from ${FLOOR_COUNT_MIN} to ${FLOOR_COUNT_MAX}.`] };
  }
  return { ok: true, floors: value };
}

export function validateBoundary(points: readonly Vec[]): { ok: true; polygon: Vec[] } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (points.length > MAX_BOUNDARY_VERTICES) {
    issues.push(`Use at most ${MAX_BOUNDARY_VERTICES} corners.`);
  }
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    issues.push("Every corner needs finite metre coordinates.");
  }
  if (
    points.some(
      (point) => Math.abs(point.x) > FORM_SUPPORT.maxAbsCoordinateM || Math.abs(point.y) > FORM_SUPPORT.maxAbsCoordinateM,
    )
  ) {
    issues.push(`This editor supports coordinates within ±${FORM_SUPPORT.maxAbsCoordinateM} m.`);
  }
  const polygon = dropCollinear(ensureCCW(dedupeClosed(points)));
  if (polygon.length < 3) issues.push("A boundary needs at least three corners.");
  if (polygon.length >= 3 && minEdgeLength(polygon) < FORM_SUPPORT.minSiteEdgeM) {
    issues.push(
      `This editor supports sides of at least ${FORM_SUPPORT.minSiteEdgeM} m. That is an application limit, not a legal minimum.`,
    );
  }
  if (polygon.length >= 3 && polygonArea(polygon) < FORM_SUPPORT.minSiteAreaM2) {
    issues.push(
      `This editor supports sites of at least ${FORM_SUPPORT.minSiteAreaM2} m². A smaller site is outside this version. It is not a zoning limit, and it does not mean a smaller site cannot hold a hollow floor.`,
    );
  }
  if (polygon.length >= 4 && selfIntersects(polygon)) {
    issues.push("The boundary crosses itself. Close a simple outline. Concave corners are allowed.");
  }
  if (polygon.length >= 3 && Math.abs(signedArea(polygon)) < 1e-6) {
    issues.push("The corners are degenerate and do not enclose an area.");
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, polygon };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wallFootprintsInside(outer: readonly Vec[], interior: readonly Vec[], site: readonly Vec[]): boolean {
  if (outer.length !== interior.length) return false;
  if (!polygonInside(interior, outer)) return false;
  if (!polygonInside(outer, site)) return false;
  for (let i = 0; i < outer.length; i += 1) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    const c = interior[(i + 1) % interior.length];
    const d = interior[i];
    if (!a || !b || !c || !d) return false;
    const quad = [a, b, c, d];
    if (selfIntersects(quad) || polygonArea(quad) < 1e-4) return false;
    if (!polygonInside(quad, outer) || !polygonInside(quad, site)) return false;
  }
  return true;
}

function plateWorks(candidate: readonly Vec[], container: readonly Vec[], site: readonly Vec[]): Vec[] | null {
  const outer = dropCollinear(ensureCCW(candidate));
  if (outer.length < 3 || outer.length > MAX_BOUNDARY_VERTICES) return null;
  if (minEdgeLength(outer) < 0.35) return null;
  if (selfIntersects(outer) || polygonArea(outer) < FORM_DESIGN.minInteriorAreaM2 + 1) return null;
  if (!polygonInside(outer, container) || !polygonInside(outer, site)) return null;
  const interior = insetPolygon(outer, FORM_DESIGN.wallThicknessM);
  if (!interior || polygonArea(interior) < FORM_DESIGN.minInteriorAreaM2) return null;
  if (!wallFootprintsInside(outer, interior, site)) return null;
  if (!triangulationCovers(outer) || !triangulationCovers(interior)) return null;
  return outer;
}

function stepPlate(base: readonly Vec[], site: readonly Vec[], random: () => number): Vec[] | null {
  const area = polygonArea(base);
  const span = Math.sqrt(area);
  const target = 0.55 + random() * 0.3;
  const rolls: number[] = [];
  for (let i = 0; i < SHAPE_TRIES; i += 1) rolls.push(random());

  const accepted: Vec[][] = [];
  const consider = (poly: Vec[] | null) => {
    if (!poly) return;
    const plate = plateWorks(poly, base, site);
    if (!plate) return;
    if (polygonArea(plate) > area * 0.97) return;
    accepted.push(plate);
  };

  consider(insetPolygon(base, Math.max(0.45, span * 0.06)));
  consider(insetPolygon(base, Math.min(1.8, span * 0.12)));

  for (let attempt = 0; attempt < SHAPE_TRIES; attempt += 1) {
    const roll = rolls[attempt] ?? 0;
    const edge = Math.floor(roll * base.length) % base.length;
    const distance = Math.max(0.7, span * (0.08 + ((rolls[(attempt + 1) % SHAPE_TRIES] ?? roll) * 0.2)));
    consider(setbackEdge(base, edge, distance));
    const corner = Math.floor(((rolls[(attempt + 3) % SHAPE_TRIES] ?? roll) * base.length) % base.length);
    const bitePrev = Math.max(1.6, span * (0.22 + roll * 0.42));
    const biteNext = Math.max(1.6, span * (0.18 + ((rolls[(attempt + 2) % SHAPE_TRIES] ?? roll) * 0.4)));
    consider(notchCorner(base, corner, bitePrev, biteNext));
    if (attempt === 0) {
      const deep = setbackEdge(base, edge, Math.min(span * 0.34, minEdgeLength(base) * 0.45));
      consider(deep);
      if (deep) {
        const nextEdge = Math.floor((rolls[2] ?? 0) * deep.length) % deep.length;
        consider(setbackEdge(deep, nextEdge, Math.max(0.6, span * 0.08)));
      }
    }
  }

  if (accepted.length === 0) return null;
  const score = (plate: Vec[]) => {
    const ratio = Math.abs(polygonArea(plate) / area - target);
    const sameSilhouette = plate.length === base.length ? 0.14 : 0;
    return ratio + sameSilhouette;
  };
  accepted.sort((left, right) => score(left) - score(right));
  return accepted[0] ?? null;
}

export function generateForm(input: { boundary: readonly Vec[]; floors: number; seed: number }): FormResult {
  const count = validateFloorCount(input.floors);
  if (!count.ok) return count;
  if (!Number.isInteger(input.seed) || !Number.isFinite(input.seed)) {
    return { ok: false, issues: ["The seed must be a finite whole number."] };
  }
  const boundary = validateBoundary(input.boundary);
  if (!boundary.ok) return boundary;
  const site = boundary.polygon;
  const random = mulberry32(input.seed);

  const span = Math.sqrt(polygonArea(site));
  const margins = [FORM_DESIGN.wallThicknessM, 0.45, Math.min(1.4, span * 0.08), Math.min(2.2, span * 0.14)];
  const marginOrder = margins
    .map((margin) => ({ margin, roll: random() }))
    .sort((left, right) => left.roll - right.roll);

  let ground: Vec[] | null = null;
  for (const { margin } of marginOrder) {
    const plate = insetPolygon(site, margin);
    if (!plate) continue;
    const shaped = stepPlate(plate, site, random) ?? plateWorks(plate, site, site);
    if (shaped) {
      ground = shaped;
      break;
    }
  }
  if (!ground) {
    return {
      ok: false,
      issues: [
        `No hollow floor with a ${FORM_DESIGN.wallThicknessM} m wall stayed inside this outline. Nothing was built past the boundary.`,
      ],
    };
  }

  const floors: FloorShell[] = [];
  let current = ground;
  for (let index = 0; index < count.floors; index += 1) {
    let stepped = false;
    if (index > 0) {
      const next = stepPlate(current, site, random);
      if (next && polygonArea(next) < polygonArea(current) - 0.05) {
        current = next;
        stepped = true;
      }
    }
    const interior = insetPolygon(current, FORM_DESIGN.wallThicknessM);
    if (!interior || !wallFootprintsInside(current, interior, site) || !polygonInside(current, site)) {
      return { ok: false, issues: [`Floor ${index + 1} could not stay a hollow shell inside the site. Nothing was kept.`] };
    }
    const elevationM = index * FORM_DESIGN.floorHeightM;
    const outer = current.map((point) => ({ x: point.x, y: point.y }));
    const hole = interior.map((point) => ({ x: point.x, y: point.y }));
    const floorNumber = index + 1;
    const walls: WallRun[] = outer.map((start, edgeIndex) => {
      const end = outer[(edgeIndex + 1) % outer.length];
      const interiorStart = hole[edgeIndex];
      const interiorEnd = hole[(edgeIndex + 1) % hole.length];
      if (!end || !interiorStart || !interiorEnd) {
        throw new Error(`Floor ${floorNumber} lost a wall edge.`);
      }
      return {
        id: `floor-${floorNumber}-wall-${edgeIndex}`,
        edgeIndex,
        outer: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }],
        interior: [{ x: interiorStart.x, y: interiorStart.y }, { x: interiorEnd.x, y: interiorEnd.y }],
        elevationM: elevationM + FORM_DESIGN.slabThicknessM,
        heightM: FORM_DESIGN.floorHeightM - FORM_DESIGN.slabThicknessM,
        thicknessM: FORM_DESIGN.wallThicknessM,
      };
    });
    floors.push({
      id: `floor-${floorNumber}`,
      index,
      elevationM,
      heightM: FORM_DESIGN.floorHeightM,
      slabThicknessM: FORM_DESIGN.slabThicknessM,
      wallThicknessM: FORM_DESIGN.wallThicknessM,
      outer,
      interior: hole,
      slab: {
        id: `floor-${floorNumber}-slab`,
        polygon: outer.map((point) => ({ x: point.x, y: point.y })),
        elevationM,
        thicknessM: FORM_DESIGN.slabThicknessM,
      },
      walls,
      stepped,
    });
  }

  const top = floors[floors.length - 1];
  if (!top) return { ok: false, issues: ["No floors were produced."] };
  const form: BuildingForm = {
    seed: input.seed,
    floorCount: count.floors,
    design: FORM_DESIGN,
    support: FORM_SUPPORT,
    site,
    floors,
    roof: {
      id: "roof",
      polygon: top.outer.map((point) => ({ x: point.x, y: point.y })),
      elevationM: top.elevationM + top.heightM,
      thicknessM: FORM_DESIGN.slabThicknessM,
    },
  };
  const contained = formContainmentIssues(form);
  if (contained.length > 0) return { ok: false, issues: contained };
  return { ok: true, form };
}

/** Continuous containment of every floor plate, hollow interior, and wall footprint. */
export function formContainmentIssues(form: BuildingForm): string[] {
  const issues: string[] = [];
  let below: Vec[] | null = null;
  for (const floor of form.floors) {
    if (!polygonInside(floor.outer, form.site)) {
      issues.push(`${floor.id} leaves the site.`);
    }
    if (!polygonInside(floor.interior, floor.outer)) {
      issues.push(`${floor.id} interior leaves its outer wall.`);
    }
    if (!wallFootprintsInside(floor.outer, floor.interior, form.site)) {
      issues.push(`${floor.id} wall solid leaves the site.`);
    }
    if (below && !polygonInside(floor.outer, below)) {
      issues.push(`${floor.id} is not carried by the floor below.`);
    }
    if (floor.elevationM !== floor.index * form.design.floorHeightM) {
      issues.push(`${floor.id} is not on its own elevation.`);
    }
    if (floor.slab.id !== `${floor.id}-slab` || !polygonInside(floor.slab.polygon, form.site)) {
      issues.push(`${floor.id} slab is missing or leaves the site.`);
    }
    if (floor.walls.length !== floor.outer.length) {
      issues.push(`${floor.id} does not have one wall per outer edge.`);
    }
    below = floor.outer;
  }
  const top = form.floors[form.floors.length - 1];
  if (!top || !polygonInside(form.roof.polygon, top.outer)) {
    issues.push("The roof does not sit on the top floor.");
  }
  return issues;
}
