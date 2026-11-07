import {
  MAX_BOUNDARY_VERTICES,
  dedupeClosed,
  dropCollinear,
  ensureCCW,
  insetPolygon,
  minEdgeLength,
  pointInPolygon,
  polygonArea,
  polygonInside,
  roundedRectangle,
  selfIntersects,
  signedArea,
  triangulate,
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

/**
 * Slider ranges. Coverage is a fraction of the site. Setback and shape run from none to full.
 * Twist is degrees of extra rotation at each level above the ground. None of these are a code limit.
 */
export const FORM_CONTROLS = {
  coverageMin: 0.18,
  coverageMax: 1,
  coverageDefault: 0.34,
  setbackMin: 0,
  setbackMax: 1,
  setbackDefault: 0.45,
  twistMinDeg: -25,
  twistMaxDeg: 25,
  twistDefaultDeg: 0,
  organicMin: 0,
  organicMax: 1,
  organicDefault: 0,
  /** Tessellation of one rounded corner. A box uses none. A full curve uses this many. */
  maxCornerSegments: 5,
} as const;

export interface FormControls {
  coverage: number;
  setback: number;
  twistDeg: number;
  organic: number;
}

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

/**
 * Exposed horizontal closure. A roof covers the top plate. A terrace is the setback ring.
 * Covered means the next floor's slab closes this level, so no second cap is drawn.
 */
export interface LevelCap {
  id: string;
  role: "roof" | "terrace" | "covered";
  outer: Vec[];
  hole: Vec[] | null;
  elevationM: number;
  thicknessM: number;
}

/** Flat cap on the top plate. The same surface as the top floor's roof cap. */
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
  cap: LevelCap;
  /** False when this level repeats the plate below. */
  stepped: boolean;
}

export interface BuildingForm {
  seed: number;
  floorCount: number;
  design: typeof FORM_DESIGN;
  support: typeof FORM_SUPPORT;
  controls: FormControls;
  /** Requested ground-plate share of the site, from the coverage slider. */
  coverageTarget: number;
  /** Area of the ground plate divided by the site area. */
  coverageActual: number;
  /** Slider requests the outline could not meet in full. */
  limits: string[];
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

function interiorPoint(poly: readonly Vec[]): Vec {
  const triangles = triangulate(poly);
  let best = poly[0] ?? { x: 0, y: 0 };
  let bestArea = -1;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = poly[triangles[i] ?? -1];
    const b = poly[triangles[i + 1] ?? -1];
    const c = poly[triangles[i + 2] ?? -1];
    if (!a || !b || !c) continue;
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    if (area > bestArea) {
      bestArea = area;
      best = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    }
  }
  return best;
}

function scaleAbout(poly: readonly Vec[], origin: Vec, scale: number): Vec[] {
  return poly.map((point) => ({
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (point.y - origin.y) * scale,
  }));
}

function fitInside(poly: readonly Vec[], origin: Vec, container: readonly Vec[]): Vec[] | null {
  if (polygonInside(poly, container)) return poly.map((point) => ({ x: point.x, y: point.y }));
  let low = 0.28;
  let high = 1;
  let best: Vec[] | null = null;
  for (let step = 0; step < 10; step += 1) {
    const scale = (low + high) / 2;
    const scaled = scaleAbout(poly, origin, scale);
    if (polygonInside(scaled, container)) {
      best = scaled;
      low = scale;
    } else {
      high = scale;
    }
  }
  return best;
}

function dimensionsForArea(area: number, aspect: number, organic: number): { width: number; depth: number } {
  const safe = Math.max(area, 1);
  let width = Math.sqrt(safe * aspect);
  let depth = safe / Math.max(width, 0.01);
  if (organic > 0.04) {
    const radius = organic * Math.min(width, depth) * 0.5;
    const roundArea = width * depth - (4 - Math.PI) * radius * radius;
    const boost = Math.sqrt((width * depth) / Math.max(roundArea, width * depth * 0.55));
    width *= boost;
    depth *= boost;
  }
  return { width, depth };
}

function cornerSegments(organic: number): number {
  if (organic < 0.04) return 0;
  return Math.min(FORM_CONTROLS.maxCornerSegments, Math.max(2, Math.round(organic * FORM_CONTROLS.maxCornerSegments)));
}

function rotateAbout(poly: readonly Vec[], origin: Vec, radians: number): Vec[] {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return ensureCCW(
    poly.map((point) => {
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      return { x: origin.x + x * cosine - y * sine, y: origin.y + x * sine + y * cosine };
    }),
  );
}

function nearlySamePlate(left: readonly Vec[], right: readonly Vec[]): boolean {
  const leftArea = polygonArea(left);
  const rightArea = polygonArea(right);
  if (leftArea < 1e-4 || rightArea < 1e-4) return false;
  const ratio = leftArea / rightArea;
  return ratio > 0.97 && ratio < 1.03 && polygonInside(left, right) && polygonInside(right, left);
}

export function validateControls(
  value: Partial<FormControls> | undefined,
): { ok: true; controls: FormControls } | { ok: false; issues: string[] } {
  const raw = value ?? {};
  const controls: FormControls = {
    coverage: raw.coverage ?? FORM_CONTROLS.coverageDefault,
    setback: raw.setback ?? FORM_CONTROLS.setbackDefault,
    twistDeg: raw.twistDeg ?? FORM_CONTROLS.twistDefaultDeg,
    organic: raw.organic ?? FORM_CONTROLS.organicDefault,
  };
  const issues: string[] = [];
  const check = (name: string, number: number, min: number, max: number, unit: string) => {
    if (!Number.isFinite(number)) issues.push(`${name} must be a finite number.`);
    else if (number < min || number > max) issues.push(`${name} must be from ${min} to ${max}${unit}.`);
  };
  check("Coverage", controls.coverage, FORM_CONTROLS.coverageMin, FORM_CONTROLS.coverageMax, " (18% to 100% of the site)");
  check("Setback", controls.setback, FORM_CONTROLS.setbackMin, FORM_CONTROLS.setbackMax, "");
  check("Twist", controls.twistDeg, FORM_CONTROLS.twistMinDeg, FORM_CONTROLS.twistMaxDeg, "°");
  check("Shape", controls.organic, FORM_CONTROLS.organicMin, FORM_CONTROLS.organicMax, "");
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, controls };
}

function insetSiteToArea(site: readonly Vec[], targetArea: number): Vec[] | null {
  const full = plateWorks(site, site, site);
  let best = full;
  let bestGap = full ? Math.abs(polygonArea(full) - targetArea) : Infinity;
  if (full && polygonArea(full) <= targetArea * 1.005) return full;
  let low = 0;
  let high = Math.sqrt(Math.max(polygonArea(site), 1));
  for (let step = 0; step < 16; step += 1) {
    const distance = (low + high) / 2;
    const inset = distance < 1e-4 ? site.map((point) => ({ x: point.x, y: point.y })) : insetPolygon(site, distance);
    const plate = inset ? plateWorks(inset, site, site) : null;
    if (!plate) {
      high = distance;
      continue;
    }
    const area = polygonArea(plate);
    const gap = Math.abs(area - targetArea);
    if (gap < bestGap) {
      best = plate;
      bestGap = gap;
    }
    if (area > targetArea) low = distance;
    else high = distance;
  }
  return best;
}

function filletConvex(poly: readonly Vec[], organic: number, segments: number): Vec[] | null {
  if (organic < 0.04 || segments < 2) return poly.map((point) => ({ x: point.x, y: point.y }));
  const source = ensureCCW(poly);
  const nextPoints: Vec[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const prev = source[(index + source.length - 1) % source.length];
    const current = source[index];
    const next = source[(index + 1) % source.length];
    if (!prev || !current || !next) continue;
    const inX = current.x - prev.x;
    const inY = current.y - prev.y;
    const outX = next.x - current.x;
    const outY = next.y - current.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    const turn = inX * outY - inY * outX;
    if (!(turn > 1e-4) || inLen < 1e-4 || outLen < 1e-4) {
      nextPoints.push({ x: current.x, y: current.y });
      continue;
    }
    const ux = inX / inLen;
    const uy = inY / inLen;
    const vx = outX / outLen;
    const vy = outY / outLen;
    const dot = Math.min(1, Math.max(-1, -ux * vx - uy * vy));
    const half = Math.acos(dot) / 2;
    const tangentCap = 0.42 * Math.min(inLen, outLen);
    const radiusWant = organic * Math.min(inLen, outLen) * 0.28;
    const tangent = Math.min(tangentCap, radiusWant / Math.max(Math.tan(half), 1e-3));
    const radius = tangent * Math.tan(half);
    if (tangent < 0.08 || radius < 0.08) {
      nextPoints.push({ x: current.x, y: current.y });
      continue;
    }
    const start = { x: current.x - ux * tangent, y: current.y - uy * tangent };
    const end = { x: current.x + vx * tangent, y: current.y + vy * tangent };
    const left = { x: -uy, y: ux };
    const center = { x: start.x + left.x * radius, y: start.y + left.y * radius };
    const a0 = Math.atan2(start.y - center.y, start.x - center.x);
    let sweep = Math.atan2(end.y - center.y, end.x - center.x) - a0;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    const sample = (amount: number) => ({
      x: center.x + radius * Math.cos(a0 + sweep * amount),
      y: center.y + radius * Math.sin(a0 + sweep * amount),
    });
    const probe = sample(0.5);
    const useSweep = pointInPolygon(probe, source, true) ? sweep : -sweep;
    nextPoints.push(start);
    for (let step = 1; step < segments; step += 1) {
      const theta = a0 + useSweep * (step / segments);
      nextPoints.push({ x: center.x + radius * Math.cos(theta), y: center.y + radius * Math.sin(theta) });
    }
    nextPoints.push(end);
  }
  const cleaned = dropCollinear(ensureCCW(dedupeClosed(nextPoints, 1e-4)));
  if (cleaned.length < 3 || selfIntersects(cleaned) || !polygonInside(cleaned, source)) return null;
  return cleaned;
}

function placeGround(
  site: readonly Vec[],
  random: () => number,
  controls: FormControls,
  limits: string[],
): Vec[] | null {
  const span = Math.sqrt(polygonArea(site));
  const yard = insetPolygon(site, Math.min(1.6, Math.max(0.5, span * 0.04))) ?? site;
  const anchor = interiorPoint(yard);
  const aspect = 0.62 + random() * 0.7;
  const angle = random() * Math.PI;
  const shifted = {
    x: anchor.x + (random() - 0.5) * span * 0.16,
    y: anchor.y + (random() - 0.5) * span * 0.16,
  };
  const preferred = pointInPolygon(shifted, yard, true) ? shifted : anchor;
  const siteArea = polygonArea(site);
  const want = siteArea * controls.coverage;
  const segments = cornerSegments(controls.organic);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of yard) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const origins = [preferred, anchor];
  for (const fx of [0.32, 0.5, 0.68]) {
    for (const fy of [0.32, 0.5, 0.68]) {
      const point = { x: minX + (maxX - minX) * fx, y: minY + (maxY - minY) * fy };
      if (pointInPolygon(point, yard, true)) origins.push(point);
    }
  }
  const placeAt = (origin: Vec, plateWidth: number, plateDepth: number, plateAngle: number): Vec[] | null => {
    const radius = controls.organic * Math.min(plateWidth, plateDepth) * 0.5;
    const drawn = roundedRectangle(origin, plateWidth, plateDepth, radius, plateAngle, segments);
    let low = 0.12;
    let high = 1;
    let best: Vec[] | null = null;
    for (let step = 0; step < 8; step += 1) {
      const scale = (low + high) / 2;
      const scaled = scale > 0.985 ? drawn : scaleAbout(drawn, origin, scale);
      const plate = polygonInside(scaled, site) ? plateWorks(scaled, site, site) : null;
      if (plate) {
        best = plate;
        low = scale;
      } else {
        high = scale;
      }
    }
    return best;
  };
  const sized = dimensionsForArea(want, aspect, controls.organic);
  const width = sized.width;
  const depth = sized.depth;
  let plate: Vec[] | null = null;
  let plateGap = Infinity;
  for (const origin of origins) {
    const candidate = placeAt(origin, width, depth, angle);
    if (!candidate) continue;
    const gap = Math.abs(polygonArea(candidate) - want);
    if (gap < plateGap) {
      plate = candidate;
      plateGap = gap;
    }
  }
  if (!plate || polygonArea(plate) < want * 0.97) {
    const rescueAngles = [0, angle, Math.PI / 2];
    const rescueAspects = [aspect, 0.6, 1, 2.2];
    const lowOrigin = { x: minX + (maxX - minX) * 0.5, y: minY + (maxY - minY) * 0.28 };
    const rescueOrigins = pointInPolygon(lowOrigin, site, true) ? [anchor, lowOrigin] : [anchor];
    for (const rescueAngle of rescueAngles) {
      for (const rescueAspect of rescueAspects) {
        const rescueSize = dimensionsForArea(want, rescueAspect, controls.organic);
        const rescueWidth = rescueSize.width;
        const rescueDepth = rescueSize.depth;
        for (const origin of rescueOrigins) {
          const candidate = placeAt(origin, rescueWidth, rescueDepth, rescueAngle);
          if (!candidate) continue;
          const gap = Math.abs(polygonArea(candidate) - want);
          if (!plate || gap < plateGap) {
            plate = candidate;
            plateGap = gap;
          }
        }
      }
    }
  }
  const familyArea = plate ? polygonArea(plate) : 0;
  const familyFraction = familyArea / siteArea;
  if (familyFraction < controls.coverage - 0.02) {
    const followed = insetSiteToArea(site, want);
    const followedArea = followed ? polygonArea(followed) : 0;
    if (followed && followedArea > familyArea + 0.5) {
      const shapeName = controls.organic < 0.04 ? "rectangle" : "rounded rectangle";
      limits.push(
        `A ${shapeName} at this proportion reached ${(familyFraction * 100).toFixed(0)}% of the site. That is this shape, not the largest shell the outline can hold. The plate followed the outline instead.`,
      );
      plate = followed;
      if (controls.organic >= 0.04) {
        const rounded = filletConvex(followed, controls.organic, cornerSegments(controls.organic));
        const roundedPlate = rounded ? plateWorks(rounded, site, site) : null;
        if (roundedPlate && polygonArea(roundedPlate) >= followedArea * 0.92) plate = roundedPlate;
        else limits.push("Rounding was reduced on the outline-following plate so the shell stayed inside.");
      }
    }
  }
  if (!plate) return null;
  const actual = polygonArea(plate) / siteArea;
  const targetPct = (controls.coverage * 100).toFixed(0);
  const actualPct = (actual * 100).toFixed(0);
  if (actual < controls.coverage - 0.02) {
    const full = plateWorks(site, site, site);
    const wallLimited = !full && controls.coverage > actual + 0.02;
    limits.push(
      wallLimited
        ? `Target ${targetPct}%. Actual ${actualPct}%. The ${FORM_DESIGN.wallThicknessM} m wall could not keep a hollow interior on more of this outline. That is not a setback.`
        : `Target ${targetPct}%. Actual ${actualPct}%.`,
    );
  }
  return plate;
}

function shrinkInside(current: readonly Vec[], site: readonly Vec[], linear: number): Vec[] | null {
  if (linear > 0.995) return current.map((point) => ({ x: point.x, y: point.y }));
  const target = polygonArea(current) * linear * linear;
  let low = 0;
  let high = Math.sqrt(Math.max(polygonArea(current), 1));
  let best: Vec[] | null = null;
  let bestGap = Infinity;
  for (let step = 0; step < 12; step += 1) {
    const distance = (low + high) / 2;
    const inset = distance < 1e-4 ? current.map((point) => ({ x: point.x, y: point.y })) : insetPolygon(current, distance);
    const plate = inset ? plateWorks(inset, current, site) : null;
    if (!plate) {
      high = distance;
      continue;
    }
    const gap = Math.abs(polygonArea(plate) - target);
    if (gap < bestGap) {
      best = plate;
      bestGap = gap;
    }
    if (polygonArea(plate) > target) low = distance;
    else high = distance;
  }
  return best;
}

function nextPlate(
  current: readonly Vec[],
  site: readonly Vec[],
  controls: FormControls,
  floorNumber: number,
  limits: string[],
): { plate: Vec[]; stepped: boolean } {
  const origin = interiorPoint(current);
  const linear = 1 - controls.setback * 0.36;
  const shrunk = shrinkInside(current, site, linear) ?? current.map((point) => ({ x: point.x, y: point.y }));
  let fitted = shrunk;
  if (controls.twistDeg !== 0) {
    const turned = rotateAbout(shrunk, origin, (controls.twistDeg * Math.PI) / 180);
    const requestedArea = polygonArea(turned);
    if (!polygonInside(turned, current)) {
      const onPlate = fitInside(turned, origin, current);
      if (!onPlate) {
        limits.push(`Floor ${floorNumber} kept the setback plate. A ${controls.twistDeg}° twist left the floor below.`);
        fitted = shrunk;
      } else {
        fitted = onPlate;
        if (polygonArea(fitted) < requestedArea * 0.94) {
          limits.push(
            `Floor ${floorNumber} was reduced so a ${controls.twistDeg}° twist stays on the floor below and inside the site.`,
          );
        }
      }
    } else {
      fitted = turned;
    }
  }
  const plate = plateWorks(fitted, current, site);
  if (!plate) {
    limits.push(`Floor ${floorNumber} kept the plate below. A smaller plate would not stay a full hollow shell.`);
    return { plate: current.map((point) => ({ x: point.x, y: point.y })), stepped: false };
  }
  const stepped = !nearlySamePlate(plate, current);
  if (controls.setback > 0.05 && !stepped) {
    limits.push(`Floor ${floorNumber} could not step back further without losing the shell.`);
  }
  return { plate, stepped };
}

function levelCap(floorNumber: number, outer: readonly Vec[], next: readonly Vec[] | null, elevationM: number): LevelCap {
  const same = next ? nearlySamePlate(outer, next) : false;
  return {
    id: next ? (same ? `floor-${floorNumber}-covered` : `floor-${floorNumber}-terrace`) : `floor-${floorNumber}-roof`,
    role: next ? (same ? "covered" : "terrace") : "roof",
    outer: outer.map((point) => ({ x: point.x, y: point.y })),
    hole: next && !same ? next.map((point) => ({ x: point.x, y: point.y })) : null,
    elevationM,
    thicknessM: 0.06,
  };
}

export function generateForm(input: {
  boundary: readonly Vec[];
  floors: number;
  seed: number;
  controls?: Partial<FormControls>;
}): FormResult {
  const count = validateFloorCount(input.floors);
  if (!count.ok) return count;
  if (!Number.isInteger(input.seed) || !Number.isFinite(input.seed)) {
    return { ok: false, issues: ["The seed must be a finite whole number."] };
  }
  const controls = validateControls(input.controls);
  if (!controls.ok) return controls;
  const boundary = validateBoundary(input.boundary);
  if (!boundary.ok) return boundary;
  const site = boundary.polygon;
  const random = mulberry32(input.seed);
  const limits: string[] = [];

  const ground = placeGround(site, random, controls.controls, limits);
  if (!ground) {
    return {
      ok: false,
      issues: [
        `No hollow floor with a ${FORM_DESIGN.wallThicknessM} m wall stayed inside this outline. Nothing was built past the boundary.`,
      ],
    };
  }

  const plates: { plate: Vec[]; stepped: boolean }[] = [{ plate: ground, stepped: false }];
  for (let index = 1; index < count.floors; index += 1) {
    const below = plates[index - 1];
    if (!below) break;
    plates.push(nextPlate(below.plate, site, controls.controls, index + 1, limits));
  }

  const floors: FloorShell[] = [];
  for (let index = 0; index < plates.length; index += 1) {
    const entry = plates[index];
    if (!entry) continue;
    const current = entry.plate;
    const interior = insetPolygon(current, FORM_DESIGN.wallThicknessM);
    if (!interior || !wallFootprintsInside(current, interior, site) || !polygonInside(current, site)) {
      return { ok: false, issues: [`Floor ${index + 1} could not stay a hollow shell inside the site. Nothing was kept.`] };
    }
    const elevationM = index * FORM_DESIGN.floorHeightM;
    const outer = current.map((point) => ({ x: point.x, y: point.y }));
    const hole = interior.map((point) => ({ x: point.x, y: point.y }));
    const floorNumber = index + 1;
    const next = plates[index + 1]?.plate ?? null;
    const walls: WallRun[] = [];
    let brokenWall = false;
    for (let edgeIndex = 0; edgeIndex < outer.length; edgeIndex += 1) {
      const start = outer[edgeIndex];
      const end = outer[(edgeIndex + 1) % outer.length];
      const interiorStart = hole[edgeIndex];
      const interiorEnd = hole[(edgeIndex + 1) % hole.length];
      if (!start || !end || !interiorStart || !interiorEnd) {
        brokenWall = true;
        break;
      }
      walls.push({
        id: `floor-${floorNumber}-wall-${edgeIndex}`,
        edgeIndex,
        outer: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }],
        interior: [
          { x: interiorStart.x, y: interiorStart.y },
          { x: interiorEnd.x, y: interiorEnd.y },
        ],
        elevationM: elevationM + FORM_DESIGN.slabThicknessM,
        heightM: FORM_DESIGN.floorHeightM - FORM_DESIGN.slabThicknessM,
        thicknessM: FORM_DESIGN.wallThicknessM,
      });
    }
    if (brokenWall) {
      return { ok: false, issues: [`Floor ${floorNumber} lost a wall edge.`] };
    }
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
      cap: levelCap(floorNumber, outer, next, elevationM + FORM_DESIGN.floorHeightM),
      stepped: entry.stepped,
    });
  }

  const top = floors[floors.length - 1];
  if (!top) return { ok: false, issues: ["No floors were produced."] };
  const form: BuildingForm = {
    seed: input.seed,
    floorCount: count.floors,
    design: FORM_DESIGN,
    support: FORM_SUPPORT,
    controls: controls.controls,
    coverageTarget: controls.controls.coverage,
    coverageActual: polygonArea(top && floors[0] ? floors[0].outer : []) / Math.max(polygonArea(site), 1e-6),
    limits,
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
    if (floor.cap.role === "roof" && floor.cap.hole) issues.push(`${floor.id} roof should cover the whole plate.`);
    if (floor.cap.role === "terrace" && !floor.cap.hole) issues.push(`${floor.id} terrace is missing its opening.`);
    if (floor.cap.role === "covered" && floor.cap.hole) issues.push(`${floor.id} is covered and should not draw a second cap.`);
    if (!polygonInside(floor.cap.outer, form.site)) issues.push(`${floor.id} cap leaves the site.`);
    below = floor.outer;
  }
  const top = form.floors[form.floors.length - 1];
  if (!top || top.cap.role !== "roof" || !polygonInside(form.roof.polygon, top.outer)) {
    issues.push("The roof does not sit on the top floor.");
  }
  return issues;
}
