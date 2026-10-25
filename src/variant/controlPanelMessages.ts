const words = {
  cn: {
    position: "操作面板位置",
    left: "左侧",
    right: "右侧",
    historyOrder: "操作记录顺序",
    oldestFirst: "正序（最早在上）",
    newestFirst: "倒序（最新在上）",
    historyOrderHelp:
      "对局、观战、录像播放和测试手牌的操作记录均按此顺序显示。",
  },
  en: {
    position: "Control panel position",
    left: "Left",
    right: "Right",
    historyOrder: "Action log order",
    oldestFirst: "Oldest first",
    newestFirst: "Newest first",
    historyOrderHelp:
      "Applies to the action log in duels, spectating, replays and hand tests.",
  },
  ja: {
    position: "操作パネルの位置",
    left: "左側",
    right: "右側",
    historyOrder: "操作履歴の順序",
    oldestFirst: "古い順",
    newestFirst: "新しい順",
    historyOrderHelp:
      "対戦・観戦・リプレイ再生・手札テストの操作履歴に適用されます。",
  },
  ko: {
    position: "조작 패널 위치",
    left: "왼쪽",
    right: "오른쪽",
    historyOrder: "조작 기록 순서",
    oldestFirst: "오래된 순",
    newestFirst: "최신 순",
    historyOrderHelp:
      "대전, 관전, 리플레이 재생, 패 테스트의 조작 기록에 적용됩니다.",
  },
};
export const controlPanelMessages = (language: string) =>
  words[language as keyof typeof words] ?? words.en;
