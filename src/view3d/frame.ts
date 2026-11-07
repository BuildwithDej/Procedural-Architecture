import type { Room } from "../model/types.ts";

/**
 * Parallel projection for the 3D view.
 *
 * Dej asked for an orthogonal view. The camera is orthographic: a length
 * stays the same size whether it is near the camera or far from it, and
 * parallel edges stay parallel. Scroll changes zoom. The frustum is sized
 * from the room and the viewport aspect.
 */
export const PROJECTION = "orthographic" as const;

export type Vec3 = readonly [number, number, number];

export interface OrthoFrame {
  target: Vec3;
  position: Vec3;
  frustumHeight: number;
  near: number;
  far: number;
  minZoom: number;
  maxZoom: number;
  minDistance: number;
  maxDistance: number;
}

export interface OrthoBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CameraBasis {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

/** Camera sits along this offset from the target: east, up, and south. */
const EYE: Vec3 = [1, 1.15, -1];
const FIT_PADDING = 1.16;

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const magnitude = length(a);
  if (!(magnitude > 0)) return [0, 0, 1];
  return scale(a, 1 / magnitude);
}

/** Same basis as Three.js Camera.lookAt: +Z points from the target back toward the camera. */
export function cameraBasis(eyeDirection: Vec3): CameraBasis {
  const z = normalize(eyeDirection);
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return { x, y, z };
}

function contentBounds(room: Room): { min: Vec3; max: Vec3 } {
  const span = Math.max(room.width, room.depth, room.height);
  const air = span * 0.34;
  return {
    min: [-air, -air * 0.04, -air],
    max: [room.width + air, room.height + air * 0.06, room.depth + air],
  };
}

function cornersOf(min: Vec3, max: Vec3): Vec3[] {
  const xs = [min[0], max[0]];
  const ys = [min[1], max[1]];
  const zs = [min[2], max[2]];
  const corners: Vec3[] = [];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) corners.push([x, y, z]);
    }
  }
  return corners;
}

export function frameOrthographic(room: Room, aspect: number): OrthoFrame {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const bounds = contentBounds(room);
  const target: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const basis = cameraBasis(EYE);
  let maxX = 0;
  let maxY = 0;
  for (const corner of cornersOf(bounds.min, bounds.max)) {
    const relative = sub(corner, target);
    maxX = Math.max(maxX, Math.abs(dot(relative, basis.x)));
    maxY = Math.max(maxY, Math.abs(dot(relative, basis.y)));
  }
  const halfHeight = Math.max(maxY, maxX / safeAspect) * FIT_PADDING;
  const span = Math.max(room.width, room.depth, room.height);
  const distance = span * 8;
  return {
    target,
    position: add(target, scale(normalize(EYE), distance)),
    frustumHeight: halfHeight * 2,
    near: 0.1,
    far: span * 80,
    minZoom: 0.45,
    maxZoom: 10,
    minDistance: span * 3,
    maxDistance: span * 40,
  };
}

export function orthoBounds(frustumHeight: number, aspect: number): OrthoBounds {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfH = frustumHeight / 2;
  const halfW = halfH * safeAspect;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

/** Normalized device coordinates for the parallel camera. Zoom 1 matches orthoBounds. */
export function projectToNdc(
  point: Vec3,
  frame: OrthoFrame,
  aspect: number,
  zoom = 1,
): { x: number; y: number } {
  const basis = cameraBasis(sub(frame.position, frame.target));
  const relative = sub(point, frame.position);
  const cameraX = dot(relative, basis.x);
  const cameraY = dot(relative, basis.y);
  const bounds = orthoBounds(frame.frustumHeight, aspect);
  const halfW = (bounds.right - bounds.left) / 2;
  const halfH = (bounds.top - bounds.bottom) / 2;
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    x: (cameraX / halfW) * safeZoom,
    y: (cameraY / halfH) * safeZoom,
  };
}

export function contentCorners(room: Room): Vec3[] {
  const bounds = contentBounds(room);
  return cornersOf(bounds.min, bounds.max);
}
