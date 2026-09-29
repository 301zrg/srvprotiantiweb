import { AudioActionType } from "../type";

// The web variant ships sound effects but no background-music files.
export function changeScene(_scene: AudioActionType) {
  // Keep the upstream scene API while skipping music downloads.
}
