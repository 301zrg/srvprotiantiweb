const words = {
  cn: { position: "操作面板位置", left: "左侧", right: "右侧" },
  en: { position: "Control panel position", left: "Left", right: "Right" },
  ja: { position: "操作パネルの位置", left: "左側", right: "右側" },
  ko: { position: "조작 패널 위치", left: "왼쪽", right: "오른쪽" },
};
export const controlPanelMessages = (language: string) =>
  words[language as keyof typeof words] ?? words.en;
