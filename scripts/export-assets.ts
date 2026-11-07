import { mkdirSync, writeFileSync } from "node:fs";
import { buildBedroomSet, FEATURE_WALL, PLACEHOLDER_FOOT_CLEARANCE_M, PLACEHOLDER_SIDE_CLEARANCE_M } from "../src/library/bedroomSet.ts";
import { buildDesk, DESK_SPEC } from "../src/library/desk.ts";
import { encodeGlb } from "../src/library/glb.ts";
import { MATTRESS_SIZES, PREVIEW_MATTRESS_ID } from "../src/library/mattressSizes.ts";
import { buildWardrobe, WARDROBE_LIMITS, WARDROBE_THREE_BAY, WARDROBE_TWO_BAY } from "../src/library/wardrobe.ts";

const queen = buildBedroomSet("queen");
const desk = buildDesk();
const three = buildWardrobe(WARDROBE_THREE_BAY);
const two = buildWardrobe(WARDROBE_TWO_BAY);

mkdirSync("library", { recursive: true });
writeFileSync("library/bedroom-set-queen.glb", encodeGlb(queen.parts, { id: queen.id }));
writeFileSync("library/desk-wall-oak.glb", encodeGlb(desk.parts, { id: desk.id }));
writeFileSync("library/wardrobe-three-bay.glb", encodeGlb(three.partsClosed, { id: three.id, pose: "closed" }));
writeFileSync("library/wardrobe-two-bay.glb", encodeGlb(two.partsClosed, { id: two.id, pose: "closed" }));

const metadata = {
  note: "Generated from src/library. GLB files carry mesh and PBR factors. The preview adds procedural textures that are not in the GLB.",
  mattressSource: "https://www.sleepfoundation.org/mattress-sizes",
  previewMattressId: PREVIEW_MATTRESS_ID,
  mattressSizes: MATTRESS_SIZES.map((size) => ({
    id: size.id,
    widthIn: size.widthIn,
    lengthIn: size.lengthIn,
    widthM: size.widthM,
    lengthM: size.lengthM,
  })),
  mattressThicknessM: queen.layout.mattressThicknessM,
  mattressThicknessNote: "Design choice for the preview model. Sleep Foundation does not standardize thickness.",
  bedroomQueen: {
    frameWidthM: queen.layout.frameWidthM,
    frameDepthM: queen.layout.frameDepthM,
    bedGroupWidthM: queen.layout.bedGroupWidthM,
    footprint: queen.footprint,
    bedFootprint: queen.bedFootprint,
    clearance: queen.clearance,
    moduleWidthM: queen.moduleWidthM,
    moduleCount: queen.modules.length,
    featureWallHeightM: FEATURE_WALL.heightM,
    lights: queen.lights.map((light) => light.id),
    lighting: "Emissive strip meshes plus RectAreaLight upwash and downwash. Not global illumination.",
  },
  placeholderClearanceM: {
    side: PLACEHOLDER_SIDE_CLEARANCE_M,
    foot: PLACEHOLDER_FOOT_CLEARANCE_M,
    status: "placeholder-comfort",
  },
  desk: {
    id: DESK_SPEC.id,
    topWidthM: DESK_SPEC.topWidthM,
    topDepthM: DESK_SPEC.topDepthM,
    topThicknessM: DESK_SPEC.topThicknessM,
    surfaceHeightM: DESK_SPEC.surfaceHeightM,
    bracketCount: DESK_SPEC.bracketCount,
    mount: desk.mount,
    knee: desk.knee,
    computer: desk.computer,
    dimensionsAre: "design choices, not a regulation or a structural approval",
  },
  wardrobeLimits: WARDROBE_LIMITS,
  wardrobes: [three, two].map((model) => ({
    id: model.id,
    bayCount: model.request.bayCount,
    bayWidthM: model.request.bayWidthM,
    usableDepthM: model.usableDepthM,
    heightM: model.heightM,
    overallWidthM: model.overallWidthM,
    exteriorDepthM: model.exteriorDepthM,
    carcassThicknessM: model.carcassThicknessM,
    sections: model.request.sections,
    footprint: model.footprint,
    doors: model.doors.map((door) => ({
      bayIndex: door.bayIndex,
      hinge: door.hinge,
      widthM: door.widthM,
      openAngleDeg: door.openAngleDeg,
      sweepRadiusM: door.sweepRadiusM,
      openMaxZ: door.open.max[2],
    })),
  })),
};

writeFileSync("library/metadata.json", `${JSON.stringify(metadata, null, 2)}\n`);
console.log("wrote library GLB files and metadata.json");
