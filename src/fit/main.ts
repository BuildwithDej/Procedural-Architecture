import "./fit.css";
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { presets } from "../model/examples.ts";
import { validateRoom } from "../model/parse.ts";
import type { Room, WallId } from "../model/types.ts";
import { buildBedroomSet } from "../library/bedroomSet.ts";
import { FEATURE_WALL, MOUNT_CLEARANCE_M } from "../library/bedroomSet.ts";
import { buildDesk } from "../library/desk.ts";
import {
  defaultFitRequest,
  fitFurniture,
  FITS_ROOM,
  moduleCenters,
  type FitRequest,
  type FitResult,
  yawForWall,
} from "../library/fit.ts";
import { MATTRESS_SIZE_IDS } from "../library/mattressSizes.ts";
import { transformPart, roundedBox } from "../library/mesh.ts";
import { pointOnWall } from "../model/geometry.ts";
import { projectPlan, worldToPlan } from "../plan/project.ts";
import type { MeshPart } from "../library/types.ts";
import { renderPlan } from "../ui/planSvg.ts";
import { frontWalls, presentationGlass, presentationSolids } from "../view3d/cutaway.ts";
import { frameOrthographic } from "../view3d/frame.ts";
import { WARDROBE_THREE_BAY, WARDROBE_TWO_BAY, buildWardrobe } from "../library/wardrobe.ts";

const root = document.querySelector("#app");
if (!root) throw new Error("Missing #app");

const search = new URLSearchParams(window.location.search);
const mountView = search.get("view") === "mount";
const initialRoom = search.get("room");
let request: FitRequest = defaultFitRequest(
  initialRoom === "tiny" && presets[1] ? presets[1].room : initialRoom === "example" && presets[0] ? presets[0].room : FITS_ROOM,
  "north",
);

const shell = document.createElement("div");
shell.className = "fit";
const bar = document.createElement("header");
bar.className = "fit-bar";
const back = document.createElement("a");
back.href = "/";
back.textContent = "Room study";
const assets = document.createElement("a");
assets.href = "/asset-preview.html";
assets.textContent = "Asset preview";
const title = document.createElement("strong");
title.textContent = "Fit demo";
bar.append(back, title, assets);

const controls = document.createElement("aside");
controls.className = "fit-side";
const notes = document.createElement("aside");
notes.className = "fit-side notes";
const stage = document.createElement("div");
stage.className = "stage";
const canvas = document.createElement("canvas");
const planCard = document.createElement("div");
planCard.className = "plan-card";
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "plan-svg");
planCard.append(svg);
stage.append(canvas, planCard);
shell.append(bar, controls, stage, notes);
root.append(shell);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene();
scene.background = new Color("#1a1b1f");
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
scene.add(new HemisphereLight("#f4f1ea", "#6e6256", 0.45));
const key = new DirectionalLight("#fff6ec", 1.6);
key.position.set(6, 10, -4);
key.castShadow = true;
scene.add(key);

const wallMaterial = new MeshStandardMaterial({ color: "#e7e1d8", roughness: 0.92 });
const glassMaterial = new MeshStandardMaterial({ color: "#d5e4ea", roughness: 0.15, transparent: true, opacity: 0.45 });
const floorMaterial = new MeshStandardMaterial({ color: "#d9d0c4", roughness: 0.95 });
const furniture = new Map<string, MeshStandardMaterial>();

function materialFor(id: string): MeshStandardMaterial {
  const existing = furniture.get(id);
  if (existing) return existing;
  const colors: Record<string, string> = {
    upholstery: "#d2c0ae",
    upholsteryDeep: "#c4ad98",
    sheet: "#efe4d6",
    duvet: "#c9b29e",
    pillow: "#e7d7c8",
    pillowDeep: "#cbb49f",
    timber: "#c4a36e",
    timberDark: "#8d6b45",
    lacquer: "#f3eee7",
    metalPale: "#ece7e0",
    metalDark: "#3e3a36",
    led: "#ffb07a",
    plastic: "#d9d5ce",
    screen: "#2a2e33",
  };
  const material = new MeshStandardMaterial({
    color: colors[id] ?? "#cccccc",
    roughness: id === "screen" ? 0.25 : 0.8,
    emissive: id === "led" ? "#ff8d42" : "#000000",
    emissiveIntensity: id === "led" ? 1.4 : 0,
  });
  furniture.set(id, material);
  return material;
}

function addParts(parts: readonly MeshPart[], yaw: number, origin: readonly [number, number, number]): void {
  for (const part of parts) {
    if (request.panelling === "fullWall" && part.name.startsWith("wall-panel-")) continue;
    const placed = transformPart(part, { yaw, translate: origin });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(placed.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(placed.normals, 3));
    geometry.setIndex(new BufferAttribute(placed.indices, 1));
    const mesh = new Mesh(geometry, materialFor(placed.material));
    mesh.castShadow = placed.material !== "led";
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function boxMesh(min: readonly [number, number, number], max: readonly [number, number, number], material: MeshStandardMaterial): Mesh {
  const geometry = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const mesh = new Mesh(geometry, material);
  mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function draw(result: FitResult): void {
  for (const child of [...scene.children]) {
    if (child instanceof Mesh) scene.remove(child);
  }
  const room = request.room;
  const frame = frameOrthographic(room, stage.clientWidth / Math.max(stage.clientHeight, 1));
  camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
  orbit.target.set(frame.target[0], frame.target[1], frame.target[2]);
  camera.near = frame.near;
  camera.far = frame.far;
  camera.zoom = 1;
  const aspect = stage.clientWidth / Math.max(stage.clientHeight, 1);
  const height = frame.frustumHeight / 2;
  const width = height * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
  camera.left = -width;
  camera.right = width;
  camera.top = height;
  camera.bottom = -height;
  camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
  camera.updateProjectionMatrix();
  orbit.update();

  const front = frontWalls(room, { x: frame.position[0], z: frame.position[2] });
  const floor = new Mesh(new BoxGeometry(room.width, 0.02, room.depth), floorMaterial);
  floor.position.set(room.width / 2, -0.01, room.depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  for (const solid of presentationSolids(room, front)) scene.add(boxMesh(solid.min, solid.max, wallMaterial));
  for (const pane of presentationGlass(room, front)) scene.add(boxMesh(pane.min, pane.max, glassMaterial));

  const bed = result.placed.find((item) => item.id === "bed");
  if (bed) {
    const model = buildBedroomSet(request.mattressId);
    addParts(model.parts, bed.yaw, bed.origin);
    if (request.panelling === "fullWall") {
      const blocked = [...room.doors, ...room.windows]
        .filter((opening) => opening.wall === bed.wall)
        .map((opening) => [opening.position, opening.position + opening.width] as [number, number]);
      const length = bed.wall === "north" || bed.wall === "south" ? room.width : room.depth;
      for (const center of moduleCenters(length, FEATURE_WALL.moduleWidthM, FEATURE_WALL.gapM, blocked)) {
        const panelHeight = Math.min(FEATURE_WALL.heightM, room.height);
        const panel = roundedBox("full-panel", "timber", {
          width: FEATURE_WALL.moduleWidthM,
          height: panelHeight,
          depth: FEATURE_WALL.thicknessM,
          radius: 0,
          center: [0, panelHeight / 2, FEATURE_WALL.thicknessM / 2],
        });
        const at = pointOnWall(room, bed.wall, center, -MOUNT_CLEARANCE_M);
        addParts([panel], yawForWall(bed.wall), [at.x, 0, at.z]);
      }
    }
  }
  const deskPlace = result.placed.find((item) => item.id === "desk");
  if (deskPlace) addParts(buildDesk().parts, deskPlace.yaw, deskPlace.origin);
  const wardrobePlace = result.placed.find((item) => item.id === "wardrobe");
  if (wardrobePlace) addParts(buildWardrobe(request.wardrobe).partsClosed, wardrobePlace.yaw, wardrobePlace.origin);

  if (mountView && bed) {
    const edge = pointOnWall(room, bed.wall, bed.alongCenterM + 1.28, -0.012);
    const eye = pointOnWall(room, bed.wall, bed.alongCenterM + 1.7, -0.42);
    camera.position.set(eye.x, 1.15, eye.z);
    orbit.target.set(edge.x, 1.05, edge.z);
    camera.left = -0.28;
    camera.right = 0.28;
    camera.top = 0.28;
    camera.bottom = -0.28;
    camera.lookAt(edge.x, 1.05, edge.z);
    camera.updateProjectionMatrix();
    orbit.update();
  }

  const plan = projectPlan(room);
  renderPlan(svg, plan, room.name);
  for (const item of result.placed) {
    const boxes = item.marks?.length ? item.marks.map((mark) => mark.box) : [item.footprint];
    for (const box of boxes) appendPlanBox(svg, box, item.id === "desk" ? "plan-chair" : "plan-item");
    if (item.marks?.length) appendPlanBox(svg, item.footprint, "plan-item");
  }
}

function appendPlanBox(svg: SVGSVGElement, box: { min: readonly number[]; max: readonly number[] }, className: string): void {
  const rect = worldToPlan(box.min[0] ?? 0, box.max[2] ?? 0);
  const far = worldToPlan(box.max[0] ?? 0, box.min[2] ?? 0);
  const node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  node.setAttribute("class", className);
  node.setAttribute("x", String(Math.min(rect.x, far.x)));
  node.setAttribute("y", String(Math.min(rect.y, far.y)));
  node.setAttribute("width", String(Math.abs(far.x - rect.x)));
  node.setAttribute("height", String(Math.abs(far.y - rect.y)));
  svg.append(node);
}

function field(labelText: string, value: number, onInput: (value: number) => void): HTMLLabelElement {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.value = String(value);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    onInput(next);
  });
  label.append(input);
  return label;
}

function renderControls(result: FitResult): void {
  controls.replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = "Room and choices";
  const row = document.createElement("div");
  row.className = "row";
  for (const preset of [
    { id: "fits", label: "Fits", room: FITS_ROOM },
    { id: "example", label: "Example", room: presets[0]?.room },
    { id: "tiny", label: "Tiny", room: presets[1]?.room },
  ]) {
    if (!preset.room) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.setAttribute("aria-pressed", request.room.id === preset.room.id ? "true" : "false");
    button.addEventListener("click", () => {
      request = { ...request, room: preset.room as Room };
      show();
    });
    row.append(button);
  }
  const wall = document.createElement("select");
  for (const id of ["north", "east", "south", "west"] as const) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    option.selected = request.bedWall === id;
    wall.append(option);
  }
  wall.addEventListener("change", () => {
    request = { ...request, bedWall: wall.value as WallId };
    show();
  });
  const mattress = document.createElement("select");
  for (const id of MATTRESS_SIZE_IDS) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    option.selected = request.mattressId === id;
    mattress.append(option);
  }
  mattress.addEventListener("change", () => {
    request = { ...request, mattressId: mattress.value as FitRequest["mattressId"] };
    show();
  });
  const panelling = document.createElement("select");
  for (const id of ["bedSurround", "fullWall"] as const) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id === "fullWall" ? "Full wall" : "Bed surround";
    option.selected = request.panelling === id;
    panelling.append(option);
  }
  panelling.addEventListener("change", () => {
    request = { ...request, panelling: panelling.value as FitRequest["panelling"] };
    show();
  });
  const wardrobe = document.createElement("select");
  for (const model of [WARDROBE_THREE_BAY, WARDROBE_TWO_BAY]) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.id;
    option.selected = request.wardrobe.id === model.id;
    wardrobe.append(option);
  }
  wardrobe.addEventListener("change", () => {
    request = { ...request, wardrobe: wardrobe.value === WARDROBE_TWO_BAY.id ? WARDROBE_TWO_BAY : WARDROBE_THREE_BAY };
    show();
  });
  const wallLabel = document.createElement("label");
  wallLabel.textContent = "Bed wall";
  wallLabel.append(wall);
  const mattressLabel = document.createElement("label");
  mattressLabel.textContent = "Mattress";
  mattressLabel.append(mattress);
  const panelLabel = document.createElement("label");
  panelLabel.textContent = "Panelling";
  panelLabel.append(panelling);
  const wardrobeLabel = document.createElement("label");
  wardrobeLabel.textContent = "Wardrobe";
  wardrobeLabel.append(wardrobe);
  controls.append(
    heading,
    row,
    field("Width", request.room.width, (width) => editRoom({ width })),
    field("Depth", request.room.depth, (depth) => editRoom({ depth })),
    field("Height", request.room.height, (height) => editRoom({ height })),
    wallLabel,
    mattressLabel,
    panelLabel,
    wardrobeLabel,
  );
  void result;
}

function editRoom(patch: Partial<Pick<Room, "width" | "depth" | "height">>): void {
  const next = { ...request.room, ...patch };
  const checked = validateRoom(next);
  if (!checked.ok) {
    notes.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Room rejected";
    const list = document.createElement("ul");
    for (const issue of checked.issues) {
      const item = document.createElement("li");
      item.textContent = issue.message;
      list.append(item);
    }
    notes.append(heading, list);
    return;
  }
  request = { ...request, room: checked.room };
  show();
}

function renderNotes(result: FitResult): void {
  notes.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = result.ok ? "Placed" : "Not fully placed";
  heading.className = result.ok ? "ok" : "bad";
  const intent = document.createElement("p");
  intent.textContent = `Desk is locked to ${request.deskWall}. Wardrobe is locked to ${request.wardrobeWall}. Opposite the bed is a sightline, not a rule, and no television is placed there.`;
  const placed = document.createElement("ul");
  for (const item of result.placed) {
    const line = document.createElement("li");
    line.textContent = `${item.id} on the ${item.wall} wall`;
    placed.append(line);
  }
  if (result.placed.length === 0) {
    const line = document.createElement("li");
    line.textContent = "Nothing was placed.";
    placed.append(line);
  }
  const unmet = document.createElement("ul");
  for (const item of result.unplaced) {
    const line = document.createElement("li");
    line.textContent = `${item.id}: ${item.reason}`;
    unmet.append(line);
  }
  notes.append(heading, intent, placed);
  if (result.unplaced.length > 0) {
    const sub = document.createElement("h2");
    sub.textContent = "Unplaced";
    notes.append(sub, unmet);
  }
  if (result.alternatives.length > 0) {
    const sub = document.createElement("h2");
    sub.textContent = "Alternatives";
    const hint = document.createElement("p");
    hint.textContent = "Nothing here is applied until you accept it. Openings and the mattress stay as chosen.";
    notes.append(sub, hint);
    for (const alternative of result.alternatives) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = alternative.label;
      button.addEventListener("click", () => {
        request = alternative.request;
        show();
      });
      notes.append(button);
    }
  }
}

function show(): void {
  const checked = validateRoom(request.room);
  if (!checked.ok) {
    renderNotes({
      ok: false,
      placed: [],
      unplaced: [{ id: "bed", reason: checked.issues.map((issue) => issue.message).join(" ") }],
      conflicts: checked.issues.map((issue) => issue.message),
      alternatives: [],
      mattressId: request.mattressId,
      panelling: request.panelling,
    });
    return;
  }
  request = { ...request, room: checked.room };
  const result = fitFurniture(request);
  renderControls(result);
  renderNotes(result);
  resize();
  draw(result);
}

function resize(): void {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  renderer.setSize(width, height, false);
}

function loop(): void {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  resize();
  draw(fitFurniture(request));
});
show();
loop();
