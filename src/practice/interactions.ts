import type { ReplayCard } from "../replay/messages";
import type { PhaseKey } from "../variant/duelPhases";
import type { PracticeChoice, PracticeRequest } from "./prompts";

export function choicesAtCard(
  request: PracticeRequest | undefined,
  card: Pick<ReplayCard, "player" | "location" | "sequence">,
): PracticeChoice[] {
  return (
    request?.choices.filter(
      (choice) =>
        choice.player === card.player &&
        choice.location === card.location &&
        choice.sequence === card.sequence,
    ) || []
  );
}

/** Only phase commands actually offered by this Core request are available. */
export function practicePhaseChoices(request: PracticeRequest | undefined) {
  const result: Partial<Record<PhaseKey, PracticeChoice>> = {};
  for (const choice of request?.choices || []) {
    if (choice.location !== undefined) continue;
    if (request?.kind === "idle" && choice.action === 6) result.bp = choice;
    if (request?.kind === "idle" && choice.action === 7) result.ep = choice;
    if (request?.kind === "battle" && choice.action === 2) result.mp2 = choice;
    if (request?.kind === "battle" && choice.action === 3) result.ep = choice;
  }
  return result;
}
