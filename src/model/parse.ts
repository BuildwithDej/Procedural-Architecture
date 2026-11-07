import type { Door, Issue, Room, Validation, WallId, WindowOpening } from "./types.ts";

const WALLS: readonly WallId[] = ["north", "east", "south", "west"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWall(value: unknown): value is WallId {
  return typeof value === "string" && WALLS.includes(value as WallId);
}

function quoted(raw: string): string {
  return `“${raw}”`;
}

function badNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  return String(value);
}

/**
 * Accepts 4.20, 4,20, and a trailing separator left while typing (4.).
 * Returns null when the text is not a usable length.
 */
export function parseLengthText(
  raw: string,
  label: string,
  field: string,
): { ok: true; value: number } | { ok: false; issue: Issue } {
  const trimmed = raw.trim().replace(/[.,]$/, "");
  if (!trimmed) {
    return {
      ok: false,
      issue: { field, message: `${label} is empty. Enter a length in metres.` },
    };
  }
  if (/^(?:nan|[+-]?infinity)$/i.test(trimmed)) {
    return {
      ok: false,
      issue: {
        field,
        message: `${label} must be a finite number of metres. ${quoted(raw.trim())} cannot be drawn.`,
      },
    };
  }
  const canonical = trimmed.replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(canonical)) {
    return {
      ok: false,
      issue: {
        field,
        message: `${label} must be a number of metres. ${quoted(raw.trim())} is not a number.`,
      },
    };
  }
  const value = Number(canonical);
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      issue: {
        field,
        message: `${label} must be a finite number of metres. ${quoted(raw.trim())} cannot be drawn.`,
      },
    };
  }
  if (!(value > 0)) {
    return {
      ok: false,
      issue: {
        field,
        message: `${label} must be greater than zero metres. ${quoted(raw.trim())} is not a room dimension.`,
      },
    };
  }
  return { ok: true, value };
}

function readPositive(
  value: unknown,
  label: string,
  field: string,
  issues: Issue[],
): number | undefined {
  if (typeof value !== "number") {
    issues.push({ field, message: `${label} must be a number of metres.` });
    return undefined;
  }
  if (!Number.isFinite(value)) {
    issues.push({
      field,
      message: `${label} must be a finite number of metres. ${badNumber(value)} cannot be drawn.`,
    });
    return undefined;
  }
  if (!(value > 0)) {
    issues.push({
      field,
      message: `${label} must be greater than zero metres. ${badNumber(value)} is not a room dimension.`,
    });
    return undefined;
  }
  return value;
}

function readNonNegative(
  value: unknown,
  label: string,
  field: string,
  issues: Issue[],
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ field, message: `${label} must be a finite number of metres.` });
    return undefined;
  }
  if (value < 0) {
    issues.push({
      field,
      message: `${label} cannot be below zero metres. ${badNumber(value)} is below the floor.`,
    });
    return undefined;
  }
  return value;
}

export function wallLength(width: number, depth: number, wall: WallId): number {
  return wall === "north" || wall === "south" ? width : depth;
}

function alongFrom(wall: WallId): string {
  return wall === "north" || wall === "south" ? "west" : "south";
}

function openingNoun(kind: "door" | "window"): string {
  return kind === "door" ? "door" : "window";
}

interface Interval {
  kind: "door" | "window";
  index: number;
  wall: WallId;
  start: number;
  end: number;
}

function checkAlong(
  kind: "door" | "window",
  index: number,
  wall: WallId,
  position: number,
  width: number,
  roomWidth: number,
  roomDepth: number,
  issues: Issue[],
): boolean {
  const field = `${kind}s[${index}]`;
  const noun = openingNoun(kind);
  const length = wallLength(roomWidth, roomDepth, wall);
  let ok = true;
  if (position < 0) {
    ok = false;
    issues.push({
      field,
      message: `The ${noun} on the ${wall} wall cannot start before the wall. Its position is ${position.toFixed(2)} m.`,
    });
  }
  if (position + width > length + 1e-6) {
    ok = false;
    issues.push({
      field,
      message: `The ${noun} on the ${wall} wall starts ${position.toFixed(2)} m from the ${alongFrom(wall)} end and is ${width.toFixed(2)} m wide, past the end of the ${length.toFixed(2)} m wall.`,
    });
  }
  return ok;
}

export function validateRoom(input: unknown): Validation {
  const issues: Issue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ field: "room", message: "Room data must be an object." }],
    };
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!id) issues.push({ field: "id", message: "The room needs an id." });
  if (!name) issues.push({ field: "name", message: "The room needs a name." });

  const width = readPositive(input.width, "Width", "width", issues);
  const depth = readPositive(input.depth, "Depth", "depth", issues);
  const height = readPositive(input.height, "Height", "height", issues);

  if (!Array.isArray(input.doors)) {
    issues.push({ field: "doors", message: "Room data needs a doors list. An empty list is allowed." });
  }
  if (!Array.isArray(input.windows)) {
    issues.push({ field: "windows", message: "Room data needs a windows list. An empty list is allowed." });
  }

  const doors: Door[] = [];
  const windows: WindowOpening[] = [];
  const intervals: Interval[] = [];

  if (Array.isArray(input.doors)) {
    input.doors.forEach((entry, index) => {
      const field = `doors[${index}]`;
      if (!isRecord(entry)) {
        issues.push({ field, message: "Each door must be an object." });
        return;
      }
      if (!isWall(entry.wall)) {
        issues.push({ field, message: "Each door wall must be north, east, south, or west." });
        return;
      }
      const position = readNonNegative(entry.position, "Door position", field, issues);
      const openingWidth = readPositive(entry.width, "Door width", field, issues);
      const openingHeight = readPositive(entry.height, "Door height", field, issues);
      if (
        position === undefined ||
        openingWidth === undefined ||
        openingHeight === undefined ||
        width === undefined ||
        depth === undefined ||
        height === undefined
      ) {
        return;
      }
      const alongOk = checkAlong(
        "door",
        index,
        entry.wall,
        position,
        openingWidth,
        width,
        depth,
        issues,
      );
      if (openingHeight > height + 1e-6) {
        issues.push({
          field,
          message: `The door on the ${entry.wall} wall is ${openingHeight.toFixed(2)} m high, taller than the room at ${height.toFixed(2)} m.`,
        });
        return;
      }
      const door: Door = {
        wall: entry.wall,
        position,
        width: openingWidth,
        height: openingHeight,
      };
      doors.push(door);
      if (alongOk) {
        intervals.push({
          kind: "door",
          index,
          wall: entry.wall,
          start: position,
          end: position + openingWidth,
        });
      }
    });
  }

  if (Array.isArray(input.windows)) {
    input.windows.forEach((entry, index) => {
      const field = `windows[${index}]`;
      if (!isRecord(entry)) {
        issues.push({ field, message: "Each window must be an object." });
        return;
      }
      if (!isWall(entry.wall)) {
        issues.push({ field, message: "Each window wall must be north, east, south, or west." });
        return;
      }
      const position = readNonNegative(entry.position, "Window position", field, issues);
      const openingWidth = readPositive(entry.width, "Window width", field, issues);
      const sill = readNonNegative(entry.sill, "Window sill", field, issues);
      const openingHeight = readPositive(entry.height, "Window height", field, issues);
      if (
        position === undefined ||
        openingWidth === undefined ||
        sill === undefined ||
        openingHeight === undefined ||
        width === undefined ||
        depth === undefined ||
        height === undefined
      ) {
        return;
      }
      const alongOk = checkAlong(
        "window",
        index,
        entry.wall,
        position,
        openingWidth,
        width,
        depth,
        issues,
      );
      if (sill + openingHeight > height + 1e-6) {
        issues.push({
          field,
          message: `The window on the ${entry.wall} wall reaches ${(sill + openingHeight).toFixed(2)} m above the floor, above the ceiling at ${height.toFixed(2)} m.`,
        });
        return;
      }
      windows.push({
        wall: entry.wall,
        position,
        width: openingWidth,
        sill,
        height: openingHeight,
      });
      if (alongOk) {
        intervals.push({
          kind: "window",
          index,
          wall: entry.wall,
          start: position,
          end: position + openingWidth,
        });
      }
    });
  }

  for (const wall of WALLS) {
    const onWall = intervals
      .filter((item) => item.wall === wall)
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < onWall.length; i += 1) {
      const previous = onWall[i - 1];
      const current = onWall[i];
      if (current && previous && current.start < previous.end - 1e-6) {
        issues.push({
          field: `${current.kind}s[${current.index}]`,
          message: `Openings overlap on the ${wall} wall.`,
        });
      }
    }
  }

  if (issues.length > 0 || width === undefined || depth === undefined || height === undefined) {
    return { ok: false, issues };
  }

  const room: Room = { id, name, width, depth, height, doors, windows };
  return { ok: true, room };
}

/** New room from edited dimension text. Openings stay with the source room. */
export function applyDimensionText(
  base: Room,
  raw: { width: string; depth: string; height: string },
): Validation {
  const issues: Issue[] = [];
  const width = parseLengthText(raw.width, "Width", "width");
  const depth = parseLengthText(raw.depth, "Depth", "depth");
  const height = parseLengthText(raw.height, "Height", "height");
  if (!width.ok) issues.push(width.issue);
  if (!depth.ok) issues.push(depth.issue);
  if (!height.ok) issues.push(height.issue);
  if (!width.ok || !depth.ok || !height.ok) return { ok: false, issues };

  return validateRoom({
    ...base,
    width: width.value,
    depth: depth.value,
    height: height.value,
    doors: base.doors.map((door) => ({ ...door })),
    windows: base.windows.map((window) => ({ ...window })),
  });
}
