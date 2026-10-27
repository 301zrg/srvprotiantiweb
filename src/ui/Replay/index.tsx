import "./style.css";

import {
  AppstoreOutlined,
  CaretRightOutlined,
  CompressOutlined,
  DownloadOutlined,
  ExportOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  PauseOutlined,
  ReloadOutlined,
  SettingOutlined,
  SoundOutlined,
  StepForwardOutlined,
  SwapOutlined,
  UnorderedListOutlined,
  ZoomInOutlined,
} from "@ant-design/icons";
import {
  Button,
  ConfigProvider,
  Input,
  message,
  Modal,
  Pagination,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
import { useMediaQuery } from "@/hook";
import type { ReplayFrame } from "@/replay/engine";
import { MAX_REPLAY_BYTES } from "@/replay/format";
import { sha256 } from "@/replay/hash";
import {
  canShareReplayFile,
  deleteReplay,
  downloadReplay,
  getReplay,
  listReplayOccurrences,
  listReplays,
  prepareReplayFile,
  renameReplay,
  type ReplayEntry,
  type ReplayOccurrence,
  saveReplay,
  shareReplayFile,
  subscribeReplays,
} from "@/replay/library";
import { localizeReplayText } from "@/replay/localizedText";
import type { ReplayCard } from "@/replay/messages";
import { type HistoryOrder, settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { disconnectSrvpro } from "@/ui/Match/util";
import { openSettingPanel } from "@/ui/Setting";
import { CardDetailContent } from "@/ui/Shared/DuelBoard/CardDetail";
import {
  concealReplayCard,
  positionLabel,
  replayCardWords,
} from "@/ui/Shared/DuelBoard/cardState";
import {
  type SceneFrame,
  sceneSteps,
  seedScene,
} from "@/ui/Shared/DuelBoard/scene";
import { sceneInformationCards } from "@/ui/Shared/DuelBoard/sceneInformation";
import {
  type DuelHistoryEntry,
  HistoryRow,
  HistoryTimeline,
} from "@/ui/Shared/DuelHistory";
import {
  eventHistoryEntries,
  type HistoryCursor,
} from "@/ui/Shared/DuelHistory/convert";
import {
  DuelPanel,
  DuelSidebarContext,
  duelSidebarQuery,
} from "@/ui/Shared/DuelPanel";
import boardArea from "@/ui/Shared/DuelShell/boardArea.module.scss";
import { DuelBackground } from "@/ui/Shared/DuelShell/DuelBackground";
import { LifeBarView } from "@/ui/Shared/DuelShell/LifeBarView";
import { SidebarFrame } from "@/ui/Shared/DuelShell/SidebarFrame";
import { MobileHomeLink } from "@/ui/Shared/MobileHomeLink";
import { type Language, languageLocales } from "@/variant";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { corePhaseKey } from "@/variant/duelPhases";
import { mobileMessages } from "@/variant/mobileMessages";
import { previewMessages } from "@/variant/previewMessages";

import { ReplayAudio } from "./audio";
import { ReplayCardTile } from "./CardTile";
import { DeckExtract } from "./DeckExtract";
import { FieldBoard, replayFieldWords } from "./FieldBoard";
import { ReplayMenu } from "./ReplayMenu";

const extraWords = {
  cn: {
    soundOn: "音效：开",
    soundOff: "音效：关",
    shareTitle: "录像已准备好",
    share: "分享文件",
    fallback: "浏览器未允许分享，已改用文件下载",
    cancel: "取消",
    more: "更多",
    hand: "手牌",
    go: "跳转",
  },
  en: {
    soundOn: "Sound: on",
    soundOff: "Sound: off",
    shareTitle: "Replay ready",
    share: "Share file",
    fallback: "Sharing unavailable; downloading the file instead",
    cancel: "Cancel",
    more: "More",
    hand: "Hand",
    go: "Go",
  },
  ja: {
    soundOn: "効果音：オン",
    soundOff: "効果音：オフ",
    shareTitle: "リプレイの準備完了",
    share: "ファイルを共有",
    fallback: "共有できないためファイルをダウンロードします",
    cancel: "キャンセル",
    more: "その他",
    hand: "手札",
    go: "移動",
  },
  ko: {
    soundOn: "효과음: 켜짐",
    soundOff: "효과음: 꺼짐",
    shareTitle: "리플레이 준비 완료",
    share: "파일 공유",
    fallback: "공유할 수 없어 파일을 다운로드합니다",
    cancel: "취소",
    more: "더 보기",
    hand: "패",
    go: "이동",
  },
};
const replayExtraWords = (language: string) =>
  extraWords[language as keyof typeof extraWords] || extraWords.cn;

const labels = {
  cn: [
    "录像库",
    "导入录像",
    "播放",
    "下载",
    "删除",
    "改名",
    "返回首页",
    "暂停",
    "继续播放",
    "单步",
    "重新开始",
    "切换视角",
    "退出播放",
    "跳到回合",
    "另存／分享",
    "操作记录",
    "手牌",
    "怪兽区",
    "魔法／陷阱区",
    "主卡组",
    "额外",
    "墓地",
    "除外",
    "关闭",
    "取消跳转",
  ],
  en: [
    "Replays",
    "Import",
    "Play",
    "Download",
    "Delete",
    "Rename",
    "Home",
    "Pause",
    "Play",
    "Step",
    "Restart",
    "Switch view",
    "Exit",
    "Go to turn",
    "Save / share",
    "History",
    "Hand",
    "Monsters",
    "Spells / traps",
    "Deck",
    "Extra",
    "Graveyard",
    "Banished",
    "Close",
    "Cancel seek",
  ],
  ja: [
    "リプレイ",
    "インポート",
    "再生",
    "保存",
    "削除",
    "名前変更",
    "ホーム",
    "一時停止",
    "再生",
    "一手進む",
    "最初から",
    "視点切替",
    "終了",
    "ターンへ",
    "保存／共有",
    "履歴",
    "手札",
    "モンスター",
    "魔法／罠",
    "デッキ",
    "EX",
    "墓地",
    "除外",
    "閉じる",
    "移動中止",
  ],
  ko: [
    "리플레이",
    "가져오기",
    "재생",
    "다운로드",
    "삭제",
    "이름 변경",
    "홈",
    "일시정지",
    "재생",
    "한 단계",
    "다시 시작",
    "시점 전환",
    "종료",
    "턴 이동",
    "저장 / 공유",
    "기록",
    "패",
    "몬스터",
    "마법 / 함정",
    "덱",
    "엑스트라",
    "묘지",
    "제외",
    "닫기",
    "이동 취소",
  ],
};
export function Component() {
  useEffect(() => disconnectSrvpro(), []);
  const { language } = useI18N();
  const text = labels[language as keyof typeof labels] || labels.cn;
  const [params] = useSearchParams();
  const id = params.get("id");
  return (
    <ConfigProvider autoInsertSpaceInButton={false}>
      {id ? <Player key={id} id={id} text={text} /> : <Library text={text} />}
    </ConfigProvider>
  );
}
function Library({ text }: { text: string[] }) {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const preview = previewMessages(language);
  const [extracting, setExtracting] = useState<string>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ReplayEntry[]>([]),
    [occurrences, setOccurrences] = useState<ReplayOccurrence[]>([]),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<ReplayEntry>(),
    [title, setTitle] = useState("");
  const matching = entries.filter((e) =>
    e.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(matching.length / 24)),
  );
  useEffect(() => {
    let mounted = true;
    const update = () =>
      void Promise.all([listReplays(), listReplayOccurrences()])
        .then(([items, associations]) => {
          if (mounted) {
            setEntries(items);
            setOccurrences(associations);
          }
        })
        .catch((e) => setError(String(e)));
    update();
    const off = subscribeReplays(update);
    return () => {
      mounted = false;
      off();
    };
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      message.error(
        localizeReplayText(
          String(e instanceof Error ? e.message : e),
          language as Language,
        ),
      );
    }
  };
  return (
    <main className="replay-page">
      <header className="replay-header">
        <h1>{text[0]}</h1>
        <MobileHomeLink />
      </header>
      <div className="replay-tools">
        <label className="replay-import">
          {busy ? t("ReplayImporting") : text[1]}
          <input
            type="file"
            accept=".yrp,.yrp3d"
            multiple
            disabled={busy}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              setBusy(true);
              setError("");
              try {
                if (files.length > 20) throw new Error(t("ReplayImportLimit"));
                for (const file of files) {
                  if (file.size > MAX_REPLAY_BYTES)
                    throw new Error(t("ReplayFileLimit", { file: file.name }));
                  await saveReplay(
                    new Uint8Array(await file.arrayBuffer()),
                    file.name,
                  );
                }
              } catch (e) {
                setError(String(e instanceof Error ? e.message : e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <Input
          placeholder={t("ReplaySearch")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <p className="replay-note">
        {t("ReplayNote")}
        <a
          href={`${import.meta.env.BASE_URL}replay/NOTICE.md`}
          target="_blank"
          rel="noreferrer"
        >
          {" "}
          {t("ReplayLicense")}
        </a>
      </p>
      <p className="replay-note">
        {t("ReplayCapacity", {
          count: entries.length,
          size: (entries.reduce((n, e) => n + e.bytes, 0) / 1048576).toFixed(2),
        })}{" "}
        <button
          className="replay-link"
          onClick={() =>
            run(async () => {
              message.info(
                (await navigator.storage?.persist?.())
                  ? t("ReplayPersistent")
                  : t("ReplayNotPersistent"),
              );
            })
          }
        >
          {t("ReplayRequestStorage")}
        </button>
      </p>
      {error && (
        <p className="replay-error" role="alert">
          {localizeReplayText(error, language as Language)}
        </p>
      )}
      {!entries.length && (
        <div className="replay-empty">{t("ReplayEmpty")}</div>
      )}
      <section className="replay-list">
        {matching
          .slice((currentPage - 1) * 24, currentPage * 24)
          .map((entry) => (
            <article key={entry.id} className="replay-entry">
              <div>
                <h2>{entry.title}</h2>
                <p>
                  {new Date(entry.createdAt).toLocaleString(
                    languageLocales[language as Language],
                  )}{" "}
                  · {(entry.bytes / 1024).toFixed(1)} KB · {entry.header.format}{" "}
                  ·{" "}
                  {entry.source === "duel"
                    ? t("ReplayFromDuel")
                    : t("ReplayLocalImport")}
                </p>
                {entry.temporary && <strong>{t("ReplayTemporary")}</strong>}
                {entry.header.reason && (
                  <p>
                    {localizeReplayText(
                      entry.header.reason,
                      language as Language,
                    )}
                  </p>
                )}
                {!!occurrences.filter((o) => o.entry === entry.id).length && (
                  <p>
                    {t("ReplayAssociations")}
                    {occurrences
                      .filter((o) => o.entry === entry.id)
                      .map(
                        (o) =>
                          `${o.room || t("ReplayNoRoom")} · ${new Date(
                            o.receivedAt,
                          ).toLocaleString(
                            languageLocales[language as Language],
                          )}`,
                      )
                      .join("；")}
                  </p>
                )}
              </div>
              <div className="replay-actions">
                <Button onClick={() => setExtracting(entry.id)}>
                  {preview.extractDecks}
                </Button>
                <Button
                  type="primary"
                  disabled={!entry.header.playable}
                  onClick={() => navigate(`/replays?id=${entry.id}`)}
                >
                  {text[2]}
                </Button>
                <Button onClick={() => run(() => downloadReplay(entry.id))}>
                  {text[3]}
                </Button>
                <Button
                  onClick={() =>
                    run(async () => {
                      const { file, title } = await prepareReplayFile(entry.id);
                      const words = replayExtraWords(language);
                      const share = async () => {
                        if (
                          (await shareReplayFile(file, title)) === "downloaded"
                        )
                          message.info(words.fallback);
                      };
                      // File retrieval is asynchronous. A fresh confirmation tap
                      // preserves the user activation required by iOS / Web Share.
                      if (canShareReplayFile(file)) {
                        Modal.confirm({
                          title: words.shareTitle,
                          content: file.name,
                          okText: words.share,
                          cancelText: words.cancel,
                          onOk: share,
                        });
                      } else await share();
                    })
                  }
                >
                  {text[14]}
                </Button>
                <Button
                  onClick={() => {
                    setEditing(entry);
                    setTitle(entry.title);
                  }}
                >
                  {text[5]}
                </Button>
                <Button
                  danger
                  onClick={() =>
                    Modal.confirm({
                      title: `${text[4]}：${entry.title}？`,
                      content: t("ReplayDeleteWarning"),
                      onOk: () => run(() => deleteReplay(entry.id)),
                    })
                  }
                >
                  {text[4]}
                </Button>
              </div>
            </article>
          ))}
      </section>
      {matching.length > 24 && (
        <Pagination
          style={{ marginTop: 16 }}
          current={currentPage}
          pageSize={24}
          total={matching.length}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
      <Modal
        open={!!editing}
        title={text[5]}
        onCancel={() => setEditing(undefined)}
        onOk={() =>
          void run(async () => {
            await renameReplay(editing!.id, title);
            setEditing(undefined);
          })
        }
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </Modal>
      {extracting && (
        <DeckExtract
          key={extracting}
          replayId={extracting}
          closeLabel={text[23]}
          onClose={() => setExtracting(undefined)}
        />
      )}
    </main>
  );
}

function Player({ id, text }: { id: string; text: string[] }) {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const stateText = replayCardWords(language);
  const words = replayExtraWords(language);
  const preview = previewMessages(language);
  const [extracting, setExtracting] = useState(false);
  const settings = useSnapshot(settingStore);
  const soundEnabled = settings.audio.enableSoundEffects === true;
  const audio = useRef<ReplayAudio>();
  if (!audio.current) audio.current = new ReplayAudio();
  const navigate = useNavigate();
  const worker = useRef<Worker>();
  const timer = useRef<number>();
  const watchdog = useRef<number>();
  const pending = useRef(false),
    paused = useRef(true),
    speed = useRef(settingStore.replaySpeed),
    seek = useRef(0);
  const scene = useRef<SceneFrame>();
  const queue = useRef<SceneFrame[]>([]);
  const requestedAuto = useRef(false);
  const autoStartPending = useRef(false);
  const [fieldView, setFieldView] = useState(true);
  const [frame, setFrame] = useState<SceneFrame>(),
    [working, setWorking] = useState(true),
    [status, setStatus] = useState(t("ReplayOpening")),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [seeking, setSeeking] = useState(false),
    [view, setView] = useState(0),
    [target, setTarget] = useState("1"),
    [card, setCard] = useState<ReplayCard>(),
    [history, setHistory] = useState<{ id: number; entry: DuelHistoryEntry }[]>(
      [],
    ),
    [historyCode, setHistoryCode] = useState(0),
    [showHistory, setShowHistory] = useState(false),
    [title, setTitle] = useState("");
  const [reveal, setReveal] = useState(false);
  const historyCursor = useRef<HistoryCursor>({ turn: 0 });
  const historySerial = useRef(0);
  const resetHistory = () => {
    historyCursor.current = { turn: 0 };
    setHistory([]);
  };
  const [zoom, setZoom] = useState(1);
  const wide = useMediaQuery(duelSidebarQuery);
  const short = useMediaQuery(
    "(orientation: landscape) and (max-height: 600px)",
  );
  const rate = settings.replaySpeed;
  const stop = () => {
    autoStartPending.current = false;
    paused.current = true;
    setPlaying(false);
    clearTimeout(timer.current);
    audio.current?.stop();
  };
  const updateFrame = (next: SceneFrame) => {
    scene.current = next;
    setFrame(next);
  };
  const advance = () => {
    const next = queue.current.shift();
    if (!next) return;
    const action =
      next.action !== scene.current?.action ? next.action : undefined;
    if (action && !seek.current) audio.current?.play(action, speed.current);
    updateFrame(next);
    if (next.end) {
      stop();
      return;
    }
    if (!paused.current)
      timer.current = window.setTimeout(() => request(), 600 / speed.current);
  };
  useEffect(() => {
    audio.current?.configure(
      soundEnabled,
      settings.audio.soundEffectsVolume ?? 0.7,
    );
  }, [soundEnabled, settings.audio.soundEffectsVolume]);
  const request = (type = "next") => {
    if (pending.current || !worker.current) return;
    if (type !== "next" || seek.current) queue.current = [];
    if (type === "next" && queue.current.length) {
      advance();
      return;
    }
    pending.current = true;
    setWorking(true);
    clearTimeout(timer.current);
    watchdog.current = window.setTimeout(() => {
      worker.current?.terminate();
      pending.current = false;
      setWorking(false);
      setError(t("ReplayUnresponsive"));
      stop();
    }, 10000);
    worker.current.postMessage({ type, turn: seek.current });
    requestedAuto.current = !paused.current;
  };
  const requestRef = useRef(request);
  requestRef.current = request;
  useEffect(() => {
    speed.current = rate;
    if (!paused.current && !pending.current && !seek.current) {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => requestRef.current(), 600 / rate);
    }
  }, [rate]);
  useEffect(() => {
    let disposed = false;
    autoStartPending.current = settingStore.replayAutoPlay && !document.hidden;
    paused.current = true;
    setPlaying(false);
    const loadingTimeout = window.setTimeout(() => {
      if (disposed) return;
      worker.current?.terminate();
      setError(t("ReplayLoadTimeout"));
    }, 120000);
    void getReplay(id)
      .then(async ({ entry, blob }) => {
        if (!entry.header.playable) throw new Error(entry.header.reason);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if ((await sha256(bytes)) !== entry.hash)
          throw new Error(t("ReplayHashError"));
        if (disposed) return;
        setTitle(entry.title);
        const w = new Worker(
          new URL("../../replay/worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = w;
        w.onmessage = ({ data }) => {
          if (disposed || worker.current !== w) return;
          if (data.type === "status") {
            setStatus(data.text);
            return;
          }
          clearTimeout(loadingTimeout);
          clearTimeout(timer.current);
          clearTimeout(watchdog.current);
          pending.current = false;
          setWorking(false);
          if (data.type === "error") {
            setError(data.text);
            stop();
            return;
          }
          if (data.type !== "frame") return;
          const startAuto = autoStartPending.current;
          autoStartPending.current = false;
          const next = data.frame as ReplayFrame;
          setStatus("");
          // Outside the state updater: the cursor walks each message once.
          const codeAt = (place: {
            player: number;
            location: number;
            sequence: number;
          }) =>
            next.cards.find(
              (c) =>
                c.player === place.player &&
                c.location === place.location &&
                c.sequence === place.sequence,
            )?.code;
          const added = (data.history || [next]).flatMap(
            (f: ReplayHistoryFrame) => {
              const entries = eventHistoryEntries(
                f.events,
                historyCursor.current,
                codeAt,
              );
              historyCursor.current.turn = f.turn;
              return entries.map((entry) => ({
                id: historySerial.current++,
                entry,
              }));
            },
          );
          if (added.length)
            setHistory((old) => [...old, ...added].slice(-1000));
          if (!seek.current && next.step > 0 && scene.current) {
            queue.current = sceneSteps(scene.current, next);
            if (!requestedAuto.current || !paused.current) advance();
            return;
          }
          queue.current = [];
          updateFrame(
            seedScene(next, next.step === 0 ? undefined : scene.current),
          );
          if (next.end) {
            stop();
            setSeeking(false);
            seek.current = 0;
            return;
          }
          if (seek.current) {
            if (next.turn < seek.current) {
              timer.current = window.setTimeout(() => request(), 0);
              return;
            }
            seek.current = 0;
            setSeeking(false);
            stop();
            return;
          }
          if (startAuto && !document.hidden) {
            audio.current?.unlock();
            paused.current = false;
            setPlaying(true);
          }
          if (!paused.current)
            timer.current = window.setTimeout(
              () => request(),
              600 / speed.current,
            );
        };
        w.onerror = () => {
          if (disposed || worker.current !== w) return;
          clearTimeout(loadingTimeout);
          clearTimeout(watchdog.current);
          pending.current = false;
          setWorking(false);
          setError(t("ReplayWorkerError"));
          stop();
        };
        pending.current = true;
        w.postMessage(
          {
            type: "open",
            bytes: bytes.buffer,
            base: new URL(
              `${import.meta.env.BASE_URL}replay/706-v1/`,
              document.baseURI,
            ).href,
          },
          [bytes.buffer],
        );
      })
      .catch((e) => {
        if (disposed) return;
        if (!disposed) setError(String(e instanceof Error ? e.message : e));
        clearTimeout(loadingTimeout);
        clearTimeout(watchdog.current);
      });
    const background = () => {
      if (document.hidden) {
        stop();
        seek.current = 0;
        setSeeking(false);
      }
    };
    document.addEventListener("visibilitychange", background);
    return () => {
      disposed = true;
      clearTimeout(loadingTimeout);
      clearTimeout(watchdog.current);
      clearTimeout(timer.current);
      worker.current?.postMessage({ type: "close" });
      worker.current?.terminate();
      worker.current = undefined;
      queue.current = [];
      scene.current = undefined;
      audio.current?.dispose();
      document.removeEventListener("visibilitychange", background);
    };
  }, [id]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      message.error(
        localizeReplayText(
          String(e instanceof Error ? e.message : e),
          language as Language,
        ),
      );
    }
  };
  const currentCard =
    card &&
    frame?.cards.find(
      (c) =>
        c.player === card.player &&
        c.location === card.location &&
        c.sequence === card.sequence &&
        c.code === card.code,
    );
  const selected = currentCard ? fetchCard(currentCard.code) : undefined;
  const selectedIdentity =
    currentCard &&
    currentCard.currentCode !== undefined &&
    !(currentCard.location & 128) &&
    !concealReplayCard(currentCard, reveal)
      ? currentCard
      : undefined;
  const fieldWords = replayFieldWords(language);
  const [nameA, nameB] = frame?.names ?? [];
  const replayPlayer = useCallback(
    (player: number) =>
      (player === 0 ? nameA : nameB) || `Player ${player + 1}`,
    [nameA, nameB],
  );
  const inspectHistory = useCallback((code: number) => {
    paused.current = true;
    setPlaying(false);
    clearTimeout(timer.current);
    audio.current?.stop();
    setShowHistory(false);
    setCard(undefined);
    setHistoryCode(code);
  }, []);
  const action = frame?.action;
  const actionText = action
    ? `${fieldWords[action.kind as keyof typeof fieldWords] || action.kind} ${
        action.code ? fetchCard(action.code).text.name || action.code : ""
      } ${action.amount !== undefined ? `· ${action.amount}` : ""}`
    : fieldWords.ready;
  const historyList = (
    <HistoryTimeline
      language={language}
      empty={!history.length}
      embedded={wide}
      testId="replay-history-content"
      className="replay-history"
    >
      {orderHistory(
        history.map(({ id, entry }) => (
          <HistoryRow
            key={id}
            entry={entry}
            language={language}
            playerLabel={replayPlayer}
            onInspect={inspectHistory}
            testPrefix="replay"
          />
        )),
        settings.historyOrder,
      )}
    </HistoryTimeline>
  );
  // Persistent: errors and the end state never auto-dismiss.
  const statusPanel = (
    <div className="replay-status" data-testid="replay-status">
      <h1 className="replay-title">{title || text[2]}</h1>
      {frame && (
        <>
          <div className="replay-progress">
            {t("ReplayTurn")} {frame.turn} · {phaseName(frame.phase, t)} ·{" "}
            {frame.names[frame.turnPlayer]} · {t("ReplayStep")} {frame.step} ·{" "}
            {t("ReplayResponse")} {frame.consumed}/{frame.total}
            {frame.end && (
              <strong data-testid="replay-end" data-end={frame.end}>
                {frame.end === "complete"
                  ? ` · ${t("ReplayComplete")}`
                  : ` · ${t("ReplayStopped")}`}
              </strong>
            )}
          </div>
          <div
            className="replay-field-action"
            role="status"
            data-action={action?.kind || "ready"}
          >
            {actionText}
          </div>
        </>
      )}
      {reveal && <p className="replay-note">{stateText.revealNote}</p>}
      {(status || seeking) && (
        <p className="replay-note" role="status">
          {seeking
            ? t("ReplaySeeking", { turn: seek.current })
            : localizeReplayText(status, language as Language)}
        </p>
      )}
      {error && (
        <p className="replay-error" role="alert">
          {localizeReplayText(error, language as Language)}
        </p>
      )}
    </div>
  );
  const handCount = (player: number) =>
    frame?.cards.filter((c) => c.player === player && c.location === 2)
      .length ?? 0;
  const lifeBarPlayer = (player: number) => ({
    name: frame?.names[player] || `Player ${player + 1}`,
    life: frame?.lp[player] ?? 0,
    active: frame?.turnPlayer === player,
    controller: player,
    extra: `${words.hand} ${handCount(player)}`,
  });
  const common = [
    {
      key: "play",
      label: playing ? text[7] : text[8],
      icon: playing ? <PauseOutlined /> : <CaretRightOutlined />,
      disabled: !frame || !!frame.end || !!error || seeking,
      onClick: () => {
        if (playing) {
          stop();
          clearTimeout(timer.current);
        } else {
          audio.current?.unlock();
          paused.current = false;
          setPlaying(true);
          request();
        }
      },
    },
    {
      key: "step",
      label: text[9],
      icon: <StepForwardOutlined />,
      disabled:
        !frame || !!frame.end || playing || !!error || seeking || working,
      onClick: () => {
        audio.current?.unlock();
        request();
      },
    },
    ...(wide
      ? []
      : [
          {
            key: "history",
            label: text[15],
            icon: <FileSearchOutlined />,
            onClick: () => setShowHistory(true),
          },
        ]),
  ];
  const others = [
    {
      key: "restart",
      pinned: true,
      label: text[10],
      icon: <ReloadOutlined />,
      disabled: !frame || working || !!error,
      onClick: () => {
        stop();
        seek.current = 0;
        setSeeking(false);
        resetHistory();
        request("restart");
      },
    },
    {
      key: "view",
      pinned: true,
      label: text[11],
      icon: <SwapOutlined />,
      onClick: () => setView(1 - view),
    },
    {
      key: "sound",
      pinned: true,
      label: soundEnabled ? words.soundOn : words.soundOff,
      icon: <SoundOutlined />,
      pressed: soundEnabled,
      onClick: () => {
        const enabled = !soundEnabled;
        settingStore.saveAudioConfig({ enableSoundEffects: enabled });
        audio.current?.configure(
          enabled,
          settingStore.audio.soundEffectsVolume ?? 0.7,
        );
        if (enabled) audio.current?.unlock();
      },
    },
    {
      key: "reveal",
      pinned: true,
      label: stateText.reveal,
      icon: <EyeOutlined />,
      pressed: reveal,
      onClick: () => setReveal(!reveal),
    },
    {
      key: "list",
      label: fieldView ? fieldWords.list : fieldWords.field,
      icon: fieldView ? <UnorderedListOutlined /> : <AppstoreOutlined />,
      onClick: () => setFieldView(!fieldView),
    },
    {
      key: "zoom",
      pinned: true,
      label: `${fieldWords.zoom} ${zoom}×`,
      icon: <ZoomInOutlined />,
      disabled: !fieldView,
      onClick: () => setZoom((z) => (z >= 2 ? 1 : z + 0.5)),
    },
    {
      key: "reset",
      label: fieldWords.reset,
      icon: <CompressOutlined />,
      disabled: !fieldView,
      onClick: () => setZoom(1),
    },
    {
      key: "download",
      label: text[3],
      icon: <DownloadOutlined />,
      onClick: () => run(() => downloadReplay(id)),
    },
    {
      key: "extract",
      label: preview.extractDecks,
      icon: <ExportOutlined />,
      onClick: () => {
        stop();
        setExtracting(true);
      },
    },
    {
      key: "settings",
      label: mobileMessages(language).settings,
      icon: <SettingOutlined />,
      onClick: () => openSettingPanel({ defaultKey: "replay" }),
    },
    {
      key: "exit",
      pinned: true,
      label: text[12],
      icon: <LogoutOutlined />,
      onClick: () => navigate("/replays"),
    },
  ];
  const menu = (
    <ReplayMenu
      key="menu"
      docked={wide}
      compact={!wide || short}
      label={mobileMessages(language).settings}
      phase={{
        current: frame ? corePhaseKey(frame.phase) : undefined,
        turnOwner: frame?.turnPlayer === view ? "self" : "opponent",
      }}
      common={common}
      others={others}
      speed={{
        label: t("ReplaySpeed"),
        value: rate,
        options: [0.5, 1, 2, 4, 8, 16],
        onChange: (n: number) => {
          settingStore.replaySpeed = n;
        },
      }}
      jump={{
        label: text[13],
        inputLabel: t("ReplayTarget"),
        cancelLabel: text[24],
        confirmLabel: words.go,
        value: target,
        onChange: setTarget,
        disabled: !frame || working || !!error,
        onJump: () => {
          const turn = Number(target);
          if (!Number.isInteger(turn) || turn < 1 || turn > 999) return;
          stop();
          seek.current = turn;
          setSeeking(true);
          if (turn <= frame!.turn) {
            resetHistory();
            request("restart");
          } else request();
        },
        onCancel: seeking
          ? () => {
              seek.current = 0;
              setSeeking(false);
              stop();
            }
          : undefined,
      }}
      moreLabel={words.more}
    />
  );
  return (
    <main
      className="replay-player replay-duel"
      data-testid="replay-player"
      style={
        {
          "--replay-motion-ms": `${Math.min(300, 600 / rate)}ms`,
        } as React.CSSProperties
      }
    >
      <DuelSidebarContext.Provider value={wide}>
        <DuelBackground near={!frame || frame.turnPlayer === view} />
        <SidebarFrame
          wide={wide}
          top={[
            <LifeBarView
              key="life"
              docked={wide}
              far={lifeBarPlayer(1 - view)}
              near={lifeBarPlayer(view)}
            />,
            menu,
          ]}
          status={statusPanel}
          tabsLabel={text[15]}
          expandLabels={{
            expand: clientRevisionMessages(language).expandLogs,
            collapse: clientRevisionMessages(language).collapseLogs,
          }}
          closePanels={() => setCard(undefined)}
          tabs={[
            {
              key: "history",
              label: text[15],
              testId: "replay-history-tab",
              render: ({ active, wide }) => wide && active && historyList,
            },
          ]}
        />
        {!wide && <div className="replay-shell-strip">{statusPanel}</div>}
        <div className="replay-duel-stage">
          <div className={boardArea.viewport}>
            {frame &&
              (fieldView ? (
                <FieldBoard
                  frame={frame}
                  view={view}
                  reveal={reveal}
                  language={language}
                  text={text}
                  zoom={zoom}
                  onPause={stop}
                  onInspect={(selectedCard) => {
                    stop();
                    setCard(selectedCard);
                  }}
                />
              ) : (
                <div className="replay-board">
                  {[1 - view, view].map((player) => (
                    <section className="replay-side" key={player}>
                      <header>
                        <h2>{frame.names[player] || `Player ${player + 1}`}</h2>
                        <strong>LP {frame.lp[player]}</strong>
                      </header>
                      {[2, 4, 8, 1, 64, 16, 32].map((location, i) => {
                        const cards = frame.cards.filter(
                          (c) => c.player === player && c.location === location,
                        );
                        return (
                          <div className="replay-zone" key={location}>
                            <h3>
                              {text[16 + i]} <span>{cards.length}</span>
                            </h3>
                            <div>
                              {cards.map((c) => (
                                <ReplayCardTile
                                  key={c.sequence}
                                  card={c}
                                  language={language}
                                  reveal={reveal}
                                  zoneLabel={text[16 + i]}
                                  onInspect={(selectedCard) => {
                                    stop();
                                    clearTimeout(timer.current);
                                    setCard(selectedCard);
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ))}
                </div>
              ))}
          </div>
        </div>
        <DuelPanel
          open={!!currentCard}
          onClose={() => setCard(undefined)}
          title={
            (selectedIdentity?.currentCode
              ? fetchCard(selectedIdentity.currentCode).text.name
              : selected?.text.name) || currentCard?.code
          }
          testId="replay-card-detail"
          zIndex={1100}
          compact
        >
          {currentCard && (
            <CardDetailContent
              code={currentCard.code}
              language={language}
              imageClassName="replay-detail-image"
              descriptionClassName="replay-description"
              stats={
                (currentCard.type | (selected?.data.type ?? 0)) & 1
                  ? {
                      ...currentCard,
                      printedAttack: selected?.data.atk,
                      printedDefense: selected?.data.def,
                      hasDefense: !(currentCard.type & 0x4000000),
                    }
                  : undefined
              }
              live={
                [4, 8].includes(currentCard.location) &&
                !!(currentCard.position & 5) &&
                !!(currentCard.type & 1)
              }
              counters={currentCard.counters}
              identity={selectedIdentity}
              related={{
                id: currentCard.sceneId,
                cards: sceneInformationCards(
                  frame?.cards ?? [],
                  language,
                  view,
                  reveal,
                ),
                onLocate: () => setCard(undefined),
              }}
              description={selected?.text.desc}
            >
              <p>{positionLabel(currentCard, language)}</p>
              {!!((currentCard.status || 0) & 1) && <p>{stateText.disabled}</p>}
              {!!((currentCard.status || 0) & 0x4000000) && (
                <p>{stateText.forbidden}</p>
              )}
              {currentCard.declared && (
                <p>
                  {stateText.declared}：
                  {fetchCard(currentCard.declared).text.name ||
                    currentCard.declared}
                </p>
              )}
              {!!currentCard.overlay.length && (
                <p>
                  {stateText.materials} {currentCard.overlay.length}：
                  {currentCard.overlay
                    .map((n) => fetchCard(n).text.name || n)
                    .join("、")}
                </p>
              )}
            </CardDetailContent>
          )}
        </DuelPanel>
        <DuelPanel
          open={!!historyCode}
          onClose={() => setHistoryCode(0)}
          title={fetchCard(historyCode).text.name || historyCode}
          testId="replay-history-card-detail"
          zIndex={1100}
          compact
        >
          {!!historyCode && (
            <CardDetailContent
              code={historyCode}
              language={language}
              imageClassName="replay-detail-image"
              descriptionClassName="replay-description"
            />
          )}
        </DuelPanel>
        <DuelPanel
          open={showHistory && !wide}
          onClose={() => setShowHistory(false)}
          title={text[15]}
          testId="replay-history-panel"
          followControlSide
        >
          {historyList}
        </DuelPanel>
        <DuelPanel
          open={extracting}
          onClose={() => setExtracting(false)}
          title={preview.extractDecks}
          testId="replay-extract-panel"
          followControlSide
        >
          {extracting && (
            <DeckExtract
              replayId={id}
              closeLabel={text[23]}
              onClose={() => setExtracting(false)}
            />
          )}
        </DuelPanel>
      </DuelSidebarContext.Provider>
    </main>
  );
}
type ReplayHistoryFrame = Pick<ReplayFrame, "turn" | "names" | "events">;
const orderHistory = <T,>(lines: T[], order: HistoryOrder) =>
  order === "newest" ? lines.reverse() : lines;
const phaseName = (phase: number, t: (key: string) => string) =>
  ({
    1: "DP",
    2: "SP",
    4: "MP1",
    8: t("BattleStart"),
    16: "BP",
    32: t("DamageStep"),
    64: t("DamageCalculation"),
    128: t("BattleEnd"),
    256: "MP2",
    512: "EP",
  })[phase] || String(phase);
