/** PBR factors for original materials. Textures, when the preview adds them, are procedural. */

export interface MaterialDef {
  id: string;
  hex: string;
  roughness: number;
  metalness: number;
  emissiveHex?: string;
  emissiveIntensity?: number;
}

export const MATERIALS = {
  upholstery: { id: "upholstery", hex: "#d2c0ae", roughness: 0.86, metalness: 0 },
  upholsteryDeep: { id: "upholsteryDeep", hex: "#c4ad98", roughness: 0.88, metalness: 0 },
  sheet: { id: "sheet", hex: "#efe4d6", roughness: 0.9, metalness: 0 },
  duvet: { id: "duvet", hex: "#c9b29e", roughness: 0.92, metalness: 0 },
  pillow: { id: "pillow", hex: "#e7d7c8", roughness: 0.9, metalness: 0 },
  pillowDeep: { id: "pillowDeep", hex: "#cbb49f", roughness: 0.9, metalness: 0 },
  timber: { id: "timber", hex: "#c4a36e", roughness: 0.62, metalness: 0 },
  timberDark: { id: "timberDark", hex: "#8d6b45", roughness: 0.72, metalness: 0 },
  lacquer: { id: "lacquer", hex: "#f3eee7", roughness: 0.42, metalness: 0.02 },
  metalPale: { id: "metalPale", hex: "#ece7e0", roughness: 0.48, metalness: 0.06 },
  metalDark: { id: "metalDark", hex: "#3e3a36", roughness: 0.4, metalness: 0.7 },
  led: {
    id: "led",
    hex: "#ffc9a0",
    roughness: 0.35,
    metalness: 0,
    emissiveHex: "#ff8d42",
    emissiveIntensity: 2.4,
  },
} as const satisfies Record<string, MaterialDef>;

export type MaterialId = keyof typeof MATERIALS;

export function materialDef(id: string): MaterialDef {
  const found = MATERIALS[id as MaterialId];
  if (!found) throw new Error(`Unknown material ${id}`);
  return found;
}
