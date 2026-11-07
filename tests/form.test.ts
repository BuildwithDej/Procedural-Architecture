import { describe, expect, it } from "vitest";
import {
  FLOOR_COUNT_MAX,
  FORM_DESIGN,
  FORM_SUPPORT,
  formContainmentIssues,
  generateForm,
  validateBoundary,
  validateFloorCount,
} from "../src/form/generate.ts";
import { FORM_PRESETS } from "../src/form/presets.ts";
import {
  insetPolygon,
  minEdgeLength,
  notchCorner,
  pointInPolygon,
  polygonArea,
  polygonInside,
  segmentInPolygon,
  selfIntersects,
  setbackEdge,
  triangulationCovers,
  type Vec,
} from "../src/form/polygon.ts";
import { buildFormGeometry, type MeshData } from "../src/form/shell.ts";

function triangleNormal(mesh: MeshData, triangle: number): { x: number; y: number; z: number } {
  const base = triangle * 3;
  const read = (index: number) => {
    const vertex = mesh.indices[index] ?? 0;
    return {
      x: mesh.positions[vertex * 3] ?? 0,
      y: mesh.positions[vertex * 3 + 1] ?? 0,
      z: mesh.positions[vertex * 3 + 2] ?? 0,
    };
  };
  const a = read(base);
  const b = read(base + 1);
  const c = read(base + 2);
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const az = b.z - a.z;
  const bx = c.x - a.x;
  const by = c.y - a.y;
  const bz = c.z - a.z;
  const x = ay * bz - az * by;
  const y = az * bx - ax * bz;
  const z = ax * by - ay * bx;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function sparseSamples(a: Vec, b: Vec, steps: number): Vec[] {
  const samples: Vec[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return samples;
}

/** Concave site with a narrow mouth. A straight sample can miss the mouth entirely. */
const NARROW_NOTCH: Vec[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 5.55, y: 10 },
  { x: 5.55, y: 6 },
  { x: 5.15, y: 6 },
  { x: 5.15, y: 10 },
  { x: 0, y: 10 },
];

describe("boundary support", () => {
  it("accepts one to five floors and rejects anything else", () => {
    expect(validateFloorCount(1)).toEqual({ ok: true, floors: 1 });
    expect(validateFloorCount(5)).toEqual({ ok: true, floors: 5 });
    for (const value of [0, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -2]) {
      const result = validateFloorCount(value);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a self-crossing outline", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    expect(selfIntersects(bowtie)).toBe(true);
    const result = validateBoundary(bowtie);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => /crosses itself|degenerate/.test(issue))).toBe(true);
  });

  it("labels short sides and small sites as editor support, not as a legal ban", () => {
    const short = validateBoundary([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 11.6, y: 8 },
      { x: 11.6, y: 8.3 },
      { x: 0, y: 8 },
    ]);
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.issues.join(" ")).toContain("application limit");
      expect(short.issues.join(" ")).not.toContain("too small for a hollow floor");
    }

    const small = validateBoundary([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ]);
    expect(small.ok).toBe(false);
    if (!small.ok) {
      const text = small.issues.join(" ");
      expect(text).toContain(`${FORM_SUPPORT.minSiteAreaM2}`);
      expect(text).toContain("does not mean a smaller site cannot hold a hollow floor");
      expect(text).not.toContain("too small for a hollow floor");
    }
  });

  it("rejects non-finite corners and coordinates past the editor extent", () => {
    expect(validateBoundary([{ x: 0, y: 0 }, { x: 20, y: Number.NaN }, { x: 20, y: 10 }, { x: 0, y: 10 }]).ok).toBe(false);
    expect(validateBoundary([{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 40 }, { x: 0, y: 40 }]).ok).toBe(false);
  });
});

describe("continuous containment", () => {
  it("rejects an edge that crosses a narrow notch even when uniform samples all land inside", () => {
    const inner: Vec[] = [
      { x: 1, y: 1 },
      { x: 9, y: 1 },
      { x: 9, y: 9 },
      { x: 1, y: 9 },
    ];
    const crossing = inner[2] && inner[3] ? [inner[3], inner[2]] : [];
    const [start, end] = crossing;
    expect(start && end).toBeTruthy();
    if (!start || !end) return;
    for (const steps of [3, 4, 8]) {
      const samples = sparseSamples(start, end, steps);
      expect(samples.every((point) => pointInPolygon(point, NARROW_NOTCH, true))).toBe(true);
    }
    expect(segmentInPolygon(start, end, NARROW_NOTCH)).toBe(false);
    expect(polygonInside(inner, NARROW_NOTCH)).toBe(false);
  });

  it("rejects a collinear run that bridges the mouth of a notch between sample points", () => {
    const start = { x: 0.2, y: 10 };
    const end = { x: 9.8, y: 10 };
    const samples = sparseSamples(start, end, 4);
    expect(samples.every((point) => pointInPolygon(point, NARROW_NOTCH, true))).toBe(true);
    expect(segmentInPolygon(start, end, NARROW_NOTCH)).toBe(false);
  });

  it("keeps an inset and a setback inside the source polygon", () => {
    const rect = FORM_PRESETS.rectangle;
    if (!rect) return;
    const inset = insetPolygon(rect, 0.4);
    expect(inset).not.toBeNull();
    if (!inset) return;
    expect(polygonInside(inset, rect)).toBe(true);
    expect(polygonArea(inset)).toBeLessThan(polygonArea(rect));
    expect(selfIntersects(inset)).toBe(false);

    const setback = setbackEdge(rect, 0, 1.2);
    expect(setback).not.toBeNull();
    if (!setback) return;
    expect(polygonInside(setback, rect)).toBe(true);
    expect(selfIntersects(setback)).toBe(false);
    expect(triangulationCovers(setback)).toBe(true);

    const notch = notchCorner(rect, 1, 4, 3);
    expect(notch).not.toBeNull();
    if (!notch) return;
    expect(notch.length).toBeGreaterThan(rect.length);
    expect(polygonInside(notch, rect)).toBe(true);
    expect(selfIntersects(notch)).toBe(false);
  });
});

describe("hollow form", () => {
  it("builds one and five distinct hollow floors inside a concave notch", () => {
    const notch = FORM_PRESETS.notch;
    if (!notch) throw new Error("missing notch");
    for (const floors of [1, 5]) {
      const result = generateForm({ boundary: notch, floors, seed: 4 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.form.floorCount).toBe(floors);
      expect(result.form.floors).toHaveLength(floors);
      expect(formContainmentIssues(result.form)).toEqual([]);
      expect(polygonArea(result.form.floors[0]?.outer ?? [])).toBeLessThan(polygonArea(result.form.site) * 0.62);
      expect(result.form.roof.id).toBe("roof");
      expect(result.form.roof.elevationM).toBe((floors - 1) * FORM_DESIGN.floorHeightM + FORM_DESIGN.floorHeightM);
      const elevations = result.form.floors.map((floor) => floor.elevationM);
      expect(new Set(elevations).size).toBe(floors);
      result.form.floors.forEach((floor, index) => {
        expect(floor.id).toBe(`floor-${index + 1}`);
        expect(floor.slab.id).toBe(`${floor.id}-slab`);
        expect(floor.walls.map((wall) => wall.id)).toEqual(floor.outer.map((_, edge) => `${floor.id}-wall-${edge}`));
        expect(floor.elevationM).toBe(index * FORM_DESIGN.floorHeightM);
        expect(floor.wallThicknessM).toBe(FORM_DESIGN.wallThicknessM);
        expect(floor.outer.length).toBe(floor.interior.length);
        expect(polygonArea(floor.interior)).toBeGreaterThanOrEqual(FORM_DESIGN.minInteriorAreaM2);
        expect(polygonInside(floor.outer, result.form.site)).toBe(true);
        expect(polygonInside(floor.interior, floor.outer)).toBe(true);
        expect(minEdgeLength(floor.outer)).toBeGreaterThan(0.2);
      });
      const geometry = buildFormGeometry(result.form);
      expect(geometry).toHaveLength(floors);
      geometry.forEach((floor, index) => {
        expect(floor.walls.length).toBeGreaterThan(2);
        expect(floor.roof === null).toBe(index !== floors - 1);
        if (floor.roof) expect(triangleNormal(floor.roof, 0).y).toBeGreaterThan(0.5);
        expect(floor.walls.length).toBe(result.form.floors[index]?.outer.length);
        for (const wall of floor.walls) {
          expect(wall.mesh.indices.length).toBe(18);
          const outer = triangleNormal(wall.mesh, 0);
          const inner = triangleNormal(wall.mesh, 2);
          const top = triangleNormal(wall.mesh, 4);
          expect(outer.x * wall.outward.x + outer.z * wall.outward.y).toBeGreaterThan(0.5);
          expect(inner.x * -wall.outward.x + inner.z * -wall.outward.y).toBeGreaterThan(0.5);
          expect(top.y).toBeGreaterThan(0.5);
        }
        const positions = [
          ...floor.slab.positions,
          ...floor.walls.flatMap((wall) => wall.mesh.positions),
          ...(floor.roof?.positions ?? []),
        ];
        for (let i = 0; i < positions.length; i += 3) {
          const point = { x: positions[i] ?? 0, y: positions[i + 2] ?? 0 };
          expect(pointInPolygon(point, result.form.site, true)).toBe(true);
        }
      });
    }
  });

  it("is deterministic for the same seed and varies across seeds", () => {
    const ell = FORM_PRESETS.ell;
    if (!ell) throw new Error("missing ell");
    const first = generateForm({ boundary: ell, floors: 4, seed: 11 });
    const repeat = generateForm({ boundary: ell, floors: 4, seed: 11 });
    expect(first.ok && repeat.ok).toBe(true);
    if (!first.ok || !repeat.ok) return;
    expect(JSON.stringify(first.form.floors)).toBe(JSON.stringify(repeat.form.floors));

    const signatures = new Set<string>();
    for (let seed = 1; seed <= 8; seed += 1) {
      const result = generateForm({ boundary: ell, floors: 5, seed });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(formContainmentIssues(result.form)).toEqual([]);
      expect(result.form.floors.length).toBe(FLOOR_COUNT_MAX);
      signatures.add(result.form.floors.map((floor) => JSON.stringify(floor.outer)).join("|"));
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("stays inside a rotated quadrilateral and a long narrow court", () => {
    const rotated = [
      { x: 2, y: 1 },
      { x: 18, y: 3 },
      { x: 16, y: 15 },
      { x: 1, y: 11 },
    ];
    const skinny = [
      { x: 0, y: 0 },
      { x: 22, y: 0 },
      { x: 22, y: 3.2 },
      { x: 0, y: 3.2 },
    ];
    for (const boundary of [rotated, skinny, FORM_PRESETS.skew, FORM_PRESETS.rectangle]) {
      const result = generateForm({ boundary: boundary ?? [], floors: 3, seed: 2 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(formContainmentIssues(result.form)).toEqual([]);
      for (let index = 1; index < result.form.floors.length; index += 1) {
        const lower = result.form.floors[index - 1];
        const upper = result.form.floors[index];
        if (!lower || !upper) continue;
        expect(polygonInside(upper.outer, lower.outer)).toBe(true);
      }
    }
  });

  it("does not build from an invalid outline", () => {
    const result = generateForm({
      boundary: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
      ],
      floors: 3,
      seed: 1,
    });
    expect(result.ok).toBe(false);
  });
});
