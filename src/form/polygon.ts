/** Site and floor polygons, in metres. x east, y north. */

export interface Vec {
  x: number;
  y: number;
}

export const MAX_BOUNDARY_VERTICES = 48;

/** Perpendicular distance treated as on the boundary. Narrower than any notch this editor accepts. */
const BOUNDARY_M = 1e-5;

export function signedArea(poly: readonly Vec[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(poly: readonly Vec[]): number {
  return Math.abs(signedArea(poly));
}

export function ensureCCW(poly: readonly Vec[]): Vec[] {
  const copy = poly.map((point) => ({ x: point.x, y: point.y }));
  return signedArea(copy) < 0 ? copy.reverse() : copy;
}

export function dedupeClosed(poly: readonly Vec[], epsilon = 1e-6): Vec[] {
  const points = poly.filter((point, index) => {
    const prev = poly[(index + poly.length - 1) % poly.length];
    if (!prev) return true;
    return Math.hypot(point.x - prev.x, point.y - prev.y) > epsilon;
  });
  return points;
}

/** Drop vertices that sit on the straight edge between their neighbours. */
export function dropCollinear(poly: readonly Vec[], epsilon = 1e-8): Vec[] {
  if (poly.length < 4) return poly.map((point) => ({ x: point.x, y: point.y }));
  const kept: Vec[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    if (!prev || !curr || !next) continue;
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    const scale = Math.max(
      1,
      Math.hypot(curr.x - prev.x, curr.y - prev.y),
      Math.hypot(next.x - curr.x, next.y - curr.y),
    );
    if (Math.abs(cross) <= epsilon * scale) continue;
    kept.push({ x: curr.x, y: curr.y });
  }
  return kept.length >= 3 ? kept : poly.map((point) => ({ x: point.x, y: point.y }));
}

export function pointSegmentDistance(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-16) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

export function onSegment(a: Vec, b: Vec, point: Vec, epsilon = BOUNDARY_M): boolean {
  return pointSegmentDistance(point, a, b) <= epsilon;
}

export function pointInPolygon(point: Vec, poly: readonly Vec[], includeBoundary = true): boolean {
  if (poly.length < 3) return false;
  if (includeBoundary) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a && b && onSegment(a, b, point)) return true;
    }
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    const intersects =
      a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orient(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Proper crossing of non-adjacent edges. Shared endpoints and collinear overlaps do not count. */
export function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

function properCrossing(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const scale = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - c.x, d.y - c.y));
  const eps = 1e-9 * scale;
  if (Math.abs(o1) <= eps || Math.abs(o2) <= eps || Math.abs(o3) <= eps || Math.abs(o4) <= eps) return false;
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

export function selfIntersects(poly: readonly Vec[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (!a || !b) continue;
    for (let j = i + 1; j < n; j += 1) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = poly[j];
      const d = poly[(j + 1) % n];
      if (!c || !d) continue;
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function minEdgeLength(poly: readonly Vec[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    min = Math.min(min, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return min;
}

function projectT(a: Vec, b: Vec, point: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return 0;
  return ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
}

/**
 * The whole straight segment lies in the closed polygon.
 * A handful of samples along the segment is not enough: a concave notch can sit between them.
 * The segment is split at every boundary contact, and each open piece is tested. A proper crossing fails immediately.
 */
export function segmentInPolygon(a: Vec, b: Vec, poly: readonly Vec[]): boolean {
  if (poly.length < 3) return false;
  if (!pointInPolygon(a, poly, true) || !pointInPolygon(b, poly, true)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * dx + dy * dy < 1e-16) return true;

  const events = [0, 1];
  for (let i = 0; i < poly.length; i += 1) {
    const c = poly[i];
    const d = poly[(i + 1) % poly.length];
    if (!c || !d) return false;
    if (properCrossing(a, b, c, d)) return false;

    if (onSegment(a, b, c)) {
      const t = projectT(a, b, c);
      if (t > 1e-9 && t < 1 - 1e-9) events.push(t);
    }

    const scale = Math.max(1, Math.hypot(dx, dy));
    const oc = orient(a, b, c);
    const od = orient(a, b, d);
    if (Math.abs(oc) <= 1e-9 * scale && Math.abs(od) <= 1e-9 * scale) {
      const tc = projectT(a, b, c);
      const td = projectT(a, b, d);
      const lo = Math.max(0, Math.min(tc, td));
      const hi = Math.min(1, Math.max(tc, td));
      if (hi - lo > 1e-9) {
        events.push(lo, hi);
      }
    }
  }

  events.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const t of events) {
    const last = unique[unique.length - 1];
    if (last === undefined || t - last > 1e-8) unique.push(t);
  }

  for (let i = 0; i < unique.length - 1; i += 1) {
    const t0 = unique[i];
    const t1 = unique[i + 1];
    if (t0 === undefined || t1 === undefined || t1 - t0 < 1e-8) continue;
    const tm = (t0 + t1) / 2;
    const mid = { x: a.x + dx * tm, y: a.y + dy * tm };
    if (!pointInPolygon(mid, poly, true)) return false;
  }
  return true;
}

/**
 * Filled simple polygon `inner` lies in the closed simple polygon `outer`.
 * Every edge of `inner` must lie in `outer`. Sampling those edges is not a substitute.
 */
export function polygonInside(inner: readonly Vec[], outer: readonly Vec[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  if (selfIntersects(inner) || selfIntersects(outer)) return false;
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    if (!a || !b) return false;
    if (!segmentInPolygon(a, b, outer)) return false;
  }
  return true;
}

function preparePolygon(poly: readonly Vec[]): Vec[] | null {
  const cleaned = dropCollinear(ensureCCW(dedupeClosed(poly)));
  if (cleaned.length < 3) return null;
  if (signedArea(cleaned) <= 1e-4) return null;
  if (selfIntersects(cleaned)) return null;
  if (minEdgeLength(cleaned) < 1e-3) return null;
  if (cleaned.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return cleaned;
}

interface Line {
  p: Vec;
  d: Vec;
}

function lineHit(first: Line, second: Line): Vec | null {
  const det = first.d.x * second.d.y - first.d.y * second.d.x;
  if (Math.abs(det) < 1e-10) return null;
  const dx = second.p.x - first.p.x;
  const dy = second.p.y - first.p.y;
  const t = (dx * second.d.y - dy * second.d.x) / det;
  return { x: first.p.x + first.d.x * t, y: first.p.y + first.d.y * t };
}

/** Inward offset for a CCW simple polygon. Null when the offset is not a simple polygon inside the original. */
export function insetPolygon(poly: readonly Vec[], distance: number): Vec[] | null {
  if (!(distance > 0) || poly.length < 3) return null;
  const source = ensureCCW(poly);
  const lines: Line[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const a = source[i];
    const b = source[(i + 1) % source.length];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-8) return null;
    const nx = -dy / length;
    const ny = dx / length;
    lines.push({ p: { x: a.x + nx * distance, y: a.y + ny * distance }, d: { x: dx / length, y: dy / length } });
  }
  const next: Vec[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const prev = lines[(i + lines.length - 1) % lines.length];
    const curr = lines[i];
    if (!prev || !curr) return null;
    const hit = lineHit(prev, curr);
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return null;
    next.push(hit);
  }
  const prepared = preparePolygon(next);
  if (!prepared) return null;
  if (polygonArea(prepared) >= polygonArea(source) - 1e-4) return null;
  if (!polygonInside(prepared, source)) return null;
  return prepared;
}

export function clipHalfPlane(poly: readonly Vec[], origin: Vec, inward: Vec): Vec[] {
  const inside = (point: Vec) => (point.x - origin.x) * inward.x + (point.y - origin.y) * inward.y >= -1e-7;
  const cross = (from: Vec, to: Vec): Vec => {
    const dir = { x: to.x - from.x, y: to.y - from.y };
    const denom = dir.x * inward.x + dir.y * inward.y;
    const t = denom === 0 ? 0 : ((origin.x - from.x) * inward.x + (origin.y - from.y) * inward.y) / denom;
    const clamped = Math.min(1, Math.max(0, t));
    return { x: from.x + dir.x * clamped, y: from.y + dir.y * clamped };
  };
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const previous = poly[(i + poly.length - 1) % poly.length];
    if (!current || !previous) continue;
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) out.push(cross(previous, current));
      out.push(current);
    } else if (previousIn) {
      out.push(cross(previous, current));
    }
  }
  return out;
}

/**
 * Cut a rectangular bite from a convex corner. Used so a rectangular site can become an L or a court
 * instead of a smaller copy of itself. Returns null unless the bite stays a simple polygon inside.
 */
export function notchCorner(poly: readonly Vec[], corner: number, alongPrev: number, alongNext: number): Vec[] | null {
  const source = ensureCCW(poly);
  const count = source.length;
  const prev = source[(corner - 1 + count) % count];
  const vertex = source[corner];
  const next = source[(corner + 1) % count];
  if (!prev || !vertex || !next) return null;
  if (orient(prev, vertex, next) <= 1e-6) return null;
  const inDx = vertex.x - prev.x;
  const inDy = vertex.y - prev.y;
  const inLen = Math.hypot(inDx, inDy);
  const outDx = next.x - vertex.x;
  const outDy = next.y - vertex.y;
  const outLen = Math.hypot(outDx, outDy);
  if (!(alongPrev > 0.4) || !(alongNext > 0.4)) return null;
  if (inLen < 1e-6 || outLen < 1e-6) return null;
  if (alongPrev > inLen * 0.72 || alongNext > outLen * 0.72) return null;
  const a = { x: vertex.x - (inDx / inLen) * alongPrev, y: vertex.y - (inDy / inLen) * alongPrev };
  const c = { x: vertex.x + (outDx / outLen) * alongNext, y: vertex.y + (outDy / outLen) * alongNext };
  const b = { x: a.x + (outDx / outLen) * alongNext, y: a.y + (outDy / outLen) * alongNext };
  const expanded = source.flatMap((point, index) => (index === corner ? [a, b, c] : [{ x: point.x, y: point.y }]));
  const prepared = preparePolygon(expanded);
  if (!prepared) return null;
  if (!polygonInside(prepared, source)) return null;
  if (polygonArea(prepared) >= polygonArea(source) - 1e-3) return null;
  return prepared;
}

export function setbackEdge(poly: readonly Vec[], edge: number, distance: number): Vec[] | null {
  const source = ensureCCW(poly);
  const a = source[edge];
  const b = source[(edge + 1) % source.length];
  if (!a || !b || !(distance > 0)) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < distance * 1.25) return null;
  const nx = -dy / length;
  const ny = dx / length;
  const clipped = clipHalfPlane(source, { x: a.x + nx * distance, y: a.y + ny * distance }, { x: nx, y: ny });
  const prepared = preparePolygon(clipped);
  if (!prepared) return null;
  if (!polygonInside(prepared, source)) return null;
  if (polygonArea(prepared) >= polygonArea(source) - 1e-4) return null;
  return prepared;
}

export function triangulate(poly: readonly Vec[]): number[] {
  const indices = poly.map((_, index) => index);
  const triangles: number[] = [];
  const guardMax = poly.length * poly.length;
  let guard = 0;
  while (indices.length > 3 && guard < guardMax) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < indices.length; i += 1) {
      const prevI = indices[(i + indices.length - 1) % indices.length];
      const currI = indices[i];
      const nextI = indices[(i + 1) % indices.length];
      if (prevI === undefined || currI === undefined || nextI === undefined) continue;
      const prev = poly[prevI];
      const curr = poly[currI];
      const next = poly[nextI];
      if (!prev || !curr || !next) continue;
      if (orient(prev, curr, next) <= 1e-8) continue;
      let ear = true;
      for (const otherI of indices) {
        if (otherI === prevI || otherI === currI || otherI === nextI) continue;
        const other = poly[otherI];
        if (other && pointInTriangle(other, prev, curr, next)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      triangles.push(prevI, currI, nextI);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (indices.length === 3) {
    const [a, b, c] = indices;
    if (a !== undefined && b !== undefined && c !== undefined) triangles.push(a, b, c);
  }
  return triangles;
}

export function triangulationCovers(poly: readonly Vec[]): boolean {
  if (poly.length < 3) return false;
  return triangulate(poly).length === (poly.length - 2) * 3;
}

function pointInTriangle(point: Vec, a: Vec, b: Vec, c: Vec): boolean {
  const ab = orient(a, b, point);
  const bc = orient(b, c, point);
  const ca = orient(c, a, point);
  const hasNeg = ab < -1e-8 || bc < -1e-8 || ca < -1e-8;
  const hasPos = ab > 1e-8 || bc > 1e-8 || ca > 1e-8;
  return !(hasNeg && hasPos);
}

/** Outward unit normal of a CCW edge from `a` to `b`. */
export function outwardNormal(a: Vec, b: Vec): Vec | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;
  return { x: dy / length, y: -dx / length };
}
