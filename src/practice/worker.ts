import { unpackScripts } from "../replay/engine";
import profile from "../replay/profile.json";
import { loadReplayResource, loadReplayRuntime } from "../replay/runtime";
import { PracticeEngine } from "./engine";

let engine: PracticeEngine | undefined;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === "open") {
      const status = () => self.postMessage({ type: "status" });
      const [runtime, cards, scripts] = await Promise.all([
        loadReplayRuntime(data.base, profile, status),
        loadReplayResource(data.base, profile, "cards.data", status),
        loadReplayResource(data.base, profile, "scripts.data", status),
      ]);
      engine = new PracticeEngine(runtime);
      engine.install(
        cards,
        unpackScripts(scripts, profile.unpackedScriptBytes),
      );
      self.postMessage({ type: "frame", frame: engine.open(data.config) });
    } else if (data.type === "next" && engine) {
      self.postMessage({ type: "frame", frame: engine.next() });
    } else if (data.type === "respond" && engine) {
      if (engine.respond(data.id, data.player, data.answer))
        self.postMessage({ type: "frame", frame: engine.next() });
      else self.postMessage({ type: "rejected", id: data.id });
    } else if (data.type === "close") {
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
