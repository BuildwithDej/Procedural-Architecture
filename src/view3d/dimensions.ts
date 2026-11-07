import { WALL_THICKNESS_M } from "../model/geometry.ts";
import { formatMetres } from "../model/format.ts";
import type { Room } from "../model/types.ts";

export interface Segment {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
}

export interface DimensionGuide {
  axis: "width" | "depth";
  label: string;
  labelAt: readonly [number, number, number];
  segments: Segment[];
}

const DIMENSION_Y = 0.02;

export function dimensionOffset(span: number): number {
  return Math.max(span * 0.08, WALL_THICKNESS_M + span * 0.04);
}

function add(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): readonly [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(
  a: readonly [number, number, number],
  factor: number,
): readonly [number, number, number] {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function arrow(
  tip: readonly [number, number, number],
  outward: readonly [number, number, number],
  size: number,
): Segment[] {
  const neck = add(tip, scale(outward, -size));
  const side: readonly [number, number, number] = [-outward[2] * size * 0.38, 0, outward[0] * size * 0.38];
  return [
    { from: tip, to: add(neck, side) },
    { from: tip, to: add(neck, scale(side, -1)) },
  ];
}

function axisGuide(
  axis: "width" | "depth",
  label: string,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  outward: readonly [number, number, number],
  span: number,
  labelShift: readonly [number, number, number],
): DimensionGuide {
  const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
  const mid: readonly [number, number, number] = [
    (start[0] + end[0]) / 2,
    DIMENSION_Y,
    (start[2] + end[2]) / 2,
  ];
  const arrowSize = Math.min(span * 0.04, length * 0.08);
  const segments: Segment[] = [
    { from: start, to: end },
    ...arrow(start, scale(outward, -1), arrowSize),
    ...arrow(end, outward, arrowSize),
  ];
  return { axis, label, labelAt: add(mid, labelShift), segments };
}

/** Width and depth ticks outside the room, measured on the interior faces. */
export function dimensionGuides(room: Room): DimensionGuide[] {
  const span = Math.max(room.width, room.depth, room.height);
  const offset = dimensionOffset(span);
  const y = DIMENSION_Y;
  const shift = Math.max(span * 0.07, 0.08);
  return [
    axisGuide(
      "width",
      formatMetres(room.width),
      [0, y, -offset],
      [room.width, y, -offset],
      [1, 0, 0],
      span,
      [0, 0, -shift],
    ),
    axisGuide(
      "depth",
      formatMetres(room.depth),
      [room.width + offset, y, 0],
      [room.width + offset, y, room.depth],
      [0, 0, 1],
      span,
      [shift, 0, 0],
    ),
  ];
}
