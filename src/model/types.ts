/**
 * Coordinates for the one room, in metres.
 *
 * Origin: interior southwest corner, on the finished floor.
 * +X east, along the width.
 * +Y up, along the height.
 * +Z north, along the depth.
 *
 * North and south walls run east–west. Their openings are measured from the
 * west end toward the east. East and west walls run north–south. Their
 * openings are measured from the south end toward the north.
 *
 * Width, depth, and height are interior face to interior face.
 * Wall thickness is a drawing constant, not part of the room data.
 *
 * Door height, window sill, and window height are stored here so the drawing
 * stays driven by data. The short brief named only wall, position, and width.
 *
 * Furniture position and rotation are not chosen yet. Ask before milestone 3.
 */

export type WallId = "north" | "east" | "south" | "west";

export interface Door {
  wall: WallId;
  /** Metres from the wall's start. See the note above. */
  position: number;
  width: number;
  /** Metres from the floor to the head of the opening. */
  height: number;
}

export interface WindowOpening {
  wall: WallId;
  position: number;
  width: number;
  /** Metres from the floor to the sill. */
  sill: number;
  /** Metres from the sill to the head. */
  height: number;
}

export interface Room {
  id: string;
  name: string;
  /** Interior east–west size, metres. */
  width: number;
  /** Interior north–south size, metres. */
  depth: number;
  /** Floor to ceiling, metres. */
  height: number;
  doors: Door[];
  windows: WindowOpening[];
}

export interface Issue {
  field: string;
  message: string;
}

export type Validation =
  | { ok: true; room: Room }
  | { ok: false; issues: Issue[] };
