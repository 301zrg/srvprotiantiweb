import { fetchCard, fetchStrings, Region } from "@/api";
import {
  Attribute2StringCodeMap,
  Race2StringCodeMap,
  Type2StringCodeMap,
} from "@/common";
import { statsPlaybackMessages } from "@/variant/statsPlaybackMessages";

export interface LiveIdentity {
  currentCode?: number;
  type?: number;
  level?: number;
  rank?: number;
  attribute?: number;
  race?: number;
}
const flags = (value: number | undefined, map: Map<number, number>) =>
  value === undefined
    ? "?"
    : [...map]
        .filter(([bit]) => (value & bit) !== 0)
        .map(([, key]) => fetchStrings(Region.System, key))
        .join(" / ") || "?";
export function CardIdentityDetails({
  code,
  current,
  language,
}: {
  code: number;
  current?: LiveIdentity;
  language: string;
}) {
  const printed = fetchCard(code),
    words = statsPlaybackMessages(language);
  const format = (data: LiveIdentity, name: string) => [
    name,
    ...(data.type && data.type & 1
      ? [
          `${fetchStrings(Region.System, 1324)} ${
            data.type & 0x4000000
              ? "—"
              : data.type & 0x800000
              ? data.rank ?? "?"
              : data.level ?? "?"
          }`,
          flags(data.attribute, Attribute2StringCodeMap),
          flags(data.race, Race2StringCodeMap),
        ]
      : []),
    flags(data.type, Type2StringCodeMap),
  ];
  const original: LiveIdentity = {
    ...printed.data,
    level:
      printed.data.level === undefined ? undefined : printed.data.level & 255,
    rank:
      printed.data.level === undefined ? undefined : printed.data.level & 255,
  };
  const originalName = printed.text.name || String(code);
  const printedValues = format(original, originalName);
  const currentName = current?.currentCode
    ? fetchCard(current.currentCode).text.name || String(current.currentCode)
    : originalName;
  const liveValues = current && format(current, currentName);
  const changed =
    liveValues && JSON.stringify(liveValues) !== JSON.stringify(printedValues);
  const rows = current
    ? [
        { key: "current", label: words.current, values: liveValues! },
        ...(changed
          ? [{ key: "printed", label: words.printed, values: printedValues }]
          : []),
      ]
    : [{ key: "printed", label: words.printed, values: printedValues }];
  return (
    <section
      className="card-identity-details"
      data-testid="card-identity-details"
    >
      {rows.map((row) => (
        <div key={row.key} data-identity-row={row.key}>
          <strong>{row.label}</strong>
          <div>
            <b>{row.values[0]}</b>
            <div>
              {row.values.slice(1).map((value, i) => (
                <span key={i}>{value}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
