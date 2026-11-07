import "./preview.css";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RectAreaLight,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { unionBounds } from "../library/bounds.ts";
import { buildBedroomSet, type LightAnchor } from "../library/bedroomSet.ts";
import { buildDesk } from "../library/desk.ts";
import { materialDef } from "../library/materials.ts";
import type { MeshPart } from "../library/types.ts";
import { buildWardrobe, WARDROBE_THREE_BAY, WARDROBE_TWO_BAY, type WardrobeModel } from "../library/wardrobe.ts";

type PreviewId = "bedroom" | "desk" | "wardrobe";

const bedroom = buildBedroomSet("queen");
const desk = buildDesk();
const wardrobeThree = buildWardrobe(WARDROBE_THREE_BAY);
const wardrobeTwo = buildWardrobe(WARDROBE_TWO_BAY);

const root = document.querySelector("#app");
if (!root) throw new Error("Missing #app");

const shell = document.createElement("div");
shell.className = "preview";
const bar = document.createElement("header");
bar.className = "preview-bar";
const title = document.createElement("p");
title.className = "preview-title";
const back = document.createElement("a");
back.href = "/";
back.textContent = "Room study";
const name = document.createElement("strong");
name.textContent = "Asset preview";
title.append(back, name);
const choices = document.createElement("div");
choices.className = "choices";
const caption = document.createElement("p");
caption.className = "caption";
const stage = document.createElement("div");
stage.className = "stage";
const canvas = document.createElement("canvas");
stage.append(canvas);
bar.append(title, choices);
shell.append(bar, caption, stage);
root.append(shell);

RectAreaLightUniformsLib.init();
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
scene.background = new Color("#221c18");
const camera = new PerspectiveCamera(34, 1, 0.05, 40);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.7, -0.2);

scene.add(new HemisphereLight("#fff0e2", "#7d6552", 0.38));
scene.add(new AmbientLight("#ffe8d2", 0.12));
const key = new DirectionalLight("#fff4e8", 2.1);
key.position.set(-2.4, 3.4, 2.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 12;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
scene.add(key);

const floor = new Mesh(
  new PlaneGeometry(8, 8),
  new MeshStandardMaterial({ color: "#b7a28a", roughness: 0.9, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const plaster = new Mesh(
  new PlaneGeometry(3.2, 2.4),
  new MeshStandardMaterial({ color: "#e5ddd2", roughness: 0.92, metalness: 0 }),
);
plaster.position.set(0, 1.15, -0.02);
plaster.receiveShadow = true;
scene.add(plaster);

const fabric = noiseTexture();
const grain = woodGrain();
const materials = new Map<string, MeshStandardMaterial | MeshPhysicalMaterial>();

function materialFor(id: string): MeshStandardMaterial | MeshPhysicalMaterial {
  const existing = materials.get(id);
  if (existing) return existing;
  const def = materialDef(id);
  let material: MeshStandardMaterial | MeshPhysicalMaterial;
  if (id === "led") {
    material = new MeshStandardMaterial({
      color: def.hex,
      emissive: new Color(def.emissiveHex ?? "#ff9a4a"),
      emissiveIntensity: def.emissiveIntensity ?? 1,
      roughness: 0.4,
    });
  } else if (id === "timber" || id === "timberDark") {
    material = new MeshStandardMaterial({
      color: def.hex,
      map: grain,
      roughness: def.roughness,
      metalness: 0,
    });
  } else if (id === "lacquer" || id === "metalPale" || id === "metalDark") {
    material = new MeshStandardMaterial({
      color: def.hex,
      roughness: def.roughness,
      metalness: def.metalness,
    });
  } else {
    material = new MeshPhysicalMaterial({
      color: def.hex,
      map: fabric,
      roughness: def.roughness,
      metalness: 0,
      sheen: 0.62,
      sheenColor: new Color("#f4e7da"),
      sheenRoughness: 0.62,
    });
  }
  materials.set(id, material);
  return material;
}

function addParts(group: Group, parts: readonly MeshPart[]): void {
  for (const part of parts) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(part.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(part.normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(part.uvs, 2));
    geometry.setIndex(new BufferAttribute(part.indices, 1));
    const mesh = new Mesh(geometry, materialFor(part.material));
    mesh.name = part.name;
    mesh.castShadow = part.material !== "led";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function addLights(group: Group, lights: readonly LightAnchor[]): void {
  for (const anchor of lights) {
    const light = new RectAreaLight(anchor.hex, anchor.intensity, anchor.widthM, anchor.heightM);
    light.position.set(anchor.position[0], anchor.position[1], anchor.position[2]);
    light.lookAt(anchor.target[0], anchor.target[1], anchor.target[2]);
    light.name = anchor.id;
    group.add(light);
  }
}

const bedroomGroup = new Group();
bedroomGroup.name = "bedroom";
addParts(bedroomGroup, bedroom.parts);
addLights(bedroomGroup, bedroom.lights);
scene.add(bedroomGroup);

const deskGroup = new Group();
deskGroup.name = "desk";
addParts(deskGroup, desk.parts);
scene.add(deskGroup);

const wardrobeGroups = new Map<string, { closed: Group; open: Group }>();
for (const model of [wardrobeThree, wardrobeTwo]) {
  const closed = new Group();
  const open = new Group();
  closed.name = model.id;
  addParts(closed, model.partsClosed);
  addParts(open, model.partsOpen);
  scene.add(closed, open);
  wardrobeGroups.set(model.id, { closed, open });
}

const buttons: HTMLButtonElement[] = [];

function button(label: string, pressed: () => boolean, onClick: () => void): void {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  buttons.push(element);
  choices.append(element);
  element.dataset.pressed = pressed.toString();
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function currentSet(): PreviewId {
  const value = params().get("set");
  if (value === "desk" || value === "wardrobe") return value;
  return "bedroom";
}

function currentWardrobe(): WardrobeModel {
  return params().get("config") === "two" ? wardrobeTwo : wardrobeThree;
}

function doorsOpen(): boolean {
  return params().get("doors") === "open";
}

function go(next: Record<string, string | null>): void {
  const search = params();
  for (const [key, value] of Object.entries(next)) {
    if (value === null) search.delete(key);
    else search.set(key, value);
  }
  const query = search.toString();
  history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  show();
}

button("Bedroom set", () => currentSet() === "bedroom", () => go({ set: "bedroom", config: null, doors: null }));
button("Desk", () => currentSet() === "desk", () => go({ set: "desk", config: null, doors: null }));
button("Wardrobe, three bays", () => currentSet() === "wardrobe" && currentWardrobe().id === wardrobeThree.id, () =>
  go({ set: "wardrobe", config: "three" }),
);
button("Wardrobe, two bays", () => currentSet() === "wardrobe" && currentWardrobe().id === wardrobeTwo.id, () =>
  go({ set: "wardrobe", config: "two" }),
);
button("Doors open", () => currentSet() === "wardrobe" && doorsOpen(), () => {
  if (currentSet() !== "wardrobe") go({ set: "wardrobe", config: "three", doors: "open" });
  else go({ doors: doorsOpen() ? null : "open" });
});

function frameParts(parts: readonly MeshPart[]): void {
  const box = unionBounds(parts);
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const sx = box.max[0] - box.min[0];
  const sy = box.max[1] - box.min[1];
  const sz = box.max[2] - box.min[2];
  const radius = Math.max(Math.hypot(sx, sy, sz) * 0.55, 0.4);
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 0.72;
  camera.position.set(cx + dist * 0.42, box.min[1] + sy * 0.46 + dist * 0.16, cz + dist * 0.92);
  controls.target.set(cx, box.min[1] + sy * 0.42, cz);
  controls.update();
}

function show(): void {
  const selected = currentSet();
  bedroomGroup.visible = selected === "bedroom";
  deskGroup.visible = selected === "desk";
  plaster.visible = selected !== "bedroom";
  for (const [id, groups] of wardrobeGroups) {
    const active = selected === "wardrobe" && currentWardrobe().id === id;
    groups.closed.visible = active && !doorsOpen();
    groups.open.visible = active && doorsOpen();
  }
  if (selected === "bedroom") {
    frameParts(bedroom.parts);
    caption.textContent =
      "Queen mattress 1.524 × 2.032 m, from the Sleep Foundation 60 × 80 in chart. The frame footprint is separate. LED light is an emissive strip plus rectangular area lights on the timber, not global illumination. Other mattress sizes are in the data and are not visually signed off.";
  } else if (selected === "desk") {
    frameParts(desk.parts);
    caption.textContent =
      "Wall-mounted oak top, 1.20 × 0.52 × 0.032 m, surface at 0.74 m, with a blank computer and a chair in the right-hand knee gap. Seat height 0.45 m and the 0.35 m pull-out are assumptions, not a regulation. Brackets carry the top. Fixing is not assessed.";
  } else {
    const model = currentWardrobe();
    frameParts(doorsOpen() ? model.partsOpen : model.partsClosed);
    const bays = model.request.sections.map((section) => section.kind).join(", ");
    caption.textContent = doorsOpen()
      ? `${model.id}: doors at 90°. The swing is access metadata, not part of the closed footprint. Usable depth stays ${model.usableDepthM} m.`
      : `${model.id}: ${model.request.bayCount} bays (${bays}), clear bay ${model.request.bayWidthM} m, usable depth ${model.usableDepthM} m, carcass ${model.carcassThicknessM} m. This is one valid request, not a scaled copy of the other.`;
  }
  for (const element of buttons) {
    const label = element.textContent ?? "";
    const pressed =
      (label === "Bedroom set" && selected === "bedroom") ||
      (label === "Desk" && selected === "desk") ||
      (label.startsWith("Wardrobe, three") && selected === "wardrobe" && currentWardrobe().id === wardrobeThree.id) ||
      (label.startsWith("Wardrobe, two") && selected === "wardrobe" && currentWardrobe().id === wardrobeTwo.id) ||
      (label === "Doors open" && selected === "wardrobe" && doorsOpen());
    element.setAttribute("aria-pressed", pressed ? "true" : "false");
  }
}

function resize(): void {
  const width = stage.clientWidth;
  const height = Math.max(stage.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function frameLoop(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frameLoop);
}

function noiseTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const image = context.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const shade = 236 + Math.floor(hash(x * 0.37 + y * 1.7) * 16);
      const offset = (y * 256 + x) * 4;
      image.data[offset] = shade;
      image.data[offset + 1] = shade;
      image.data[offset + 2] = shade;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function woodGrain(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const image = context.createImageData(128, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const line = Math.sin(x * 1.15 + Math.sin(y * 0.03) * 0.8) * 0.5 + 0.5;
      const speck = hash(x * 3 + y * 0.15);
      const shade = 214 + line * 28 + speck * 8;
      const offset = (y * 128 + x) * 4;
      image.data[offset] = shade;
      image.data[offset + 1] = shade;
      image.data[offset + 2] = shade;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function hash(value: number): number {
  const raw = Math.sin(value * 127.1) * 43758.5453;
  return raw - Math.floor(raw);
}

window.addEventListener("resize", resize);
resize();
show();
frameLoop();
