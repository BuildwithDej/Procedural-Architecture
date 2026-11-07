import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { fitOrthographic, type Vec3 } from "../src/form/frame.ts";
import { FORM_DESIGN, generateForm } from "../src/form/generate.ts";
import { FORM_PRESETS } from "../src/form/presets.ts";

function enclosure(site: readonly { x: number; y: number }[], top: number): Vec3[] {
  const points: Vec3[] = [];
  for (const point of site) {
    points.push({ x: point.x, y: 0, z: point.y });
    points.push({ x: point.x, y: top, z: point.y });
  }
  return points;
}

function project(camera: OrthographicCamera, point: Vec3): Vector3 {
  return new Vector3(point.x, point.y, point.z).project(camera);
}

function applyFit(camera: OrthographicCamera, eye: Vec3, target: Vec3, up: Vec3, fit: ReturnType<typeof fitOrthographic>): void {
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
  camera.updateMatrixWorld();
  void eye;
  void target;
}

describe("orthographic framing", () => {
  it("keeps the site and the full stack inside the view for 1, 3, and 5 floors", () => {
    const notch = FORM_PRESETS.notch;
    const ell = FORM_PRESETS.ell;
    if (!notch || !ell) throw new Error("missing preset");
    const camera = new OrthographicCamera();
    const aspects = [0.55, 1, 1.35, 2.1];
    for (const floors of [1, 3, 5]) {
      const boundary = floors === 1 ? ell : notch;
      const result = generateForm({ boundary, floors, seed: floors === 5 ? 11 : 4 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const top = result.form.roof.elevationM + result.form.roof.thicknessM;
      const points = enclosure(result.form.site, top);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const point of result.form.site) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.y);
        maxZ = Math.max(maxZ, point.y);
      }
      const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
      const span = Math.max(maxX - minX, maxZ - minZ);
      const eye = {
        x: center.x + span * 0.9,
        y: top * 0.55 + span * 0.45,
        z: center.z + span * 1.15,
      };
      const target = { x: center.x, y: top * 0.42, z: center.z };
      const up = { x: 0, y: 1, z: 0 };
      for (const aspect of aspects) {
        const fit = fitOrthographic(eye, target, up, points, aspect);
        applyFit(camera, eye, target, up, fit);
        for (const point of points) {
          const ndc = project(camera, point);
          expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.9);
          expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.9);
          expect(ndc.z).toBeGreaterThanOrEqual(-1);
          expect(ndc.z).toBeLessThanOrEqual(1);
        }
        expect(top).toBe(floors * FORM_DESIGN.floorHeightM + FORM_DESIGN.slabThicknessM);
      }
    }
  });

  it("fits a top view without clipping the outline", () => {
    const notch = FORM_PRESETS.notch;
    if (!notch) throw new Error("missing notch");
    const result = generateForm({ boundary: notch, floors: 5, seed: 11 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const top = result.form.roof.elevationM + result.form.roof.thicknessM;
    const points = enclosure(result.form.site, top);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of result.form.site) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.y);
      maxZ = Math.max(maxZ, point.y);
    }
    const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    const eye = { x: center.x, y: top + 40, z: center.z };
    const target = { x: center.x, y: 0, z: center.z };
    const up = { x: 0, y: 0, z: 1 };
    const camera = new OrthographicCamera();
    const fit = fitOrthographic(eye, target, up, points, 1.4, 1.16, true);
    applyFit(camera, eye, target, up, fit);
    for (const point of points) {
      const ndc = project(camera, point);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.9);
    }
    const east = project(camera, { x: maxX, y: 0, z: center.z });
    const west = project(camera, { x: minX, y: 0, z: center.z });
    const north = project(camera, { x: center.x, y: 0, z: maxZ });
    const south = project(camera, { x: center.x, y: 0, z: minZ });
    expect(east.x).toBeGreaterThan(west.x);
    expect(north.y).toBeGreaterThan(south.y);
  });
});
