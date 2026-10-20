import { easings } from "@react-spring/web";

import { ygopro } from "@/api";
import { cardStore, isMe } from "@/stores";

import { matConfig } from "../../css";
import { materialOffset } from "../../materials";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { MZONE, SZONE, TZONE } = ygopro.CardZone;

export const moveToGround: MoveFunc = async (props) => {
  const {
    BLOCK_WIDTH,
    BLOCK_HEIGHT_M,
    BLOCK_HEIGHT_S,
    MONSTER_ROW_Y,
    SPELL_ROW_Y,
    CARD_RATIO,
    COL_GAP,
    BLOCK_OUTSIDE_OFFSET_X,
    CARD_HEIGHT_O,
  } = matConfig;
  const { card, api, options } = props;

  const { location } = card;

  const { controller, zone, sequence, is_overlay } = location;
  const position = is_overlay
    ? cardStore.at(zone, controller, sequence)?.location.position
    : location.position;

  let height = zone === SZONE ? BLOCK_HEIGHT_S : BLOCK_HEIGHT_M;

  // 首先计算 x 和 y
  let x = 0,
    y = 0;
  switch (zone) {
    case SZONE: {
      if (sequence === 5) {
        height = CARD_HEIGHT_O;
        // 场地魔法
        x = -(
          BLOCK_WIDTH * 2.5 +
          COL_GAP * 2 +
          BLOCK_OUTSIDE_OFFSET_X +
          CARD_HEIGHT_O * CARD_RATIO * 0.5
        );
        y = SPELL_ROW_Y;
      } else {
        x = (sequence - 2) * (BLOCK_WIDTH + COL_GAP);
        y = SPELL_ROW_Y;
      }
      break;
    }
    case MZONE: {
      if (sequence > 4) {
        // 额外怪兽区
        x = (sequence > 5 ? 1 : -1) * (BLOCK_WIDTH + COL_GAP);
        y = 0;
      } else {
        x = (sequence - 2) * (BLOCK_WIDTH + COL_GAP);
        y = MONSTER_ROW_Y;
      }
      break;
    }
  }

  if (!isMe(controller)) {
    x = -x;
    y = -y;
  }

  // 判断是不是防御表示
  const defence = [
    ygopro.CardPosition.DEFENSE,
    ygopro.CardPosition.FACEDOWN_DEFENSE,
    ygopro.CardPosition.FACEUP_DEFENSE,
  ].includes(position ?? 5);
  height = defence ? BLOCK_WIDTH : height;
  const rz = (isMe(controller) ? 0 : 180) + (defence ? 90 : 0);

  if (is_overlay) {
    const offset = materialOffset(
      location.overlay_sequence,
      cardStore.findOverlay(zone, controller, sequence).length,
      height,
      rz,
    );
    x += offset.x;
    y += offset.y;
  }
  const ry =
    !is_overlay &&
    [
      ygopro.CardPosition.FACEDOWN,
      ygopro.CardPosition.FACEDOWN_ATTACK,
      ygopro.CardPosition.FACEDOWN_DEFENSE,
    ].includes(position ?? 5)
      ? 180
      : 0;

  // 动画
  const isToken = options?.fromZone === TZONE;
  if (isToken) {
    // 如果是Token，直接先移动到那个位置，然后再放大
    api.set({
      x,
      y,
      ry,
      rz,
      height: 0,
    });
  } else {
    await asyncStart(api)({
      x,
      y,
      height,
      z: is_overlay ? 120 : 200,
      ry,
      rz,
      config: {
        duration: getDuration(),
        clamp: true,
        easing: easings.easeOutSine,
      },
    });
  }

  await asyncStart(api)({
    height,
    z: 0,
    subZ: isToken ? 100 : 0,
    zIndex: is_overlay ? 2 : 3,
    config: {
      easing: easings.easeInQuad,
      duration: 100,
      clamp: true,
    },
  });
  if (isToken) api.set({ subZ: 0 });
};
