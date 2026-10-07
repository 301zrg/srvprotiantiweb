/* eslint valtio/avoid-this-in-proxy: 0 */
import { proxy } from "valtio";

import { ygopro } from "@/api";

import { type NeosStore } from "../shared";
import { ChainSetting, InitInfo, MatState } from "./types";

/**
 * 根据controller判断是自己还是对方。
 * 这个无需export，尽量逻辑收拢在store内部。
 */
const getWhom = (controller: number): "me" | "op" =>
  isMe(controller) ? "me" : "op";

/**
 * 根据自己的先后手判断是否是自己
 * 原本名字叫judgeSelf
 */
export const isMe = (controller: number): boolean => {
  // FIXME: all of the `matStore` need to access with container
  switch (matStore.selfType) {
    case 1:
      // 自己是先攻
      return controller === 0;
    case 2:
      // 自己是后攻
      return controller === 1;
    default:
      // 自己是观战者
      // 这里假设偶数方的玩家是自己
      return controller % 2 === 0;
  }
};

const defaultInitInfo = {
  masterRule: "UNKNOWN",
  name: "?",
  life: -1, // 特地设置一个不可能的值
  deckSize: 0,
  extraSize: 0,
};

const initInfo: MatState["initInfo"] = proxy({
  me: { ...defaultInitInfo },
  op: { ...defaultInitInfo },
  of: (controller: number) => initInfo[getWhom(controller)],
  set: (controller: number, obj: Partial<InitInfo>) => {
    initInfo[getWhom(controller)] = {
      ...initInfo[getWhom(controller)],
      ...obj,
    };
  },
});

const initialState: Omit<MatState, "reset"> = {
  chains: [],
  timeLimits: {
    // 时间限制
    me: -1,
    op: -1,
    of: (controller: number) => matStore.timeLimits[getWhom(controller)],
    set: (controller: number, time: number) => {
      matStore.timeLimits[getWhom(controller)] = time;
    },
  },
  initInfo,
  selfType: ygopro.StocTypeChange.SelfType.UNKNOWN,
  observerSwapped: false,
  observerView: 0,
  hint: { code: -1 },
  currentPlayer: -1,
  phase: {
    currentPhase: ygopro.StocGameMessage.MsgNewPhase.PhaseType.UNKNOWN,
    enableBp: false, // 允许进入战斗阶段
    enableM2: false, // 允许进入M2阶段
    enableEp: false, // 允许回合结束
  },
  unimplemented: 0,
  handResults: {
    me: 0,
    op: 0,
    of: (controller: number) => matStore.handResults[getWhom(controller)],
    set(controller, result) {
      matStore.handResults[getWhom(controller)] = result;
    },
  },
  tossResult: undefined,
  selectUnselectInfo: {
    finishable: false,
    cancelable: false,
    selectableList: [],
    selectedList: [],
  },
  chainSetting: ChainSetting.CHAIN_SMART,
  duelEnd: false,
  // methods
  isMe,
  turnCount: 0,
  error: "",
};

export class MatStore implements MatState, NeosStore {
  chains = initialState.chains;
  chainSetting = initialState.chainSetting;
  timeLimits = initialState.timeLimits;
  initInfo = initialState.initInfo;
  selfType = initialState.selfType;
  observerSwapped = initialState.observerSwapped;
  observerView: 0 | 1 = 0;
  hint = initialState.hint;
  currentPlayer = initialState.currentPlayer;
  phase = initialState.phase;
  unimplemented = initialState.unimplemented;
  handResults = initialState.handResults;
  tossResult = initialState.tossResult;
  selectUnselectInfo = initialState.selectUnselectInfo;
  duelEnd = initialState.duelEnd;
  turnCount = initialState.turnCount;
  error = initialState.error;

  // methods
  isMe = initialState.isMe;
  reset(): void {
    this.chains = [];
    this.timeLimits.me = -1;
    this.timeLimits.op = -1;
    this.initInfo.me = defaultInitInfo;
    this.initInfo.op = defaultInitInfo;
    this.selfType = ygopro.StocTypeChange.SelfType.UNKNOWN;
    this.observerSwapped = false;
    this.observerView = 0;
    this.hint = { code: -1 };
    this.currentPlayer = -1;
    this.phase = {
      currentPhase: ygopro.StocGameMessage.MsgNewPhase.PhaseType.UNKNOWN,
      enableBp: false, // 允许进入战斗阶段
      enableM2: false, // 允许进入M2阶段
      enableEp: false, // 允许回合结束
    };
    this.unimplemented = 0;
    this.handResults.me = 0;
    this.handResults.op = 0;
    this.tossResult = undefined;
    this.selectUnselectInfo = {
      finishable: false,
      cancelable: false,
      selectableList: [],
      selectedList: [],
    };
    this.duelEnd = false;
    this.turnCount = 0;
    this.error = initialState.error;
  }
}

/**
 * 💡 决斗盘状态仓库，本文件核心，
 * 具体介绍可以点进`MatState`去看
 */
export const matStore = proxy<MatStore>(new MatStore());

// @ts-ignore 挂到全局，便于调试
window.matStore = matStore;
