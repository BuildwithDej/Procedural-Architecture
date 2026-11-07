/** Plain geometry shared by the preview, the tests, and the GLB export. */

export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshPart {
  name: string;
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface Vec3 {
  readonly 0: number;
  readonly 1: number;
  readonly 2: number;
}
