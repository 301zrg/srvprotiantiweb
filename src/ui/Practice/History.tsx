import { fetchCard } from "@/api";
import { corePhaseKey } from "@/variant/duelPhases";
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
  return (
    <ol className="practice-history" data-testid="practice-history-content">
      {!entries.length && <p>{mobileMessages(language).emptyHistory}</p>}
      {entries
        .slice()
        .reverse()
        .map(({ action, turn, phase }, index) => {
          const player =
            action.player ?? action.to?.player ?? action.from?.player;
          return (
            <li key={entries.length - index} data-history-kind={action.kind}>
              <strong>
                T{turn} · {corePhaseKey(phase)?.toUpperCase()}{" "}
                {player === undefined ? "" : player === 0 ? "A" : "B"}
              </strong>
              <div>
                {words[action.kind as keyof typeof words] || words.ready}{" "}
                {action.code ? (
                  <button
                    type="button"
                    className="practice-history-card"
                    data-testid="practice-history-card"
                    data-card-code={action.code}
                    onClick={() => onInspect(action.code!)}
                  >
                    {fetchCard(action.code).text.name || action.code}
                  </button>
                ) : (
                  ""
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
