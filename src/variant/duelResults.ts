import { fetchCard, fetchStrings, getStrings, Region } from "@/api";

import { duelResultMessages } from "./duelResultMessages";

export { duelResultMessages };

export type DuelResult =
  | {
      kind:
        | "option"
        | "race"
        | "attribute"
        | "number"
        | "zone"
        | "card"
        | "effect"
        | "message"
        | "turn"
        | "cardDescriptionAdded"
        | "cardDescriptionRemoved"
        | "playerDescriptionAdded"
        | "playerDescriptionRemoved";
      value: number;
    }
  | { kind: "coin" | "dice"; values: readonly number[] }
  | { kind: "yesNo" | "effectDecision"; value: number; accepted: boolean };

export type ValueResultKind = Exclude<
  DuelResult["kind"],
  "coin" | "dice" | "yesNo" | "effectDecision"
>;

const fallback = (value: number) => `#${value >>> 0}`;
const description = (value: number) => {
  const text = getStrings(value >>> 0);
  return text && text !== "?" && text !== "[?]" ? text : fallback(value);
};
const system = (id: number, value = id) => {
  const text = fetchStrings(Region.System, id);
  return text !== "?" ? text : fallback(value);
};

function bits(value: number, base: number, count: number): string {
  const names = Array.from({ length: count }, (_, bit) =>
    (value >>> bit) & 1 ? system(base + bit, 2 ** bit) : "",
  ).filter(Boolean);
  const unknown = (value >>> 0) & ~(2 ** count - 1);
  if (unknown) names.push(fallback(unknown));
  return names.join(" / ") || fallback(value);
}

/** Only a server-supplied description or card ID can identify a source card. */
export function duelResultSource(result: DuelResult): number {
  if (result.kind === "effect") return result.value >>> 0;
  if (
    result.kind === "option" ||
    result.kind === "yesNo" ||
    result.kind === "message" ||
    result.kind.endsWith("DescriptionAdded") ||
    result.kind.endsWith("DescriptionRemoved")
  ) {
    const value = "value" in result ? result.value >>> 0 : 0;
    return value >= 10000 ? value >>> 4 : 0;
  }
  return 0;
}

export function formatDuelResult(result: DuelResult, language: string) {
  const words = duelResultMessages(language);
  let title: string = words[result.kind];
  let value: string;
  switch (result.kind) {
    case "option":
      if ([70, 71, 72].includes(result.value)) title = words.type;
      value = description(result.value);
      break;
    case "race":
      value = bits(result.value, 1020, 26);
      break;
    case "attribute":
      value = bits(result.value, 1010, 7);
      break;
    case "number":
    case "turn":
      value = String(result.value);
      break;
    case "card":
    case "effect":
      value = fetchCard(result.value >>> 0).text.name ?? fallback(result.value);
      break;
    case "zone": {
      // Native zone masks are relative to the player in the hint.
      const zones: string[] = [];
      for (let side = 0; side < 2; side++) {
        const half = (result.value >>> (side * 16)) & 0xffff;
        for (let bit = 0; bit < 16; bit++) {
          if (!((half >>> bit) & 1)) continue;
          const label = side === 0 ? words.self : words.opponent;
          const name =
            bit < 7
              ? `${system(1002)} ${bit + 1}`
              : bit >= 8 && bit < 13
              ? `${system(1003)} ${bit - 7}`
              : bit === 13
              ? system(1008)
              : bit >= 14
              ? `${system(1009)} ${bit - 13}`
              : fallback(2 ** (bit + side * 16));
          zones.push(`${label} · ${name}`);
        }
      }
      value = zones.join(" / ") || fallback(result.value);
      break;
    }
    case "dice":
      value = result.values.join(" / ");
      break;
    case "coin":
      value = result.values.map((x) => system(61 - x, x)).join(" / ");
      break;
    case "yesNo":
    case "effectDecision": {
      const prompt =
        result.kind === "effectDecision" && [0, 221].includes(result.value)
          ? words.activate
          : description(result.value);
      value = `${prompt} · ${result.accepted ? words.yes : words.no}`;
      break;
    }
    default:
      value = description(result.value);
  }
  return { title, value };
}
