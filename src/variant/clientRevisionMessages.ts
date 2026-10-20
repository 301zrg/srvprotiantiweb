/** User-approved copy for client preview follow-ups. */
const messages = {
  cn: {
    expandLogs: "展开记录面板",
    collapseLogs: "收起记录面板",
    hidePlayerIds: "隐藏双方玩家 ID",
    hidePlayerIdsHelp: "将双方玩家 ID 统一显示为固定的 ********。",
    rpsWin: "猜拳结果：获胜",
    rpsLose: "猜拳结果：落败",
    rpsTie: "猜拳结果：平局",
    pileOrder: "当前顺序：从牌堆顶部到底部。",
    sourceIntro: "本项目开源地址位于：",
    playedRps: "本次已出：{hand}",
    showZoneCounts: "显示区域卡片数量",
    showZoneCountsHelp:
      "在主卡组、额外卡组、墓地和除外区显示数量角标；关闭后仍可点击区域查看数量。",
    practiceSetup: "练习设置",
    practiceHelp:
      "固定我方在下、对方在上，双方手牌与里侧卡可见。点击卡片选择动作，由你处理双方的操作与连锁；可进入的阶段以当前规则为准。",
  },
  en: {
    expandLogs: "Expand log panel",
    collapseLogs: "Collapse log panel",
    hidePlayerIds: "Hide both player IDs",
    hidePlayerIdsHelp: "Replace both player IDs with the fixed text ********.",
    rpsWin: "Rock-paper-scissors: you won.",
    rpsLose: "Rock-paper-scissors: you lost.",
    rpsTie: "Rock-paper-scissors: tie.",
    pileOrder: "Current order: top to bottom of the pile.",
    sourceIntro: "This project's source code is available at:",
    playedRps: "Played: {hand}",
    showZoneCounts: "Show card counts on zones",
    showZoneCountsHelp:
      "Show count badges on the Main Deck, Extra Deck, Graveyard and banishment zones. Counts remain available by opening a zone when badges are hidden.",
    practiceSetup: "Practice setup",
    practiceHelp:
      "Your side stays at the bottom, with both hands and face-down cards visible. Click cards to choose actions and handle both players' actions and chains. Available phases follow the current rules.",
  },
  ja: {
    expandLogs: "ログパネルを展開",
    collapseLogs: "ログパネルを折りたたむ",
    hidePlayerIds: "双方のプレイヤーIDを隠す",
    hidePlayerIdsHelp: "双方のプレイヤーIDを固定の ******** で表示します。",
    rpsWin: "じゃんけんの結果：勝ち",
    rpsLose: "じゃんけんの結果：負け",
    rpsTie: "じゃんけんの結果：引き分け",
    pileOrder: "現在の順序：山札の上から下へ。",
    sourceIntro: "このプロジェクトのソースコード：",
    playedRps: "今回の手：{hand}",
    showZoneCounts: "各ゾーンのカード枚数を表示",
    showZoneCountsHelp:
      "デッキ・エクストラデッキ・墓地・除外ゾーンに枚数を表示します。非表示にしても、ゾーンを開けば枚数を確認できます。",
    practiceSetup: "練習設定",
    practiceHelp:
      "自分は下、相手は上に固定し、双方の手札と裏側のカードを表示します。カードをクリックして操作を選び、双方の行動とチェーンに応答します。移行できるフェイズは現在のルールに従います。",
  },
  ko: {
    expandLogs: "기록 패널 펼치기",
    collapseLogs: "기록 패널 접기",
    hidePlayerIds: "양쪽 플레이어 ID 숨기기",
    hidePlayerIdsHelp: "양쪽 플레이어 ID를 고정된 ********로 표시합니다.",
    rpsWin: "가위바위보 결과: 승리",
    rpsLose: "가위바위보 결과: 패배",
    rpsTie: "가위바위보 결과: 무승부",
    pileOrder: "현재 순서: 카드 더미의 맨 위부터 맨 아래까지.",
    sourceIntro: "이 프로젝트의 소스 코드:",
    playedRps: "이번에 낸 패: {hand}",
    showZoneCounts: "각 존의 카드 수 표시",
    showZoneCountsHelp:
      "메인 덱·엑스트라 덱·묘지·제외 존에 카드 수를 표시합니다. 숨겨도 존을 열어 카드 수를 확인할 수 있습니다.",
    practiceSetup: "연습 설정",
    practiceHelp:
      "자신은 아래, 상대는 위에 고정하며 양쪽 패와 뒷면 카드를 표시합니다. 카드를 눌러 행동을 선택하고 양쪽의 행동과 체인에 응답합니다. 이동 가능한 페이즈는 현재 규칙을 따릅니다.",
  },
};
export const clientRevisionMessages = (language: string) =>
  messages[language as keyof typeof messages] ?? messages.en;
