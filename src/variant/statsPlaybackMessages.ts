const words = {
  cn: {
    current: "当前",
    original: "原本",
    printed: "卡面",
    replay: "录像播放",
    autoPlay: "打开录像时自动播放",
    peekFaceDown: "里侧卡半透明显示",
    showHands: "显示双方手牌",
    hideTitles: "隐藏录像文件名（统一显示为“录像 · 日期”）",
  },
  en: {
    current: "Current",
    original: "Original",
    printed: "Printed",
    replay: "Replay playback",
    autoPlay: "Play replays automatically when opened",
    peekFaceDown: "See-through face-down cards",
    showHands: "Show both hands",
    hideTitles: 'Hide replay file names (show "Replay · date")',
  },
  ja: {
    current: "現在",
    original: "元々",
    printed: "カード記載",
    replay: "リプレイ再生",
    autoPlay: "リプレイを開いたときに自動再生",
    peekFaceDown: "裏側カードを半透明表示",
    showHands: "両者の手札を表示",
    hideTitles: "リプレイのファイル名を隠す（「リプレイ · 日付」で表示）",
  },
  ko: {
    current: "현재",
    original: "원래",
    printed: "카드 표기",
    replay: "리플레이 재생",
    autoPlay: "리플레이를 열 때 자동 재생",
    peekFaceDown: "뒷면 카드 반투명 표시",
    showHands: "양쪽 패 표시",
    hideTitles: "리플레이 파일 이름 숨기기 ('리플레이 · 날짜'로 표시)",
  },
};
export function statsPlaybackMessages(language: string) {
  return words[language as keyof typeof words] ?? words.en;
}
