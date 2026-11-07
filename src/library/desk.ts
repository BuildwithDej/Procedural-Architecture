import { partBounds, unionBounds } from "./bounds.ts";
import { boxBetween, roundedBox, transformPart } from "./mesh.ts";
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

/** Generic desktop computer. Sizes are design choices for this one setup. The screen is a blank panel. */
export const COMPUTER = {
  screenWidthM: 0.53,
  screenHeightM: 0.3,
  screenThicknessM: 0.016,
  standRiseM: 0.08,
  neckWidthM: 0.05,
  neckDepthM: 0.03,
  baseWidthM: 0.18,
  baseDepthM: 0.14,
  baseThicknessM: 0.01,
  keyboardWidthM: 0.42,
  keyboardDepthM: 0.14,
  keyboardHeightM: 0.016,
  mouseWidthM: 0.058,
  mouseDepthM: 0.1,
  mouseHeightM: 0.026,
  screenCenterZM: 0.2,
  keyboardCenterZM: 0.4,
  mouseCenterXM: 0.3,
} as const;

/**
 * One chair for this desk. Seat height and pull-out are product assumptions, not a code or a measured standard.
 * The seat is in the right-hand gap between brackets so the centre bracket stays clear.
 */
export const CHAIR = {
  seatWidthM: 0.4,
  seatDepthM: 0.38,
  seatHeightM: 0.45,
  seatThicknessM: 0.028,
  backWidthM: 0.38,
  backHeightM: 0.32,
  backThicknessM: 0.018,
  legSizeM: 0.028,
  centerXM: 0.23,
  /** Front of the seat, just under the desk's front edge, in desk-local metres from the wall. */
  seatFrontZM: 0.515,
  pullOutM: 0.35,
  seatNote: "Seat height 0.45 m and a 0.35 m pull-out are assumptions for this chair, not a regulation.",
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
  computer: {
    containedOnTop: boolean;
    screen: "blank-panel";
  };
  chair: {
    facesDesk: boolean;
    clearsBrackets: boolean;
    tucked: Aabb;
    pullOut: Aabb;
    seatHeightM: number;
    pullOutM: number;
    note: string;
  };
  /** Desk, computer, and the chair pulled out to use. */
  useBounds: Aabb;
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

  parts.push(...computerParts(spec.surfaceHeightM), ...chairParts());

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
    computer: {
      containedOnTop: computerContained(parts),
      screen: "blank-panel",
    },
    chair: chairRecord(parts),
    useBounds: unionBounds([...parts, ...chairParts().map((part) => transformPart(part, { translate: [0, 0, CHAIR.pullOutM] }))]),
  };
}

function computerParts(surfaceY: number): MeshPart[] {
  const spec = COMPUTER;
  const baseY = surfaceY + spec.baseThicknessM / 2;
  const neckY = surfaceY + spec.baseThicknessM + spec.standRiseM / 2;
  const screenY = surfaceY + spec.baseThicknessM + spec.standRiseM + spec.screenHeightM / 2;
  return [
    roundedBox("computer-base", "plastic", {
      width: spec.baseWidthM,
      height: spec.baseThicknessM,
      depth: spec.baseDepthM,
      radius: 0.003,
      curveSegments: 2,
      center: [0, baseY, spec.screenCenterZM],
    }),
    roundedBox("computer-neck", "plastic", {
      width: spec.neckWidthM,
      height: spec.standRiseM,
      depth: spec.neckDepthM,
      radius: 0.004,
      curveSegments: 2,
      center: [0, neckY, spec.screenCenterZM],
    }),
    roundedBox("computer-bezel", "plastic", {
      width: spec.screenWidthM,
      height: spec.screenHeightM,
      depth: spec.screenThicknessM,
      radius: 0.004,
      curveSegments: 2,
      center: [0, screenY, spec.screenCenterZM],
    }),
    roundedBox("computer-screen", "screen", {
      width: spec.screenWidthM - 0.028,
      height: spec.screenHeightM - 0.028,
      depth: 0.004,
      radius: 0.002,
      curveSegments: 1,
      center: [0, screenY, spec.screenCenterZM + spec.screenThicknessM / 2],
    }),
    roundedBox("computer-keyboard", "plastic", {
      width: spec.keyboardWidthM,
      height: spec.keyboardHeightM,
      depth: spec.keyboardDepthM,
      radius: 0.004,
      curveSegments: 2,
      center: [0, surfaceY + spec.keyboardHeightM / 2, spec.keyboardCenterZM],
    }),
    roundedBox("computer-mouse", "plastic", {
      width: spec.mouseWidthM,
      height: spec.mouseHeightM,
      depth: spec.mouseDepthM,
      radius: 0.01,
      curveSegments: 3,
      center: [spec.mouseCenterXM, surfaceY + spec.mouseHeightM / 2, spec.keyboardCenterZM],
    }),
  ];
}

function chairParts(): MeshPart[] {
  const spec = CHAIR;
  const seatCenterZ = spec.seatFrontZM - spec.seatDepthM / 2;
  const seatY = spec.seatHeightM - spec.seatThicknessM / 2;
  const backZ = spec.seatFrontZM + spec.backThicknessM / 2 + 0.008;
  const backY = spec.seatHeightM + spec.backHeightM / 2;
  const legInsetX = spec.seatWidthM / 2 - 0.04;
  const legInsetZ = spec.seatDepthM / 2 - 0.04;
  const legs = [
    [-legInsetX, -legInsetZ],
    [legInsetX, -legInsetZ],
    [-legInsetX, legInsetZ],
    [legInsetX, legInsetZ],
  ].map(([dx, dz], index) =>
    roundedBox(`chair-leg-${index}`, "timber", {
      width: spec.legSizeM,
      height: spec.seatHeightM - spec.seatThicknessM,
      depth: spec.legSizeM,
      radius: 0.004,
      curveSegments: 2,
      center: [spec.centerXM + (dx ?? 0), (spec.seatHeightM - spec.seatThicknessM) / 2, seatCenterZ + (dz ?? 0)],
    }),
  );
  const back = transformPart(
    roundedBox("chair-back", "upholstery", {
      width: spec.backWidthM,
      height: spec.backHeightM,
      depth: spec.backThicknessM,
      radius: 0.006,
      curveSegments: 2,
    }),
    { pitch: 0.14, pivot: [0, -spec.backHeightM / 2, 0], translate: [spec.centerXM, backY, backZ] },
  );
  return [
    roundedBox("chair-seat", "upholstery", {
      width: spec.seatWidthM,
      height: spec.seatThicknessM,
      depth: spec.seatDepthM,
      radius: 0.008,
      curveSegments: 3,
      center: [spec.centerXM, seatY, seatCenterZ],
    }),
    { ...back, name: "chair-back" },
    ...legs,
  ];
}

function chairRecord(parts: readonly MeshPart[]): DeskModel["chair"] {
  const names = parts.filter((part) => part.name.startsWith("chair-"));
  const tucked = unionBounds(names);
  const pullOut = unionBounds(names.map((part) => transformPart(part, { translate: [0, 0, CHAIR.pullOutM] })));
  const brackets = parts.filter((part) => part.name.includes("bracket"));
  const clears = names.every((part) => brackets.every((bracket) => !aabbOverlap(partBounds(part), partBounds(bracket))));
  const back = names.find((part) => part.name === "chair-back");
  const seat = names.find((part) => part.name === "chair-seat");
  const facesDesk = !!back && !!seat && partBounds(back).min[2] >= partBounds(seat).max[2] - 0.02;
  return {
    facesDesk,
    clearsBrackets: clears,
    tucked,
    pullOut,
    seatHeightM: CHAIR.seatHeightM,
    pullOutM: CHAIR.pullOutM,
    note: CHAIR.seatNote,
  };
}

function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1] && a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

const COMPUTER_NAMES = [
  "computer-base",
  "computer-neck",
  "computer-bezel",
  "computer-screen",
  "computer-keyboard",
  "computer-mouse",
] as const;

export function computerContained(parts: readonly MeshPart[]): boolean {
  const top = parts.find((part) => part.name === "desk-top");
  if (!top) return false;
  const slab = partBounds(top);
  const margin = 0.012;
  for (const name of COMPUTER_NAMES) {
    const part = parts.find((item) => item.name === name);
    if (!part) return false;
    const box = partBounds(part);
    if (box.min[0] < slab.min[0] + margin || box.max[0] > slab.max[0] - margin) return false;
    if (box.min[2] < slab.min[2] + margin || box.max[2] > slab.max[2] - margin) return false;
    if (box.min[1] < slab.max[1] - 0.003) return false;
  }
  const keyboard = partBounds(parts.find((part) => part.name === "computer-keyboard")!);
  const screen = partBounds(parts.find((part) => part.name === "computer-screen")!);
  const mouse = partBounds(parts.find((part) => part.name === "computer-mouse")!);
  const separated =
    keyboard.max[2] < screen.min[2] ||
    keyboard.min[2] > screen.max[2] ||
    keyboard.max[1] < screen.min[1] ||
    keyboard.min[0] > screen.max[0] ||
    keyboard.max[0] < screen.min[0];
  const mouseClear = mouse.min[0] >= keyboard.max[0] - 0.002;
  return separated && mouseClear;
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
