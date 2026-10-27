import {
  DeckImportError,
  type DeckImportInput,
  deckImportLimits,
  deckImportTitle,
  inputFromEncoded,
  validateDeckLists,
} from "./deckImport";
import { deckImportOrigins } from "./index";

export const deckImportChannel = "srvprotiantiweb:deck-import";
interface Snapshot {
  input?: DeckImportInput;
  title: string;
  error?: DeckImportError;
}

export class DeckImportSession {
  snapshot: Snapshot = { title: "" };
  private listeners = new Set<() => void>();
  private peer: Window | null = null;
  private origin = "";
  private request = "";
  private timer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setInterval>;
  private onMessage?: (event: MessageEvent) => void;

  constructor(url: URL) {
    try {
      const params = new URLSearchParams(
        url.hash.split("?").slice(1).join("?"),
      );
      if (url.href.length > deckImportLimits.url)
        throw new DeckImportError("too-large");
      if (params.get("v") !== "1" || params.get("kind") !== "deck")
        throw new DeckImportError("invalid-link");
      this.snapshot.title = deckImportTitle(params.get("title") ?? "");
      if (params.get("bridge") === "1") {
        this.origin = params.get("origin") ?? "";
        this.request = params.get("request") ?? "";
        if (!deckImportOrigins.includes(this.origin))
          throw new DeckImportError("source-denied");
        if (!window.opener || !/^[A-Za-z0-9_-]{16,64}$/.test(this.request))
          throw new DeckImportError("bridge-unavailable");
        this.peer = window.opener;
        this.receive();
      } else {
        if (url.href.length > deckImportLimits.url)
          throw new DeckImportError("too-large");
        this.snapshot.input = inputFromEncoded(
          params.get("format") ?? "",
          params.get("data") ?? "",
        );
      }
    } catch (error) {
      this.snapshot.error =
        error instanceof DeckImportError
          ? error
          : new DeckImportError("invalid-format");
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

  private send(type: "ready" | "result", status?: string) {
    this.peer?.postMessage(
      {
        channel: deckImportChannel,
        version: 1,
        type,
        request: this.request,
        kind: "deck",
        status,
      },
      this.origin,
    );
  }

  private receive() {
    this.onMessage = (event) => {
      const data = event.data;
      if (
        event.origin !== this.origin ||
        event.source !== this.peer ||
        !data ||
        data.channel !== deckImportChannel ||
        data.version !== 1 ||
        data.request !== this.request ||
        data.kind !== "deck" ||
        data.type !== "payload" ||
        this.snapshot.input ||
        this.snapshot.error
      )
        return;
      try {
        let input: DeckImportInput;
        if (data.format === "ydk" && typeof data.text === "string") {
          if (
            new TextEncoder().encode(data.text).length > deckImportLimits.bytes
          )
            throw new DeckImportError("too-large");
          input = { format: "ydk", text: data.text };
        } else if (
          data.format === "ygopro-update-deck" &&
          data.bytes instanceof ArrayBuffer
        ) {
          if (data.bytes.byteLength > deckImportLimits.bytes)
            throw new DeckImportError("too-large");
          input = {
            format: "ygopro-update-deck",
            bytes: new Uint8Array(data.bytes),
          };
        } else if (data.format === "deck-json") {
          input = { format: "deck-json", deck: validateDeckLists(data.deck) };
        } else throw new DeckImportError("invalid-format");
        clearTimeout(this.timer);
        clearInterval(this.readyTimer);
        this.send("result", "received");
        this.notify({
          input,
          title: deckImportTitle(
            typeof data.title === "string" ? data.title : this.snapshot.title,
          ),
        });
      } catch (error) {
        this.fail(
          error instanceof DeckImportError
            ? error
            : new DeckImportError("invalid-format"),
        );
      }
    };
    window.addEventListener("message", this.onMessage);
    this.send("ready");
    this.readyTimer = setInterval(() => this.send("ready"), 1000);
    this.timer = setTimeout(
      () => this.fail(new DeckImportError("bridge-timeout")),
      30000,
    );
  }

  private fail(error: DeckImportError) {
    this.notify({ ...this.snapshot, error });
    this.finish("failed");
  }

  finish(status: "imported" | "memory-only" | "failed" | "cancelled") {
    if (this.peer && this.origin) this.send("result", status);
    clearTimeout(this.timer);
    clearInterval(this.readyTimer);
    if (this.onMessage) window.removeEventListener("message", this.onMessage);
    if (this.peer) window.opener = null;
    this.peer = null;
  }
}

let current: DeckImportSession | undefined;

export function isCurrentDeckImport(session: DeckImportSession) {
  return current === session && window.location.hash === "#/import";
}

/** Capture before resource loaders run. The URL is scrubbed before routing/logging. */
export function captureDeckImport(): DeckImportSession | undefined {
  const url = new URL(window.location.href);
  if (url.hash.split("?")[0] !== "#/import") return current;
  if (url.hash.includes("?") || !current) {
    current?.finish("cancelled");
    current = new DeckImportSession(url);
    url.hash = "/import";
    window.history.replaceState(window.history.state, "", url);
  }
  return current;
}
