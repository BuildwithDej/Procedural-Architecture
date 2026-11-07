import { materialDef } from "./materials.ts";
import type { MeshPart } from "./types.ts";

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  return [srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue)];
}

function pad4(bytes: number): number {
  return (4 - (bytes % 4)) % 4;
}

interface View {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target?: number;
}

/** glTF 2.0 binary. Geometry and PBR factors only. Procedural preview textures stay in the page. */
export function encodeGlb(parts: readonly MeshPart[], extras: Record<string, unknown> = {}): Uint8Array {
  const bufferParts: Uint8Array[] = [];
  let byteOffset = 0;
  const bufferViews: View[] = [];
  const accessors: unknown[] = [];
  const meshes: unknown[] = [];
  const nodes: unknown[] = [];
  const materialIndex = new Map<string, number>();
  const materials: unknown[] = [];

  const append = (bytes: Uint8Array, target: number) => {
    const padding = pad4(byteOffset);
    if (padding) bufferParts.push(new Uint8Array(padding));
    byteOffset += padding;
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    bufferParts.push(bytes);
    byteOffset += bytes.byteLength;
    return viewIndex;
  };

  parts.forEach((part) => {
    if (!materialIndex.has(part.material)) {
      const def = materialDef(part.material);
      materialIndex.set(part.material, materials.length);
      const material: Record<string, unknown> = {
        name: def.id,
        pbrMetallicRoughness: {
          baseColorFactor: [...hexToLinear(def.hex), 1],
          metallicFactor: def.metalness,
          roughnessFactor: def.roughness,
        },
      };
      if (def.emissiveHex) {
        const emissive = hexToLinear(def.emissiveHex).map((channel) => channel * Math.min(def.emissiveIntensity ?? 1, 1));
        material.emissiveFactor = emissive;
        material.extras = { emissiveIntensity: def.emissiveIntensity ?? 1 };
      }
      materials.push(material);
    }

    const indexBytes = new Uint8Array(part.indices.buffer, part.indices.byteOffset, part.indices.byteLength);
    const positionBytes = new Uint8Array(part.positions.buffer, part.positions.byteOffset, part.positions.byteLength);
    const normalBytes = new Uint8Array(part.normals.buffer, part.normals.byteOffset, part.normals.byteLength);
    const indexView = append(indexBytes.slice(), 34963);
    const positionView = append(positionBytes.slice(), 34962);
    const normalView = append(normalBytes.slice(), 34962);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < part.positions.length; i += 3) {
      const x = part.positions[i] ?? 0;
      const y = part.positions[i + 1] ?? 0;
      const z = part.positions[i + 2] ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: part.positions.length / 3,
      type: "VEC3",
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: normalView,
      componentType: 5126,
      count: part.normals.length / 3,
      type: "VEC3",
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: 5125,
      count: part.indices.length,
      type: "SCALAR",
    });
    const meshIndex = meshes.length;
    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
          indices: indexAccessor,
          material: materialIndex.get(part.material),
        },
      ],
    });
    nodes.push({ name: part.name, mesh: meshIndex });
  });

  const bin = new Uint8Array(byteOffset);
  let cursor = 0;
  for (const chunk of bufferParts) {
    bin.set(chunk, cursor);
    cursor += chunk.length;
  }

  const json = {
    asset: { version: "2.0", generator: "dej-room library", extras },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPad = pad4(jsonBytes.byteLength);
  const jsonChunk = new Uint8Array(jsonBytes.byteLength + jsonPad);
  jsonChunk.set(jsonBytes, 0);
  jsonChunk.fill(0x20, jsonBytes.byteLength);
  const binPad = pad4(bin.byteLength);
  const total = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength + binPad;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonChunk, 20);
  const binHeader = 20 + jsonChunk.byteLength;
  view.setUint32(binHeader, bin.byteLength + binPad, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(bin, binHeader + 8);
  return out;
}

export function glbJson(glb: Uint8Array): unknown {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB");
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB JSON chunk missing");
  const text = new TextDecoder().decode(glb.slice(20, 20 + jsonLength));
  return JSON.parse(text);
}
