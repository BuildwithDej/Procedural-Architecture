import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FITS_ROOM, defaultFitRequest, fitFurniture } from "../src/library/fit.ts";
import { frontWalls } from "../src/view3d/cutaway.ts";
import { frameOrthographic } from "../src/view3d/frame.ts";
import { frameTopDown } from "../src/view3d/topView.ts";

function apply(frame: ReturnType<typeof frameTopDown>): OrthographicCamera {
  const camera = new OrthographicCamera(frame.left, frame.right, frame.top, frame.bottom, frame.near, frame.far);
  camera.up.set(frame.up[0], frame.up[1], frame.up[2]);
  camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
  camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

describe("top camera", () => {
  it("puts north above south and keeps the room inside the frame", () => {
    const frame = frameTopDown(FITS_ROOM, 300 / 220);
    const camera = apply(frame);
    const north = new Vector3(FITS_ROOM.width / 2, 0.4, FITS_ROOM.depth).project(camera);
    const south = new Vector3(FITS_ROOM.width / 2, 0.4, 0).project(camera);
    const east = new Vector3(FITS_ROOM.width, 0.4, FITS_ROOM.depth / 2).project(camera);
    const west = new Vector3(0, 0.4, FITS_ROOM.depth / 2).project(camera);
    expect(north.y).toBeGreaterThan(south.y);
    expect(east.x).toBeGreaterThan(west.x);
    for (const point of [north, south, east, west]) {
      expect(Math.abs(point.x)).toBeLessThan(0.92);
      expect(Math.abs(point.y)).toBeLessThan(0.92);
    }
    expect(frame.viewWidth / frame.viewHeight).toBeCloseTo(300 / 220, 5);
  });

  it("changes the crop with aspect and does not depend on furniture", () => {
    const wide = frameTopDown(FITS_ROOM, 2);
    const tall = frameTopDown(FITS_ROOM, 0.5);
    expect(wide.viewWidth / wide.viewHeight).toBeCloseTo(2, 5);
    expect(tall.viewWidth / tall.viewHeight).toBeCloseTo(0.5, 5);
    expect(wide.viewWidth).toBeGreaterThanOrEqual(FITS_ROOM.width);
    expect(tall.viewHeight).toBeGreaterThanOrEqual(FITS_ROOM.depth);
    const tiny = { width: 1.8, depth: 1.5, height: 2.2 };
    const bare = frameTopDown(tiny, 1);
    const again = frameTopDown(tiny, 1);
    expect(bare.viewWidth).toBe(again.viewWidth);
    expect(bare.position[0]).toBeCloseTo(tiny.width / 2, 6);
    expect(bare.position[2]).toBeCloseTo(tiny.depth / 2, 6);
  });

  it("does not share projection state with the orbit camera", () => {
    const top = apply(frameTopDown(FITS_ROOM, 1.2));
    const orbitFrame = frameOrthographic(FITS_ROOM, 1.2);
    const orbit = new OrthographicCamera(-1, 1, 1, -1, orbitFrame.near, orbitFrame.far);
    orbit.position.set(orbitFrame.position[0], orbitFrame.position[1], orbitFrame.position[2]);
    orbit.lookAt(orbitFrame.target[0], orbitFrame.target[1], orbitFrame.target[2]);
    orbit.zoom = 2.5;
    orbit.updateProjectionMatrix();
    const before = top.projectionMatrix.clone();
    expect(top.zoom).toBe(1);
    expect(before.equals(top.projectionMatrix)).toBe(true);
    expect(top.position.z).toBeCloseTo(FITS_ROOM.depth / 2, 5);
    expect(orbit.position.z).not.toBeCloseTo(top.position.z, 1);
  });

  it("would choose a different cutaway than the orbit camera, so the top view must not drive it", () => {
    const orbit = frameOrthographic(FITS_ROOM, 1.4);
    const top = frameTopDown(FITS_ROOM, 1.4);
    const fromOrbit = frontWalls(FITS_ROOM, { x: orbit.position[0], z: orbit.position[2] });
    const fromAbove = frontWalls(FITS_ROOM, { x: top.position[0], z: top.position[2] });
    expect(fromOrbit).not.toEqual(fromAbove);
    expect(fromOrbit[0]).toBe("south");
  });

  it("sees the placed desk in the same top frame the inset renders", () => {
    const result = fitFurniture(defaultFitRequest(FITS_ROOM, "north"));
    const desk = result.placed.find((item) => item.id === "desk");
    expect(desk?.wall).toBe("south");
    const camera = apply(frameTopDown(FITS_ROOM, 1));
    const projected = new Vector3(desk?.origin[0] ?? 0, 0.7, desk?.origin[2] ?? 0).project(camera);
    expect(projected.x).toBeGreaterThan(-1);
    expect(projected.x).toBeLessThan(1);
    expect(projected.y).toBeGreaterThan(-1);
    expect(projected.y).toBeGreaterThan(southEdge(camera));
  });
});

function southEdge(camera: OrthographicCamera): number {
  return new Vector3(FITS_ROOM.width / 2, 0.2, 0).project(camera).y;
}