/** Orthographic fit. The plan width is not the screen size: the camera looks across the model. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface OrthoFit {
  eye: Vec3;
  target: Vec3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** Extra space around the projected site and roof, as a fraction of the tight bounds. */
export const FRAME_MARGIN = 1.16;

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
}

/**
 * Frustum that contains every point, in the camera that looks from `eye` toward `target`.
 * The eye is shifted in the view plane so the bounds sit in the middle. `mirrorX` flips
 * east to the right for a top view whose up-axis would otherwise mirror the plan.
 */
export function fitOrthographic(
  eye: Vec3,
  target: Vec3,
  up: Vec3,
  points: readonly Vec3[],
  aspect: number,
  margin = FRAME_MARGIN,
  mirrorX = false,
): OrthoFit {
  const safeAspect = aspect > 0 ? aspect : 1;
  if (points.length === 0) {
    return { eye, target, left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 50 };
  }
  const forward = normalize(sub(target, eye));
  const right = normalize(cross(forward, up));
  const trueUp = normalize(cross(right, forward));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minDist = Infinity;
  let maxDist = -Infinity;
  for (const point of points) {
    const offset = sub(point, eye);
    const x = dot(offset, right);
    const y = dot(offset, trueUp);
    const distance = dot(offset, forward);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minDist = Math.min(minDist, distance);
    maxDist = Math.max(maxDist, distance);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let halfW = Math.max((maxX - minX) / 2, 0.25) * margin;
  let halfH = Math.max((maxY - minY) / 2, 0.25) * margin;
  if (halfW / halfH > safeAspect) halfH = halfW / safeAspect;
  else halfW = halfH * safeAspect;
  const shift = {
    x: right.x * centerX + trueUp.x * centerY,
    y: right.y * centerX + trueUp.y * centerY,
    z: right.z * centerX + trueUp.z * centerY,
  };
  const pad = Math.max(2, (maxDist - minDist) * 0.2);
  const halfWidth = mirrorX ? -halfW : halfW;
  return {
    eye: add(eye, shift),
    target: add(target, shift),
    left: -halfWidth,
    right: halfWidth,
    top: halfH,
    bottom: -halfH,
    near: minDist - pad,
    far: maxDist + pad,
  };
}
