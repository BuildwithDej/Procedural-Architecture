import { presets, type RoomPreset } from "../model/examples.ts";
import { formatInput } from "../model/format.ts";
import { applyDimensionText } from "../model/parse.ts";
import { projectPlan } from "../plan/project.ts";
import type { Issue, Room } from "../model/types.ts";
import { createRoomViewport, type RoomViewport } from "../view3d/scene.ts";
import { renderPlan } from "./planSvg.ts";

function field(name: string, label: string): HTMLLabelElement {
  const row = document.createElement("label");
  row.className = "row";
  row.dataset.field = name;
  const caption = document.createElement("span");
  caption.textContent = label;
  const value = document.createElement("span");
  value.className = "value";
  const input = document.createElement("input");
  input.name = name;
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", `${label} in metres`);
  const unit = document.createElement("span");
  unit.className = "unit";
  unit.textContent = "m";
  value.append(input, unit);
  row.append(caption, value);
  return row;
}

export function mountApp(root: HTMLElement): void {
  const example = presets[0];
  if (!example) throw new Error("The example room is missing.");

  root.replaceChildren();
  const shell = document.createElement("div");
  shell.className = "app";
  shell.dataset.state = "ready";
  shell.dataset.camera = "orthographic";

  const bar = document.createElement("header");
  bar.className = "topbar";
  const mark = document.createElement("p");
  mark.className = "mark";
  mark.textContent = "Room study";
  const roomTitle = document.createElement("p");
  roomTitle.className = "room-title";
  const milestone = document.createElement("p");
  milestone.className = "milestone";
  milestone.textContent = "Milestone 1";
  const trail = document.createElement("div");
  trail.className = "top-links";
  const assetLink = document.createElement("a");
  assetLink.className = "asset-link";
  assetLink.href = "/asset-preview.html";
  assetLink.textContent = "Asset preview";
  trail.append(assetLink, milestone);
  bar.append(mark, roomTitle, trail);

  const inspector = document.createElement("aside");
  inspector.className = "inspector";
  const heading = document.createElement("h1");
  heading.textContent = "Dimensions";
  const form = document.createElement("form");
  form.id = "dimensions";
  const widthRow = field("width", "Width");
  const depthRow = field("depth", "Depth");
  const heightRow = field("height", "Height");
  form.append(widthRow, depthRow, heightRow);
  const note = document.createElement("p");
  note.className = "edit-note";
  note.textContent = "Edit dimensions to update both views";
  const presetRow = document.createElement("div");
  presetRow.className = "presets";
  presetRow.setAttribute("role", "group");
  presetRow.setAttribute("aria-label", "Demonstration sizes");
  const issues = document.createElement("div");
  issues.className = "issues";
  issues.setAttribute("role", "alert");
  inspector.append(heading, form, note, presetRow, issues);

  const workspace = document.createElement("main");
  workspace.className = "workspace";
  const canvas = document.createElement("canvas");
  canvas.className = "view";
  canvas.dataset.camera = "orthographic";
  const planCard = document.createElement("section");
  planCard.className = "plan-card";
  planCard.setAttribute("aria-label", "Plan");
  const planSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  planSvg.classList.add("plan-svg");
  planSvg.setAttribute("role", "img");
  const planMessage = document.createElement("p");
  planMessage.className = "plan-message";
  planMessage.hidden = true;
  planCard.append(planSvg, planMessage);
  const hint = document.createElement("p");
  hint.className = "orbit-hint";
  hint.textContent = "Drag to orbit · Scroll to zoom";
  const workspaceMessage = document.createElement("p");
  workspaceMessage.className = "workspace-message";
  workspaceMessage.hidden = true;
  workspace.append(canvas, planCard, hint, workspaceMessage);

  shell.append(bar, inspector, workspace);
  root.append(shell);

  const inputs = {
    width: widthRow.querySelector("input") as HTMLInputElement,
    depth: depthRow.querySelector("input") as HTMLInputElement,
    height: heightRow.querySelector("input") as HTMLInputElement,
  };

  let source: Room = example.room;
  let viewport: RoomViewport | null = null;
  try {
    viewport = createRoomViewport(canvas, (zoom) => {
      canvas.dataset.zoom = zoom.toFixed(2);
    });
    canvas.dataset.camera = viewport.projection;
  } catch (error) {
    workspaceMessage.hidden = false;
    workspaceMessage.textContent = "This view needs WebGL, and the browser did not provide it.";
    console.error(error);
  }

  const buttons = new Map<string, HTMLButtonElement>();
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.dataset.preset = preset.id;
    button.setAttribute("aria-pressed", preset.id === example.id ? "true" : "false");
    button.addEventListener("click", () => loadPreset(preset));
    presetRow.append(button);
    buttons.set(preset.id, button);
  }

  function setPressed(id: string | null): void {
    for (const [presetId, button] of buttons) {
      button.setAttribute("aria-pressed", presetId === id ? "true" : "false");
    }
  }

  function showIssues(list: Issue[]): void {
    issues.replaceChildren();
    for (const issue of list) {
      const line = document.createElement("p");
      line.textContent = issue.message;
      issues.append(line);
    }
    for (const row of [widthRow, depthRow, heightRow]) {
      const name = row.dataset.field ?? "";
      const invalid = list.some((issue) => issue.field === name);
      row.classList.toggle("is-invalid", invalid);
      const input = row.querySelector("input");
      if (input) input.setAttribute("aria-invalid", invalid ? "true" : "false");
    }
  }

  function showRoom(room: Room): void {
    shell.dataset.state = "ready";
    roomTitle.textContent = room.name;
    canvas.setAttribute(
      "aria-label",
      `Orthographic view of ${room.name}, ${room.width.toFixed(2)} by ${room.depth.toFixed(2)} by ${room.height.toFixed(2)} metres`,
    );
    showIssues([]);
    planMessage.hidden = true;
    planSvg.classList.remove("is-hidden");
    workspaceMessage.hidden = true;
    renderPlan(planSvg, projectPlan(room), room.name);
    viewport?.show(room);
  }

  function showInvalid(list: Issue[]): void {
    shell.dataset.state = "invalid";
    showIssues(list);
    planSvg.classList.add("is-hidden");
    planSvg.replaceChildren();
    planMessage.hidden = false;
    planMessage.textContent = list[0]?.message ?? "These dimensions cannot be drawn.";
    workspaceMessage.hidden = false;
    workspaceMessage.textContent = "These dimensions cannot be drawn.";
    viewport?.clear();
  }

  function read(): void {
    const result = applyDimensionText(source, {
      width: inputs.width.value,
      depth: inputs.depth.value,
      height: inputs.height.value,
    });
    const matched = presets.find((preset) => sameSize(preset.room, result.ok ? result.room : null) && preset.room.id === source.id);
    setPressed(result.ok && matched ? matched.id : null);
    if (!result.ok) {
      showInvalid(result.issues);
      return;
    }
    showRoom(result.room);
  }

  function loadPreset(preset: RoomPreset): void {
    source = preset.room;
    inputs.width.value = formatInput(preset.room.width);
    inputs.depth.value = formatInput(preset.room.depth);
    inputs.height.value = formatInput(preset.room.height);
    setPressed(preset.id);
    showRoom(preset.room);
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  for (const input of Object.values(inputs)) {
    input.addEventListener("input", () => read());
  }

  loadPreset(example);
}

function sameSize(room: Room, other: Room | null): boolean {
  if (!other) return false;
  return (
    Math.abs(room.width - other.width) < 1e-6 &&
    Math.abs(room.depth - other.depth) < 1e-6 &&
    Math.abs(room.height - other.height) < 1e-6
  );
}
