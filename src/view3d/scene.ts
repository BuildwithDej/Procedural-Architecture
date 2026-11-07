import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { doorSwingXZ, pointOnWall, type Aabb } from "../model/geometry.ts";
import type { Room } from "../model/types.ts";
import { frontWalls, presentationGlass, presentationSolids, type FrontPair } from "./cutaway.ts";
import { dimensionGuides } from "./dimensions.ts";
import { frameOrthographic, orthoBounds, PROJECTION } from "./frame.ts";

const WORKSPACE = "#1a1b1f";

export interface RoomViewport {
  readonly projection: typeof PROJECTION;
  show(room: Room): void;
  clear(): void;
  resize(): void;
  dispose(): void;
}

function floorTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }
  const gradient = context.createRadialGradient(256, 236, 20, 256, 256, 360);
  gradient.addColorStop(0, "#f4efe6");
  gradient.addColorStop(0.38, "#e3d9cc");
  gradient.addColorStop(0.74, "#cfc3b4");
  gradient.addColorStop(1, "#b3a594");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function labelSprite(text: string, worldHeight: number): Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fontSize = 64;
  const font = `500 ${fontSize}px "Instrument Sans", sans-serif`;
  if (!context) return new Sprite();
  context.font = font;
  const measured = context.measureText(text);
  const pad = 18;
  canvas.width = Math.ceil(measured.width + pad * 2);
  canvas.height = Math.ceil(fontSize * 1.35);
  context.font = font;
  context.fillStyle = "#f3f3f5";
  context.textBaseline = "middle";
  context.fillText(text, pad, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  sprite.renderOrder = 4;
  return sprite;
}

function addBox(
  group: Group,
  box: Aabb,
  material: MeshStandardMaterial,
  shadows: "both" | "receive" | "none",
): void {
  const sizeX = box.max[0] - box.min[0];
  const sizeY = box.max[1] - box.min[1];
  const sizeZ = box.max[2] - box.min[2];
  const mesh = new Mesh(new BoxGeometry(sizeX, sizeY, sizeZ), material);
  mesh.position.set(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );
  mesh.castShadow = shadows === "both";
  mesh.receiveShadow = shadows === "both" || shadows === "receive";
  group.add(mesh);
}

function disposeGroup(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof Group) {
      disposeGroup(child);
      continue;
    }
    if (child instanceof Mesh || child instanceof LineSegments) {
      child.geometry.dispose();
    }
    if (child instanceof Sprite) {
      const material = child.material;
      if (material instanceof SpriteMaterial) {
        material.map?.dispose();
        material.dispose();
      }
    }
  }
}

export function createRoomViewport(
  canvas: HTMLCanvasElement,
  onZoom: (zoom: number) => void,
): RoomViewport {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(new Color(WORKSPACE), 1);

  const scene = new Scene();
  scene.background = new Color(WORKSPACE);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = false;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  controls.addEventListener("change", () => {
    onZoom(camera.zoom);
    if (cutawayReady) refreshCutaway();
  });

  const lightTarget = new Object3D();
  scene.add(lightTarget);
  scene.add(new HemisphereLight(0xf4efe6, 0x3a342e, 0.38));
  scene.add(new AmbientLight(0xe7dfd4, 0.1));
  const key = new DirectionalLight(0xfff3e4, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.target = lightTarget;
  scene.add(key);
  const fill = new DirectionalLight(0xd7e0ea, 0.42);
  fill.target = lightTarget;
  scene.add(fill);

  const wallMaterial = new MeshStandardMaterial({
    color: 0xe4ddd4,
    roughness: 0.94,
    metalness: 0,
  });
  const floorMaterial = new MeshStandardMaterial({
    map: floorTexture(),
    roughness: 0.98,
    metalness: 0,
  });
  const glassMaterial = new MeshStandardMaterial({
    color: 0xc5d5de,
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    side: DoubleSide,
    depthWrite: false,
  });
  const lineMaterial = new LineBasicMaterial({ color: 0xd5d5dc });
  const swingMaterial = new LineBasicMaterial({ color: 0x8d847a });

  const roomGroup = new Group();
  const shellGroup = new Group();
  roomGroup.add(shellGroup);
  scene.add(roomGroup);

  let room: Room | null = null;
  let front: FrontPair | null = null;
  let cutawayReady = false;
  let stopped = false;

  const aimLights = (current: Room): void => {
    const span = Math.max(current.width, current.depth, current.height);
    const targetX = current.width / 2;
    const targetY = current.height * 0.34;
    const targetZ = current.depth / 2;
    lightTarget.position.set(targetX, targetY, targetZ);
    lightTarget.updateMatrixWorld();
    key.position.set(targetX - span * 1.2, targetY + span * 1.9, targetZ - span * 0.9);
    fill.position.set(targetX + span * 0.95, targetY + span * 0.7, targetZ + span * 0.75);
    const shadowCamera = key.shadow.camera;
    const half = span * 1.7;
    shadowCamera.left = -half;
    shadowCamera.right = half;
    shadowCamera.top = half;
    shadowCamera.bottom = -half;
    shadowCamera.near = Math.max(0.05, span * 0.04);
    shadowCamera.far = span * 8;
    shadowCamera.updateProjectionMatrix();
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = Math.min(0.06, Math.max(0.012, span * 0.004));
  };

  const rebuildShell = (): void => {
    if (!room || !front) return;
    disposeGroup(shellGroup);
    for (const solid of presentationSolids(room, front)) {
      addBox(shellGroup, solid, wallMaterial, "both");
    }
    for (const pane of presentationGlass(room, front)) {
      addBox(shellGroup, pane, glassMaterial, "none");
    }
  };

  const refreshCutaway = (): void => {
    if (!room) return;
    const next = frontWalls(room, { x: camera.position.x, z: camera.position.z }, front);
    if (front && next[0] === front[0] && next[1] === front[1]) return;
    front = next;
    rebuildShell();
  };

  const resize = (): void => {
    const host = canvas.parentElement ?? canvas;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    if (!room) return;
    const zoom = camera.zoom;
    const frame = frameOrthographic(room, width / height);
    const bounds = orthoBounds(frame.frustumHeight, width / height);
    camera.left = bounds.left;
    camera.right = bounds.right;
    camera.top = bounds.top;
    camera.bottom = bounds.bottom;
    camera.near = frame.near;
    camera.far = frame.far;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  };

  const frameRoom = (): void => {
    if (!room) return;
    const host = canvas.parentElement ?? canvas;
    const width = Math.max(host.clientWidth, 2);
    const height = Math.max(host.clientHeight, 2);
    const frame = frameOrthographic(room, width / height);
    const bounds = orthoBounds(frame.frustumHeight, width / height);
    camera.left = bounds.left;
    camera.right = bounds.right;
    camera.top = bounds.top;
    camera.bottom = bounds.bottom;
    camera.near = frame.near;
    camera.far = frame.far;
    camera.zoom = 1;
    camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
    camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
    controls.target.set(frame.target[0], frame.target[1], frame.target[2]);
    controls.minDistance = frame.minDistance;
    controls.maxDistance = frame.maxDistance;
    controls.minZoom = frame.minZoom;
    controls.maxZoom = frame.maxZoom;
    controls.update();
    camera.updateProjectionMatrix();
    onZoom(camera.zoom);
  };

  const show = (next: Room): void => {
    cutawayReady = false;
    room = next;
    front = null;
    disposeGroup(roomGroup);
    roomGroup.add(shellGroup);
    aimLights(next);
    const span = Math.max(next.width, next.depth, next.height);

    const floor = new Mesh(new BoxGeometry(next.width, 0.04, next.depth), floorMaterial);
    floor.position.set(next.width / 2, -0.025, next.depth / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    const swingPositions: number[] = [];
    for (const door of next.doors) {
      const arc = doorSwingXZ(door, next);
      const hinge = pointOnWall(next, door.wall, door.position, 0);
      const open = arc[arc.length - 1];
      if (open) swingPositions.push(hinge.x, 0.015, hinge.z, open.x, 0.015, open.z);
      for (let i = 1; i < arc.length; i += 1) {
        const previous = arc[i - 1];
        const current = arc[i];
        if (!previous || !current) continue;
        swingPositions.push(previous.x, 0.015, previous.z, current.x, 0.015, current.z);
      }
    }
    if (swingPositions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(swingPositions, 3));
      roomGroup.add(new LineSegments(geometry, swingMaterial));
    }

    const guidePositions: number[] = [];
    const guides = dimensionGuides(next);
    for (const guide of guides) {
      for (const segment of guide.segments) {
        guidePositions.push(
          segment.from[0],
          segment.from[1],
          segment.from[2],
          segment.to[0],
          segment.to[1],
          segment.to[2],
        );
      }
      const sprite = labelSprite(guide.label, span * 0.062);
      sprite.position.set(guide.labelAt[0], guide.labelAt[1] + span * 0.01, guide.labelAt[2]);
      roomGroup.add(sprite);
    }
    if (guidePositions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(guidePositions, 3));
      roomGroup.add(new LineSegments(geometry, lineMaterial));
    }

    resize();
    frameRoom();
    refreshCutaway();
    cutawayReady = true;
  };

  const clear = (): void => {
    cutawayReady = false;
    room = null;
    front = null;
    disposeGroup(roomGroup);
    roomGroup.add(shellGroup);
  };

  const tick = (): void => {
    if (stopped) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas.parentElement ?? canvas);

  return {
    projection: PROJECTION,
    show,
    clear,
    resize,
    dispose: () => {
      stopped = true;
      observer.disconnect();
      controls.dispose();
      disposeGroup(roomGroup);
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      wallMaterial.dispose();
      glassMaterial.dispose();
      lineMaterial.dispose();
      swingMaterial.dispose();
      renderer.dispose();
    },
  };
}
