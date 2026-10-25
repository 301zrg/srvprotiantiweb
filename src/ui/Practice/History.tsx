import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
import { settingStore } from "@/stores/settingStore";
import { corePhaseKey } from "@/variant/duelPhases";
import { formatDuelResult } from "@/variant/duelResults";
import { mobileMessages } from "@/variant/mobileMessages";

import { replayFieldWords } from "../Replay/FieldBoard";
import { practiceZoneName } from "./Board";
import type { PracticeHistoryEntry } from "./presentation";

export function PracticeHistory({
  entries,
  language,
  onInspect,
}: {
  entries: PracticeHistoryEntry[];
  language: string;
  onInspect: (code: number) => void;
}) {
  const words = replayFieldWords(language);
  const { historyOrder } = useSnapshot(settingStore);
  const ordered = entries.map((entry, position) => ({ entry, position }));
  if (historyOrder === "newest") ordered.reverse();
  return (
    <ol className="practice-history" data-testid="practice-history-content">
      {!entries.length && <p>{mobileMessages(language).emptyHistory}</p>}
      {ordered.map(({ entry: { action, turn, phase, result }, position }) => {
        const player =
          action.player ?? action.to?.player ?? action.from?.player;
        const formatted = result
          ? formatDuelResult(result, language)
          : undefined;
        return (
          <li key={position} data-history-kind={action.kind}>
            <strong>
              T{turn} · {corePhaseKey(phase)?.toUpperCase()}{" "}
              {player === undefined ? "" : player === 0 ? "A" : "B"}
            </strong>
            <div>
              {formatted
                ? `${formatted.title}: `
                : words[action.kind as keyof typeof words] || words.ready}{" "}
              {action.code ? (
                <button
                  type="button"
                  className="practice-history-card"
                  data-testid="practice-history-card"
                  data-card-code={action.code}
                  onClick={() => onInspect(action.code!)}
                >
                  {formatted?.value ||
                    fetchCard(action.code).text.name ||
                    action.code}
                </button>
              ) : (
                formatted?.value || ""
              )}{" "}
              {action.amount ?? ""}
            </div>
            {action.from && action.to && (
              <div>
                {practiceZoneName(action.from.location & 127)} →{" "}
                {practiceZoneName(action.to.location & 127)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
