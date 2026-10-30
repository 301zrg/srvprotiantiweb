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
    historyStyle: "操作记录显示方式",
    historyStyleAuto: "自动（手机文字、电脑图文）",
    historyStyleImage: "图文（显示卡图）",
    historyStyleText: "文字（卡名可点开详情）",
    historyStyleHelp:
      "文字模式不显示卡图和图标，同样空间内能看到更多记录；对局、观战、录像播放和测试手牌通用。",
    chatOrder: "聊天消息顺序",
    chatFollowHistory: "跟随操作记录顺序",
    chatOrderHelp: "对局和观战中的玩家与系统消息按此顺序显示。",
    spectatorKeepSeat: "观战换备后保持视角不换边",
    spectatorKeepSeatHelp:
      "开启时，下一局继续让同一位玩家显示在下方，不随先后手变化；关闭时每局以先攻方在下方。手动切换视角后会记住所选玩家。",
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
    historyStyle: "Action log style",
    historyStyleAuto: "Auto (text on phones, cards on computers)",
    historyStyleImage: "Card images",
    historyStyleText: "Text (card names open details)",
    historyStyleHelp:
      "Text mode omits card art and icons so more entries fit. Applies to duels, spectating, replays and hand tests.",
    chatOrder: "Chat order",
    chatFollowHistory: "Same as the action log",
    chatOrderHelp: "Player and system messages in duels and while spectating.",
    spectatorKeepSeat: "Keep the spectator view after siding",
    spectatorKeepSeatHelp:
      "When on, the same player stays at the bottom in the next game regardless of who goes first. When off, the first player is at the bottom each game. A manual view switch is remembered.",
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
    historyStyle: "操作履歴の表示",
    historyStyleAuto: "自動（スマホは文字、PC は画像）",
    historyStyleImage: "画像付き",
    historyStyleText: "文字（カード名で詳細を表示）",
    historyStyleHelp:
      "文字表示はカード画像とアイコンを省き、より多くの履歴を表示します。対戦・観戦・リプレイ・手札テストに適用されます。",
    chatOrder: "チャットの順序",
    chatFollowHistory: "操作履歴と同じ",
    chatOrderHelp:
      "対戦・観戦中のプレイヤーとシステムのメッセージに適用されます。",
    spectatorKeepSeat: "サイデッキング後も観戦視点を固定",
    spectatorKeepSeatHelp:
      "オンにすると、先攻・後攻に関係なく次のゲームも同じプレイヤーを下側に表示します。オフでは各ゲームの先攻プレイヤーが下側です。手動で切り替えた視点は記憶されます。",
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
    historyStyle: "조작 기록 표시",
    historyStyleAuto: "자동 (휴대폰은 텍스트, PC는 이미지)",
    historyStyleImage: "카드 이미지",
    historyStyleText: "텍스트 (카드명으로 상세 보기)",
    historyStyleHelp:
      "텍스트 모드는 카드 이미지와 아이콘을 생략해 더 많은 기록을 보여 줍니다. 대전, 관전, 리플레이, 패 테스트에 적용됩니다.",
    chatOrder: "채팅 순서",
    chatFollowHistory: "조작 기록과 같게",
    chatOrderHelp: "대전과 관전 중 플레이어 및 시스템 메시지에 적용됩니다.",
    spectatorKeepSeat: "사이드 후 관전 시점 유지",
    spectatorKeepSeatHelp:
      "켜면 선후공과 관계없이 다음 게임에도 같은 플레이어를 아래쪽에 표시합니다. 끄면 매 게임 선공 플레이어가 아래쪽입니다. 직접 전환한 시점은 기억됩니다.",
  },
};
export const controlPanelMessages = (language: string) =>
  words[language as keyof typeof words] ?? words.en;
