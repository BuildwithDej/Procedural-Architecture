import type { MeshPart } from "./types.ts";

type Triple = [number, number, number];

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function builder(): Builder {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function addVertex(mesh: Builder, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
  const length = Math.hypot(nx, ny, nz) || 1;
  const index = mesh.positions.length / 3;
  mesh.positions.push(x, y, z);
  mesh.normals.push(nx / length, ny / length, nz / length);
  mesh.uvs.push(u, v);
  return index;
}

function cross(ax: number, ay: number, az: number, bx: number, by: number, bz: number): Triple {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function finish(name: string, material: string, mesh: Builder): MeshPart {
  if (mesh.positions.length === 0 || mesh.indices.length === 0) {
    throw new Error(`${name} produced no triangles`);
  }
  return {
    name,
    material,
    positions: Float32Array.from(mesh.positions),
    normals: Float32Array.from(mesh.normals),
    uvs: Float32Array.from(mesh.uvs),
    indices: Uint32Array.from(mesh.indices),
  };
}

function triangleFacing(
  mesh: Builder,
  a: number,
  b: number,
  c: number,
  hintX: number,
  hintY: number,
  hintZ: number,
): number {
  const ax = mesh.positions[a * 3] ?? 0;
  const ay = mesh.positions[a * 3 + 1] ?? 0;
  const az = mesh.positions[a * 3 + 2] ?? 0;
  const bx = (mesh.positions[b * 3] ?? 0) - ax;
  const by = (mesh.positions[b * 3 + 1] ?? 0) - ay;
  const bz = (mesh.positions[b * 3 + 2] ?? 0) - az;
  const cx = (mesh.positions[c * 3] ?? 0) - ax;
  const cy = (mesh.positions[c * 3 + 1] ?? 0) - ay;
  const cz = (mesh.positions[c * 3 + 2] ?? 0) - az;
  const normal = cross(bx, by, bz, cx, cy, cz);
  return normal[0] * hintX + normal[1] * hintY + normal[2] * hintZ;
}

/** a, b, c, d run around the quad. The hint picks which way faces out. */
function addOrientedQuad(
  mesh: Builder,
  a: number,
  b: number,
  c: number,
  d: number,
  hintX: number,
  hintY: number,
  hintZ: number,
): void {
  const forward = triangleFacing(mesh, a, b, c, hintX, hintY, hintZ) + triangleFacing(mesh, a, c, d, hintX, hintY, hintZ);
  const reverse = triangleFacing(mesh, a, d, c, hintX, hintY, hintZ) + triangleFacing(mesh, a, c, b, hintX, hintY, hintZ);
  if (forward >= reverse) mesh.indices.push(a, b, c, a, c, d);
  else mesh.indices.push(a, d, c, a, c, b);
}

export interface RoundBoxOptions {
  width: number;
  height: number;
  depth: number;
  radius: number;
  curveSegments?: number;
  center?: readonly [number, number, number];
}

function clampRadius(width: number, height: number, depth: number, radius: number): number {
  const limit = 0.45 * Math.min(width, height, depth);
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return Math.min(radius, limit);
}

/** Outer size is the full width, height, and depth. Radius rounds edges without changing that box. */
export function roundedBox(name: string, material: string, options: RoundBoxOptions): MeshPart {
  const width = options.width;
  const height = options.height;
  const depth = options.depth;
  if (width <= 0 || height <= 0 || depth <= 0) throw new Error(`${name} needs positive size`);
  const radius = clampRadius(width, height, depth, options.radius);
  const curve = Math.max(1, options.curveSegments ?? 5);
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  const sx = hw - radius;
  const sy = hh - radius;
  const sz = hd - radius;
  const mesh = builder();
  const center = options.center ?? [0, 0, 0];

  const place = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) =>
    addVertex(mesh, x + center[0], y + center[1], z + center[2], nx, ny, nz, u, v);

  const face = (
    origin: Triple,
    axisU: Triple,
    axisV: Triple,
    normal: Triple,
  ) => {
    const steps = 1;
    const ids: number[] = [];
    for (let iv = 0; iv <= steps; iv += 1) {
      for (let iu = 0; iu <= steps; iu += 1) {
        const tu = iu / steps;
        const tv = iv / steps;
        ids.push(
          place(
            origin[0] + axisU[0] * tu + axisV[0] * tv,
            origin[1] + axisU[1] * tu + axisV[1] * tv,
            origin[2] + axisU[2] * tu + axisV[2] * tv,
            normal[0],
            normal[1],
            normal[2],
            tu,
            tv,
          ),
        );
      }
    }
    const row = steps + 1;
    for (let iv = 0; iv < steps; iv += 1) {
      for (let iu = 0; iu < steps; iu += 1) {
        const a = ids[iv * row + iu] ?? 0;
        const b = ids[iv * row + iu + 1] ?? 0;
        const c = ids[(iv + 1) * row + iu + 1] ?? 0;
        const d = ids[(iv + 1) * row + iu] ?? 0;
        addOrientedQuad(mesh, a, b, c, d, normal[0], normal[1], normal[2]);
      }
    }
  };

  face([-sx, hh, -sz], [0, 0, sz * 2], [sx * 2, 0, 0], [0, 1, 0]);
  face([-sx, -hh, -sz], [sx * 2, 0, 0], [0, 0, sz * 2], [0, -1, 0]);
  face([hw, -sy, -sz], [0, sy * 2, 0], [0, 0, sz * 2], [1, 0, 0]);
  face([-hw, -sy, -sz], [0, 0, sz * 2], [0, sy * 2, 0], [-1, 0, 0]);
  face([-sx, -sy, hd], [sx * 2, 0, 0], [0, sy * 2, 0], [0, 0, 1]);
  face([-sx, -sy, -hd], [0, sy * 2, 0], [sx * 2, 0, 0], [0, 0, -1]);

  if (radius > 0) {
    addEdges(place, mesh, sx, sy, sz, radius, curve);
    addCorners(place, mesh, sx, sy, sz, radius, curve);
  }

  return finish(name, material, mesh);
}

function addEdges(
  place: (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => number,
  mesh: Builder,
  sx: number,
  sy: number,
  sz: number,
  radius: number,
  curve: number,
): void {
  const edge = (
    fixed: "x" | "y" | "z",
    signA: number,
    signB: number,
    length: number,
  ) => {
    const ids: number[] = [];
    for (let i = 0; i <= 1; i += 1) {
      for (let k = 0; k <= curve; k += 1) {
        const along = -length + (2 * length * i) / 1;
        const t = (k / curve) * (Math.PI / 2);
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        let x = 0;
        let y = 0;
        let z = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        if (fixed === "x") {
          x = along;
          ny = signA * cos;
          nz = signB * sin;
          y = signA * sy + radius * ny;
          z = signB * sz + radius * nz;
        } else if (fixed === "y") {
          y = along;
          nx = signA * cos;
          nz = signB * sin;
          x = signA * sx + radius * nx;
          z = signB * sz + radius * nz;
        } else {
          z = along;
          nx = signA * cos;
          ny = signB * sin;
          x = signA * sx + radius * nx;
          y = signB * sy + radius * ny;
        }
        ids.push(place(x, y, z, nx, ny, nz, i, k / curve));
      }
    }
    const row = curve + 1;
    for (let k = 0; k < curve; k += 1) {
      const a = ids[k] ?? 0;
      const b = ids[k + 1] ?? 0;
      const c = ids[row + k + 1] ?? 0;
      const d = ids[row + k] ?? 0;
      const hint = fixed === "x" ? [0, signA, signB] : fixed === "y" ? [signA, 0, signB] : [signA, signB, 0];
      addOrientedQuad(mesh, a, b, c, d, hint[0], hint[1], hint[2]);
    }
  };

  edge("x", 1, 1, sx);
  edge("x", 1, -1, sx);
  edge("x", -1, 1, sx);
  edge("x", -1, -1, sx);
  edge("y", 1, 1, sy);
  edge("y", 1, -1, sy);
  edge("y", -1, 1, sy);
  edge("y", -1, -1, sy);
  edge("z", 1, 1, sz);
  edge("z", 1, -1, sz);
  edge("z", -1, 1, sz);
  edge("z", -1, -1, sz);
}

function addCorners(
  place: (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => number,
  mesh: Builder,
  sx: number,
  sy: number,
  sz: number,
  radius: number,
  curve: number,
): void {
  for (const signX of [1, -1]) {
    for (const signY of [1, -1]) {
      for (const signZ of [1, -1]) {
        const ids: number[] = [];
        for (let iv = 0; iv <= curve; iv += 1) {
          for (let iu = 0; iu <= curve; iu += 1) {
            const phi = (iv / curve) * (Math.PI / 2);
            const theta = (iu / curve) * (Math.PI / 2);
            const nx = signX * Math.sin(phi) * Math.cos(theta);
            const ny = signY * Math.cos(phi);
            const nz = signZ * Math.sin(phi) * Math.sin(theta);
            ids.push(
              place(
                signX * sx + radius * nx,
                signY * sy + radius * ny,
                signZ * sz + radius * nz,
                nx,
                ny,
                nz,
                iu / curve,
                iv / curve,
              ),
            );
          }
        }
        const row = curve + 1;
        for (let iv = 0; iv < curve; iv += 1) {
          for (let iu = 0; iu < curve; iu += 1) {
            const a = ids[iv * row + iu] ?? 0;
            const b = ids[iv * row + iu + 1] ?? 0;
            const c = ids[(iv + 1) * row + iu + 1] ?? 0;
            const d = ids[(iv + 1) * row + iu] ?? 0;
            addOrientedQuad(mesh, a, b, c, d, signX, signY, signZ);
          }
        }
      }
    }
  }
}

export function shellFromGrid(
  name: string,
  material: string,
  rows: readonly (readonly [number, number, number])[][],
  thickness: number,
): MeshPart {
  const nv = rows.length;
  const nu = rows[0]?.length ?? 0;
  if (nv < 2 || nu < 2) throw new Error(`${name} grid is too small`);
  const raw: Triple[] = [];
  for (let j = 0; j < nv; j += 1) {
    const row = rows[j];
    if (!row || row.length !== nu) throw new Error(`${name} grid is ragged`);
    for (let i = 0; i < nu; i += 1) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nu - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nv - 1, j + 1);
      const du = sub(row[i1] ?? row[i] ?? [0, 0, 0], row[i0] ?? row[i] ?? [0, 0, 0]);
      const col1 = rows[j1]?.[i] ?? row[i] ?? [0, 0, 0];
      const col0 = rows[j0]?.[i] ?? row[i] ?? [0, 0, 0];
      const dv = sub(col1, col0);
      raw.push(normalize(cross(du[0], du[1], du[2], dv[0], dv[1], dv[2])));
    }
  }
  const mid = raw[Math.floor(nv / 2) * nu + Math.floor(nu / 2)] ?? [0, 1, 0];
  const flip = mid[1] < 0 ? -1 : 1;
  const mesh = builder();
  const top: number[] = [];
  const bottom: number[] = [];
  const half = thickness / 2;
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const point = rows[j]?.[i] ?? [0, 0, 0];
      const normal = raw[j * nu + i] ?? [0, 1, 0];
      const nx = normal[0] * flip;
      const ny = normal[1] * flip;
      const nz = normal[2] * flip;
      const u = nu === 1 ? 0 : i / (nu - 1);
      const v = nv === 1 ? 0 : j / (nv - 1);
      top.push(addVertex(mesh, point[0] + nx * half, point[1] + ny * half, point[2] + nz * half, nx, ny, nz, u, v));
      bottom.push(
        addVertex(mesh, point[0] - nx * half, point[1] - ny * half, point[2] - nz * half, -nx, -ny, -nz, u, v),
      );
    }
  }
  for (let j = 0; j < nv - 1; j += 1) {
    for (let i = 0; i < nu - 1; i += 1) {
      const t00 = top[j * nu + i] ?? 0;
      const t10 = top[j * nu + i + 1] ?? 0;
      const t11 = top[(j + 1) * nu + i + 1] ?? 0;
      const t01 = top[(j + 1) * nu + i] ?? 0;
      const hint = raw[j * nu + i] ?? [0, 1, 0];
      addOrientedQuad(mesh, t00, t10, t11, t01, hint[0] * flip, hint[1] * flip, hint[2] * flip);
      const b00 = bottom[j * nu + i] ?? 0;
      const b10 = bottom[j * nu + i + 1] ?? 0;
      const b11 = bottom[(j + 1) * nu + i + 1] ?? 0;
      const b01 = bottom[(j + 1) * nu + i] ?? 0;
      addOrientedQuad(mesh, b00, b01, b11, b10, -hint[0] * flip, -hint[1] * flip, -hint[2] * flip);
    }
  }
  const stitch = (cells: readonly (readonly [number, number])[], hint: Triple) => {
    for (let k = 0; k < cells.length - 1; k += 1) {
      const a = cells[k]?.[0] ?? 0;
      const d = cells[k]?.[1] ?? 0;
      const b = cells[k + 1]?.[0] ?? 0;
      const c = cells[k + 1]?.[1] ?? 0;
      addOrientedQuad(mesh, a, b, c, d, hint[0], hint[1], hint[2]);
    }
  };
  const cell = (i: number, j: number): [number, number] => [top[j * nu + i] ?? 0, bottom[j * nu + i] ?? 0];
  const head: [number, number][] = [];
  for (let i = 0; i < nu; i += 1) head.push(cell(i, 0));
  const right: [number, number][] = [];
  for (let j = 0; j < nv; j += 1) right.push(cell(nu - 1, j));
  const foot: [number, number][] = [];
  for (let i = nu - 1; i >= 0; i -= 1) foot.push(cell(i, nv - 1));
  const left: [number, number][] = [];
  for (let j = nv - 1; j >= 0; j -= 1) left.push(cell(0, j));
  stitch(head, [0, 0, -1]);
  stitch(right, [1, 0, 0]);
  stitch(foot, [0, 0, 1]);
  stitch(left, [-1, 0, 0]);
  return finish(name, material, mesh);
}

function sub(a: readonly [number, number, number], b: readonly [number, number, number]): Triple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(value: Triple): Triple {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-8) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

export interface Transform {
  translate?: readonly [number, number, number];
  yaw?: number;
  pitch?: number;
  pivot?: readonly [number, number, number];
}

export function transformPart(part: MeshPart, transform: Transform): MeshPart {
  const yaw = transform.yaw ?? 0;
  const pitch = transform.pitch ?? 0;
  const pivot = transform.pivot ?? [0, 0, 0];
  const translate = transform.translate ?? [0, 0, 0];
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const positions = new Float32Array(part.positions.length);
  const normals = new Float32Array(part.normals.length);
  for (let i = 0; i < part.positions.length; i += 3) {
    const spun = spin(
      (part.positions[i] ?? 0) - pivot[0],
      (part.positions[i + 1] ?? 0) - pivot[1],
      (part.positions[i + 2] ?? 0) - pivot[2],
      cosPitch,
      sinPitch,
      cosYaw,
      sinYaw,
    );
    positions[i] = spun[0] + pivot[0] + translate[0];
    positions[i + 1] = spun[1] + pivot[1] + translate[1];
    positions[i + 2] = spun[2] + pivot[2] + translate[2];
    const turned = spin(
      part.normals[i] ?? 0,
      part.normals[i + 1] ?? 0,
      part.normals[i + 2] ?? 0,
      cosPitch,
      sinPitch,
      cosYaw,
      sinYaw,
    );
    normals[i] = turned[0];
    normals[i + 1] = turned[1];
    normals[i + 2] = turned[2];
  }
  return {
    name: part.name,
    material: part.material,
    positions,
    normals,
    uvs: part.uvs,
    indices: part.indices,
  };
}

function spin(
  x: number,
  y: number,
  z: number,
  cosPitch: number,
  sinPitch: number,
  cosYaw: number,
  sinYaw: number,
): Triple {
  const pitchedY = y * cosPitch - z * sinPitch;
  const pitchedZ = y * sinPitch + z * cosPitch;
  return [x * cosYaw + pitchedZ * sinYaw, pitchedY, -x * sinYaw + pitchedZ * cosYaw];
}

export function boxBetween(
  name: string,
  material: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  width: number,
  thickness: number,
): MeshPart {
  const direction = normalize(sub(to, from));
  let side = normalize(cross(direction[0], direction[1], direction[2], 0, 1, 0));
  if (Math.hypot(side[0], side[1], side[2]) < 0.2 || Math.abs(direction[1]) > 0.95) {
    side = normalize(cross(direction[0], direction[1], direction[2], 1, 0, 0));
  }
  const up = normalize(cross(direction[0], direction[1], direction[2], side[0], side[1], side[2]));
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const core = roundedBox(name, material, {
    width,
    height: thickness,
    depth: Math.max(length, 0.001),
    radius: Math.min(0.004, width * 0.2, thickness * 0.2),
    curveSegments: 2,
  });
  const positions = new Float32Array(core.positions.length);
  const normals = new Float32Array(core.normals.length);
  const mid: Triple = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  for (let i = 0; i < core.positions.length; i += 3) {
    const x = core.positions[i] ?? 0;
    const y = core.positions[i + 1] ?? 0;
    const z = core.positions[i + 2] ?? 0;
    positions[i] = mid[0] + side[0] * x + up[0] * y + direction[0] * z;
    positions[i + 1] = mid[1] + side[1] * x + up[1] * y + direction[1] * z;
    positions[i + 2] = mid[2] + side[2] * x + up[2] * y + direction[2] * z;
    const nx = core.normals[i] ?? 0;
    const ny = core.normals[i + 1] ?? 0;
    const nz = core.normals[i + 2] ?? 0;
    normals[i] = side[0] * nx + up[0] * ny + direction[0] * nz;
    normals[i + 1] = side[1] * nx + up[1] * ny + direction[1] * nz;
    normals[i + 2] = side[2] * nx + up[2] * ny + direction[2] * nz;
  }
  return { name, material, positions, normals, uvs: core.uvs, indices: core.indices };
}

export function cylinderX(
  name: string,
  material: string,
  center: readonly [number, number, number],
  radius: number,
  length: number,
  segments = 12,
): MeshPart {
  const mesh = builder();
  const rings: number[][] = [];
  for (const end of [-1, 1]) {
    const ring: number[] = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const y = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      ring.push(addVertex(mesh, center[0] + (end * length) / 2, center[1] + y, center[2] + z, 0, Math.cos(angle), Math.sin(angle), i / segments, end));
    }
    rings.push(ring);
  }
  const left = rings[0] ?? [];
  const right = rings[1] ?? [];
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const angle = (i / segments) * Math.PI * 2;
    addOrientedQuad(
      mesh,
      left[i] ?? 0,
      left[next] ?? 0,
      right[next] ?? 0,
      right[i] ?? 0,
      0,
      Math.cos(angle),
      Math.sin(angle),
    );
  }
  return finish(name, material, mesh);
}
