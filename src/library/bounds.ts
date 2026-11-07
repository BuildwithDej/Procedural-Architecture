import type { Aabb, MeshPart } from "./types.ts";

export function emptyAabb(): Aabb {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
}

export function expandAabb(box: Aabb, x: number, y: number, z: number): void {
  if (x < box.min[0]) box.min[0] = x;
  if (y < box.min[1]) box.min[1] = y;
  if (z < box.min[2]) box.min[2] = z;
  if (x > box.max[0]) box.max[0] = x;
  if (y > box.max[1]) box.max[1] = y;
  if (z > box.max[2]) box.max[2] = z;
}

export function partBounds(part: MeshPart): Aabb {
  const box = emptyAabb();
  for (let i = 0; i < part.positions.length; i += 3) {
    expandAabb(box, part.positions[i] ?? 0, part.positions[i + 1] ?? 0, part.positions[i + 2] ?? 0);
  }
  return box;
}

export function unionBounds(parts: readonly MeshPart[]): Aabb {
  const box = emptyAabb();
  for (const part of parts) {
    const next = partBounds(part);
    expandAabb(box, next.min[0], next.min[1], next.min[2]);
    expandAabb(box, next.max[0], next.max[1], next.max[2]);
  }
  return box;
}

export function aabbWidth(box: Aabb): number {
  return box.max[0] - box.min[0];
}

export function aabbDepth(box: Aabb): number {
  return box.max[2] - box.min[2];
}

export function aabbHeight(box: Aabb): number {
  return box.max[1] - box.min[1];
}

export function containsPoint(box: Aabb, x: number, y: number, z: number, epsilon = 1e-4): boolean {
  return (
    x >= box.min[0] - epsilon &&
    x <= box.max[0] + epsilon &&
    y >= box.min[1] - epsilon &&
    y <= box.max[1] + epsilon &&
    z >= box.min[2] - epsilon &&
    z <= box.max[2] + epsilon
  );
}
