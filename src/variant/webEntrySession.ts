import { deckImportOrigins } from "./index";
import { saveJoinForm } from "./joinForm";
import {
  entryNickname,
  readWebEntry,
  type WebEntry,
  type WebEntryError,
  type WebEntryRequest,
} from "./webEntry";

export { webEntryRoute } from "./webEntry";
export const webEntryChannel = "srvprotiantiweb:entry";
interface Snapshot {
  entry?: WebEntry;
  error?: WebEntryError;
}

export class WebEntrySession {
  private snapshot: Snapshot = {};
  private listeners = new Set<() => void>();
  private peer: Window | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setInterval>;
  private autoStarted = false;
  private finished = false;

  constructor(
    private request?: WebEntryRequest,
    error?: WebEntryError,
  ) {
    if (error || !request) {
      this.snapshot = { error: error ?? "invalid-link" };
      return;
    }
    if (!request.bridge) {
      this.snapshot = { entry: request.entry };
      return;
    }
    const { origin, request: nonce } = request.bridge;
    if (
      !deckImportOrigins.includes(origin) ||
      !window.opener ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)
    ) {
      this.snapshot = { error: "bridge-unavailable" };
      return;
    }
    this.peer = window.opener;
    window.addEventListener("message", this.receive);
    window.addEventListener("hashchange", this.onNavigation);
    window.addEventListener("pagehide", this.onLeave);
    this.send("ready");
    this.readyTimer = setInterval(() => this.send("ready"), 1000);
    this.timer = setTimeout(() => this.fail("bridge-unavailable"), 30000);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  claimAutojoin = () => {
    if (this.autoStarted) return false;
    this.autoStarted = true;
    return true;
  };
  private notify(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private send(type: "ready" | "result", status?: string) {
    const bridge = this.request?.bridge;
    if (!bridge) return;
    this.peer?.postMessage(
      {
        channel: webEntryChannel,
        version: 1,
        type,
        request: bridge.request,
        intent: this.request!.entry.intent,
        ...(status ? { status } : {}),
      },
      bridge.origin,
    );
  }
  private receive = (event: MessageEvent) => {
    const data = event.data;
    if (
      this.finished ||
      event.origin !== this.request?.bridge?.origin ||
      event.source !== this.peer ||
      !data ||
      data.channel !== webEntryChannel ||
      data.version !== 1 ||
      data.request !== this.request.bridge.request ||
      data.intent !== this.request.entry.intent ||
      data.type !== "payload"
    )
      return;
    if (window.location.hash !== "#/entry") return this.cancel();
    try {
      const nickname = entryNickname(data.credentials);
      const entry = { ...this.request.entry, nickname };
      if (nickname)
        saveJoinForm({
          nickname,
          ...(entry.intent === "spectate" ? { roomName: "" } : {}),
        });
      this.finish("accepted");
      this.notify({ entry });
    } catch {
      this.fail("invalid-link");
    }
  };
  private onNavigation = () => {
    if (window.location.hash !== "#/entry") this.cancel();
  };
  private onLeave = () => this.cancel();
  private fail(error: WebEntryError) {
    this.finish("failed");
    this.notify({ error });
  }
  cancel() {
    this.finish("cancelled");
    if (!this.snapshot.entry) this.notify({ error: "bridge-unavailable" });
  }
  private finish(status: "accepted" | "failed" | "cancelled") {
    if (this.finished) return;
    this.finished = true;
    this.send("result", status);
    clearTimeout(this.timer);
    clearInterval(this.readyTimer);
    window.removeEventListener("message", this.receive);
    window.removeEventListener("hashchange", this.onNavigation);
    window.removeEventListener("pagehide", this.onLeave);
    if (this.peer) window.opener = null;
    this.peer = null;
  }
}

let current: WebEntrySession | undefined;
/** Runs before loaders, scrubbing once and retaining only an in-memory request. */
export function captureWebEntry(): WebEntrySession | undefined {
  const url = new URL(window.location.href);
  if (url.hash === "#/entry" && current) return current;
  const parsed = readWebEntry(url);
  if (!parsed) return;
  current?.cancel();
  window.history.replaceState(window.history.state, "", parsed.url);
  current = new WebEntrySession(parsed.request, parsed.error);
  return current;
}
