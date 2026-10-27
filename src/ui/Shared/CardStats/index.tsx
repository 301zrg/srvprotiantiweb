import "./style.css";

import {
  type CardStats,
  showPrintedStats,
  statText,
  statTrend,
} from "@/variant/cardStats";
import { statsPlaybackMessages } from "@/variant/statsPlaybackMessages";

export function StatNumber({
  current,
  original,
  direction = false,
}: {
  current?: number;
  original?: number;
  direction?: boolean;
}) {
  const trend = statTrend(current, original);
  return (
    <span
      className="card-stat-number"
      data-trend={trend}
      data-value={statText(current)}
    >
      {statText(current)}
      {direction && (trend === "higher" ? " ↑" : trend === "lower" ? " ↓" : "")}
    </span>
  );
}
export function CompactCardStats({ stats }: { stats: CardStats }) {
  return (
    <span className="card-stats-compact" data-testid="field-card-stats">
      <StatNumber current={stats.attack} original={stats.baseAttack} />
      {stats.hasDefense !== false && (
        <>
          {" "}
          / <StatNumber current={stats.defense} original={stats.baseDefense} />
        </>
      )}
    </span>
  );
}
export function CardStatsDetails({
  stats,
  language,
  live = true,
}: {
  stats: CardStats;
  language: string;
  live?: boolean;
}) {
  const text = statsPlaybackMessages(language);
  const rows = live
    ? [
        {
          key: "current",
          label: text.current,
          attack: stats.attack,
          defense: stats.defense,
        },
        {
          key: "original",
          label: text.original,
          attack: stats.baseAttack,
          defense: stats.baseDefense,
        },
        ...(showPrintedStats(stats)
          ? [
              {
                key: "printed",
                label: text.printed,
                attack: stats.printedAttack,
                defense: stats.printedDefense,
              },
            ]
          : []),
      ]
    : [
        {
          key: "printed",
          label: text.printed,
          attack: stats.printedAttack,
          defense: stats.printedDefense,
        },
      ];
  return (
    <table className="card-stats-details" data-testid="card-stats-details">
      <thead>
        <tr>
          <th />
          <th scope="col">ATK</th>
          {stats.hasDefense !== false && <th scope="col">DEF</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-stat-row={row.key}>
            <th scope="row">{row.label}</th>
            <td data-stat="ATK">
              <StatNumber
                current={row.attack}
                original={row.key === "current" ? stats.baseAttack : undefined}
                direction={row.key === "current"}
              />
            </td>
            {stats.hasDefense !== false && (
              <td data-stat="DEF">
                <StatNumber
                  current={row.defense}
                  original={
                    row.key === "current" ? stats.baseDefense : undefined
                  }
                  direction={row.key === "current"}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
