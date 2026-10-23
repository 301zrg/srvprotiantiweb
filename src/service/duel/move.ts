import { v4 as v4uuid } from "uuid";

import { fetchCard, ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { CardType } from "@/stores";
import { callCardMove } from "@/ui/Duel/PlayMat/Card";

import { REASON_DESTROY, REASON_MATERIAL, TYPE_TOKEN } from "../../common";
import { genCard } from "../utils";
import { clearOnlineCardLinks } from "./cardRelation";

type MsgMove = ygopro.StocGameMessage.MsgMove;
const { EMPTY, HAND, GRAVE, REMOVED, DECK, EXTRA, MZONE, SZONE, TZONE } =
  ygopro.CardZone;
const { FACEDOWN, FACEDOWN_ATTACK, FACEDOWN_DEFENSE } = ygopro.CardPosition;

/*
 * * 超量素材的`Location`：
 * - 位置是跟随超量怪兽的，通过`is_overlay`字段判断是否是超量素材，`overlay_sequence`是在某个超量怪兽下面的超量序列；
 * - 超量怪兽移动，超量素材需要跟着移动，并且需要前端自己维护这个关系，因为当超量怪兽移动时，
 *   后端不会针对超量素材传`MSG_MOVE`；
 * - 某个超量怪兽下面的超量素材的`overlay_sequence`也需要前端自己维护；
 * - Core 先把素材挂在仍位于额外卡组的宿主上，再询问进场位置。保留真实地址，
 *   展示暂留原位；收到宿主进场消息后，先依次叠素材，再移动宿主。
 * - 当场上的超量怪兽离开`MZONE`，比如送墓/除外时，超量素材会跟着超量怪兽移动，这时候它们的`sequence`还是一样的，
 *   然后后端会传`MSG_MOVE`，对超量素材的位置进行修正。
 *
 * * 衍生物的`Location`
 * - 在neos视角中，衍生物放在`TZONE`区域；
 * - 在ygopro后端视角中，衍生物放在`DECK`区域；
 * - 当衍生物进场和离场的时候，from和to的zone都是`DECK`，因此这里手动修改；
 * - 通过`meta.data.type`判断一张卡是否是衍生物。
 *
 * */
export default async (container: Container, move: MsgMove) => {
  const context = container.context;
  const code = move.code;
  const from = move.from;
  const to = move.to;
  const reason = move.reason;
  const fromEmpty = from.zone === EMPTY;
  const toEmpty = to.zone === EMPTY;

  const meta = fetchCard(code);
  if (meta.data.type !== undefined && (meta.data.type & TYPE_TOKEN) > 0) {
    // 衍生物
    if (from.zone === DECK) {
      // 衍生物出场的场景，设置`from.zone`为`TZONE`
      from.zone = TZONE;
    }
    if (to.zone === DECK) {
      // 衍生物离开场上的场合，设置`to.zone`为`TZONE`
      to.zone = TZONE;
    }
  }

  // log出来看看
  console.color("green")(
    `${meta.text.name} ${ygopro.CardZone[from.zone]}:${from.sequence}${
      from.is_overlay ? ":" + from.overlay_sequence : ""
    } → ${ygopro.CardZone[to.zone]}:${to.sequence}${
      to.is_overlay ? ":" + to.overlay_sequence : ""
    }`,
  );

  let target: CardType;

  if (fromEmpty) {
    target = genCard({
      uuid: v4uuid(),
      code,
      location: to,
      counters: {},
      idleInteractivities: [],
      meta,
      isToken:
        meta.data.type !== undefined && (meta.data.type & TYPE_TOKEN) > 0,
      targeted: false,
      selectInfo: {
        selectable: false,
        selected: false,
      },
      status: 0,
    });
  } else if (from.is_overlay) {
    // 超量素材的去除
    const overlayMaterial = context.cardStore.at(
      from.zone,
      from.controller,
      from.sequence,
      from.overlay_sequence,
    );
    if (overlayMaterial) {
      target = overlayMaterial;
    } else {
      console.warn(
        `<Move>overlayMaterial from zone=${from.zone}, controller=${from.controller},
          sequence=${from.sequence}, overlay_sequence=${from.overlay_sequence} is null`,
      );
      return;
    }
  } else {
    const card = context.cardStore.at(
      from.zone,
      from.controller,
      from.sequence,
    );
    if (card) {
      target = card;
    } else {
      console.warn(
        `<Move>card from zone=${from.zone}, controller=${from.controller} sequence=${from.sequence} is null`,
      );
      console.info(context.cardStore.at(from.zone, from.controller));
      return;
    }
  }

  if (to.is_overlay || from.zone !== to.zone) {
    target.baseAttack = undefined;
    target.baseDefense = undefined;
    target.currentCode = undefined;
    target.rank = undefined;
    if ([MZONE, SZONE].includes(from.zone)) target.counters = {};
    clearOnlineCardLinks(context.cardStore, target.uuid);
  }

  if (to.is_overlay && to.zone === EXTRA && (reason & REASON_MATERIAL) > 0)
    target.overlayOrigin =
      target.overlayOrigin ?? new ygopro.CardLocation(from);
  else delete target.overlayOrigin;

  if (
    !from.is_overlay &&
    !to.is_overlay &&
    to.zone === MZONE &&
    from.zone === EXTRA
  ) {
    const materials = context.cardStore
      .findOverlay(from.zone, from.controller, from.sequence)
      .sort(
        (a, b) => a.location.overlay_sequence - b.location.overlay_sequence,
      );
    for (const material of materials) {
      delete material.overlayOrigin;
      material.location = new ygopro.CardLocation({
        ...material.location.toObject(),
        controller: to.controller,
        zone: to.zone,
        sequence: to.sequence,
      });
      await callCardMove(material.uuid);
    }
  }

  // 维护sequence
  const fromCards = fromEmpty
    ? []
    : context.cardStore.at(from.zone, from.controller);
  const toCards = toEmpty ? [] : context.cardStore.at(to.zone, to.controller);

  if (
    !fromEmpty &&
    [HAND, GRAVE, REMOVED, DECK, EXTRA, TZONE].includes(from.zone) &&
    !from.is_overlay
  )
    fromCards
      .sort((a, b) => a.location.sequence - b.location.sequence)
      .forEach((c) => {
        if (c.location.sequence <= from.sequence) return;
        for (const material of context.cardStore.findOverlay(
          from.zone,
          from.controller,
          c.location.sequence,
        ))
          material.location.sequence--;
        c.location.sequence--;
      });
  if (
    !toEmpty &&
    !to.is_overlay &&
    [HAND, GRAVE, REMOVED, DECK, EXTRA, TZONE].includes(to.zone)
  )
    toCards
      .sort((a, b) => b.location.sequence - a.location.sequence)
      .forEach((c) => {
        if (c.location.sequence < to.sequence) return;
        for (const material of context.cardStore.findOverlay(
          to.zone,
          to.controller,
          c.location.sequence,
        ))
          material.location.sequence++;
        c.location.sequence++;
      });
  if (!fromEmpty && from.is_overlay) {
    // 超量素材的序号也需要维护
    const overlay_sequence = from.overlay_sequence;
    for (const overlay of context.cardStore.findOverlay(
      from.zone,
      from.controller,
      from.sequence,
    )) {
      if (overlay.location.overlay_sequence > overlay_sequence) {
        overlay.location.overlay_sequence--;
      }
    }
  }

  // 更新信息
  delete target.confirmedHandCode;
  target.code = code;
  if (from.zone !== DECK || to.zone !== DECK) target.deckPublicCode = undefined;
  if (from.zone !== DECK || to.zone !== DECK) target.deckReversed = undefined;
  target.location = to;
  if (fromEmpty) {
    context.cardStore.inner.push(target);
  }
  if (toEmpty) {
    context.cardStore.inner = context.cardStore.inner.filter(
      (card) => card.uuid !== target.uuid,
    );
    return;
  }
  target.targetFlash = undefined;
  if (!(from.zone === MZONE && to.zone === MZONE)) {
    // if the card is moved, it no longer being targeted
    // unless it move over the monster zone.
    target.targeted = false;
  }

  if (
    (to.zone !== MZONE && to.zone !== SZONE) ||
    (to.zone === MZONE && reason !== 0)
  )
    context.historyStore.putMove(context, code, from, to.zone);

  // 维护完了之后，开始播放音效和动画

  if (to.zone === REMOVED) {
    playEffect(AudioActionType.SOUND_BANISHED);
  } else if (
    (to.zone === MZONE || to.zone === SZONE) &&
    (to.position === FACEDOWN ||
      to.position === FACEDOWN_ATTACK ||
      to.position === FACEDOWN_DEFENSE)
  ) {
    playEffect(AudioActionType.SOUND_SET);
  } else if ((reason & REASON_DESTROY) > 0) {
    playEffect(AudioActionType.SOUND_DESTROYED);
  }

  const p =
    fromEmpty || target.overlayOrigin
      ? Promise.resolve()
      : callCardMove(target.uuid, { fromZone: from.zone });
  // 如果from或者to是手卡，那么需要刷新除了这张卡之外，这个玩家的所有手卡
  if ([from.zone, to.zone].includes(HAND)) {
    const pHands = context.cardStore
      .at(HAND, target.location.controller)
      .filter((c) => c.uuid !== target.uuid)
      .map(async (c) => await callCardMove(c.uuid));
    await Promise.all([p, ...pHands]);
  } else {
    await p;
  }

  // 超量素材位置跟随超量怪兽移动
  if (from.zone === MZONE && !from.is_overlay) {
    for (const overlay of context.cardStore.findOverlay(
      from.zone,
      from.controller,
      from.sequence,
    )) {
      overlay.location.zone = to.zone;
      overlay.location.controller = to.controller;
      overlay.location.sequence = to.sequence;
      overlay.location.position = to.position;

      await callCardMove(overlay.uuid);
    }
  }
};
