import exampleBedroomData from "../../data/example-bedroom.json" with { type: "json" };
import hugeRoomData from "../../data/huge-room.json" with { type: "json" };
import tinyRoomData from "../../data/tiny-room.json" with { type: "json" };
import { validateRoom } from "./parse.ts";
import type { Room } from "./types.ts";

function load(data: unknown, source: string): Room {
  const result = validateRoom(data);
  if (!result.ok) {
    const detail = result.issues.map((issue) => issue.message).join(" ");
    throw new Error(`${source} could not be loaded. ${detail}`);
  }
  return result.room;
}

export interface RoomPreset {
  id: string;
  label: string;
  room: Room;
}

export const presets: readonly RoomPreset[] = [
  { id: "example-bedroom", label: "Example", room: load(exampleBedroomData, "Example bedroom") },
  { id: "tiny-room", label: "Tiny", room: load(tinyRoomData, "Tiny room") },
  { id: "huge-room", label: "Huge", room: load(hugeRoomData, "Huge room") },
];

export function presetById(id: string): RoomPreset | undefined {
  return presets.find((preset) => preset.id === id);
}
