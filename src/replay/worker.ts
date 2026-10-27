import { loadReplayEngine, type ReplayEngine } from "./engine";
import profile from "./profile.json";

let engine: ReplayEngine | undefined;
let original: Uint8Array | undefined;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === "open") {
      original = new Uint8Array(data.bytes);
      engine = await loadReplayEngine(data.base, profile, (text) =>
        self.postMessage({ type: "status", text }),
      );
      self.postMessage({ type: "frame", frame: engine.open(original) });
    } else if (data.type === "next" && engine) {
      let frame = engine.next();
      const history = [
        { turn: frame.turn, names: frame.names, events: frame.events },
      ];
      let eventBytes = frame.events.reduce((n, e) => n + e.length, 0);
      const started = performance.now();
      // A bounded seek batch keeps cancel/exit responsive. No future frames are
      // computed until the UI acknowledges with its next request.
      if (data.turn)
        for (
          let i = 1;
          i < 128 &&
          frame.turn < data.turn &&
          !frame.end &&
          eventBytes < 128 * 1024 &&
          performance.now() - started < 1500;
          i++
        ) {
          frame = engine.next();
          history.push({
            turn: frame.turn,
            names: frame.names,
            events: frame.events,
          });
          eventBytes += frame.events.reduce((n, e) => n + e.length, 0);
        }
      self.postMessage({ type: "frame", frame, history });
    } else if (data.type === "restart" && engine && original)
      self.postMessage({ type: "frame", frame: engine.open(original) });
    else if (data.type === "close") {
      engine?.close();
      self.close();
    }
  } catch (error) {
    engine?.close();
    self.postMessage({
      type: "error",
      text: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
  }
};
