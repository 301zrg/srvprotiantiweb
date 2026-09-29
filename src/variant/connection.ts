import { proxy } from "valtio";

export const connectionStore = proxy<{
  state: "idle" | "connecting" | "connected" | "disconnected";
  detail: string;
  pendingJoinMessage: string;
}>({ state: "idle", detail: "", pendingJoinMessage: "" });
