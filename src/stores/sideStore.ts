import { proxy } from "valtio";

import { emptyDeck, IDeck } from "./deckStore";
import { type NeosStore } from "./shared";

const KEY = "side_deck";

export enum SideStage {
  NONE = 0, // 没有进入SIDE阶段
  SIDE_CHANGING = 1, // 正在更换副卡组
  SIDE_CHANGED = 2, // 副卡组更换完毕
  TP_SELECTING = 5, // 正在选边
  TP_SELECTED = 6, // 选边完成
  DUEL_START = 7, // 决斗开始
  WAITING = 8, // 观战者等待双方玩家
}

export class SideStore implements NeosStore {
  stage: SideStage = SideStage.NONE;

  // 换备牌组只属于当前标签页的连接；localStorage 会让同源的对手标签页互相覆盖。
  // sessionStorage 保留本标签页刷新后的数据，但在离开房间时清除。
  //
  // TODO: 后续应该有个`Storage`模块统一管理浏览器存储的数据，
  // 这样一来卡组cdb还有文案的一些数据都可以做持久化存储，减少
  // 网络请求量。
  setSideDeck(deck: IDeck) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(deck));
    } catch (err) {
      console.warn(`save side in sessionStorage error: ${err}`);
    }
  }
  getSideDeck(): IDeck {
    try {
      const json = sessionStorage.getItem(KEY);
      if (!json) return emptyDeck;
      const deck = JSON.parse(json) as IDeck;
      if (
        !Array.isArray(deck.main) ||
        !Array.isArray(deck.extra) ||
        !Array.isArray(deck.side)
      ) {
        return emptyDeck;
      }
      return deck;
    } catch {
      return emptyDeck;
    }
  }
  reset(): void {
    this.stage = SideStage.NONE;
    try {
      sessionStorage.removeItem(KEY);
    } catch (err) {
      console.warn(`clear side in sessionStorage error: ${err}`);
    }
  }
}

export const sideStore = proxy(new SideStore());
