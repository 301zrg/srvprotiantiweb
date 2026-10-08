import "./style.css";

import {
  Button,
  ConfigProvider,
  Drawer,
  Input,
  message,
  Modal,
  Pagination,
  Select,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchCard, getCardImgUrl } from "@/api";
import type { ReplayFrame } from "@/replay/engine";
import { MAX_REPLAY_BYTES } from "@/replay/format";
import { sha256 } from "@/replay/hash";
import {
  deleteReplay,
  downloadReplay,
  getReplay,
  listReplayOccurrences,
  listReplays,
  renameReplay,
  type ReplayEntry,
  type ReplayOccurrence,
  saveReplay,
  subscribeReplays,
} from "@/replay/library";
import type { ReplayCard } from "@/replay/messages";
import { useI18N } from "@/ui/I18N";
import { disconnectSrvpro } from "@/ui/Match/util";

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
  const [entries, setEntries] = useState<ReplayEntry[]>([]),
    [occurrences, setOccurrences] = useState<ReplayOccurrence[]>([]),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<ReplayEntry>(),
    [title, setTitle] = useState("");
  const navigate = useNavigate();
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
      message.error(String(e instanceof Error ? e.message : e));
    }
  };
  return (
    <main className="replay-page">
      <header className="replay-header">
        <h1>{text[0]}</h1>
        <Button onClick={() => navigate("/")}>{text[6]}</Button>
      </header>
      <div className="replay-tools">
        <label className="replay-import">
          {busy ? "正在导入…" : text[1]}
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
                if (files.length > 20)
                  throw new Error("每次最多导入 20 份录像");
                for (const file of files) {
                  if (file.size > MAX_REPLAY_BYTES)
                    throw new Error(`${file.name} 超过 8 MB`);
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
          placeholder="搜索录像标题"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <p className="replay-note">
        本地导入、保存与播放，不上传录像。更换浏览器或网址前请下载备份。导入录像的脚本来源无法从文件头确认；使用固定
        706 环境尝试重演。
        <a
          href={`${import.meta.env.BASE_URL}replay/NOTICE.md`}
          target="_blank"
          rel="noreferrer"
        >
          {" "}
          资源来源与许可
        </a>
      </p>
      <p className="replay-note">
        {entries.length} 份 ·{" "}
        {(entries.reduce((n, e) => n + e.bytes, 0) / 1048576).toFixed(2)} / 100
        MB{" "}
        <button
          className="replay-link"
          onClick={() =>
            run(async () => {
              message.info(
                (await navigator.storage?.persist?.())
                  ? "浏览器已允许保留本地存储"
                  : "浏览器未授予持久存储，请定期下载备份",
              );
            })
          }
        >
          请求保留本地存储
        </button>
      </p>
      {error && (
        <p className="replay-error" role="alert">
          {error}
        </p>
      )}
      {!entries.length && (
        <div className="replay-empty">
          选择手机／电脑上的 .yrp 文件导入；在线对局收到的录像也会保存到这里。旧
          .yrp3d 仅支持保存与下载。
        </div>
      )}
      <section className="replay-list">
        {matching
          .slice((currentPage - 1) * 24, currentPage * 24)
          .map((entry) => (
            <article key={entry.id} className="replay-entry">
              <div>
                <h2>{entry.title}</h2>
                <p>
                  {new Date(entry.createdAt).toLocaleString()} ·{" "}
                  {(entry.bytes / 1024).toFixed(1)} KB · {entry.header.format} ·{" "}
                  {entry.source === "duel" ? "对局接收" : "本地导入"}
                </p>
                {entry.temporary && (
                  <strong>仅本次页面可用，请立即下载备份</strong>
                )}
                {entry.header.reason && <p>{entry.header.reason}</p>}
                {!!occurrences.filter((o) => o.entry === entry.id).length && (
                  <p>
                    对局关联：
                    {occurrences
                      .filter((o) => o.entry === entry.id)
                      .map(
                        (o) =>
                          `${o.room || "未记录房名"} · ${new Date(
                            o.receivedAt,
                          ).toLocaleString()}`,
                      )
                      .join("；")}
                  </p>
                )}
              </div>
              <div className="replay-actions">
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
                  onClick={() => run(() => downloadReplay(entry.id, true))}
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
                      content: "删除后无法从本地恢复。",
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
    </main>
  );
}

function Player({ id, text }: { id: string; text: string[] }) {
  const navigate = useNavigate();
  const worker = useRef<Worker>();
  const timer = useRef<number>();
  const watchdog = useRef<number>();
  const pending = useRef(false),
    paused = useRef(true),
    speed = useRef(1),
    seek = useRef(0);
  const [frame, setFrame] = useState<ReplayFrame>(),
    [working, setWorking] = useState(true),
    [status, setStatus] = useState("正在打开录像…"),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [seeking, setSeeking] = useState(false),
    [view, setView] = useState(0),
    [target, setTarget] = useState("1"),
    [rate, setRate] = useState(1),
    [card, setCard] = useState<ReplayCard>(),
    [history, setHistory] = useState<string[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [title, setTitle] = useState("");
  const stop = () => {
    paused.current = true;
    setPlaying(false);
  };
  const request = (type = "next") => {
    if (pending.current || !worker.current) return;
    pending.current = true;
    setWorking(true);
    clearTimeout(timer.current);
    watchdog.current = window.setTimeout(() => {
      worker.current?.terminate();
      pending.current = false;
      setWorking(false);
      setError("录像内核无响应，已停止。本地原件仍可下载。");
      stop();
    }, 10000);
    worker.current.postMessage({ type, turn: seek.current });
  };
  useEffect(() => {
    let disposed = false;
    const loadingTimeout = window.setTimeout(() => {
      worker.current?.terminate();
      setError("播放资源加载超时，请检查网络并重新打开。");
    }, 120000);
    void getReplay(id)
      .then(async ({ entry, blob }) => {
        if (!entry.header.playable) throw new Error(entry.header.reason);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if ((await sha256(bytes)) !== entry.hash)
          throw new Error("本地录像原件校验失败");
        if (disposed) return;
        setTitle(entry.title);
        const w = new Worker(
          new URL("../../replay/worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = w;
        w.onmessage = ({ data }) => {
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
          const next = data.frame as ReplayFrame;
          setFrame(next);
          setStatus("");
          setHistory((old) =>
            [...old, ...(data.history || [next]).flatMap(describeEvents)].slice(
              -1000,
            ),
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
          if (!paused.current)
            timer.current = window.setTimeout(
              () => request(),
              600 / speed.current,
            );
        };
        w.onerror = () => {
          clearTimeout(loadingTimeout);
          clearTimeout(watchdog.current);
          pending.current = false;
          setWorking(false);
          setError("播放内核加载失败，请重新打开；原录像仍可下载。");
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
      document.removeEventListener("visibilitychange", background);
    };
  }, [id]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      message.error(String(e));
    }
  };
  const selected = card ? fetchCard(card.code) : undefined;
  return (
    <main className="replay-player">
      <header className="replay-header">
        <h1>{title || text[2]}</h1>
        <Button onClick={() => navigate("/replays")}>{text[12]}</Button>
      </header>
      <div className="replay-controls">
        <Button
          type="primary"
          disabled={!frame || !!frame.end || !!error || seeking}
          onClick={() => {
            if (playing) {
              stop();
              clearTimeout(timer.current);
            } else {
              paused.current = false;
              setPlaying(true);
              request();
            }
          }}
        >
          {playing ? text[7] : text[8]}
        </Button>
        <Button
          disabled={
            !frame || !!frame.end || playing || !!error || seeking || working
          }
          onClick={() => request()}
        >
          {text[9]}
        </Button>
        <Button
          disabled={!frame || working || !!error}
          onClick={() => {
            stop();
            seek.current = 0;
            setSeeking(false);
            setHistory([]);
            request("restart");
          }}
        >
          {text[10]}
        </Button>
        <Select
          aria-label="播放速度"
          value={rate}
          options={[0.5, 1, 2, 4, 8].map((n) => ({ value: n, label: `${n}×` }))}
          onChange={(n) => {
            speed.current = n;
            setRate(n);
          }}
        />
        <Button onClick={() => setView(1 - view)}>{text[11]}</Button>
        <Input
          aria-label="目标回合"
          type="number"
          min={1}
          max={999}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Button
          disabled={!frame || working || !!error}
          onClick={() => {
            const turn = Number(target);
            if (!Number.isInteger(turn) || turn < 1 || turn > 999) return;
            stop();
            seek.current = turn;
            setSeeking(true);
            if (turn <= frame!.turn) {
              setHistory([]);
              request("restart");
            } else request();
          }}
        >
          {text[13]}
        </Button>
        {seeking && (
          <Button
            onClick={() => {
              seek.current = 0;
              setSeeking(false);
              stop();
            }}
          >
            {text[24]}
          </Button>
        )}
        <Button onClick={() => setShowHistory(true)}>{text[15]}</Button>
        <Button onClick={() => run(() => downloadReplay(id))}>{text[3]}</Button>
      </div>
      {(status || seeking) && (
        <p className="replay-note" role="status">
          {seeking ? `正在重演至回合 ${seek.current}…` : status}
        </p>
      )}
      {error && (
        <p className="replay-error" role="alert">
          {error}
        </p>
      )}
      {frame && (
        <>
          <div className="replay-progress">
            回合 {frame.turn} · {phaseName(frame.phase)} ·{" "}
            {frame.names[frame.turnPlayer]} · 步骤 {frame.step} · 响应{" "}
            {frame.consumed}/{frame.total}
            {frame.end && (
              <strong>
                {frame.end === "complete"
                  ? " · 重演结束"
                  : " · 记录到此结束（可能为弃权、超时或中途终止）"}
              </strong>
            )}
          </div>
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
                          <button
                            className={`replay-card ${
                              c.position & 10 ? "replay-facedown" : ""
                            }`}
                            key={c.sequence}
                            onClick={() => setCard(c)}
                            aria-label={`${
                              fetchCard(c.code).text.name || c.code
                            }，${text[16 + i]}`}
                          >
                            <img
                              src={getCardImgUrl(c.code)}
                              loading="lazy"
                              alt={
                                fetchCard(c.code).text.name || String(c.code)
                              }
                            />
                            <span>{fetchCard(c.code).text.name || c.code}</span>
                            {location === 4 && (
                              <small>
                                {c.attack}/{c.defense}
                                {c.overlay.length
                                  ? ` · 素材 ${c.overlay.length}`
                                  : ""}
                              </small>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}
      <Drawer
        rootClassName="replay-drawer"
        title={selected?.text.name || card?.code}
        open={!!card}
        onClose={() => setCard(undefined)}
        width={400}
      >
        <Button onClick={() => setCard(undefined)}>{text[23]}</Button>
        {card && (
          <>
            <img
              className="replay-detail-image"
              src={getCardImgUrl(card.code)}
              alt=""
            />
            <p>
              {card.attack} / {card.defense} ·{" "}
              {card.position & 10 ? "里侧" : "表侧"}
            </p>
            <p className="replay-description">{selected?.text.desc}</p>
            {card.declared && (
              <p>
                宣言卡片：{fetchCard(card.declared).text.name || card.declared}
              </p>
            )}
            {!!card.overlay.length && (
              <p>
                素材：
                {card.overlay
                  .map((n) => fetchCard(n).text.name || n)
                  .join("、")}
              </p>
            )}
            {!!card.counters.length && (
              <p>
                指示物：
                {card.counters
                  .map((n) => `${n & 65535} × ${n >>> 16}`)
                  .join("、")}
              </p>
            )}
          </>
        )}
      </Drawer>
      <Drawer
        rootClassName="replay-drawer"
        title={text[15]}
        open={showHistory}
        onClose={() => setShowHistory(false)}
        width={380}
      >
        <Button onClick={() => setShowHistory(false)}>{text[23]}</Button>
        <ol className="replay-history">
          {history.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </Drawer>
    </main>
  );
}
const phaseName = (phase: number) =>
  ({
    1: "DP",
    2: "SP",
    4: "MP1",
    8: "BP 开始",
    16: "BP",
    32: "伤害",
    64: "伤害计算",
    128: "BP 结束",
    256: "MP2",
    512: "EP",
  })[phase] || String(phase);
function describeEvents(frame: Pick<ReplayFrame, "turn" | "names" | "events">) {
  return frame.events.flatMap((e) => {
    const v = new DataView(new Uint8Array(e).buffer),
      code = (p: number) =>
        fetchCard(v.getUint32(p, true)).text.name ||
        String(v.getUint32(p, true)),
      prefix = `T${frame.turn} `;
    if (e[0] === 40) return [`${prefix}${frame.names[e[1]]} 开始回合`];
    if (e[0] === 41) return [`${prefix}${phaseName(v.getUint16(1, true))}`];
    if ([60, 62, 64].includes(e[0]))
      return [
        `${prefix}${code(1)} ${
          e[0] === 60 ? "召唤" : e[0] === 62 ? "特殊召唤" : "反转召唤"
        }`,
      ];
    if (e[0] === 70) return [`${prefix}连锁：${code(1)}`];
    if (e[0] === 50) return [`${prefix}${code(1)} 移动 ${e[6]} → ${e[10]}`];
    if (e[0] === 2 && [8, 10].includes(e[1]))
      return [`${prefix}宣言／提示：${code(3)}`];
    if (e[0] === 160 && e[5] === 2) return [`${prefix}宣言卡片：${code(6)}`];
    if ([91, 92, 100].includes(e[0]))
      return [
        `${prefix}${frame.names[e[1]]} ${
          e[0] === 92 ? "回复" : "减少"
        } LP ${v.getUint32(2, true)}`,
      ];
    if (e[0] === 5)
      return [
        `${prefix}${e[1] < 2 ? frame.names[e[1]] : "平局"} · 终局原因 ${e[2]}`,
      ];
    return [];
  });
}
