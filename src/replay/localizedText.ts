import chinese from "../ui/I18N/Source/Chinese/translation.json";
import english from "../ui/I18N/Source/English/translation.json";
import japanese from "../ui/I18N/Source/Japanese/translation.json";
import korean from "../ui/I18N/Source/Korean/translation.json";
import type { Language } from "../variant/languageLink";
import diagnostics from "./diagnosticMessages.json";

const ui = {
  cn: chinese.ClientUI,
  en: english.ClientUI,
  ja: japanese.ClientUI,
  ko: korean.ClientUI,
};

/** Localize stored reasons / worker messages at render time, including old files. */
export function localizeReplayText(text: string, language: Language): string {
  const exact = (diagnostics as Record<string, Record<Language, string>>)[text];
  if (exact) return exact[language];
  for (const messages of Object.values(ui)) {
    const key = (Object.keys(messages) as (keyof typeof messages)[]).find(
      (k) => messages[k] === text,
    );
    if (key) return ui[language][key];
  }
  const patterns: [RegExp, Record<Language, string>][] = [
    [
      /^正在加载 (.+)$/,
      {
        cn: "正在加载 $1",
        en: "Loading $1",
        ja: "$1 を読み込み中",
        ko: "$1 불러오는 중",
      },
    ],
    [
      /^播放资源请求失败：(.+)$/,
      {
        cn: "播放资源请求失败：$1",
        en: "Playback resource request failed: $1",
        ja: "再生リソースの取得に失敗しました：$1",
        ko: "재생 리소스 요청 실패: $1",
      },
    ],
    [
      /^录像版本 (.+) 尚未验证，暂仅保存与下载$/,
      {
        cn: "录像版本 $1 尚未验证，暂仅保存与下载",
        en: "Replay version $1 is unverified; saving and downloading only",
        ja: "リプレイバージョン $1 は未検証です。保存とダウンロードのみ対応します",
        ko: "리플레이 버전 $1은 미검증 상태로 저장과 다운로드만 지원합니다",
      },
    ],
    [
      /^不支持(?:的)? Core 消息[：: ](.*)$/,
      {
        cn: "不支持的 Core 消息：$1",
        en: "Unsupported Core message: $1",
        ja: "未対応のCoreメッセージ：$1",
        ko: "지원하지 않는 Core 메시지: $1",
      },
    ],
  ];
  for (const [pattern, messages] of patterns)
    if (pattern.test(text)) return text.replace(pattern, messages[language]);
  return text;
}
