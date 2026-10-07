import { fetchCard, ygopro } from "@/api";
import { type QueryUpdateAction } from "@/api/ocgcore/ocgAdapter/util";
import { callCardMove } from "@/ui/Duel/PlayMat/Card";

import MsgUpdateData = ygopro.StocGameMessage.MsgUpdateData;
import { v4 as v4uuid } from "uuid";

import {
  QUERY_ATTACK,
  QUERY_COUNTERS,
  QUERY_DEFENSE,
  QUERY_OVERLAY_CARD,
  TYPE_TOKEN,
} from "@/common";
import { Container } from "@/container";

import { genCard } from "../utils";

export default async (container: Container, updateData: MsgUpdateData) => {
  const { player: controller, zone, actions } = updateData;
  if (controller !== undefined && zone !== undefined && actions !== undefined) {
    const field = container.context.cardStore.at(zone, controller);
    for (const action of actions) {
      const sequence = action.location?.sequence;
      if (typeof sequence !== "undefined") {
        const target = field
          .filter((card) => card.location.sequence === sequence)
          .at(0);
        if (target) {
          const updateAction = action as QueryUpdateAction;
          if (updateAction.clear) {
            continue;
          }

          // code=0 means the query did not expose identity; movement and
          // position messages decide whether an existing visible card changes.
          if (
            action?.code > 0 &&
            (target.code !== action.code || target.meta.id === 0)
          ) {
            const newMeta = fetchCard(action.code);
            target.code = action.code;
            target.meta = newMeta;
          }

          const meta = target.meta;
          if (updateAction.updatesPosition && action.location !== undefined) {
            if (target.location.position !== action.location.position) {
              // Currently only update position
              target.location.position = action.location.position;
              // animation
              await callCardMove(target.uuid);
            }
          }
          if (action?.type_ >= 0) {
            meta.data.type = action.type_;
            if (action.type_ & TYPE_TOKEN) {
              target.isToken = true;
            }
          }
          if (action?.level >= 0) {
            meta.data.level = action.level;
          }
          if (action?.attribute >= 0) {
            meta.data.attribute = action.attribute;
          }
          if (action?.race >= 0) {
            meta.data.race = action.race;
          }
          if (
            updateAction.queryFlags === undefined
              ? action.attack >= 0
              : (updateAction.queryFlags & QUERY_ATTACK) !== 0
          ) {
            meta.data.atk = action.attack;
          }
          if (
            updateAction.queryFlags === undefined
              ? action.defense >= 0
              : (updateAction.queryFlags & QUERY_DEFENSE) !== 0
          ) {
            meta.data.def = action.defense;
          }
          if (action?.status >= 0) {
            target.status = action.status;
          }
          if (
            updateAction.queryFlags === undefined
              ? Boolean(action.counters?.size)
              : (updateAction.queryFlags & QUERY_COUNTERS) !== 0
          ) {
            target.counters = Object.fromEntries(action.counters ?? []);
          }
          if (
            updateAction.queryFlags === undefined
              ? action.overlay_cards.length > 0
              : (updateAction.queryFlags & QUERY_OVERLAY_CARD) !== 0
          ) {
            const store = container.context.cardStore;
            const materials = store.findOverlay(zone, controller, sequence);
            const codes = action.overlay_cards;
            // An explicit empty list is authoritative; an omitted list is not.
            const removed = new Set(
              materials
                .filter(
                  (card) => card.location.overlay_sequence >= codes.length,
                )
                .map((card) => card.uuid),
            );
            if (removed.size)
              store.inner = store.inner.filter(
                (card) => !removed.has(card.uuid),
              );
            codes.forEach((code, overlaySequence) => {
              const material = materials.find(
                (card) => card.location.overlay_sequence === overlaySequence,
              );
              if (material) {
                if (material.code !== code || material.meta.id !== code) {
                  material.code = code;
                  material.meta = fetchCard(code);
                }
              } else {
                store.inner.push(
                  genCard({
                    uuid: v4uuid(),
                    code,
                    meta: fetchCard(code),
                    location: new ygopro.CardLocation({
                      controller,
                      zone,
                      sequence,
                      is_overlay: true,
                      overlay_sequence: overlaySequence,
                      position: target.location.position,
                    }),
                    counters: {},
                    idleInteractivities: [],
                    isToken: false,
                    targeted: false,
                    selectInfo: { selectable: false, selected: false },
                    status: 0,
                  }),
                );
              }
            });
          }
        } else {
          console.warn(
            `<UpdateData>target from zone=${zone}, controller=${controller}, sequence=${sequence} is null`,
          );
          console.info(field);
        }
      }
    }
  }
};
