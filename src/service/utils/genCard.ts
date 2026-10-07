import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";

import { fetchCard } from "@/api";
import { CardType } from "@/stores";

// Refresh identity synchronously, before the same packet applies live stats.
export const genCard = (card: CardType) => {
  const t = proxy(card);
  subscribeKey(
    t,
    "code",
    (code) => {
      t.meta = fetchCard(code);
    },
    true,
  );
  return t;
};
