import { describe, expect, it } from "vitest";
import { aabbWidth, partBounds } from "../src/library/bounds.ts";
import {
  BED_FRAME,
  buildBedroomSet,
  mattressInsideFootprint,
  PLACEHOLDER_FOOT_CLEARANCE_M,
  PLACEHOLDER_SIDE_CLEARANCE_M,
} from "../src/library/bedroomSet.ts";
import { bracketXs, buildDesk, computerContained, DESK_SPEC } from "../src/library/desk.ts";
import { encodeGlb, glbJson } from "../src/library/glb.ts";
import { materialDef } from "../src/library/materials.ts";
import { INCH_M, MATTRESS_SIZES, mattressSize, PREVIEW_MATTRESS_ID } from "../src/library/mattressSizes.ts";
import { roundedBox } from "../src/library/mesh.ts";
import { layoutFeatureWall } from "../src/library/panels.ts";
import {
  buildWardrobe,
  CARCASS_THICKNESS_M,
  decideWardrobe,
  exteriorDepthM,
  SHELF_SETBACK_M,
  shelfDepthM,
  validateWardrobe,
  WARDROBE_THREE_BAY,
  WARDROBE_TWO_BAY,
} from "../src/library/wardrobe.ts";

describe("mattress sizes", () => {
  it("matches the Sleep Foundation inch chart exactly in metres", () => {
    const expected = [
      ["twin", 38, 75],
      ["twinXl", 38, 80],
      ["full", 54, 75],
      ["queen", 60, 80],
      ["king", 76, 80],
      ["calKing", 72, 84],
    ] as const;
    expect(MATTRESS_SIZES.map((entry) => entry.id)).toEqual(expected.map(([id]) => id));
    for (const [id, widthIn, lengthIn] of expected) {
      const size = mattressSize(id);
      expect(size.widthIn).toBe(widthIn);
      expect(size.lengthIn).toBe(lengthIn);
      expect(size.widthM).toBeCloseTo(widthIn * INCH_M, 10);
      expect(size.lengthM).toBeCloseTo(lengthIn * INCH_M, 10);
    }
    expect(mattressSize("queen").widthM).toBeCloseTo(1.524, 10);
    expect(mattressSize("queen").lengthM).toBeCloseTo(2.032, 10);
    expect(PREVIEW_MATTRESS_ID).toBe("queen");
  });
});

describe("bedroom set", () => {
  const queen = buildBedroomSet("queen");
  const full = buildBedroomSet("full");

  it("keeps the mattress size distinct from the frame footprint", () => {
    expect(queen.layout.mattressWidthM).toBeCloseTo(1.524, 8);
    expect(queen.layout.frameWidthM).toBeCloseTo(queen.layout.mattressWidthM + BED_FRAME.sideOverhangM * 2, 8);
    expect(queen.layout.frameDepthM).toBeGreaterThan(queen.layout.mattressLengthM);
    expect(queen.layout.mattressThicknessM).toBe(BED_FRAME.mattressThicknessM);
    expect(mattressInsideFootprint(queen)).toBe(true);
    const widthDelta = queen.layout.mattressWidthM - full.layout.mattressWidthM;
    expect(queen.layout.frameWidthM - full.layout.frameWidthM).toBeCloseTo(widthDelta, 8);
    expect(queen.layout.frameDepthM - full.layout.frameDepthM).toBeCloseTo(
      queen.layout.mattressLengthM - full.layout.mattressLengthM,
      8,
    );
  });

  it("lets the duvet extend past the solid footprint and records placeholder clearance", () => {
    expect(aabbWidth(queen.visualBounds)).toBeGreaterThan(queen.layout.frameWidthM + 0.05);
    expect(queen.clearance).toEqual({
      sideM: PLACEHOLDER_SIDE_CLEARANCE_M,
      footM: PLACEHOLDER_FOOT_CLEARANCE_M,
      status: "placeholder-comfort",
    });
    expect(queen.clearance.sideM).toBe(0.6);
    expect(queen.clearance.footM).toBe(0.9);
    expect(queen.footprint.max[0] - queen.footprint.min[0]).toBeGreaterThan(queen.bedFootprint.max[0] - queen.bedFootprint.min[0]);
  });

  it("repeats equal wall modules and keeps the queen LED on the bed group", () => {
    expect(new Set(queen.modules.map((module) => module.widthM)).size).toBe(1);
    expect(queen.modules.length).toBeGreaterThan(2);
    const wide = layoutFeatureWall({
      mode: "fullWall",
      wallWidthM: 12,
      bedGroupWidthM: queen.layout.bedGroupWidthM,
      moduleWidthM: 0.4,
      gapM: 0.014,
    });
    expect(wide.ok).toBe(true);
    expect(wide.led?.centerM).toBe(0);
    expect(wide.led?.lengthM).toBeCloseTo(queen.layout.bedGroupWidthM, 8);
    expect(wide.modules.every((module) => module.widthM === 0.4)).toBe(true);
    expect(wide.modules.length).toBeGreaterThan(queen.modules.length);
  });

  it("refuses to clip an LED that leaves the wall", () => {
    const blocked = layoutFeatureWall({
      mode: "fullWall",
      wallWidthM: 3,
      bedGroupWidthM: 2.4,
      moduleWidthM: 0.4,
      gapM: 0.014,
      ledEdit: { id: "shift", centerOffsetM: 0.8, lengthScale: 1, brightness: 1, warmth: 0.8 },
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.led).toBeNull();
    expect(blocked.alternatives.some((alternative) => alternative.led?.centerM === 0)).toBe(true);
  });

  it("builds finite meshes with outward normals on the platform", () => {
    expect(queen.parts.some((part) => part.name === "bed-duvet")).toBe(true);
    expect(queen.parts.some((part) => part.name === "nightstand-left")).toBe(true);
    expect(queen.parts.some((part) => part.name === "led-up")).toBe(true);
    for (const part of queen.parts) {
      expect(part.indices.length).toBeGreaterThan(0);
      expect(Number.isFinite(part.positions[0])).toBe(true);
    }
    const platform = roundedBox("probe", "upholstery", {
      width: 1,
      height: 0.4,
      depth: 0.8,
      radius: 0.04,
      curveSegments: 3,
    });
    const box = partBounds(platform);
    expect(box.max[0] - box.min[0]).toBeCloseTo(1, 2);
    expect(box.max[1] - box.min[1]).toBeCloseTo(0.4, 2);
    let outward = 0;
    let inward = 0;
    for (let i = 0; i < platform.indices.length; i += 3) {
      const a = platform.indices[i] ?? 0;
      const b = platform.indices[i + 1] ?? 0;
      const c = platform.indices[i + 2] ?? 0;
      const ax = platform.positions[a * 3] ?? 0;
      const ay = platform.positions[a * 3 + 1] ?? 0;
      const az = platform.positions[a * 3 + 2] ?? 0;
      const bx = (platform.positions[b * 3] ?? 0) - ax;
      const by = (platform.positions[b * 3 + 1] ?? 0) - ay;
      const bz = (platform.positions[b * 3 + 2] ?? 0) - az;
      const cx = (platform.positions[c * 3] ?? 0) - ax;
      const cy = (platform.positions[c * 3 + 1] ?? 0) - ay;
      const cz = (platform.positions[c * 3 + 2] ?? 0) - az;
      const nx = by * cz - bz * cy;
      const ny = bz * cx - bx * cz;
      const nz = bx * cy - by * cx;
      const dot = nx * ax + ny * ay + nz * az;
      if (dot >= 0) outward += 1;
      else inward += 1;
    }
    expect(inward).toBe(0);
    expect(outward).toBeGreaterThan(0);
  });
});

describe("desk", () => {
  const model = buildDesk();

  it("is a wall-mounted slab with three brackets and a recorded knee space", () => {
    expect(bracketXs()).toHaveLength(3);
    expect(model.parts.filter((part) => part.name.includes("plate"))).toHaveLength(3);
    expect(model.mount.kind).toBe("wall-mounted");
    expect(model.mount.structuralApproval).toBe("not-assessed");
    expect(model.mount.floorContact).toBe("none");
    expect(model.mount.wallSegmentLengthM).toBe(DESK_SPEC.topWidthM);
    expect(model.mount.projectionFromWallM).toBe(DESK_SPEC.topDepthM);
    expect(model.knee.clearHeightM).toBeCloseTo(DESK_SPEC.surfaceHeightM - DESK_SPEC.topThicknessM, 8);
    expect(model.knee.clearHeightM).toBeGreaterThan(0.65);
    const top = partBounds(model.parts.find((part) => part.name === "desk-top")!);
    expect(top.max[1] - top.min[1]).toBeCloseTo(DESK_SPEC.topThicknessM, 2);
    expect(top.max[1]).toBeCloseTo(DESK_SPEC.surfaceHeightM, 2);
    expect(model.visualBounds.min[1]).toBeLessThan(model.knee.clearHeightM);
    expect(model.parts.some((part) => part.name === "desk-cable-slot")).toBe(true);
    expect(model.computer.containedOnTop).toBe(true);
    expect(model.computer.screen).toBe("blank-panel");
    expect(computerContained(model.parts)).toBe(true);
    expect(model.parts.some((part) => part.name === "computer-screen")).toBe(true);
    expect(model.parts.some((part) => part.name === "computer-keyboard")).toBe(true);
    expect(model.parts.some((part) => part.name === "computer-mouse")).toBe(true);
    expect(model.chair.facesDesk).toBe(true);
    expect(model.chair.clearsBrackets).toBe(true);
    expect(model.chair.seatHeightM).toBe(0.45);
    expect(model.chair.pullOut.max[2]).toBeGreaterThan(model.chair.tucked.max[2]);
    expect(model.useBounds.max[2]).toBeGreaterThan(DESK_SPEC.topDepthM);
  });
});

describe("wardrobe", () => {
  const three = buildWardrobe(WARDROBE_THREE_BAY);
  const two = buildWardrobe(WARDROBE_TWO_BAY);

  it("builds two requests with the same carcass thickness and different proportions", () => {
    expect(three.carcassThicknessM).toBe(CARCASS_THICKNESS_M);
    expect(two.carcassThicknessM).toBe(three.carcassThicknessM);
    expect(three.usableDepthM).toBe(0.56);
    expect(two.usableDepthM).toBe(0.6);
    expect(three.overallWidthM / two.overallWidthM).not.toBeCloseTo(three.heightM / two.heightM, 2);
    expect(three.exteriorDepthM).toBeCloseTo(exteriorDepthM(0.56), 8);
    expect(three.request.bayCount).toBe(3);
    expect(two.request.bayCount).toBe(2);
  });

  it("keeps shelf depth at the requested usable depth minus a fixed setback", () => {
    const shelf = three.partsClosed.find((part) => part.name === "wardrobe-bay-1-shelf-0");
    expect(shelf).toBeTruthy();
    if (!shelf) return;
    expect(shelfDepthM(shelf)).toBeCloseTo(three.usableDepthM - SHELF_SETBACK_M, 2);
  });

  it("records a door swing outside the closed footprint", () => {
    const door = three.doors[0];
    expect(door?.openAngleDeg).toBe(90);
    expect(door?.sweepRadiusM).toBeCloseTo(door?.widthM ?? 0, 5);
    expect(door?.open.max[2] ?? 0).toBeGreaterThan(three.footprint.max[2] + 0.2);
    expect(three.footprint.max[2]).toBeCloseTo(three.exteriorDepthM, 5);
  });

  it("rejects a shallow usable depth instead of shrinking the interior", () => {
    const request = { ...WARDROBE_THREE_BAY, id: "too-shallow", usableDepthM: 0.4 };
    const decision = decideWardrobe(request);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.errors.some((error) => error.includes("Usable depth"))).toBe(true);
    expect(decision.alternatives[0]?.usableDepthM).toBe(0.52);
    expect(decision.alternatives[0]?.sections).toEqual(WARDROBE_THREE_BAY.sections);
    expect(validateWardrobe(decision.alternatives[0] ?? request).ok).toBe(true);
  });
});

describe("materials and glb", () => {
  it("uses soft fabric factors and an emissive LED", () => {
    expect(materialDef("upholstery").roughness).toBeGreaterThan(0.7);
    expect(materialDef("timber").roughness).toBeGreaterThan(0.4);
    expect(materialDef("led").emissiveIntensity).toBeGreaterThan(1);
  });

  it("writes a real GLB for the queen set", () => {
    const queen = buildBedroomSet("queen");
    const glb = encodeGlb(queen.parts, { id: queen.id });
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe("glTF");
    const json = glbJson(glb) as { meshes: { name: string }[]; buffers: { byteLength: number }[] };
    expect(json.meshes.some((mesh) => mesh.name === "bed-duvet")).toBe(true);
    expect(json.meshes.some((mesh) => mesh.name === "led-up")).toBe(true);
    expect(json.buffers[0]?.byteLength).toBeGreaterThan(1000);
  });
});
