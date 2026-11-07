import "./form.css";
import {
  ACESFilmicToneMapping,
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
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  FLOOR_COUNT_MAX,
  FLOOR_COUNT_MIN,
  FORM_CONTROLS,
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
const initialCoverage = Number(params.get("coverage") ?? FORM_CONTROLS.coverageDefault);
const initialSetback = Number(params.get("setback") ?? FORM_CONTROLS.setbackDefault);
const initialTwist = Number(params.get("twist") ?? FORM_CONTROLS.twistDefaultDeg);
const initialOrganic = Number(params.get("organic") ?? FORM_CONTROLS.organicDefault);

app.innerHTML = `
  <div class="form-app">
    <header class="form-bar">
      <strong>Procedural Architecture</strong>
      <span class="grow">Boundary to hollow floors</span>
    </header>
    <aside class="form-side">
      <h1>Design</h1>
      <label class="slider">Coverage <output id="coverage-out"></output>
        <input id="coverage" type="range" min="${FORM_CONTROLS.coverageMin}" max="${FORM_CONTROLS.coverageMax}" step="0.01" value="${initialCoverage}" />
      </label>
      <p class="meta" id="coverage-readout"></p>
      <label class="slider">Setback <output id="setback-out"></output>
        <input id="setback" type="range" min="${FORM_CONTROLS.setbackMin}" max="${FORM_CONTROLS.setbackMax}" step="0.01" value="${initialSetback}" />
      </label>
      <label class="slider">Twist <output id="twist-out"></output>
        <input id="twist" type="range" min="${FORM_CONTROLS.twistMinDeg}" max="${FORM_CONTROLS.twistMaxDeg}" step="1" value="${initialTwist}" />
      </label>
      <label class="slider">Shape <output id="organic-out"></output>
        <input id="organic" type="range" min="${FORM_CONTROLS.organicMin}" max="${FORM_CONTROLS.organicMax}" step="0.01" value="${initialOrganic}" />
      </label>
      <div class="row">
        <label>Floors
          <input id="floors" type="number" min="${FLOOR_COUNT_MIN}" max="${FLOOR_COUNT_MAX}" step="1" value="${initialFloors}" />
        </label>
        <label>Seed
          <input id="seed" type="number" step="1" value="${initialSeed}" />
        </label>
      </div>
      <div class="row">
        <button type="button" id="regenerate">New seed</button>
        <button type="button" id="view-model" aria-pressed="true">Model</button>
        <button type="button" id="view-plan" aria-pressed="false">Plan</button>
      </div>
      <p class="meta">Plan shows one floor from above. Model restores every cap.</p>
      <div class="row" id="plan-floors"></div>
      <h1>Site boundary</h1>
      <p>Click corners in metres. East is right, north is up. Click the first corner to close.</p>
      <canvas class="board" id="board" width="680" height="360"></canvas>
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
      <p class="status" id="form-status"></p>
      <p>Coverage is the target share of the site, from 18% to 100%. The outline may be touched. Setback 0 keeps the same plate; 1 steps back hard. Twist is degrees per level. Shape 0 is a rectangle and 1 rounds corners, with at most ${FORM_CONTROLS.maxCornerSegments} segments on a corner. If that shape cannot reach the target, the plate follows the outline and the page shows target and actual. Floor height ${FORM_DESIGN.floorHeightM} m, slab ${FORM_DESIGN.slabThicknessM} m, and wall ${FORM_DESIGN.wallThicknessM} m are design choices. Sites under ${FORM_SUPPORT.minSiteAreaM2} m² or sides under ${FORM_SUPPORT.minSiteEdgeM} m are outside what this editor supports, not a zoning rule.</p>
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
let planFloor: number | null = null;
let viewMode: "model" | "plan" = "model";

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

for (const id of ["coverage", "setback", "twist", "organic"]) {
  document.querySelector(`#${id}`)?.addEventListener("input", () => rebuild());
}

const planRow = document.querySelector("#plan-floors");
function renderPlanFloors(form: BuildingForm | null): void {
  if (!(planRow instanceof HTMLElement)) return;
  planRow.replaceChildren();
  if (!form) return;
  const closed = document.createElement("button");
  closed.type = "button";
  closed.textContent = "Closed";
  closed.setAttribute("aria-pressed", viewMode === "plan" && planFloor === null ? "true" : "false");
  closed.addEventListener("click", () => {
    viewMode = "plan";
    planFloor = null;
    if (currentForm) frameCamera(currentForm, false);
    applyVisibility();
    renderPlanFloors(form);
  });
  planRow.append(closed);
  for (const floor of form.floors) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = floor.id;
    button.setAttribute("aria-pressed", viewMode === "plan" && planFloor === floor.index ? "true" : "false");
    button.addEventListener("click", () => {
      viewMode = "plan";
      planFloor = floor.index;
      if (currentForm) frameCamera(currentForm, false);
      applyVisibility();
      renderPlanFloors(form);
    });
    planRow.append(button);
  }
}

const renderer = new WebGLRenderer({ canvas: viewCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color("#1a1b1f"));
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 400);
camera.position.set(24, 18, 28);
const controls = new OrbitControls(camera, viewCanvas);
controls.target.set(8, 4, 8);
controls.enableDamping = true;
controls.update();

const ambient = new AmbientLight("#d9d3c8", 0.24);
scene.add(ambient);
scene.add(new HemisphereLight("#f4efe6", "#2a2824", 0.48));
const sun = new DirectionalLight("#fff6ea", 1.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
const fill = new DirectionalLight("#e4ddd2", 0.32);
scene.add(fill);
scene.add(fill.target);

const building = new Group();
scene.add(building);

const STONE = ["#e7e0d4", "#ddd4c8", "#efe6da", "#e3d9cc", "#e9e1d4"];
const SLABS = ["#f3ece2", "#ebe3d6", "#f6efe4", "#e8dfd2", "#f0e7da"];

interface FloorTag {
  kind: "slab" | "wall" | "cap";
  floor: number;
  south: boolean;
}

function floorTag(mesh: Mesh): FloorTag | null {
  const data: unknown = mesh.userData;
  if (typeof data !== "object" || data === null) return null;
  if (!("kind" in data) || !("floor" in data) || !("south" in data)) return null;
  const { kind, floor, south } = data as { kind: unknown; floor: unknown; south: unknown };
  if ((kind === "slab" || kind === "wall" || kind === "cap") && typeof floor === "number" && typeof south === "boolean") {
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
  const loop = new LineLoop(outlineGeometry, new MeshBasicMaterial({ color: "#c8c2b8" }));
  building.add(loop);

  const geometry = buildFormGeometry(form);
  geometry.forEach((floor, index) => {
    const wallMaterial = new MeshStandardMaterial({
      color: STONE[index % STONE.length],
      roughness: 0.88,
      metalness: 0,
    });
    const slabMaterial = new MeshStandardMaterial({
      color: SLABS[index % SLABS.length],
      roughness: 0.9,
      metalness: 0,
    });
    building.add(meshFrom(floor.slab, slabMaterial, { kind: "slab", floor: index, south: false }));
    for (const wall of floor.walls) {
      building.add(
        meshFrom(wall.mesh, wallMaterial, { kind: "wall", floor: index, south: wall.south }),
      );
    }
    if (floor.cap) {
      const capMaterial = new MeshStandardMaterial({
        color: floor.capRole === "terrace" ? "#efe6d8" : "#d9d0c2",
        roughness: 0.9,
        metalness: 0,
      });
      const capMesh = meshFrom(floor.cap, capMaterial, { kind: "cap", floor: index, south: false });
      capMesh.castShadow = false;
      building.add(capMesh);
    }
  });
  applyVisibility();
  frameCamera(form, false);
  renderPlanFloors(form);
}

function applyVisibility(): void {
  sun.castShadow = viewMode === "model";
  ambient.intensity = viewMode === "plan" ? 0.72 : 0.24;
  for (const child of building.children) {
    if (!(child instanceof Mesh)) continue;
    const tagged = floorTag(child);
    if (!tagged) continue;
    if (viewMode === "model" || planFloor === null) {
      child.visible = true;
      continue;
    }
    if (tagged.floor > planFloor) child.visible = false;
    else if (tagged.floor === planFloor && tagged.kind === "cap") child.visible = false;
    else child.visible = true;
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
  if (viewMode === "plan") {
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
  northTag.hidden = viewMode !== "plan";
  const modelButton = document.querySelector("#view-model");
  const planButton = document.querySelector("#view-plan");
  if (modelButton instanceof HTMLButtonElement) modelButton.setAttribute("aria-pressed", viewMode === "model" ? "true" : "false");
  if (planButton instanceof HTMLButtonElement) planButton.setAttribute("aria-pressed", viewMode === "plan" ? "true" : "false");
}

function frameCamera(form: BuildingForm, keepDirection: boolean): void {
  if (keepDirection && camera.position.distanceTo(controls.target) > 0.5) {
    applyFrame(
      form,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      { x: camera.up.x, y: camera.up.y, z: camera.up.z },
      viewMode === "plan",
    );
    return;
  }
  const view = canonicalView(form);
  applyFrame(form, view.eye, view.target, view.up, view.mirrorX);
}

document.querySelector("#view-model")?.addEventListener("click", () => {
  viewMode = "model";
  planFloor = null;
  if (currentForm) {
    frameCamera(currentForm, false);
    applyVisibility();
    renderPlanFloors(currentForm);
  }
});
document.querySelector("#view-plan")?.addEventListener("click", () => {
  viewMode = "plan";
  if (planFloor === null && currentForm) planFloor = currentForm.floors.length - 1;
  if (currentForm) {
    frameCamera(currentForm, false);
    applyVisibility();
    renderPlanFloors(currentForm);
  }
});

function resize(): void {
  const width = viewCanvas.clientWidth || viewCanvas.getBoundingClientRect().width || 1;
  const height = viewCanvas.clientHeight || viewCanvas.getBoundingClientRect().height || 1;
  renderer.setSize(width, height, false);
  if (currentForm) frameCamera(currentForm, true);
  drawBoard();
}

function setCoverageReadout(target: number | null, actual: number | null): void {
  const readout = document.querySelector("#coverage-readout");
  if (!(readout instanceof HTMLElement)) return;
  if (target === null || actual === null) {
    readout.textContent = "";
    return;
  }
  readout.textContent = `Target ${Math.round(target * 100)}%. Actual ${Math.round(actual * 100)}%.`;
}

function setStatus(text: string, ok: boolean): void {
  statusEl.textContent = text;
  statusEl.className = ok ? "status ok" : "status bad";
  statusEl.dataset.floors = ok ? String(currentForm?.floorCount ?? "") : "0";
}

function readControl(id: string, fallback: number): number {
  const node = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-out`);
  const value = node instanceof HTMLInputElement ? Number(node.value) : fallback;
  if (output instanceof HTMLElement) {
    if (id === "twist") output.textContent = `${Math.round(value)}°`;
    else if (id === "coverage") output.textContent = `${Math.round(value * 100)}%`;
    else if (id === "organic") output.textContent = value < 0.02 ? "0 box" : value > 0.98 ? "1 round" : value.toFixed(2);
    else output.textContent = value.toFixed(2);
  }
  return value;
}

function rebuild(): void {
  drawBoard();
  const coverage = readControl("coverage", FORM_CONTROLS.coverageDefault);
  const setback = readControl("setback", FORM_CONTROLS.setbackDefault);
  const twistDeg = readControl("twist", FORM_CONTROLS.twistDefaultDeg);
  const organic = readControl("organic", FORM_CONTROLS.organicDefault);
  if (!closed) {
    clearBuilding();
    currentForm = null;
    renderPlanFloors(null);
    setCoverageReadout(null, null);
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
    renderPlanFloors(null);
    setCoverageReadout(null, null);
    setStatus(boundary.issues.join(" "), false);
    return;
  }
  const floors = validateFloorCount(Number(floorsInput.value));
  if (!floors.ok) {
    clearBuilding();
    currentForm = null;
    renderPlanFloors(null);
    setCoverageReadout(null, null);
    setStatus(floors.issues.join(" "), false);
    return;
  }
  const seed = Number(seedInput.value);
  const result = generateForm({
    boundary: points,
    floors: floors.floors,
    seed,
    controls: { coverage, setback, twistDeg, organic },
  });
  if (!result.ok) {
    clearBuilding();
    currentForm = null;
    renderPlanFloors(null);
    setCoverageReadout(coverage, null);
    setStatus(result.issues.join(" "), false);
    return;
  }
  showForm(result.form);
  const varied = new Set(result.form.floors.map((floor) => JSON.stringify(floor.outer))).size;
  const repeated = result.form.floors.filter((floor) => floor.index > 0 && !floor.stepped).length;
  setCoverageReadout(result.form.coverageTarget, result.form.coverageActual);
  const limitText = result.form.limits.length > 0 ? ` ${result.form.limits.join(" ")}` : "";
  setStatus(
    `${result.form.floorCount} closed ${result.form.floorCount === 1 ? "floor" : "floors"}, seed ${result.form.seed}. ${varied} distinct plate${varied === 1 ? "" : "s"}.${repeated ? ` ${repeated} level${repeated === 1 ? "" : "s"} repeat the plate below.` : ""}${limitText}`,
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

if (params.get("view") === "plan") {
  viewMode = "plan";
  const requested = Number(params.get("planFloor") ?? "0");
  planFloor = Number.isInteger(requested) ? requested : 0;
}

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
