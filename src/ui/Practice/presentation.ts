import type { PracticeRequest } from "@/practice/prompts";
import type { ReplayFrame } from "@/replay/engine";
import {
  type SceneAction,
  type SceneFrame,
  sceneSteps,
  seedScene,
} from "@/ui/Replay/scene";

export interface PracticeHistoryEntry {
  action: SceneAction;
  turn: number;
  phase: number;
}

/** A batch's final query inherits its last action; it is not another event. */
export function advancePracticeScene(
  frame: ReplayFrame,
  previous?: SceneFrame,
) {
  const steps = previous ? sceneSteps(previous, frame) : [seedScene(frame)];
  let last = previous?.action;
  const entries: PracticeHistoryEntry[] = [];
  for (const step of steps) {
    if (step.action && step.action !== last) {
      entries.push({ action: step.action, turn: step.turn, phase: step.phase });
      last = step.action;
    }
  }
  return {
    scene: steps.at(-1)!,
    actions: entries.map((entry) => entry.action),
    entries,
  };
}

/** Native effect prompts use the same card/zone placeholders as online play. */
export function practiceEffectText(
  request: Pick<
    PracticeRequest,
    "message" | "description" | "code" | "location"
  >,
  system: (id: number) => string,
  description: (id: number) => string,
  cardName: (id: number) => string,
  zoneName: (location: number) => string,
) {
  const id = request.description ?? 0;
  let text = request.message === 12 && id === 0 ? system(200) : description(id);
  if (request.message === 12 && (id === 0 || id === 221))
    text = text.replace("[%ls]", zoneName((request.location ?? 0) & 127));
  if (request.code) text = text.replaceAll("[%ls]", cardName(request.code));
  return text;
}
