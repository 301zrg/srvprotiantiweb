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
    chatOrderHelp: "对局、观战和换备中的玩家与系统消息按此顺序显示。",
    spectatorKeepSeat: "观战换备后保持视角不换边",
    spectatorKeepSeatHelp:
      "开启时，下一局继续让同一位玩家显示在下方，不随先后手变化；关闭时每局以先攻方在下方。手动切换视角后会记住所选玩家。",
    cardCache: "卡图缓存",
    clearCardCache: "清理卡图缓存",
    cardCacheHelp:
      "卡图会缓存在本机以免重复下载，最多约 600 张，存储空间紧张时自动停止缓存。清理只删除卡图，不影响卡组、录像和联机输入。",
    cardCacheCleared: "已清理卡图缓存。卡组、录像和联机输入未受影响。",
    cardCacheEmpty: "当前没有可清理的卡图缓存。",
    zoneIndexes: "显示区域编号",
    zoneIndexesHelp:
      "在怪兽区和魔法陷阱区格子右下角显示 1–5，对应操作记录中的“怪兽区 3”等位置；对方区域按对方自己的编号。",
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
    chatOrderHelp:
      "Player and system messages in duels, while spectating and while siding.",
    spectatorKeepSeat: "Keep the spectator view after siding",
    spectatorKeepSeatHelp:
      "When on, the same player stays at the bottom in the next game regardless of who goes first. When off, the first player is at the bottom each game. A manual view switch is remembered.",
    cardCache: "Card image cache",
    clearCardCache: "Clear card image cache",
    cardCacheHelp:
      "Card images are kept on this device to avoid downloading them again (about 600 at most; caching stops when storage is low). Clearing removes only card images, not decks, replays or connection inputs.",
    cardCacheCleared:
      "Card image cache cleared. Decks, replays and inputs are unchanged.",
    cardCacheEmpty: "There is no card image cache to clear.",
    zoneIndexes: "Show zone numbers",
    zoneIndexesHelp:
      'Shows 1-5 in the corner of each Monster and Spell & Trap Zone, matching places such as "Monster Zone 3" in the action log. The opponent\'s zones use their own numbering.',
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
      "対戦・観戦・サイドデッキ調整中のプレイヤーとシステムのメッセージに適用されます。",
    spectatorKeepSeat: "サイデッキング後も観戦視点を固定",
    spectatorKeepSeatHelp:
      "オンにすると、先攻・後攻に関係なく次のゲームも同じプレイヤーを下側に表示します。オフでは各ゲームの先攻プレイヤーが下側です。手動で切り替えた視点は記憶されます。",
    cardCache: "カード画像キャッシュ",
    clearCardCache: "カード画像キャッシュを削除",
    cardCacheHelp:
      "カード画像を端末に保存し、再ダウンロードを防ぎます（最大約600枚、容量が少ない場合は保存を停止）。削除するのはカード画像のみで、デッキ・リプレイ・接続入力は残ります。",
    cardCacheCleared:
      "カード画像キャッシュを削除しました。デッキ・リプレイ・入力は変わりません。",
    cardCacheEmpty: "削除できるカード画像キャッシュはありません。",
    zoneIndexes: "ゾーン番号を表示",
    zoneIndexesHelp:
      "モンスターゾーンと魔法・罠ゾーンの隅に 1–5 を表示し、操作履歴の「モンスターゾーン 3」などに対応させます。相手のゾーンは相手側の番号です。",
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
    chatOrderHelp:
      "대전, 관전, 사이드 덱 교체 중 플레이어 및 시스템 메시지에 적용됩니다.",
    spectatorKeepSeat: "사이드 후 관전 시점 유지",
    spectatorKeepSeatHelp:
      "켜면 선후공과 관계없이 다음 게임에도 같은 플레이어를 아래쪽에 표시합니다. 끄면 매 게임 선공 플레이어가 아래쪽입니다. 직접 전환한 시점은 기억됩니다.",
    cardCache: "카드 이미지 캐시",
    clearCardCache: "카드 이미지 캐시 삭제",
    cardCacheHelp:
      "카드 이미지를 기기에 저장해 다시 내려받지 않습니다(최대 약 600장, 저장 공간이 부족하면 저장 중지). 삭제는 카드 이미지만 지우며 덱, 리플레이, 접속 입력은 남습니다.",
    cardCacheCleared:
      "카드 이미지 캐시를 삭제했습니다. 덱, 리플레이, 입력은 그대로입니다.",
    cardCacheEmpty: "삭제할 카드 이미지 캐시가 없습니다.",
    zoneIndexes: "구역 번호 표시",
    zoneIndexesHelp:
      '몬스터 존과 마법·함정 존 모서리에 1–5를 표시해 조작 기록의 "몬스터 존 3" 등과 대응시킵니다. 상대 구역은 상대 기준 번호입니다.',
  },
};
export const controlPanelMessages = (language: string) =>
  words[language as keyof typeof words] ?? words.en;
