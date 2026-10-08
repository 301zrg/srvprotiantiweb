import "./field.css";

import { Button, Drawer } from "antd";
import { useEffect, useRef, useState } from "react";

import { fetchCard, getCardImgUrl } from "@/api";
import type { ReplayCard } from "@/replay/messages";

import { concealReplayCard, positionLabel } from "./cardState";
import { ReplayCardTile } from "./CardTile";
import { type SceneFrame, scenePoint, type Spot } from "./scene";

export const fieldWords = {
  cn: {
    field: "场地视图",
    list: "列表视图",
    zoom: "放大场地",
    reset: "恢复大小",
    close: "关闭",
    ready: "当前局面",
    draw: "抽卡",
    move: "移动",
    position: "改变表示形式",
    set: "盖放",
    summon: "召唤",
    special: "特殊召唤",
    flip: "反转召唤",
    attack: "攻击",
    chain: "发动连锁",
    resolve: "处理连锁",
    chainEnd: "连锁结束",
    damage: "减少 LP",
    recover: "回复 LP",
    lp: "LP 更新",
    counter: "指示物变化",
    turn: "开始回合",
    phase: "阶段变化",
  },
  en: {
    field: "Field view",
    list: "List view",
    zoom: "Zoom field",
    reset: "Reset zoom",
    close: "Close",
    ready: "Current position",
    draw: "Draw",
    move: "Move",
    position: "Change position",
    set: "Set",
    summon: "Summon",
    special: "Special summon",
    flip: "Flip summon",
    attack: "Attack",
    chain: "Chain activation",
    resolve: "Chain resolution",
    chainEnd: "Chain ended",
    damage: "LP loss",
    recover: "LP recovery",
    lp: "LP update",
    counter: "Counters changed",
    turn: "New turn",
    phase: "Phase changed",
  },
  ja: {
    field: "フィールド",
    list: "一覧表示",
    zoom: "拡大",
    reset: "表示を戻す",
    close: "閉じる",
    ready: "現在の盤面",
    draw: "ドロー",
    move: "移動",
    position: "表示形式変更",
    set: "セット",
    summon: "召喚",
    special: "特殊召喚",
    flip: "反転召喚",
    attack: "攻撃",
    chain: "チェーン発動",
    resolve: "チェーン処理",
    chainEnd: "チェーン終了",
    damage: "LP減少",
    recover: "LP回復",
    lp: "LP更新",
    counter: "カウンター変更",
    turn: "ターン開始",
    phase: "フェイズ変更",
  },
  ko: {
    field: "필드 보기",
    list: "목록 보기",
    zoom: "필드 확대",
    reset: "확대 초기화",
    close: "닫기",
    ready: "현재 필드",
    draw: "드로우",
    move: "이동",
    position: "표시 형식 변경",
    set: "세트",
    summon: "소환",
    special: "특수 소환",
    flip: "반전 소환",
    attack: "공격",
    chain: "체인 발동",
    resolve: "체인 처리",
    chainEnd: "체인 종료",
    damage: "LP 감소",
    recover: "LP 회복",
    lp: "LP 갱신",
    counter: "카운터 변경",
    turn: "턴 시작",
    phase: "페이즈 변경",
  },
};
export function replayFieldWords(language: string) {
  return fieldWords[language as keyof typeof fieldWords] || fieldWords.cn;
}
const locations = [2, 4, 8, 1, 64, 16, 32];
export function FieldBoard({
  frame,
  view,
  reveal,
  language,
  text,
  onInspect,
  onPause,
}: {
  frame: SceneFrame;
  view: number;
  reveal: boolean;
  language: string;
  text: string[];
  onInspect: (card: ReplayCard) => void;
  onPause: () => void;
}) {
  const t = replayFieldWords(language),
    viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000),
    [height, setHeight] = useState(540),
    [desktop, setDesktop] = useState(false),
    [zoom, setZoom] = useState(1),
    [pile, setPile] = useState<Spot>();
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const update = () => {
      setWidth(el.clientWidth);
      const wide = window.innerWidth >= 1024 && window.innerHeight >= 600;
      setDesktop(wide);
      const top =
        el.getBoundingClientRect().top +
        (el.closest(".replay-player")?.scrollTop || 0);
      setHeight(
        wide
          ? Math.max(240, window.innerHeight - top - 52)
          : Math.max(320, window.innerHeight - 380),
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el
      .closest(".replay-player")
      ?.querySelectorAll(
        ".replay-header, .replay-controls, .replay-progress, .replay-field-heading",
      )
      .forEach((part) => observer.observe(part));
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [language, reveal]);
  const fieldHeight = desktop ? 640 : 920;
  const scale =
    Math.min(
      desktop ? 1.25 : 1,
      (width - 2) / 1000,
      (height - 2) / fieldHeight,
    ) * zoom;
  const label = (location: number) =>
    text[16 + locations.indexOf(location)] || "";
  const action = frame.action;
  const actionName = action
    ? t[action.kind as keyof typeof t] || action.kind
    : "";
  const actionCode = action?.code
    ? fetchCard(action.code).text.name || action.code
    : "";
  const placed = frame.cards.filter((c) => [2, 4, 8].includes(c.location));
  const point = (place: Spot) => {
    const p = scenePoint(place, view);
    if (desktop) {
      const rows: Record<number, number> = {
        30: 14,
        75: 54,
        225: 160,
        385: 266,
        535: 374,
        695: 480,
        845: 586,
        890: 626,
      };
      p.y = rows[p.y] ?? p.y;
    }
    if (place.location === 2) {
      const count = frame.cards.filter(
        (c) => c.player === place.player && c.location === 2,
      ).length;
      p.x =
        500 +
        (place.sequence - (count - 1) / 2) *
          Math.min(135, 570 / Math.max(1, count - 1));
    }
    return p;
  };
  const focus = (c: Spot) =>
    action?.to &&
    c.player === action.to.player &&
    c.location === (action.to.location & 127) &&
    c.sequence === action.to.sequence;
  const arrow =
    action?.kind === "attack" && action.from && action.to
      ? { from: point(action.from), to: point(action.to) }
      : undefined;
  return (
    <section
      className={`replay-field-board ${desktop ? "replay-field-desktop" : ""}`}
    >
      <div className="replay-field-heading">
        <div className="replay-field-toolbar">
          <div className="replay-field-tools">
            <Button onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 0.5))}>
              {t.zoom} {zoom}×
            </Button>
            <Button onClick={() => setZoom(1)}>{t.reset}</Button>
          </div>
          <div
            className="replay-field-action"
            role="status"
            data-action={action?.kind || "ready"}
          >
            {actionName || t.ready} {actionCode}{" "}
            {action?.amount !== undefined ? `· ${action.amount}` : ""}
          </div>
        </div>
        <div className="replay-field-player">
          <strong>{frame.names[1 - view]}</strong>
          <span>LP {frame.lp[1 - view]}</span>
        </div>
      </div>
      <div
        className="replay-field-viewport"
        ref={viewport}
        style={{ maxHeight: height }}
      >
        <div
          className="replay-field-canvas"
          style={{ width: 1000 * scale, height: fieldHeight * scale }}
        >
          <div
            className="replay-field-plane"
            style={
              {
                transform: `scale(${scale})`,
                height: fieldHeight,
                "--field-scale": scale,
              } as React.CSSProperties
            }
          >
            {[1 - view, view].map((player) => (
              <div key={player}>
                {[4, 8].flatMap((location) =>
                  Array.from(
                    { length: location === 4 ? 5 : 6 },
                    (_, sequence) => {
                      const p = point({ player, location, sequence });
                      return (
                        <div
                          key={`${location}:${sequence}`}
                          className="replay-field-slot"
                          data-player={player}
                          data-location={location}
                          data-sequence={sequence}
                          style={{ left: p.x, top: p.y }}
                        >
                          {label(location)} {sequence + 1}
                        </div>
                      );
                    },
                  ),
                )}
                {[1, 16, 32, 64].map((location) => {
                  const cards = frame.cards.filter(
                      (c) => c.player === player && c.location === location,
                    ),
                    count = cards.length,
                    top = cards.at(-1),
                    p = point({ player, location, sequence: 0 });
                  return (
                    <button
                      key={location}
                      className="replay-field-pile"
                      style={{ left: p.x, top: p.y }}
                      data-pile={location}
                      data-player={player}
                      onClick={() => {
                        onPause();
                        setPile({ player, location, sequence: 0 });
                      }}
                    >
                      {top && (
                        <img
                          src={getCardImgUrl(
                            top.code,
                            concealReplayCard(top, reveal),
                          )}
                          alt={positionLabel(top, language)}
                          loading="lazy"
                        />
                      )}
                      <span>
                        {label(location)} {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {placed.map((c) => {
              const p = point(c);
              const arriving = action?.arrivals?.includes(c.sceneId);
              const origin =
                arriving && action?.kind === "draw"
                  ? point({ player: c.player, location: 1, sequence: 0 })
                  : arriving &&
                    action?.from &&
                    ![2, 4, 8].includes(action.from.location)
                  ? point(action.from)
                  : undefined;
              return (
                <ReplayCardTile
                  key={c.sceneId}
                  card={c}
                  language={language}
                  reveal={reveal}
                  zoneLabel={label(c.location)}
                  onInspect={onInspect}
                  className={`replay-field-card ${
                    c.player !== view ? "replay-field-far" : ""
                  } ${focus(c) ? "replay-field-focus" : ""} ${
                    origin ? "replay-field-enter" : ""
                  }`}
                  style={{
                    left: p.x,
                    top: p.y,
                    ...(origin
                      ? {
                          "--replay-origin-x": `${origin.x}px`,
                          "--replay-origin-y": `${origin.y}px`,
                        }
                      : {}),
                  }}
                />
              );
            })}
            {action?.moving &&
              action.from &&
              action.to &&
              [2, 4, 8].includes(action.from.location) &&
              [1, 16, 32, 64].includes(action.to.location) && (
                <ReplayCardTile
                  key={`depart:${frame.step}:${action.moving.sceneId}`}
                  card={action.moving}
                  language={language}
                  reveal={reveal}
                  zoneLabel={label(action.to.location)}
                  onInspect={onInspect}
                  className={`replay-field-card replay-field-enter replay-field-leave ${
                    action.moving.player !== view ? "replay-field-far" : ""
                  }`}
                  style={{
                    left: point(action.to).x,
                    top: point(action.to).y,
                    "--replay-origin-x": `${point(action.from).x}px`,
                    "--replay-origin-y": `${point(action.from).y}px`,
                  }}
                />
              )}
            {frame.chains.map((chain) => {
              const p = point(chain);
              return (
                <span
                  key={chain.index}
                  className="replay-field-chain"
                  style={{ left: p.x + 45, top: p.y - 45 }}
                >
                  {chain.index}
                </span>
              );
            })}
            {arrow && (
              <svg
                className="replay-field-arrows"
                viewBox={`0 0 1000 ${fieldHeight}`}
                aria-label={t.attack}
              >
                <defs>
                  <marker
                    id="replay-attack-tip"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffca57" />
                  </marker>
                </defs>
                <line
                  x1={arrow.from.x}
                  y1={arrow.from.y}
                  x2={arrow.to.x}
                  y2={arrow.to.y}
                  stroke="#ffca57"
                  strokeWidth="9"
                  markerEnd="url(#replay-attack-tip)"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
      <div className="replay-field-player">
        <strong>{frame.names[view]}</strong>
        <span>LP {frame.lp[view]}</span>
      </div>
      <Drawer
        rootClassName="replay-drawer"
        title={
          pile ? `${frame.names[pile.player]} · ${label(pile.location)}` : ""
        }
        open={!!pile}
        onClose={() => setPile(undefined)}
        width={450}
      >
        <Button onClick={() => setPile(undefined)}>{t.close}</Button>
        <div className="replay-field-pile-list">
          {pile &&
            frame.cards
              .filter(
                (c) => c.player === pile.player && c.location === pile.location,
              )
              .map((c) => (
                <ReplayCardTile
                  key={c.sceneId}
                  card={c}
                  reveal={reveal}
                  language={language}
                  zoneLabel={label(c.location)}
                  onInspect={(card) => {
                    setPile(undefined);
                    onInspect(card);
                  }}
                />
              ))}
        </div>
      </Drawer>
    </section>
  );
}
