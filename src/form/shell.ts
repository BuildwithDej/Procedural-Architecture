import { outwardNormal, triangulate, triangulateRing, type Vec } from "./polygon.ts";
import type { BuildingForm, FloorShell, LevelCap } from "./generate.ts";

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface WallMesh {
  mesh: MeshData;
  /** Plan outward normal, x east, y north. */
  outward: Vec;
  south: boolean;
}

export interface FloorGeometry {
  id: string;
  slab: MeshData;
  walls: WallMesh[];
  cap: MeshData | null;
  capRole: LevelCap["role"];
}

function emptyMesh(): MeshData {
  return { positions: [], normals: [], indices: [] };
}

function pushVertex(mesh: MeshData, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const index = mesh.positions.length / 3;
  mesh.positions.push(x, y, z);
  mesh.normals.push(nx, ny, nz);
  return index;
}

function addTriangle(mesh: MeshData, a: Vec, b: Vec, c: Vec, y: number, normalY: number): void {
  const ny = normalY >= 0 ? 1 : -1;
  const signed = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(signed) < 1e-8) return;
  const ia = pushVertex(mesh, a.x, y, a.y, 0, ny, 0);
  const ib = pushVertex(mesh, b.x, y, b.y, 0, ny, 0);
  const ic = pushVertex(mesh, c.x, y, c.y, 0, ny, 0);
  // Plan-CCW maps to a downward normal. Face the triangle by its actual order, not an assumed one.
  const ccw = signed > 0;
  const reverse = ny > 0 ? ccw : !ccw;
  if (reverse) mesh.indices.push(ia, ic, ib);
  else mesh.indices.push(ia, ib, ic);
}

function addQuad(
  mesh: MeshData,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  normal: [number, number, number],
): void {
  const ax = p1[0] - p0[0];
  const ay = p1[1] - p0[1];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p0[0];
  const by = p2[1] - p0[1];
  const bz = p2[2] - p0[2];
  const facing = (ay * bz - az * by) * normal[0] + (az * bx - ax * bz) * normal[1] + (ax * by - ay * bx) * normal[2];
  const order = facing >= 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1];
  const [a, b, c, d] = order;
  if (!a || !b || !c || !d) return;
  const i0 = pushVertex(mesh, a[0], a[1], a[2], normal[0], normal[1], normal[2]);
  const i1 = pushVertex(mesh, b[0], b[1], b[2], normal[0], normal[1], normal[2]);
  const i2 = pushVertex(mesh, c[0], c[1], c[2], normal[0], normal[1], normal[2]);
  const i3 = pushVertex(mesh, d[0], d[1], d[2], normal[0], normal[1], normal[2]);
  mesh.indices.push(i0, i1, i2, i0, i2, i3);
}

function capMesh(poly: readonly Vec[], yBottom: number, yTop: number): MeshData {
  const mesh = emptyMesh();
  const triangles = triangulate(poly);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = poly[triangles[i] ?? -1];
    const b = poly[triangles[i + 1] ?? -1];
    const c = poly[triangles[i + 2] ?? -1];
    if (!a || !b || !c) continue;
    addTriangle(mesh, a, b, c, yTop, 1);
    addTriangle(mesh, a, b, c, yBottom, -1);
  }
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const normal = a && b ? outwardNormal(a, b) : null;
    if (!a || !b || !normal) continue;
    addQuad(
      mesh,
      [a.x, yBottom, a.y],
      [b.x, yBottom, b.y],
      [b.x, yTop, b.y],
      [a.x, yTop, a.y],
      [normal.x, 0, normal.y],
    );
  }
  return mesh;
}

function wallEdgeMesh(outerA: Vec, outerB: Vec, innerB: Vec, innerA: Vec, y0: number, y1: number): WallMesh | null {
  const outward = outwardNormal(outerA, outerB);
  const inward = outward ? { x: -outward.x, y: -outward.y } : null;
  if (!outward || !inward) return null;
  const mesh = emptyMesh();
  addQuad(
    mesh,
    [outerA.x, y0, outerA.y],
    [outerB.x, y0, outerB.y],
    [outerB.x, y1, outerB.y],
    [outerA.x, y1, outerA.y],
    [outward.x, 0, outward.y],
  );
  addQuad(
    mesh,
    [innerB.x, y0, innerB.y],
    [innerA.x, y0, innerA.y],
    [innerA.x, y1, innerA.y],
    [innerB.x, y1, innerB.y],
    [inward.x, 0, inward.y],
  );
  addQuad(
    mesh,
    [outerA.x, y1, outerA.y],
    [outerB.x, y1, outerB.y],
    [innerB.x, y1, innerB.y],
    [innerA.x, y1, innerA.y],
    [0, 1, 0],
  );
  return { mesh, outward, south: outward.y < -0.35 };
}

function addRim(mesh: MeshData, poly: readonly Vec[], y0: number, y1: number, sign: 1 | -1): void {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const normal = a && b ? outwardNormal(a, b) : null;
    if (!a || !b || !normal) continue;
    addQuad(
      mesh,
      [a.x, y0, a.y],
      [b.x, y0, b.y],
      [b.x, y1, b.y],
      [a.x, y1, a.y],
      [normal.x * sign, 0, normal.y * sign],
    );
  }
}

function capSolid(cap: LevelCap): MeshData | null {
  if (cap.role === "covered") return null;
  const y1 = cap.elevationM;
  const y0 = y1 - cap.thicknessM;
  if (!cap.hole) return capMesh(cap.outer, y0, y1);
  const triangles = triangulateRing(cap.outer, cap.hole);
  if (!triangles) return null;
  const mesh = emptyMesh();
  for (const triangle of triangles) {
    const [a, b, c] = triangle;
    if (!a || !b || !c) continue;
    addTriangle(mesh, a, b, c, y1, 1);
    addTriangle(mesh, a, b, c, y0, -1);
  }
  addRim(mesh, cap.outer, y0, y1, 1);
  addRim(mesh, cap.hole, y0, y1, -1);
  return mesh;
}

function floorGeometry(floor: FloorShell): FloorGeometry {
  const ySlabBottom = floor.elevationM;
  const ySlabTop = floor.elevationM + floor.slabThicknessM;
  // A repeated plate is closed by the next slab, so the wall runs into that slab.
  // A roof or terrace cap is the visible top, and the wall stops inside the cap.
  const yWallTop = floor.cap.role === "covered" ? floor.cap.elevationM + 0.012 : floor.cap.elevationM - 0.008;
  const walls: WallMesh[] = [];
  for (let i = 0; i < floor.outer.length; i += 1) {
    const outerA = floor.outer[i];
    const outerB = floor.outer[(i + 1) % floor.outer.length];
    const innerA = floor.interior[i];
    const innerB = floor.interior[(i + 1) % floor.interior.length];
    if (!outerA || !outerB || !innerA || !innerB) continue;
    const wall = wallEdgeMesh(outerA, outerB, innerB, innerA, ySlabTop - 0.02, yWallTop);
    if (wall) walls.push(wall);
  }
  return {
    id: floor.id,
    slab: capMesh(floor.outer, ySlabBottom, ySlabTop),
    walls,
    cap: capSolid(floor.cap),
    capRole: floor.cap.role,
  };
}

export function buildFormGeometry(form: BuildingForm): FloorGeometry[] {
  return form.floors.map((floor) => floorGeometry(floor));
}
