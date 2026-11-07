/**
 * US mattress width and length.
 *
 * Source: Sleep Foundation, “Mattress Sizes 101”, size chart.
 * https://www.sleepfoundation.org/mattress-sizes
 * Checked 2026-11-07. The chart lists width × length in inches.
 * Thickness is not a standard; Sleep Foundation says it varies by model.
 *
 * Metres use the international inch, exactly 0.0254 m.
 * These are fixed sizes. Nothing here scales one mattress into another.
 */

export const INCH_M = 0.0254;

export const MATTRESS_SIZE_IDS = ["twin", "twinXl", "full", "queen", "king", "calKing"] as const;

export type MattressSizeId = (typeof MATTRESS_SIZE_IDS)[number];

export interface MattressSize {
  id: MattressSizeId;
  label: string;
  widthIn: number;
  lengthIn: number;
  widthM: number;
  lengthM: number;
  source: string;
}

const SOURCE = "https://www.sleepfoundation.org/mattress-sizes";

function size(id: MattressSizeId, label: string, widthIn: number, lengthIn: number): MattressSize {
  return {
    id,
    label,
    widthIn,
    lengthIn,
    widthM: widthIn * INCH_M,
    lengthM: lengthIn * INCH_M,
    source: SOURCE,
  };
}

export const MATTRESS_SIZES: readonly MattressSize[] = [
  size("twin", "Twin", 38, 75),
  size("twinXl", "Twin XL", 38, 80),
  size("full", "Full", 54, 75),
  size("queen", "Queen", 60, 80),
  size("king", "King", 76, 80),
  size("calKing", "California King", 72, 84),
];

/** The gallery builds this size. Other ids are data and dimension-checked, not visually signed off. */
export const PREVIEW_MATTRESS_ID: MattressSizeId = "queen";

const BY_ID = new Map(MATTRESS_SIZES.map((entry) => [entry.id, entry]));

export function mattressSize(id: MattressSizeId): MattressSize {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown mattress size ${id}`);
  return found;
}
