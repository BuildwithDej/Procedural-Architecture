import type { Room } from "../model/types.ts";

/**
 * Straight-down orthographic frame of the real room.
 * +Z is north and is the camera's up direction, so north is up on screen.
 * The frame depends only on the room size and the viewport aspect.
 */
export interface TopFrame {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly near: number;
  readonly far: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Plan-space window matching worldToPlan, for annotation overlays only. */
  readonly viewBox: { x: number; y: number; width: number; height: number };
}

const PAD = 0.34;

export function frameTopDown(room: Pick<Room, "width" | "depth" | "height">, aspect: number): TopFrame {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const pad = Math.max(room.width, room.depth, 0.5) * PAD;
  const spanX = room.width + pad * 2;
  const spanZ = room.depth + pad * 2;
  let viewWidth = spanX;
  let viewHeight = spanZ;
  if (viewWidth / viewHeight < safeAspect) viewWidth = viewHeight * safeAspect;
  else viewHeight = viewWidth / safeAspect;
  const eyeY = Math.max(room.height, room.width, room.depth, 1) * 2 + 4;
  const centerX = room.width / 2;
  const centerZ = room.depth / 2;
  return {
    position: [centerX, eyeY, centerZ],
    target: [centerX, 0, centerZ],
    up: [0, 0, 1],
    // Three.js looks down local -Z. With up = +Z that puts east on the left,
    // so the horizontal frustum is reversed to put east on the right.
    left: viewWidth / 2,
    right: -viewWidth / 2,
    top: viewHeight / 2,
    bottom: -viewHeight / 2,
    near: 0.05,
    far: eyeY + room.height + 4,
    viewWidth,
    viewHeight,
    viewBox: {
      x: centerX - viewWidth / 2,
      y: -(centerZ + viewHeight / 2),
      width: viewWidth,
      height: viewHeight,
    },
  };
}
