import { inspectReplay, MAX_REPLAY_BYTES } from "@/replay/format";

import { deckImportOrigins } from "./index";

export const replayImportChannel = "srvprotiantiweb:replay-import";
export const inlineReplayBytes = 24 * 1024;
export const replayImportUrlLimit = 34 * 1024;
export type ReplayImportError =
  | "invalid-link"
  | "source-denied"
  | "unavailable"
  | "timeout"
  | "invalid-file"
  | "too-large";
interface Snapshot {
  input?: { bytes: Uint8Array; filename: string };
  error?: ReplayImportError;
}

/** The handoff receives files only. It never fetches an arbitrary URL or runs Core. */
export class ReplayImportSession {
  private snapshot: Snapshot = {};
  private listeners = new Set<() => void>();
  private peer: Window | null = null;
  private origin = "";
  private request = "";
  private timeout?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setInterval>;
  private onMessage?: (event: MessageEvent) => void;
  private finished = false;

  constructor(url: URL) {
    const params = new URLSearchParams(url.hash.split("?").slice(1).join("?"));
    if (url.href.length > replayImportUrlLimit) return this.fail("too-large");
    if (params.get("v") !== "1" || params.get("kind") !== "replay")
      return this.fail("invalid-link");
    if (params.get("bridge") === "1") {
      this.origin = params.get("origin") ?? "";
      this.request = params.get("request") ?? "";
      if (!deckImportOrigins.includes(this.origin))
        return this.fail("source-denied");
      if (!window.opener || !/^[A-Za-z0-9_-]{16,64}$/.test(this.request))
        return this.fail("unavailable");
      this.peer = window.opener;
      this.receive();
    } else {
      const data = params.get("data") ?? "";
      if (
        params.get("format") !== "yrp-base64url" ||
        !/^[A-Za-z0-9_-]+$/.test(data)
      )
        return this.fail("invalid-link");
      if (data.length > Math.ceil(inlineReplayBytes / 3) * 4)
        return this.fail("too-large");
      try {
        const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
        if (binary.length > inlineReplayBytes) return this.fail("too-large");
        this.accept(
          Uint8Array.from(binary, (c) => c.charCodeAt(0)),
          params.get("file"),
        );
      } catch {
        this.fail("invalid-file");
      }
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private notify(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private accept(bytes: Uint8Array, filename: unknown) {
    if (
      typeof filename !== "string" ||
      filename.length > 240 ||
      !/\.yrp$/i.test(filename) ||
      /[\\/\x00-\x1f\x7f]/.test(filename)
    )
      throw new Error("Invalid replay filename");
    if (bytes.length > MAX_REPLAY_BYTES) return this.fail("too-large");
    inspectReplay(bytes, filename);
    clearTimeout(this.timeout);
    clearInterval(this.readyTimer);
    this.send("received");
    this.notify({ input: { bytes, filename } });
  }
  private send(status?: string) {
    try {
      this.peer?.postMessage(
        {
          channel: replayImportChannel,
          version: 1,
          kind: "replay",
          request: this.request,
          type: status ? "result" : "ready",
          status,
        },
        this.origin,
      );
    } catch {
      /* Source may have navigated; the received file remains usable. */
    }
  }
  private receive() {
    this.onMessage = (event) => {
      const data = event.data;
      if (
        this.finished ||
        this.snapshot.input ||
        this.snapshot.error ||
        event.origin !== this.origin ||
        event.source !== this.peer ||
        !data ||
        data.channel !== replayImportChannel ||
        data.version !== 1 ||
        data.kind !== "replay" ||
        data.request !== this.request ||
        data.type !== "payload"
      )
        return;
      try {
        if (data.format !== "yrp" || !(data.bytes instanceof ArrayBuffer))
          return this.fail("invalid-file");
        this.accept(new Uint8Array(data.bytes), data.filename);
      } catch {
        this.fail("invalid-file");
      }
    };
    window.addEventListener("message", this.onMessage);
    this.send();
    this.readyTimer = setInterval(() => this.send(), 1000);
    this.timeout = setTimeout(() => this.fail("timeout"), 45000);
  }
  private fail(error: ReplayImportError) {
    this.notify({ error });
    this.finish("failed");
    return this;
  }
  finish(status: "saved" | "memory-only" | "failed" | "cancelled") {
    if (this.finished) return;
    this.finished = true;
    this.send(status);
    clearTimeout(this.timeout);
    clearInterval(this.readyTimer);
    if (this.onMessage) window.removeEventListener("message", this.onMessage);
    if (this.peer) window.opener = null;
    this.peer = null;
    // Release the transfer buffer after the storage transaction has completed.
    this.snapshot = { error: this.snapshot.error };
  }
}

let current: ReplayImportSession | undefined;
export function isCurrentReplayImport(session: ReplayImportSession) {
  return current === session && window.location.hash === "#/replay-import";
}
/** Install before loaders; scrub content/request from history before UI/logging. */
export function captureReplayImport(): ReplayImportSession | undefined {
  const url = new URL(window.location.href);
  if (url.hash.split("?")[0] !== "#/replay-import") return current;
  if (url.hash.includes("?") || !current) {
    current?.finish("cancelled");
    current = new ReplayImportSession(url);
    url.hash = "/replay-import";
    window.history.replaceState(window.history.state, "", url);
  }
  return current;
}
