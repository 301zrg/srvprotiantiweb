// 暂时先简单实现攻击动画，后面有时间再慢慢优化
import { easings } from "@react-spring/web";

import { isMe } from "@/stores";
import { zoneRect } from "@/ui/Shared/DuelBoard/geometry";

import { onlineSpot } from "../../boardSpot";
import { matConfig } from "../../css";
import type { AttackFunc } from "./types";
import { asyncStart } from "./utils";

export const attack: AttackFunc = async (props) => {
  const { BLOCK_HEIGHT_M, BLOCK_HEIGHT_S } = matConfig;
  const { card, api, options, signal } = props;
  const current = api.current[0].get();

  let x = current.x;
  let y = current.y;
  let rz = current.rz;
  if (options?.directAttack) {
    // 直接攻击
    y = BLOCK_HEIGHT_M + BLOCK_HEIGHT_S;

    if (isMe(card.location.controller)) {
      y = -y;
    }
  } else if (options?.target) {
    // 攻击`target`
    ({ x, y } = zoneRect(matConfig, onlineSpot(options.target)!));

    rz += -Math.atan((x - current.x) / (y - current.y)) / (Math.PI / 180);
  } else {
    console.error(`<Spring/Attack>directAttack is false and target is null.`);
    return;
  }

  // 先浮空
  await asyncStart(
    api,
    signal,
  )({
    z: 200,
  });
  // 后撤半个卡位，并调整倾斜角
  await asyncStart(
    api,
    signal,
  )({
    y:
      current.y +
      (BLOCK_HEIGHT_M / 2) * (isMe(card.location.controller) ? 1 : -1),
    rz,
  });
  // 加速前冲
  await asyncStart(
    api,
    signal,
  )({
    x,
    y,
    config: {
      easing: easings.easeInOutSine,
    },
  });
  // 减速归位
  await asyncStart(
    api,
    signal,
  )({
    x: current.x,
    y: current.y,
    z: current.z,
    rz: current.rz,
    config: {
      easing: easings.easeInOutQuad,
    },
  });
};
