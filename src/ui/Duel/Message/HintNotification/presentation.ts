import type { ServerMessageMode } from "@/stores/settingStore";

export function chatPresentation(
  mode: ServerMessageMode,
  portrait: boolean,
  server: boolean,
): "popup" | "summary" | "record" {
  if (!server) return "popup";
  if (mode === "record") return "record";
  return mode === "auto" && portrait ? "summary" : "popup";
}
