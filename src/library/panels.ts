/**
 * Feature-wall modules and the automatic LED run.
 * Modules keep a fixed width. A wider wall adds modules. It does not stretch them.
 * The LED stays centred on the bed group. An edit is an offset, so a later resize
 * can reapply it. This file does not place the bed in a room.
 */

export interface OpeningSpan {
  id: string;
  startM: number;
  endM: number;
}

export interface PanelModule {
  index: number;
  centerM: number;
  widthM: number;
}

export interface LedPlacement {
  centerM: number;
  lengthM: number;
  brightness: number;
  warmth: number;
}

export interface LedEdit {
  id: string;
  centerOffsetM: number;
  lengthScale: number;
  brightness: number;
  warmth: number;
}

export interface LayoutAlternative {
  description: string;
  led?: LedPlacement;
  opening?: OpeningSpan;
}

export interface PanelLayout {
  ok: boolean;
  mode: "bedSurround" | "fullWall";
  targetWidthM: number;
  moduleWidthM: number;
  gapM: number;
  modules: PanelModule[];
  led: LedPlacement | null;
  errors: string[];
  alternatives: LayoutAlternative[];
}

export interface PanelLayoutInput {
  mode: "bedSurround" | "fullWall";
  wallWidthM: number;
  bedGroupWidthM: number;
  moduleWidthM: number;
  gapM: number;
  openings?: readonly OpeningSpan[];
  ledEdit?: LedEdit;
  brightness?: number;
  warmth?: number;
}

const OVERLAP = 0.001;

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > OVERLAP;
}

export function layoutFeatureWall(input: PanelLayoutInput): PanelLayout {
  const errors: string[] = [];
  const alternatives: LayoutAlternative[] = [];
  const moduleWidthM = input.moduleWidthM;
  const gapM = input.gapM;
  if (moduleWidthM <= 0 || gapM < 0 || input.bedGroupWidthM <= 0 || input.wallWidthM <= 0) {
    return {
      ok: false,
      mode: input.mode,
      targetWidthM: 0,
      moduleWidthM,
      gapM,
      modules: [],
      led: null,
      errors: ["Wall, bed group, and module width must be positive."],
      alternatives: [],
    };
  }

  const targetWidthM = input.mode === "fullWall" ? input.wallWidthM : input.bedGroupWidthM;
  let count = 1;
  while (count * moduleWidthM + (count - 1) * gapM < targetWidthM - 1e-6) count += 1;
  const run = count * moduleWidthM + (count - 1) * gapM;
  const start = -run / 2;
  const openings = input.openings ?? [];
  const modules: PanelModule[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = start + index * (moduleWidthM + gapM);
    const right = left + moduleWidthM;
    const blocked = openings.some((opening) => overlaps(left, right, opening.startM, opening.endM));
    if (blocked) continue;
    modules.push({ index, centerM: (left + right) / 2, widthM: moduleWidthM });
  }

  const brightness = input.ledEdit?.brightness ?? input.brightness ?? 1;
  const warmth = input.ledEdit?.warmth ?? input.warmth ?? 0.8;
  const auto: LedPlacement = {
    centerM: 0,
    lengthM: input.bedGroupWidthM,
    brightness,
    warmth,
  };
  const edited: LedPlacement = {
    centerM: auto.centerM + (input.ledEdit?.centerOffsetM ?? 0),
    lengthM: auto.lengthM * (input.ledEdit?.lengthScale ?? 1),
    brightness,
    warmth,
  };
  const halfWall = input.wallWidthM / 2;
  const ledLeft = edited.centerM - edited.lengthM / 2;
  const ledRight = edited.centerM + edited.lengthM / 2;
  const hangsOff = ledLeft < -halfWall - 1e-6 || ledRight > halfWall + 1e-6;
  const crosses = openings.filter((opening) => overlaps(ledLeft, ledRight, opening.startM, opening.endM));

  if (hangsOff) {
    errors.push("The LED run leaves the wall. It was not clipped or moved.");
    alternatives.push({
      description: "Keep the automatic run centred on the bed group.",
      led: auto,
    });
  }
  for (const opening of crosses) {
    errors.push(`The LED run crosses opening ${opening.id}. The opening was left where it is.`);
    const gap = opening.endM - opening.startM;
    alternatives.push({
      description: `Shift opening ${opening.id} just past the lit run.`,
      opening: {
        id: opening.id,
        startM: ledRight + gapM,
        endM: ledRight + gapM + gap,
      },
    });
  }

  return {
    ok: errors.length === 0,
    mode: input.mode,
    targetWidthM,
    moduleWidthM,
    gapM,
    modules,
    led: errors.length === 0 ? edited : null,
    errors,
    alternatives,
  };
}

/** Warmth 0 is a pale amber. Warmth 1 is a deeper tungsten. Not a measured colour temperature. */
export function ledHex(warmth: number): string {
  const t = Math.min(1, Math.max(0, warmth));
  const red = 255;
  const green = Math.round(216 - t * 70);
  const blue = Math.round(176 - t * 110);
  return `#${red.toString(16)}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}
