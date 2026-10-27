import { useMemo, useRef } from "react";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { HistoryRow, HistoryTimeline } from "@/ui/Shared/DuelHistory";
import {
  type HistoryCursor,
  sceneHistoryEntry,
} from "@/ui/Shared/DuelHistory/convert";

import type { PracticeHistoryEntry } from "./presentation";

const playerLabel = (player: number) => (player === 0 ? "A" : "B");

export function PracticeHistory({
  entries,
  language,
  onInspect,
}: {
  entries: PracticeHistoryEntry[];
  language: string;
  onInspect: (code: number) => void;
}) {
  const { historyOrder } = useSnapshot(settingStore);
  // Rows are memoized; keep the callback identity across renders.
  const inspect = useRef(onInspect);
  inspect.current = onInspect;
  const stableInspect = useMemo(
    () => (code: number) => inspect.current(code),
    [],
  );
  const rows = useMemo(() => {
    const cursor: HistoryCursor = { turn: 0 };
    return entries.flatMap(({ action, turn, phase, result }, position) => {
      const entry = sceneHistoryEntry(action, turn, phase, cursor, result);
      return entry ? [{ entry, position }] : [];
    });
  }, [entries]);
  const ordered = historyOrder === "newest" ? [...rows].reverse() : rows;
  return (
    <HistoryTimeline
      language={language}
      empty={!rows.length}
      testId="practice-history-content"
      className="practice-history"
    >
      {ordered.map(({ entry, position }) => (
        <HistoryRow
          key={position}
          entry={entry}
          language={language}
          playerLabel={playerLabel}
          onInspect={stableInspect}
          testPrefix="practice"
        />
      ))}
    </HistoryTimeline>
  );
}
