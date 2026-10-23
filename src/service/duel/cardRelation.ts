import type { ygopro } from "@/api";
import type { CardRelationEvent } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/cardRelation";
import type { QueryUpdateAction } from "@/api/ocgcore/ocgAdapter/util";
import { QUERY_EQUIP_CARD, QUERY_TARGET_CARD } from "@/common";
import type { Container } from "@/container";
import type { CardStore, CardType } from "@/stores/cardStore";
import { clearCardLinks } from "@/variant/cardInformation";

export function updateCardRelation(
  container: Container,
  event: CardRelationEvent,
) {
  const store = container.context.cardStore;
  const source = store.find(event.source);
  if (!source) return;
  const target = event.target && store.find(event.target);
  if (event.kind === "unequip") delete source.equipTarget;
  else if (event.kind === "equip") source.equipTarget = target?.uuid;
  else if (target) {
    const targets = source.cardTargets ?? [];
    source.cardTargets =
      event.kind === "target"
        ? [...new Set([...targets, target.uuid])]
        : targets.filter((id) => id !== target.uuid);
  }
}

export function updateQueryRelations(
  store: CardStore,
  source: CardType,
  action: QueryUpdateAction,
) {
  const resolve = (location?: ygopro.CardLocation) =>
    location && store.find(location)?.uuid;
  if (action.queryFlags !== undefined && action.queryFlags & QUERY_EQUIP_CARD)
    source.equipTarget = resolve(action.equip_card);
  if (action.queryFlags !== undefined && action.queryFlags & QUERY_TARGET_CARD)
    source.cardTargets = (action.target_cards ?? []).flatMap((location) => {
      const id = resolve(location);
      return id ? [id] : [];
    });
}

export function clearOnlineCardLinks(store: CardStore, id: string) {
  clearCardLinks(store.inner, id, (card) => card.uuid);
}

/** Original client clears lasting card targets when a face-up card is set. */
export function clearOnlineCardTargets(store: CardStore, id: string) {
  clearCardLinks(store.inner, id, (card) => card.uuid, false);
}
