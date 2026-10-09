import { proxy } from "valtio";

export const connectionStore = proxy<{
  state: "idle" | "connecting" | "connected" | "recovering" | "disconnected";
  detail: string;
  pendingJoinMessage: string;
  epoch: number;
  resumeRoute?: string;
}>({ state: "idle", detail: "", pendingJoinMessage: "", epoch: 0 });
