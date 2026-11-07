import type { Vec } from "./polygon.ts";

/** Demonstration outlines. Metres, x east, y north. Not a survey. */
export const FORM_PRESETS: Record<string, readonly Vec[]> = {
  rectangle: [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 12 },
    { x: 0, y: 12 },
  ],
  ell: [
    { x: 0, y: 0 },
    { x: 18, y: 0 },
    { x: 18, y: 8 },
    { x: 10, y: 8 },
    { x: 10, y: 16 },
    { x: 0, y: 16 },
  ],
  notch: [
    { x: 0, y: 0 },
    { x: 22, y: 0 },
    { x: 22, y: 16 },
    { x: 13, y: 16 },
    { x: 13, y: 9 },
    { x: 9, y: 9 },
    { x: 9, y: 16 },
    { x: 0, y: 16 },
  ],
  skew: [
    { x: 1, y: 1 },
    { x: 16, y: 2 },
    { x: 18, y: 9 },
    { x: 8, y: 14 },
    { x: 0, y: 8 },
  ],
};
