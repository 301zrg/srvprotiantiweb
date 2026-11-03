import { SoundOutlined } from "@ant-design/icons";
import { useSnapshot } from "valtio";

import { audioBlocked } from "@/infra/audio/blocked";
import { useI18N } from "@/ui/I18N";

import styles from "./index.module.scss";

const words: Record<string, string> = {
  cn: "声音被浏览器暂停，点击任意处开启",
  en: "Sound is paused by the browser. Tap anywhere to enable it.",
  ja: "ブラウザが音声を停止しています。どこかをタップすると再生します",
  ko: "브라우저가 소리를 멈췄습니다. 아무 곳이나 탭하면 켜집니다",
};

/** Shown after a sound was skipped because autoplay kept audio suspended.
 * Any tap (this one included) resumes it through the window gesture handlers. */
export const AudioUnlockHint = ({
  source,
}: {
  source: "replay" | "online";
}) => {
  const blocked = useSnapshot(audioBlocked)[source];
  const { language } = useI18N();
  if (!blocked) return null;
  return (
    <button
      type="button"
      className={styles.hint}
      data-testid="audio-unlock-hint"
      role="status"
    >
      <SoundOutlined aria-hidden /> {words[language] || words.cn}
    </button>
  );
};
