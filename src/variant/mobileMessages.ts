import { type Language } from "./index";

const messages = {
  cn: {
    manageDecks: "卡组管理",
    editDeck: "编辑卡组",
    searchCards: "搜索卡片",
    close: "关闭",
    cardDetails: "卡片详情",
    history: "操作历史",
    chat: "聊天",
    settings: "设置",
    messageSettings: "消息",
    serverMessagePopups: "弹出服务器消息",
    serverMessagePopupsHelp:
      "关闭后，服务器消息仍会显示在聊天记录中。此设置会保存在当前浏览器。",
    emptyHistory: "暂无操作记录",
    viewCard: "查看卡片",
    declaredCard: "宣言卡片",
    cardHint: "卡片提示",
    switchView: "切换视角",
    leaveSpectating: "退出观战",
    observerWaitSide: "等待双方换备，下一局将自动继续观战",
  },
  en: {
    manageDecks: "Decks",
    editDeck: "Edit deck",
    searchCards: "Search cards",
    close: "Close",
    cardDetails: "Card details",
    history: "History",
    chat: "Chat",
    settings: "Settings",
    messageSettings: "Messages",
    serverMessagePopups: "Show server message popups",
    serverMessagePopupsHelp:
      "When off, server messages still appear in chat. This setting is saved in this browser.",
    emptyHistory: "No actions yet",
    viewCard: "View card",
    declaredCard: "Declared card",
    cardHint: "Card hint",
    switchView: "Switch view",
    leaveSpectating: "Leave spectator mode",
    observerWaitSide:
      "Waiting for side decking. The next game will start automatically.",
  },
  ja: {
    manageDecks: "デッキ管理",
    editDeck: "デッキ編集",
    searchCards: "カード検索",
    close: "閉じる",
    cardDetails: "カード詳細",
    history: "操作履歴",
    chat: "チャット",
    settings: "設定",
    messageSettings: "メッセージ",
    serverMessagePopups: "サーバーメッセージをポップアップ表示",
    serverMessagePopupsHelp:
      "オフでもサーバーのメッセージはチャットに表示されます。このブラウザーに設定を保存します。",
    emptyHistory: "操作履歴はありません",
    viewCard: "カードを見る",
    declaredCard: "宣言したカード",
    cardHint: "カードのヒント",
    switchView: "視点切替",
    leaveSpectating: "観戦を終了",
    observerWaitSide:
      "両者のサイドチェンジを待っています。次の対戦も自動で観戦します。",
  },
  ko: {
    manageDecks: "덱 관리",
    editDeck: "덱 편집",
    searchCards: "카드 검색",
    close: "닫기",
    cardDetails: "카드 정보",
    history: "기록",
    chat: "채팅",
    settings: "설정",
    messageSettings: "메시지",
    serverMessagePopups: "서버 메시지 팝업 표시",
    serverMessagePopupsHelp:
      "꺼도 서버 메시지는 채팅 기록에 표시됩니다. 이 설정은 현재 브라우저에 저장됩니다.",
    emptyHistory: "기록이 없습니다",
    viewCard: "카드 보기",
    declaredCard: "선언한 카드",
    cardHint: "카드 힌트",
    switchView: "시점 전환",
    leaveSpectating: "관전 종료",
    observerWaitSide:
      "양측의 사이드 교체를 기다리는 중입니다. 다음 게임을 자동으로 관전합니다.",
  },
} as const;

export const mobileMessages = (language: string) =>
  messages[language as Language] ?? messages.en;
