import type { PlanGraphic, PlanPoint, PlanSegment } from "../plan/project.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function segment(line: PlanSegment, className: string): SVGLineElement {
  return el("line", {
    class: className,
    x1: String(line.x1),
    y1: String(line.y1),
    x2: String(line.x2),
    y2: String(line.y2),
  });
}

function pointsAttr(points: PlanPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/** Draws the plan graphic. The graphic already came from the room data. */
export function renderPlan(svg: SVGSVGElement, plan: PlanGraphic, roomName: string): void {
  svg.replaceChildren();
  const box = plan.viewBox;
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  const title = el("title", {});
  title.textContent = `Plan of ${roomName}. Empty room, cut at ${plan.cutHeight.toFixed(2)} m. North is up.`;
  svg.append(title);

  svg.append(
    el("rect", {
      class: "plan-floor",
      x: String(plan.floor.x),
      y: String(plan.floor.y),
      width: String(plan.floor.width),
      height: String(plan.floor.height),
    }),
  );

  for (const wall of plan.walls) {
    svg.append(
      el("rect", {
        class: "plan-wall",
        x: String(wall.x),
        y: String(wall.y),
        width: String(wall.width),
        height: String(wall.height),
      }),
    );
  }

  for (const swing of plan.swings) {
    svg.append(el("polyline", { class: "plan-swing", points: pointsAttr(swing) }));
  }
  for (const leaf of plan.leaves) svg.append(segment(leaf, "plan-swing"));

  for (const window of plan.windows) svg.append(segment(window, "plan-window"));

  for (const dimension of plan.dimensions) {
    for (const line of dimension.segments) svg.append(segment(line, "plan-dim"));
    const text = el("text", {
      class: "plan-label",
      x: String(dimension.labelAt.x),
      y: String(dimension.labelAt.y),
      "font-size": String(plan.fontSize),
    });
    text.textContent = dimension.label;
    svg.append(text);
  }

  svg.append(
    segment(
      {
        x1: plan.north.tail.x,
        y1: plan.north.tail.y,
        x2: plan.north.tip.x,
        y2: plan.north.tip.y,
      },
      "plan-north",
    ),
  );
  const north = el("text", {
    class: "plan-north-label",
    x: String(plan.north.labelAt.x),
    y: String(plan.north.labelAt.y),
    "font-size": String(plan.fontSize),
  });
  north.textContent = "N";
  svg.append(north);
}
