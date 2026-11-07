import "./form.css";
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  FLOOR_COUNT_MAX,
  FLOOR_COUNT_MIN,
  FORM_DESIGN,
  FORM_SUPPORT,
  generateForm,
  validateBoundary,
  validateFloorCount,
  type BuildingForm,
} from "./generate.ts";
import { FORM_PRESETS } from "./presets.ts";
import { fitOrthographic, type Vec3 } from "./frame.ts";
import { polygonArea, type Vec } from "./polygon.ts";
import { buildFormGeometry, type MeshData } from "./shell.ts";

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) throw new Error("Missing app root");

const params = new URLSearchParams(location.search);
const initialPreset = params.get("preset") ?? "ell";
const initialFloors = Number(params.get("floors") ?? "3");
const initialSeed = Number(params.get("seed") ?? "11");

app.innerHTML = `
  <div class="form-app">
    <header class="form-bar">
      <strong>Procedural Architecture</strong>
      <span class="grow">Boundary to hollow floors</span>
    </header>
    <aside class="form-side">
      <h1>Site boundary</h1>
      <p>Click corners in metres. Click the first corner again to close. East is to the right, north is up. Drag a corner after the outline is closed.</p>
      <canvas class="board" id="board" width="680" height="520"></canvas>
      <p class="meta" id="meta"></p>
      <div class="row">
        <button type="button" id="close">Close</button>
        <button type="button" id="undo">Undo</button>
        <button type="button" id="clear">Clear</button>
      </div>
      <div class="row" id="presets">
        <button type="button" data-preset="rectangle">Rectangle</button>
        <button type="button" data-preset="ell">L shape</button>
        <button type="button" data-preset="notch">Notch</button>
        <button type="button" data-preset="skew">Skew</button>
      </div>
      <label>Floors, ${FLOOR_COUNT_MIN} to ${FLOOR_COUNT_MAX}
        <input id="floors" type="number" min="${FLOOR_COUNT_MIN}" max="${FLOOR_COUNT_MAX}" step="1" value="${initialFloors}" />
      </label>
      <div class="row" id="floor-picks"></div>
      <label>Seed
        <input id="seed" type="number" step="1" value="${initialSeed}" />
      </label>
      <div class="row">
        <button type="button" id="regenerate">New seed</button>
        <button type="button" id="view-model" aria-pressed="true">Model</button>
        <button type="button" id="view-top" aria-pressed="false">Top</button>
      </div>
      <div class="checks">
        <label><input id="show-slabs" type="checkbox" checked /> Floor slabs</label>
        <label><input id="show-roof" type="checkbox" /> Roof cap</label>
        <label><input id="open-south" type="checkbox" checked /> Open south walls</label>
      </div>
      <div class="row" id="isolate"></div>
      <p class="status" id="form-status"></p>
      <p>Floor height ${FORM_DESIGN.floorHeightM} m, slab ${FORM_DESIGN.slabThicknessM} m, and wall ${FORM_DESIGN.wallThicknessM} m are design choices. Sites under ${FORM_SUPPORT.minSiteAreaM2} m² or sides under ${FORM_SUPPORT.minSiteEdgeM} m are outside what this editor supports. Those figures are not a zoning rule.</p>
    </aside>
    <div class="stage">
      <canvas id="view"></canvas>
      <div class="north-tag" id="north-tag" hidden>N</div>
    </div>
  </div>
`;

function canvasById(id: string): HTMLCanvasElement {
  const node = document.querySelector(id);
  if (!(node instanceof HTMLCanvasElement)) throw new Error(`Missing canvas ${id}`);
  return node;
}

function elementById(id: string): HTMLElement {
  const node = document.querySelector(id);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${id}`);
  return node;
}

function inputById(id: string): HTMLInputElement {
  const node = document.querySelector(id);
  if (!(node instanceof HTMLInputElement)) throw new Error(`Missing input ${id}`);
  return node;
}

const board = canvasById("#board");
const viewCanvas = canvasById("#view");
const meta = elementById("#meta");
const statusEl = elementById("#form-status");
const floorsInput = inputById("#floors");
const seedInput = inputById("#seed");
const northTag = elementById("#north-tag");

const boardContext = board.getContext("2d");
if (!boardContext) throw new Error("No 2D context");
const ctx: CanvasRenderingContext2D = boardContext;

interface ViewBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

let points: Vec[] = [];
let closed = false;
let dragIndex: number | null = null;
let viewBox: ViewBox = { minX: -1, minY: -1, maxX: 24, maxY: 18 };
let isolate: number | null = null;
let viewMode: "model" | "top" = "model";

const floorPicks = document.querySelector("#floor-picks");
if (floorPicks instanceof HTMLElement) {
  for (let floor = FLOOR_COUNT_MIN; floor <= FLOOR_COUNT_MAX; floor += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(floor);
    button.addEventListener("click", () => {
      floorsInput.value = String(floor);
      rebuild();
    });
    floorPicks.append(button);
  }
}

function fitBox(pts: readonly Vec[]): void {
  if (pts.length === 0) {
    viewBox = { minX: -1, minY: -1, maxX: 24, maxY: 18 };
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of pts) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const pad = Math.max(2, (maxX - minX) * 0.18, (maxY - minY) * 0.18);
  viewBox = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function boardTransform(): { scale: number; ox: number; oy: number; width: number; height: number } {
  const width = board.clientWidth || 340;
  const height = board.clientHeight || 280;
  const scale = Math.min(width / (viewBox.maxX - viewBox.minX), height / (viewBox.maxY - viewBox.minY));
  const ox = (width - (viewBox.maxX - viewBox.minX) * scale) / 2;
  const oy = (height - (viewBox.maxY - viewBox.minY) * scale) / 2;
  return { scale, ox, oy, width, height };
}

function toScreen(point: Vec, transform: ReturnType<typeof boardTransform>): { x: number; y: number } {
  return {
    x: transform.ox + (point.x - viewBox.minX) * transform.scale,
    y: transform.height - (transform.oy + (point.y - viewBox.minY) * transform.scale),
  };
}

function toWorld(screenX: number, screenY: number): Vec {
  const transform = boardTransform();
  const x = viewBox.minX + (screenX - transform.ox) / transform.scale;
  const y = viewBox.minY + (transform.height - screenY - transform.oy) / transform.scale;
  return { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
}

function drawBoard(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = board.clientWidth || 340;
  const height = board.clientHeight || 280;
  board.width = Math.floor(width * ratio);
  board.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101114";
  ctx.fillRect(0, 0, width, height);
  const transform = boardTransform();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const startX = Math.ceil(viewBox.minX);
  const endX = Math.floor(viewBox.maxX);
  const startY = Math.ceil(viewBox.minY);
  const endY = Math.floor(viewBox.maxY);
  for (let x = startX; x <= endX; x += 1) {
    const screen = toScreen({ x, y: viewBox.minY }, transform);
    const screenTop = toScreen({ x, y: viewBox.maxY }, transform);
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screenTop.x, screenTop.y);
  }
  for (let y = startY; y <= endY; y += 1) {
    const screen = toScreen({ x: viewBox.minX, y }, transform);
    const screenEast = toScreen({ x: viewBox.maxX, y }, transform);
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screenEast.x, screenEast.y);
  }
  ctx.stroke();

  ctx.fillStyle = "#6f6f78";
  ctx.font = "11px Instrument Sans, sans-serif";
  ctx.fillText("N", 10, 16);
  ctx.fillText("E", width - 18, height - 10);

  if (points.length > 0) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const screen = toScreen(point, transform);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    if (closed) ctx.closePath();
    if (closed) {
      ctx.fillStyle = "rgba(228, 214, 196, 0.14)";
      ctx.fill();
    }
    ctx.strokeStyle = "#e7d7c4";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      const screen = toScreen(point, transform);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, index === 0 && !closed ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 ? "#f4f4f5" : "#e7d7c4";
      ctx.fill();
    }
  }
}

function eventPoint(event: PointerEvent): Vec {
  const rect = board.getBoundingClientRect();
  return toWorld(event.clientX - rect.left, event.clientY - rect.top);
}

function hitVertex(screenX: number, screenY: number): number | null {
  const transform = boardTransform();
  let best: number | null = null;
  let bestDistance = 12;
  points.forEach((point, index) => {
    const screen = toScreen(point, transform);
    const distance = Math.hypot(screen.x - screenX, screen.y - screenY);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

board.addEventListener("pointerdown", (event) => {
  const rect = board.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const hit = hitVertex(localX, localY);
  if (!closed && hit === 0 && points.length >= 3) {
    closed = true;
    rebuild();
    return;
  }
  if (hit !== null) {
    dragIndex = hit;
    board.setPointerCapture(event.pointerId);
    return;
  }
  if (closed) return;
  const point = eventPoint(event);
  const first = points[0];
  if (first && points.length >= 3) {
    const transform = boardTransform();
    const screen = toScreen(first, transform);
    if (Math.hypot(screen.x - localX, screen.y - localY) <= 14) {
      closed = true;
      rebuild();
      return;
    }
  }
  const previous = points[points.length - 1];
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.2) return;
  points.push(point);
  if (point.x < viewBox.minX || point.x > viewBox.maxX || point.y < viewBox.minY || point.y > viewBox.maxY) {
    fitBox(points);
  }
  rebuild();
});

board.addEventListener("pointermove", (event) => {
  if (dragIndex === null) return;
  const point = eventPoint(event);
  points[dragIndex] = point;
  drawBoard();
});

board.addEventListener("pointerup", () => {
  if (dragIndex === null) return;
  dragIndex = null;
  rebuild();
});

document.querySelector("#close")?.addEventListener("click", () => {
  if (points.length >= 3) {
    closed = true;
    rebuild();
  }
});

document.querySelector("#undo")?.addEventListener("click", () => {
  if (closed) closed = false;
  else points.pop();
  rebuild();
});

document.querySelector("#clear")?.addEventListener("click", () => {
  points = [];
  closed = false;
  fitBox(points);
  rebuild();
});

document.querySelector("#presets")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const name = target.dataset.preset;
  const preset = name ? FORM_PRESETS[name] : undefined;
  if (!preset) return;
  points = preset.map((point) => ({ x: point.x, y: point.y }));
  closed = true;
  fitBox(points);
  rebuild();
});

document.querySelector("#regenerate")?.addEventListener("click", () => {
  const current = Number(seedInput.value);
  seedInput.value = String(Number.isInteger(current) ? current + 1 : 1);
  rebuild();
});

floorsInput.addEventListener("input", () => rebuild());
seedInput.addEventListener("input", () => rebuild());

const showSlabs = document.querySelector("#show-slabs");
const showRoof = document.querySelector("#show-roof");
const openSouth = document.querySelector("#open-south");
showSlabs?.addEventListener("change", () => applyVisibility());
showRoof?.addEventListener("change", () => applyVisibility());
openSouth?.addEventListener("change", () => applyVisibility());

const isolateRow = document.querySelector("#isolate");
function renderIsolate(form: BuildingForm | null): void {
  if (!(isolateRow instanceof HTMLElement)) return;
  isolateRow.replaceChildren();
  if (!form) return;
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "All floors";
  all.setAttribute("aria-pressed", isolate === null ? "true" : "false");
  all.addEventListener("click", () => {
    isolate = null;
    applyVisibility();
    renderIsolate(form);
  });
  isolateRow.append(all);
  for (const floor of form.floors) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = floor.id;
    button.setAttribute("aria-pressed", isolate === floor.index ? "true" : "false");
    button.addEventListener("click", () => {
      isolate = floor.index;
      applyVisibility();
      renderIsolate(form);
    });
    isolateRow.append(button);
  }
}

const renderer = new WebGLRenderer({ canvas: viewCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color("#e4e1da"));
renderer.toneMapping = NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 400);
camera.position.set(24, 18, 28);
const controls = new OrbitControls(camera, viewCanvas);
controls.target.set(8, 4, 8);
controls.enableDamping = true;
controls.update();

scene.add(new AmbientLight("#f4f1ea", 0.55));
scene.add(new HemisphereLight("#f7f5f0", "#d5d0c6", 0.65));
const sun = new DirectionalLight("#fffaf3", 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
const fill = new DirectionalLight("#f3f6fb", 0.85);
scene.add(fill);
scene.add(fill.target);
const ground = new Mesh(
  new PlaneGeometry(800, 800),
  new MeshStandardMaterial({ color: "#e7e4dc", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const building = new Group();
scene.add(building);

const STONE = ["#f4f1ea", "#e8e3da", "#f7f4ee", "#ebe6dd", "#f1ece4"];
const SLABS = ["#fbf9f4", "#f3eee6", "#faf6f1", "#efe9e0", "#f6f1ea"];

interface FloorTag {
  kind: "slab" | "wall" | "roof";
  floor: number;
  south: boolean;
}

function floorTag(mesh: Mesh): FloorTag | null {
  const data: unknown = mesh.userData;
  if (typeof data !== "object" || data === null) return null;
  if (!("kind" in data) || !("floor" in data) || !("south" in data)) return null;
  const { kind, floor, south } = data as { kind: unknown; floor: unknown; south: unknown };
  if ((kind === "slab" || kind === "wall" || kind === "roof") && typeof floor === "number" && typeof south === "boolean") {
    return { kind, floor, south };
  }
  return null;
}

function meshFrom(data: MeshData, material: MeshStandardMaterial, tagged: FloorTag): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setIndex(data.indices);
  const mesh = new Mesh(geometry, material.clone());
  mesh.userData = tagged;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let currentForm: BuildingForm | null = null;

function clearBuilding(): void {
  while (building.children.length > 0) {
    const child = building.children[0];
    if (!child) break;
    building.remove(child);
    if (child instanceof Mesh || child instanceof LineLoop) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }
}

function showForm(form: BuildingForm): void {
  clearBuilding();
  currentForm = form;
  const outline: number[] = [];
  for (const point of form.site) outline.push(point.x, 0.05, point.y);
  const outlineGeometry = new BufferGeometry();
  outlineGeometry.setAttribute("position", new Float32BufferAttribute(outline, 3));
  const loop = new LineLoop(outlineGeometry, new MeshBasicMaterial({ color: "#5c584f" }));
  building.add(loop);

  const geometry = buildFormGeometry(form);
  geometry.forEach((floor, index) => {
    const wallMaterial = new MeshStandardMaterial({
      color: STONE[index % STONE.length],
      roughness: 0.72,
      metalness: 0,
    });
    const slabMaterial = new MeshStandardMaterial({
      color: SLABS[index % SLABS.length],
      roughness: 0.8,
      metalness: 0,
    });
    building.add(meshFrom(floor.slab, slabMaterial, { kind: "slab", floor: index, south: false }));
    for (const wall of floor.walls) {
      building.add(
        meshFrom(wall.mesh, wallMaterial, { kind: "wall", floor: index, south: wall.south }),
      );
    }
    if (floor.roof) {
      const roofMaterial = new MeshStandardMaterial({ color: "#ddd8ce", roughness: 0.78, metalness: 0 });
      building.add(meshFrom(floor.roof, roofMaterial, { kind: "roof", floor: index, south: false }));
    }
  });
  applyVisibility();
  frameCamera(form, false);
  renderIsolate(form);
}

function applyVisibility(): void {
  const slabsOn = showSlabs instanceof HTMLInputElement ? showSlabs.checked : true;
  const roofOn = showRoof instanceof HTMLInputElement ? showRoof.checked : false;
  const open = openSouth instanceof HTMLInputElement ? openSouth.checked : true;
  for (const child of building.children) {
    if (!(child instanceof Mesh)) continue;
    const tagged = floorTag(child);
    if (!tagged) continue;
    const floorOk = isolate === null || tagged.floor === isolate;
    if (tagged.kind === "slab") child.visible = floorOk && slabsOn;
    else if (tagged.kind === "roof") child.visible = floorOk && roofOn;
    else child.visible = floorOk && !(open && tagged.south);
  }
}

function enclosurePoints(form: BuildingForm): Vec3[] {
  const top = form.roof.elevationM + form.roof.thicknessM;
  const points: Vec3[] = [];
  for (const point of form.site) {
    points.push({ x: point.x, y: 0, z: point.y });
    points.push({ x: point.x, y: top, z: point.y });
  }
  for (const floor of form.floors) {
    const crown = floor.elevationM + floor.heightM;
    for (const point of floor.outer) {
      points.push({ x: point.x, y: floor.elevationM, z: point.y });
      points.push({ x: point.x, y: crown, z: point.y });
    }
  }
  return points;
}

function siteSpan(form: BuildingForm): { centerX: number; centerZ: number; span: number; top: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of form.site) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.y);
    maxZ = Math.max(maxZ, point.y);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    span: Math.max(maxX - minX, maxZ - minZ, 4),
    top: form.roof.elevationM + form.roof.thicknessM,
  };
}

function canonicalView(form: BuildingForm): { eye: Vec3; target: Vec3; up: Vec3; mirrorX: boolean } {
  const { centerX, centerZ, span, top } = siteSpan(form);
  if (viewMode === "top") {
    return {
      eye: { x: centerX, y: top + span * 2, z: centerZ },
      target: { x: centerX, y: 0, z: centerZ },
      up: { x: 0, y: 0, z: 1 },
      mirrorX: true,
    };
  }
  return {
    eye: { x: centerX + span * 0.9, y: top * 0.55 + span * 0.45, z: centerZ + span * 1.15 },
    target: { x: centerX, y: top * 0.42, z: centerZ },
    up: { x: 0, y: 1, z: 0 },
    mirrorX: false,
  };
}

function viewAspect(): number {
  const width = viewCanvas.clientWidth || viewCanvas.getBoundingClientRect().width;
  const height = viewCanvas.clientHeight || viewCanvas.getBoundingClientRect().height;
  if (width < 2 || height < 2) return 1;
  return width / height;
}

function applyFrame(form: BuildingForm, eye: Vec3, target: Vec3, up: Vec3, mirrorX: boolean): void {
  const fit = fitOrthographic(eye, target, up, enclosurePoints(form), viewAspect(), 1.16, mirrorX);
  camera.up.set(up.x, up.y, up.z);
  camera.position.set(fit.eye.x, fit.eye.y, fit.eye.z);
  camera.lookAt(fit.target.x, fit.target.y, fit.target.z);
  camera.left = fit.left;
  camera.right = fit.right;
  camera.top = fit.top;
  camera.bottom = fit.bottom;
  camera.near = fit.near;
  camera.far = fit.far;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.set(fit.target.x, fit.target.y, fit.target.z);
  controls.enableRotate = viewMode === "model";
  controls.update();

  const { centerX, centerZ, span, top } = siteSpan(form);
  const shadow = span * 1.4;
  sun.position.set(centerX + span * 0.7, top + span, centerZ + span * 0.85);
  sun.target.position.set(centerX, top * 0.35, centerZ);
  sun.shadow.camera.left = -shadow;
  sun.shadow.camera.right = shadow;
  sun.shadow.camera.top = shadow;
  sun.shadow.camera.bottom = -shadow;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = span * 6;
  sun.shadow.camera.updateProjectionMatrix();
  fill.position.set(centerX, top * 0.55, centerZ - span * 1.3);
  fill.target.position.set(centerX, top * 0.4, centerZ);
  northTag.hidden = viewMode !== "top";
  const modelButton = document.querySelector("#view-model");
  const topButton = document.querySelector("#view-top");
  if (modelButton instanceof HTMLButtonElement) modelButton.setAttribute("aria-pressed", viewMode === "model" ? "true" : "false");
  if (topButton instanceof HTMLButtonElement) topButton.setAttribute("aria-pressed", viewMode === "top" ? "true" : "false");
}

function frameCamera(form: BuildingForm, keepDirection: boolean): void {
  if (keepDirection && camera.position.distanceTo(controls.target) > 0.5) {
    applyFrame(
      form,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      { x: camera.up.x, y: camera.up.y, z: camera.up.z },
      viewMode === "top",
    );
    return;
  }
  const view = canonicalView(form);
  applyFrame(form, view.eye, view.target, view.up, view.mirrorX);
}

document.querySelector("#view-model")?.addEventListener("click", () => {
  viewMode = "model";
  if (currentForm) frameCamera(currentForm, false);
});
document.querySelector("#view-top")?.addEventListener("click", () => {
  viewMode = "top";
  if (currentForm) frameCamera(currentForm, false);
});

function resize(): void {
  const width = viewCanvas.clientWidth || viewCanvas.getBoundingClientRect().width || 1;
  const height = viewCanvas.clientHeight || viewCanvas.getBoundingClientRect().height || 1;
  renderer.setSize(width, height, false);
  if (currentForm) frameCamera(currentForm, true);
  drawBoard();
}

function setStatus(text: string, ok: boolean): void {
  statusEl.textContent = text;
  statusEl.className = ok ? "status ok" : "status bad";
  statusEl.dataset.floors = ok ? String(currentForm?.floorCount ?? "") : "0";
}

function rebuild(): void {
  drawBoard();
  const floorPick = document.querySelectorAll("#floor-picks button");
  floorPick.forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.setAttribute("aria-pressed", button.textContent === floorsInput.value ? "true" : "false");
    }
  });
  if (!closed) {
    clearBuilding();
    currentForm = null;
    renderIsolate(null);
    const area = points.length >= 3 ? polygonArea(points) : 0;
    meta.textContent = points.length === 0 ? "No corners yet." : `${points.length} corners${area ? `, about ${area.toFixed(1)} m²` : ""}. Not closed.`;
    setStatus("Close the outline to generate the floors.", false);
    return;
  }
  const boundary = validateBoundary(points);
  const area = boundary.ok ? polygonArea(boundary.polygon) : polygonArea(points);
  meta.textContent = `${points.length} corners, ${area.toFixed(1)} m².`;
  if (!boundary.ok) {
    clearBuilding();
    currentForm = null;
    renderIsolate(null);
    setStatus(boundary.issues.join(" "), false);
    return;
  }
  const floors = validateFloorCount(Number(floorsInput.value));
  if (!floors.ok) {
    clearBuilding();
    currentForm = null;
    renderIsolate(null);
    setStatus(floors.issues.join(" "), false);
    return;
  }
  const seed = Number(seedInput.value);
  const result = generateForm({ boundary: points, floors: floors.floors, seed });
  if (!result.ok) {
    clearBuilding();
    currentForm = null;
    renderIsolate(null);
    setStatus(result.issues.join(" "), false);
    return;
  }
  showForm(result.form);
  const varied = new Set(result.form.floors.map((floor) => JSON.stringify(floor.outer))).size;
  const repeated = result.form.floors.filter((floor) => floor.index > 0 && !floor.stepped).length;
  setStatus(
    `${result.form.floorCount} hollow ${result.form.floorCount === 1 ? "floor" : "floors"}, seed ${result.form.seed}. ${varied} distinct plate${varied === 1 ? "" : "s"}.${repeated ? ` ${repeated} level${repeated === 1 ? "" : "s"} repeat the plate below because a smaller step would leave the support.` : ""}`,
    true,
  );
}

const preset = FORM_PRESETS[initialPreset];
if (params.get("empty") === "1") {
  points = [];
  closed = false;
  fitBox(points);
} else if (preset) {
  points = preset.map((point) => ({ x: point.x, y: point.y }));
  closed = true;
  fitBox(points);
} else {
  points = [];
  closed = false;
}

if (params.get("roof") === "1" && showRoof instanceof HTMLInputElement) showRoof.checked = true;
if (params.get("slabs") === "0" && showSlabs instanceof HTMLInputElement) showSlabs.checked = false;
if (params.get("open") === "0" && openSouth instanceof HTMLInputElement) openSouth.checked = false;
if (params.get("view") === "top") viewMode = "top";

window.addEventListener("resize", resize);
const stage = viewCanvas.parentElement;
if (stage instanceof HTMLElement) new ResizeObserver(() => resize()).observe(stage);
resize();
rebuild();

function animate(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
