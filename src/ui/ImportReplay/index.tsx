import "../Replay/style.css";

import { Alert, App, Button, Spin } from "antd";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { saveReplay } from "@/replay/library";
import {
  captureReplayImport,
  isCurrentReplayImport,
  type ReplayImportSession,
} from "@/variant/replayImportSession";

import { useI18N } from "../I18N";
import { disconnectSrvpro } from "../Match/util";

const messages = {
  cn: {
    title: "接收官网录像",
    waiting: "正在等待官网发送录像…",
    saving: "正在保存录像原件…",
    cancel: "取消",
    library: "打开录像库",
    failed: "无法接收录像，请返回官网重试，或下载后从录像库导入。",
    denied: "此来源未获允许，请从天梯官网打开。",
    large: "录像超过接收限制，请下载后导入。",
    memory: "录像仅临时保存，请立即下载备份。",
    unsupported: "原件已保存；该格式暂不支持播放。",
  },
  en: {
    title: "Receive website replay",
    waiting: "Waiting for the website…",
    saving: "Saving the original replay…",
    cancel: "Cancel",
    library: "Replay library",
    failed:
      "Replay transfer failed. Retry from the website, or download and import the file.",
    denied: "This source is not allowed. Open from the ladder website.",
    large: "Replay exceeds the handoff limit. Download and import the file.",
    memory: "Replay stored temporarily. Download a backup now.",
    unsupported: "Original saved; playback is not supported for this format.",
  },
  ja: {
    title: "サイトのリプレイを受信",
    waiting: "サイトからの送信を待っています…",
    saving: "リプレイの原本を保存中…",
    cancel: "キャンセル",
    library: "リプレイ一覧",
    failed:
      "受信できません。サイトから再試行するか、保存してインポートしてください。",
    denied: "許可されていない送信元です。ランキングサイトから開いてください。",
    large: "受信サイズの制限を超えています。保存してインポートしてください。",
    memory: "一時保存です。今すぐバックアップを保存してください。",
    unsupported: "原本を保存しました。この形式は再生できません。",
  },
  ko: {
    title: "사이트 리플레이 받기",
    waiting: "사이트의 전송을 기다리는 중…",
    saving: "원본 리플레이 저장 중…",
    cancel: "취소",
    library: "리플레이 목록",
    failed:
      "전송에 실패했습니다. 사이트에서 다시 시도하거나 다운로드 후 가져오세요.",
    denied: "허용되지 않은 출처입니다. 랭킹 사이트에서 여세요.",
    large: "전송 크기 제한을 초과했습니다. 다운로드 후 가져오세요.",
    memory: "임시 저장입니다. 지금 백업을 다운로드하세요.",
    unsupported: "원본을 저장했습니다. 이 형식은 재생할 수 없습니다.",
  },
};
const pending = new WeakMap<
  ReplayImportSession,
  ReturnType<typeof saveReplay>
>();
export function Component() {
  const location = useLocation();
  const session = useMemo(
    () => captureReplayImport()!,
    [location.key, location.search],
  );
  return <ImportFlow key={location.key} session={session} />;
}
function ImportFlow({ session }: { session: ReplayImportSession }) {
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = messages[language as keyof typeof messages] || messages.cn;
  const { message } = App.useApp();
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    disconnectSrvpro();
  }, []);
  useEffect(() => {
    if (snapshot.input && !snapshot.error && isCurrentReplayImport(session)) {
      let task = pending.get(session);
      if (!task) {
        task = saveReplay(snapshot.input.bytes, snapshot.input.filename);
        pending.set(session, task);
      }
      void task
        .then((entry) => {
          if (!isCurrentReplayImport(session)) return;
          session.finish(entry.temporary ? "memory-only" : "saved");
          if (entry.temporary) message.warning(text.memory, 10);
          if (!entry.header.playable) message.info(text.unsupported, 8);
          navigate(
            entry.header.playable
              ? `/replays?id=${encodeURIComponent(entry.id)}`
              : "/replays",
            { replace: true },
          );
        })
        .catch(() => {
          if (!isCurrentReplayImport(session)) return;
          session.finish("failed");
          setFailed(true);
        });
    }
    return () => {
      if (!window.location.hash.startsWith("#/replay-import"))
        session.finish("cancelled");
    };
  }, [snapshot.input, snapshot.error, session, navigate, message, text]);
  const error = snapshot.error || failed;
  return (
    <main className="replay-page" data-testid="replay-import-page">
      <header className="replay-header">
        <h1>{text.title}</h1>
      </header>
      {error ? (
        <Alert
          data-testid="replay-import-error"
          type="error"
          showIcon
          message={
            snapshot.error === "source-denied"
              ? text.denied
              : snapshot.error === "too-large"
              ? text.large
              : text.failed
          }
        />
      ) : (
        <p className="replay-note">
          <Spin /> {snapshot.input ? text.saving : text.waiting}
        </p>
      )}
      <div className="replay-actions" style={{ marginTop: 20 }}>
        <Button
          onClick={() => {
            session.finish("cancelled");
            navigate("/replays", { replace: true });
          }}
        >
          {error ? text.library : text.cancel}
        </Button>
      </div>
    </main>
  );
}
