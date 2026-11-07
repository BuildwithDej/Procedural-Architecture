import { unionBounds } from "./bounds.ts";
import { boxBetween, roundedBox } from "./mesh.ts";
import type { Aabb, MeshPart } from "./types.ts";

/**
 * One wall-mounted desk. Dimensions are design choices for this asset, not a
 * regulation or a structural approval. The brackets are the supports: the top
 * is not a floating slab. The floor under it stays clear.
 */
export const DESK_SPEC = {
  id: "desk-wall-oak",
  topWidthM: 1.2,
  topDepthM: 0.52,
  topThicknessM: 0.032,
  cornerRadiusM: 0.014,
  surfaceHeightM: 0.74,
  bracketCount: 3,
  bracketInsetFromEndM: 0.14,
  plateWidthM: 0.064,
  plateHeightM: 0.22,
  plateThicknessM: 0.008,
  armWidthM: 0.03,
  armHeightM: 0.024,
  armDepthM: 0.36,
  cableSlotWidthM: 0.08,
  cableSlotDepthM: 0.024,
  cableSlotDropM: 0.008,
  cableSlotInsetFromBackM: 0.04,
  structuralApproval: "not-assessed",
} as const;

export interface DeskModel {
  id: string;
  parts: MeshPart[];
  /** Closed top outline. The open floor is not part of the footprint. */
  topFootprint: Aabb;
  visualBounds: Aabb;
  mount: {
    kind: "wall-mounted";
    structuralApproval: "not-assessed";
    wallSegmentLengthM: number;
    projectionFromWallM: number;
    surfaceHeightM: number;
    floorContact: "none";
  };
  knee: {
    clearHeightM: number;
    clearHeightAtBracketM: number;
    note: string;
  };
}

export function buildDesk(): DeskModel {
  const spec = DESK_SPEC;
  const parts: MeshPart[] = [];
  const topCenterY = spec.surfaceHeightM - spec.topThicknessM / 2;
  parts.push(
    roundedBox("desk-top", "timber", {
      width: spec.topWidthM,
      height: spec.topThicknessM,
      depth: spec.topDepthM,
      radius: spec.cornerRadiusM,
      curveSegments: 4,
      center: [0, topCenterY, spec.topDepthM / 2],
    }),
    roundedBox("desk-cable-slot", "timberDark", {
      width: spec.cableSlotWidthM,
      height: spec.cableSlotDropM,
      depth: spec.cableSlotDepthM,
      radius: 0.003,
      curveSegments: 2,
      center: [
        0,
        spec.surfaceHeightM - spec.cableSlotDropM / 2,
        spec.cableSlotInsetFromBackM + spec.cableSlotDepthM / 2,
      ],
    }),
  );

  const xs = bracketXs();
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] ?? 0;
    const plateTop = spec.surfaceHeightM - spec.topThicknessM;
    const plateCenterY = plateTop - spec.plateHeightM / 2;
    parts.push(
      roundedBox(`desk-bracket-${index}-plate`, "metalPale", {
        width: spec.plateWidthM,
        height: spec.plateHeightM,
        depth: spec.plateThicknessM,
        radius: 0.002,
        curveSegments: 1,
        center: [x, plateCenterY, spec.plateThicknessM / 2],
      }),
      roundedBox(`desk-bracket-${index}-arm`, "metalPale", {
        width: spec.armWidthM,
        height: spec.armHeightM,
        depth: spec.armDepthM,
        radius: 0.003,
        curveSegments: 2,
        center: [
          x,
          plateTop - spec.armHeightM / 2,
          spec.plateThicknessM + spec.armDepthM / 2,
        ],
      }),
    );
    parts.push(
      boxBetween(
        `desk-bracket-${index}-strut`,
        "metalPale",
        [x, plateTop - spec.plateHeightM + 0.02, spec.plateThicknessM],
        [x, plateTop - spec.armHeightM, spec.armDepthM * 0.82],
        0.018,
        0.012,
      ),
    );
  }

  const underside = spec.surfaceHeightM - spec.topThicknessM;
  return {
    id: spec.id,
    parts,
    topFootprint: {
      min: [-spec.topWidthM / 2, underside, 0],
      max: [spec.topWidthM / 2, spec.surfaceHeightM, spec.topDepthM],
    },
    visualBounds: unionBounds(parts),
    mount: {
      kind: "wall-mounted",
      structuralApproval: "not-assessed",
      wallSegmentLengthM: spec.topWidthM,
      projectionFromWallM: spec.topDepthM,
      surfaceHeightM: spec.surfaceHeightM,
      floorContact: "none",
    },
    knee: {
      clearHeightM: underside,
      clearHeightAtBracketM: underside - spec.armHeightM,
      note: "Clear height is a design record for this desk, not an ergonomic standard.",
    },
  };
}

export function bracketXs(): number[] {
  const spec = DESK_SPEC;
  const end = spec.topWidthM / 2 - spec.bracketInsetFromEndM;
  const xs: number[] = [];
  const last = spec.bracketCount - 1;
  for (let index = 0; index < spec.bracketCount; index += 1) {
    const t = index / last;
    xs.push(-end + t * end * 2);
  }
  return xs;
}
