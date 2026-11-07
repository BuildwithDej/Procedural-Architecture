import { partBounds, unionBounds } from "./bounds.ts";
import { mattressSize, type MattressSizeId } from "./mattressSizes.ts";
import { roundedBox, shellFromGrid, transformPart } from "./mesh.ts";
import { layoutFeatureWall, ledHex, type PanelModule } from "./panels.ts";
import type { Aabb, MeshPart } from "./types.ts";

/** Comfort placeholders for a later fitter. Not measured legal minima. */
export const PLACEHOLDER_SIDE_CLEARANCE_M = 0.6;
export const PLACEHOLDER_FOOT_CLEARANCE_M = 0.9;

/** Frame allowances are design choices around the mattress. They are not a second mattress size. */
export const BED_FRAME = {
  sideOverhangM: 0.055,
  footOverhangM: 0.05,
  headboardThicknessM: 0.11,
  platformHeightM: 0.2,
  platformRadiusM: 0.038,
  /** Not from the Sleep Foundation chart. Thickness varies by mattress, so this is the preview model. */
  mattressThicknessM: 0.28,
  headboardHeightM: 0.6,
  headboardBottomM: 0.16,
  headboardGapM: 0.018,
  headboardInsetM: 0.05,
  headboardRadiusM: 0.05,
} as const;

export const NIGHTSTAND = {
  widthM: 0.46,
  depthM: 0.36,
  heightM: 0.15,
  gapFromBedM: 0.04,
  bottomM: 0.48,
  radiusM: 0.01,
  support: "wall-cleat",
  structuralApproval: "not-assessed",
} as const;

export const FEATURE_WALL = {
  moduleWidthM: 0.4,
  gapM: 0.014,
  thicknessM: 0.02,
  heightM: 2.4,
  bandHeightM: 0.06,
  bandDepthM: 0.14,
  bandCenterYM: 0.92,
  /** How far the band bites into the panel face. It stays in front of the panel back. */
  bandBiteM: 0.008,
} as const;

/**
 * Air gap between a mounted back and the room's interior face.
 * The piece stands in the room. It does not enter the wall solid, and it does not share that face.
 */
export const MOUNT_CLEARANCE_M = 0.002;

export function featureMount(wallFront: number): {
  panelBack: number;
  panelFront: number;
  panelCenter: number;
  bandBack: number;
  bandFront: number;
  bandCenter: number;
} {
  const panelBack = wallFront + MOUNT_CLEARANCE_M;
  const panelFront = panelBack + FEATURE_WALL.thicknessM;
  const bandBack = panelFront - FEATURE_WALL.bandBiteM;
  const bandFront = bandBack + FEATURE_WALL.bandDepthM;
  return {
    panelBack,
    panelFront,
    panelCenter: (panelBack + panelFront) / 2,
    bandBack,
    bandFront,
    bandCenter: (bandBack + bandFront) / 2,
  };
}

export interface LightAnchor {
  id: string;
  position: [number, number, number];
  target: [number, number, number];
  widthM: number;
  heightM: number;
  hex: string;
  intensity: number;
}

export interface BedLayout {
  sizeId: MattressSizeId;
  mattressWidthM: number;
  mattressLengthM: number;
  mattressThicknessM: number;
  frameWidthM: number;
  frameDepthM: number;
  mattressCenter: [number, number, number];
  mattressTopY: number;
  bedGroupWidthM: number;
}

export function bedLayout(sizeId: MattressSizeId): BedLayout {
  const mattress = mattressSize(sizeId);
  const frameWidthM = mattress.widthM + BED_FRAME.sideOverhangM * 2;
  const frameDepthM = BED_FRAME.headboardThicknessM + mattress.lengthM + BED_FRAME.footOverhangM;
  const mattressCenterZ = -frameDepthM / 2 + BED_FRAME.headboardThicknessM + mattress.lengthM / 2;
  const mattressCenterY = BED_FRAME.platformHeightM + BED_FRAME.mattressThicknessM / 2;
  return {
    sizeId,
    mattressWidthM: mattress.widthM,
    mattressLengthM: mattress.lengthM,
    mattressThicknessM: BED_FRAME.mattressThicknessM,
    frameWidthM,
    frameDepthM,
    mattressCenter: [0, mattressCenterY, mattressCenterZ],
    mattressTopY: BED_FRAME.platformHeightM + BED_FRAME.mattressThicknessM,
    bedGroupWidthM: frameWidthM + (NIGHTSTAND.gapFromBedM + NIGHTSTAND.widthM) * 2,
  };
}

export interface BedroomSetModel {
  id: string;
  layout: BedLayout;
  /** Solid furniture and the feature wall. Duvet drape and pillows are not in this box. */
  footprint: Aabb;
  bedFootprint: Aabb;
  visualBounds: Aabb;
  clearance: {
    sideM: number;
    footM: number;
    status: "placeholder-comfort";
  };
  modules: readonly PanelModule[];
  moduleWidthM: number;
  parts: MeshPart[];
  lights: LightAnchor[];
}

export function buildBedroomSet(sizeId: MattressSizeId = "queen"): BedroomSetModel {
  const layout = bedLayout(sizeId);
  const wallFront = -layout.frameDepthM / 2;
  const panels = layoutFeatureWall({
    mode: "bedSurround",
    wallWidthM: layout.bedGroupWidthM,
    bedGroupWidthM: layout.bedGroupWidthM,
    moduleWidthM: FEATURE_WALL.moduleWidthM,
    gapM: FEATURE_WALL.gapM,
    brightness: 1,
    warmth: 0.82,
  });
  if (!panels.ok || !panels.led) {
    throw new Error(panels.errors.join(" ") || "Feature wall did not layout.");
  }

  const parts: MeshPart[] = [];
  parts.push(
    roundedBox("bed-plinth", "timberDark", {
      width: layout.frameWidthM - 0.04,
      height: 0.05,
      depth: layout.frameDepthM - 0.06,
      radius: 0.012,
      curveSegments: 3,
      center: [0, 0.025, 0.01],
    }),
    roundedBox("bed-platform", "upholstery", {
      width: layout.frameWidthM,
      height: BED_FRAME.platformHeightM - 0.03,
      depth: layout.frameDepthM,
      radius: BED_FRAME.platformRadiusM,
      curveSegments: 5,
      center: [0, 0.03 + (BED_FRAME.platformHeightM - 0.03) / 2, 0],
    }),
    roundedBox("bed-mattress", "upholsteryDeep", {
      width: layout.mattressWidthM,
      height: layout.mattressThicknessM,
      depth: layout.mattressLengthM,
      radius: 0.03,
      curveSegments: 4,
      center: layout.mattressCenter,
    }),
  );

  const headZ = layout.mattressCenter[2] - layout.mattressLengthM / 2;
  parts.push(
    roundedBox("bed-sheet", "sheet", {
      width: layout.mattressWidthM + 0.02,
      height: 0.045,
      depth: 0.42,
      radius: 0.02,
      curveSegments: 3,
      center: [0, layout.mattressTopY + 0.01, headZ + 0.22],
    }),
  );
  parts.push(...pillows(layout, headZ), duvet(layout, headZ), ...headboard(layout, wallFront));
  parts.push(...nightstands(layout, wallFront), ...featureWall(layout, wallFront, panels.modules, panels.led.lengthM));

  const run = panelRunWidth(panels.modules);
  const mount = featureMount(wallFront);
  const bedFootprint: Aabb = {
    min: [-layout.frameWidthM / 2, 0, wallFront],
    max: [layout.frameWidthM / 2, BED_FRAME.headboardBottomM + BED_FRAME.headboardHeightM, wallFront + layout.frameDepthM],
  };
  const footprint: Aabb = {
    min: [-run / 2, 0, mount.panelBack],
    max: [run / 2, FEATURE_WALL.heightM, wallFront + layout.frameDepthM],
  };

  const ledY = FEATURE_WALL.bandCenterYM + FEATURE_WALL.bandHeightM / 2 + 0.01;
  const downY = FEATURE_WALL.bandCenterYM - FEATURE_WALL.bandHeightM / 2 - 0.01;
  const mounted = featureMount(wallFront);
  const warmthHex = ledHex(panels.led.warmth);
  const lights: LightAnchor[] = [
    {
      id: "led-upwash",
      position: [panels.led.centerM, ledY, mounted.panelFront + 0.01],
      target: [panels.led.centerM, ledY + 1.1, mounted.panelBack],
      widthM: panels.led.lengthM,
      heightM: 0.045,
      hex: warmthHex,
      intensity: 8,
    },
    {
      id: "led-downwash",
      position: [panels.led.centerM, downY, mounted.bandFront - 0.02],
      target: [panels.led.centerM, 0.55, 0.15],
      widthM: panels.led.lengthM * 0.92,
      heightM: 0.04,
      hex: warmthHex,
      intensity: 5,
    },
  ];

  return {
    id: `bedroom-set-${layout.sizeId}`,
    layout,
    footprint,
    bedFootprint,
    visualBounds: unionBounds(parts),
    clearance: {
      sideM: PLACEHOLDER_SIDE_CLEARANCE_M,
      footM: PLACEHOLDER_FOOT_CLEARANCE_M,
      status: "placeholder-comfort",
    },
    modules: panels.modules,
    moduleWidthM: FEATURE_WALL.moduleWidthM,
    parts,
    lights,
  };
}

function panelRunWidth(modules: readonly PanelModule[]): number {
  if (modules.length === 0) return 0;
  const left = Math.min(...modules.map((module) => module.centerM - module.widthM / 2));
  const right = Math.max(...modules.map((module) => module.centerM + module.widthM / 2));
  return right - left;
}

function headboard(layout: BedLayout, wallFront: number): MeshPart[] {
  const inner = layout.frameWidthM - BED_FRAME.headboardInsetM * 2;
  const panelWidth = (inner - BED_FRAME.headboardGapM) / 2;
  const y = BED_FRAME.headboardBottomM + BED_FRAME.headboardHeightM / 2;
  const z = featureMount(wallFront).panelFront + BED_FRAME.headboardThicknessM / 2;
  const x = panelWidth / 2 + BED_FRAME.headboardGapM / 2;
  const options = {
    width: panelWidth,
    height: BED_FRAME.headboardHeightM,
    depth: BED_FRAME.headboardThicknessM,
    radius: BED_FRAME.headboardRadiusM,
    curveSegments: 6,
  };
  return [
    roundedBox("bed-headboard-left", "upholstery", { ...options, center: [-x, y, z] }),
    roundedBox("bed-headboard-right", "upholstery", { ...options, center: [x, y, z] }),
  ];
}

function nightstands(layout: BedLayout, wallFront: number): MeshPart[] {
  const x = layout.frameWidthM / 2 + NIGHTSTAND.gapFromBedM + NIGHTSTAND.widthM / 2;
  const y = NIGHTSTAND.bottomM + NIGHTSTAND.heightM / 2;
  const mount = featureMount(wallFront);
  const z = mount.panelFront + NIGHTSTAND.depthM / 2;
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? "left" : "right";
    const centerX = side * x;
    return [
      roundedBox(`nightstand-${name}`, "lacquer", {
        width: NIGHTSTAND.widthM,
        height: NIGHTSTAND.heightM,
        depth: NIGHTSTAND.depthM,
        radius: NIGHTSTAND.radiusM,
        curveSegments: 3,
        center: [centerX, y, z],
      }),
      roundedBox(`nightstand-${name}-drawer`, "timberDark", {
        width: NIGHTSTAND.widthM - 0.06,
        height: 0.008,
        depth: 0.01,
        radius: 0.002,
        curveSegments: 1,
        center: [centerX, y - 0.01, z + NIGHTSTAND.depthM / 2],
      }),
      roundedBox(`nightstand-${name}-cleat`, "timberDark", {
        width: NIGHTSTAND.widthM * 0.62,
        height: 0.035,
        depth: 0.016,
        radius: 0.002,
        curveSegments: 1,
        center: [centerX, y + NIGHTSTAND.heightM / 2 - 0.03, mount.panelFront + 0.008],
      }),
    ];
  });
}

function featureWall(
  layout: BedLayout,
  wallFront: number,
  modules: readonly PanelModule[],
  ledLength: number,
): MeshPart[] {
  const mount = featureMount(wallFront);
  const parts = modules.map((module, index) =>
    roundedBox(`wall-panel-${index}`, "timber", {
      width: module.widthM,
      height: FEATURE_WALL.heightM,
      depth: FEATURE_WALL.thicknessM,
      radius: 0,
      center: [module.centerM, FEATURE_WALL.heightM / 2, mount.panelCenter],
    }),
  );
  const run = panelRunWidth(modules);
  parts.push(
    roundedBox("wall-band", "timber", {
      width: run,
      height: FEATURE_WALL.bandHeightM,
      depth: FEATURE_WALL.bandDepthM,
      radius: 0.006,
      curveSegments: 2,
      center: [0, FEATURE_WALL.bandCenterYM, mount.bandCenter],
    }),
    roundedBox("led-up", "led", {
      width: ledLength,
      height: 0.012,
      depth: 0.016,
      radius: 0,
      center: [0, FEATURE_WALL.bandCenterYM + FEATURE_WALL.bandHeightM / 2 + 0.008, mount.panelFront + 0.012],
    }),
    roundedBox("led-down", "led", {
      width: ledLength * 0.92,
      height: 0.01,
      depth: 0.014,
      radius: 0,
      center: [0, FEATURE_WALL.bandCenterYM - FEATURE_WALL.bandHeightM / 2 - 0.006, mount.bandFront - 0.02],
    }),
  );
  void layout;
  return parts;
}

function pillows(layout: BedLayout, headZ: number): MeshPart[] {
  const y = layout.mattressTopY;
  const specs = [
    { name: "bed-pillow-back-left", material: "pillow", w: 0.7, h: 0.18, d: 0.38, x: -0.34, z: 0.16, yaw: 0.06, pitch: -0.22 },
    { name: "bed-pillow-back-right", material: "pillow", w: 0.7, h: 0.18, d: 0.38, x: 0.34, z: 0.15, yaw: -0.05, pitch: -0.2 },
    { name: "bed-pillow-mid-left", material: "pillowDeep", w: 0.52, h: 0.14, d: 0.32, x: -0.24, z: 0.34, yaw: 0.14, pitch: -0.08 },
    { name: "bed-pillow-mid-right", material: "pillow", w: 0.5, h: 0.13, d: 0.3, x: 0.22, z: 0.36, yaw: -0.1, pitch: -0.06 },
    { name: "bed-pillow-front", material: "pillowDeep", w: 0.42, h: 0.1, d: 0.2, x: 0.02, z: 0.48, yaw: 0.04, pitch: 0.05 },
  ];
  return specs.map((pillow) =>
    transformPart(
      roundedBox(pillow.name, pillow.material, {
        width: pillow.w,
        height: pillow.h,
        depth: pillow.d,
        radius: Math.min(pillow.w, pillow.h, pillow.d) * 0.46,
        curveSegments: 5,
      }),
      { yaw: pillow.yaw, pitch: pillow.pitch, translate: [pillow.x, y + pillow.h * 0.25, headZ + pillow.z] },
    ),
  );
}

function duvet(layout: BedLayout, headZ: number): MeshPart {
  const nu = 36;
  const nv = 48;
  const rows: [number, number, number][][] = [];
  const xSpan = layout.mattressWidthM + 0.46;
  const zStart = headZ + 0.4;
  const zEnd = layout.mattressCenter[2] + layout.mattressLengthM / 2 + 0.34;
  for (let j = 0; j < nv; j += 1) {
    const row: [number, number, number][] = [];
    const v = j / (nv - 1);
    for (let i = 0; i < nu; i += 1) {
      const u = i / (nu - 1);
      const x = -xSpan / 2 + u * xSpan;
      const z = zStart + v * (zEnd - zStart);
      const half = layout.mattressWidthM / 2;
      const side = Math.max(0, Math.abs(x) - (half - 0.02));
      const sideT = smooth(side / 0.28);
      const foot = Math.max(0, z - (layout.mattressCenter[2] + layout.mattressLengthM / 2 - 0.04));
      const footT = smooth(foot / 0.32);
      const broad =
        0.045 * Math.sin(u * Math.PI * 2.2 + 0.4) * Math.sin(v * Math.PI * 1.6) +
        0.028 * Math.sin(u * Math.PI * 5 + v * 3.1) +
        0.016 * Math.sin(v * Math.PI * 6.5 + u);
      const loose = Math.exp(-((u - 0.12) ** 2) / 0.012 - ((v - 0.78) ** 2) / 0.02);
      let y = layout.mattressTopY + 0.03 + broad * (1 - sideT * 0.85);
      y -= sideT * (x < 0 ? 0.4 : 0.3);
      y -= footT * 0.34;
      y -= loose * 0.07;
      const pulledX = x - loose * 0.05 * Math.sign(x || 1);
      row.push([pulledX, y, z]);
    }
    rows.push(row);
  }
  return shellFromGrid("bed-duvet", "duvet", rows, 0.028);
}

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function partByName(parts: readonly MeshPart[], name: string): MeshPart {
  const found = parts.find((part) => part.name === name);
  if (!found) throw new Error(`Missing part ${name}`);
  return found;
}

export function mattressInsideFootprint(model: BedroomSetModel): boolean {
  const mattress = partBounds(partByName(model.parts, "bed-mattress"));
  const box = model.bedFootprint;
  return (
    mattress.min[0] >= box.min[0] - 1e-4 &&
    mattress.max[0] <= box.max[0] + 1e-4 &&
    mattress.min[2] >= box.min[2] - 1e-4 &&
    mattress.max[2] <= box.max[2] + 1e-4
  );
}
