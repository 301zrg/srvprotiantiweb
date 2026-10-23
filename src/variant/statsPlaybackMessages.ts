const words = {
  cn: {
    current: "当前",
    original: "原本",
    printed: "卡面",
    replay: "录像播放",
    autoPlay: "打开录像时自动播放",
  },
  en: {
    current: "Current",
    original: "Original",
    printed: "Printed",
    replay: "Replay playback",
    autoPlay: "Play replays automatically when opened",
  },
  ja: {
    current: "現在",
    original: "元々",
    printed: "カード記載",
    replay: "リプレイ再生",
    autoPlay: "リプレイを開いたときに自動再生",
  },
  ko: {
    current: "현재",
    original: "원래",
    printed: "카드 표기",
    replay: "리플레이 재생",
    autoPlay: "리플레이를 열 때 자동 재생",
  },
};
export function statsPlaybackMessages(language: string) {
  return words[language as keyof typeof words] ?? words.en;
}
