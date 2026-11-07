import { describe, expect, it } from "vitest";
import { presets } from "../src/model/examples.ts";
import { WALL_THICKNESS_M, wallSolids } from "../src/model/geometry.ts";
import { validateRoom } from "../src/model/parse.ts";
import type { Room } from "../src/model/types.ts";
import { aabbToPlanRect, planCutHeight, projectPlan, worldToPlan } from "../src/plan/project.ts";

function example(): Room {
  const room = presets[0]?.room;
  if (!room) throw new Error("example missing");
  return room;
}

function contains(rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean {
  return x >= rect.x - 1e-6 && x <= rect.x + rect.width + 1e-6 && y >= rect.y - 1e-6 && y <= rect.y + rect.height + 1e-6;
}

describe("plan projection", () => {
  it("maps the example corners with north up", () => {
    const plan = projectPlan(example());
    expect(plan.corners.southwest).toEqual({ x: 0, y: 0 });
    expect(plan.corners.southeast).toEqual({ x: 4.2, y: 0 });
    expect(plan.corners.northwest).toEqual({ x: 0, y: -3.6 });
    expect(plan.corners.northeast).toEqual({ x: 4.2, y: -3.6 });
    expect(plan.cutHeight).toBe(1.2);
    expect(plan.dimensions.map((item) => item.label)).toEqual(["4.20 m", "3.60 m"]);
  });

  it("uses the same wall solids as the model, sliced at the cut", () => {
    const room = example();
    const cut = planCutHeight(room);
    const expected = wallSolids(room)
      .filter((box) => box.min[1] < cut && box.max[1] > cut)
      .map(aabbToPlanRect);
    expect(projectPlan(room).walls).toEqual(expected);
  });

  it("leaves the door and window as gaps in an otherwise empty plan", () => {
    const plan = projectPlan(example());
    const door = worldToPlan(0.75, -WALL_THICKNESS_M / 2);
    const window = worldToPlan(1.95, example().depth + WALL_THICKNESS_M / 2);
    expect(plan.walls.some((wall) => contains(wall, door.x, door.y))).toBe(false);
    expect(plan.walls.some((wall) => contains(wall, window.x, window.y))).toBe(false);
    expect(plan.swings).toHaveLength(1);
    expect(plan.windows).toHaveLength(2);
    expect(JSON.stringify(plan)).not.toMatch(/bed|wardrobe|desk|partition/i);
  });

  it("swings the south door into the room", () => {
    const plan = projectPlan(example());
    const leaf = plan.leaves[0];
    expect(leaf).toBeDefined();
    if (!leaf) return;
    const openZ = -leaf.y2;
    expect(openZ).toBeGreaterThan(0.4);
    expect(openZ).toBeLessThan(example().depth);
  });

  it("hides a window the cut does not pass through", () => {
    const result = validateRoom({
      id: "clerestory",
      name: "Clerestory",
      width: 4,
      depth: 3,
      height: 2.7,
      doors: [],
      windows: [{ wall: "north", position: 1, width: 1.2, sill: 1.6, height: 0.6 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = projectPlan(result.room);
    expect(plan.windows).toHaveLength(0);
    const covered = worldToPlan(1.6, result.room.depth + WALL_THICKNESS_M / 2);
    expect(plan.walls.some((wall) => contains(wall, covered.x, covered.y))).toBe(true);
  });

  it("projects tiny and huge rooms without non-finite coordinates", () => {
    for (const preset of presets) {
      const plan = projectPlan(preset.room);
      expect(plan.corners.southeast.x - plan.corners.southwest.x).toBeCloseTo(preset.room.width);
      expect(plan.viewBox.width).toBeGreaterThan(preset.room.width);
      expect(Number.isFinite(plan.viewBox.x + plan.viewBox.y + plan.viewBox.width + plan.viewBox.height)).toBe(true);
    }
  });
});
