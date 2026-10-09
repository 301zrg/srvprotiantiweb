import i18next from "i18next";

import { fetchCard } from "@/api/cards";
import { fetchStrings, Region } from "@/api/strings";

import type { Language } from "./languageLink";

const hintKeys: Record<string, string> = {
  "「[?]」攻击时": "HintAttack",
  "「[?]」被发动时": "HintActivate",
  玩家抽卡时: "HintDraw",
  "「[?]」反转召唤宣言时": "HintFlipSummon",
  "「[?]」特殊召唤宣言时": "HintSpecialSummon",
  "「[?]」通常召唤宣言时": "HintSummon",
  玩家收到伤害时: "HintDamage",
  玩家生命值回复时: "HintRecover",
  攻击被无效时: "HintAttackDisabled",
};

export function formatDuelHint(
  source: { originMsg: string | number; cardID?: number },
  language: Language,
): string {
  let text =
    typeof source.originMsg === "number"
      ? fetchStrings(Region.System, source.originMsg)
      : hintKeys[source.originMsg]
      ? i18next.t(`ClientUI:${hintKeys[source.originMsg]}`, { lng: language })
      : source.originMsg;
  const name = source.cardID ? fetchCard(source.cardID).text.name : undefined;
  if (name) text = text.replace("[?]", name);
  return text;
}
