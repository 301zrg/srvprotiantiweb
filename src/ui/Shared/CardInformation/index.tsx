import "./style.css";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fetchStrings, getCardImgUrl, Region } from "@/api";
import {
  cardLinkWords,
  counterColor,
  counterEntries,
  type IdentifiedCardLinks,
  relatedCardLinks,
} from "@/variant/cardInformation";
import {
  type CardStats,
  placeFieldStats,
  roomyStatsQuery,
  type StatRect,
  statText,
} from "@/variant/cardStats";

import { CompactCardStats } from "../CardStats";

export interface InformationCard extends IdentifiedCardLinks {
  code: number;
  name: string;
  position: string;
  hidden?: boolean;
  counters: Readonly<Record<number, number>> | readonly number[];
  stats?: CardStats;
}

export function counterName(type: number) {
  const key = `0x${type.toString(16)}`;
  const name = fetchStrings(Region.Counter, key);
  return name && name !== "?" && name !== key ? name : key;
}

export function counterDescription(counters: InformationCard["counters"]) {
  return counterEntries(counters)
    .map(({ type, count }) => `${counterName(type)} × ${count}`)
    .join(" · ");
}

export function CardCounters({
  counters,
  testId = "card-counter-detail",
}: {
  counters: InformationCard["counters"];
  testId?: string;
}) {
  return (
    <div className="card-counter-details">
      {counterEntries(counters).map(({ type, count }) => (
        <div
          key={type}
          data-testid={testId}
          data-counter-type={type}
          data-counter-count={count}
        >
          <i style={{ background: counterColor(type) }} aria-hidden="true" />
          <span>{counterName(type)}</span>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

export function locateRelatedCard(id: string) {
  window.dispatchEvent(
    new CustomEvent("neos:locate-card-link", { detail: id }),
  );
}

export function RelatedCards({
  id,
  cards,
  language,
  onLocate,
}: {
  id?: string;
  cards: readonly InformationCard[];
  language: string;
  onLocate?: (id: string) => void;
}) {
  const edges = relatedCardLinks(cards, id);
  const ids = [
    ...new Set(
      edges.map((edge) => (edge.source === id ? edge.target : edge.source)),
    ),
  ];
  if (!ids.length) return null;
  return (
    <section
      className="related-card-details"
      data-testid="related-card-details"
    >
      <strong>{cardLinkWords(language).related}</strong>
      <div>
        {ids.map((targetId) => {
          const card = cards.find((c) => c.id === targetId)!;
          return (
            <button
              type="button"
              key={targetId}
              data-related-id={targetId}
              onClick={() => {
                onLocate?.(targetId);
                locateRelatedCard(targetId);
              }}
            >
              <img src={getCardImgUrl(card.code, card.hidden)} alt="" />
              <span>
                {card.name}
                <small>{card.position}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface CardRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  power?: StatRect;
}

/** Screen-space annotations stay upright for defense cards and flipped views.
 * The layer never catches input or participates in Core responses. */
export function CardInformationLayer({
  root,
  cards,
}: {
  root: RefObject<HTMLElement>;
  cards: readonly InformationCard[];
}) {
  const latest = useRef(cards);
  latest.current = cards;
  const scheduleMeasure = useRef<() => void>(() => {});
  // New stats or links can change labels without any DOM movement.
  useEffect(() => scheduleMeasure.current(), [cards]);
  const [hovered, setHovered] = useState<string>();
  const [pinned, setPinned] = useState<string>();
  const active = hovered ?? pinned;
  const [rects, setRects] = useState<CardRect[]>([]);
  const [clip, setClip] = useState({ x: 0, y: 0, width: 0, height: 0 });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const cardAt = (target: EventTarget | null) => {
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(
              "[data-card-info-id], [data-card-info-host]",
            )
          : null;
      return card && element.contains(card)
        ? card.dataset.cardInfoId ?? card.dataset.cardInfoHost
        : undefined;
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setHovered(cardAt(event.target));
    };
    const out = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" &&
        cardAt(event.target) !== cardAt(event.relatedTarget)
      )
        setHovered(cardAt(event.relatedTarget));
    };
    const down = (event: PointerEvent) => {
      const id = cardAt(event.target);
      if (
        id ||
        (event.target instanceof Node && element.contains(event.target))
      ) {
        setPinned(id);
        setHovered(undefined);
      }
    };
    const focus = (event: FocusEvent) => setHovered(cardAt(event.target));
    const blur = () => setHovered(undefined);
    const locate = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (latest.current.some((card) => card.id === id)) {
        setPinned(id);
        setHovered(undefined);
      }
    };
    element.addEventListener("pointerover", over);
    element.addEventListener("pointerout", out);
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", blur);
    window.addEventListener("neos:locate-card-link", locate);
    let frame = 0,
      timer = 0,
      previous = "",
      last = 0;
    const context = document.createElement("canvas").getContext("2d");
    if (context) context.font = "700 12px system-ui, sans-serif";
    const measure = () => {
      if (!document.hidden) {
        const linkedIds = new Set(
          relatedCardLinks(latest.current, active).flatMap((edge) => [
            edge.source,
            edge.target,
          ]),
        );
        const visible = new Set(
          latest.current
            .filter(
              (card) =>
                counterEntries(card.counters).length ||
                linkedIds.has(card.id) ||
                card.stats,
            )
            .map((card) => card.id),
        );
        const boundary = element.getBoundingClientRect();
        const nextClip = {
          x: Math.max(0, boundary.x),
          y: Math.max(0, boundary.y),
          width: boundary.width,
          height: boundary.height,
        };
        const obstacles = Array.from(
          element.querySelectorAll<HTMLElement>(
            "[data-card-info-id], [data-card-uuid], .scene-board-card, .practice-field-card, .replay-card",
          ),
        ).map((node) => node.getBoundingClientRect());
        const desktop = window.matchMedia(roomyStatsQuery).matches;
        const columns = Array.from(
          element.querySelectorAll<HTMLElement>(
            '[data-testid="duel-zone"][data-zone="MZONE"], .scene-board-slot[data-location="4"]',
          ),
        ).map((node) => node.getBoundingClientRect());
        const next = Array.from(
          element.querySelectorAll<HTMLElement>("[data-card-info-id]"),
        ).flatMap((node) => {
          const id = node.dataset.cardInfoId!;
          if (!visible.has(id)) return [];
          const r = node.getBoundingClientRect();
          if (
            r.width < 2 ||
            r.height < 2 ||
            r.bottom <= boundary.top ||
            r.top >= boundary.bottom ||
            r.right <= boundary.left ||
            r.left >= boundary.right
          )
            return [];
          const stats = latest.current.find((card) => card.id === id)?.stats;
          const column = columns.find(
            (slot) =>
              slot.left <= r.x + r.width / 2 &&
              slot.right >= r.x + r.width / 2 &&
              slot.top <= r.y + r.height / 2 &&
              slot.bottom >= r.y + r.height / 2,
          );
          const label =
            stats &&
            `${statText(stats.attack)}${
              stats.hasDefense === false ? "" : ` / ${statText(stats.defense)}`
            }`;
          const power =
            desktop && stats && context
              ? placeFieldStats(
                  r,
                  obstacles,
                  nextClip,
                  context.measureText(label!).width,
                  column?.width,
                )
              : undefined;
          return [
            { id, x: r.x, y: r.y, width: r.width, height: r.height, power },
          ];
        });
        const key = JSON.stringify([next, nextClip]);
        if (key !== previous) {
          previous = key;
          setRects(next);
          setClip(nextClip);
        }
      }
    };
    // Measure only after something moved, at most every 30 ms; an idle board
    // costs nothing. Spring animations write inline styles each frame, so
    // they keep being tracked while they play.
    const schedule = () => {
      if (frame || timer) return;
      const wait = last + 30 - performance.now();
      if (wait > 0) {
        timer = window.setTimeout(() => {
          timer = 0;
          schedule();
        }, wait);
        return;
      }
      frame = requestAnimationFrame((time) => {
        frame = 0;
        last = time;
        measure();
        // CSS-driven card moves (offline boards) change no attributes while
        // they run, so keep following them until they finish.
        for (const [key, started] of moving)
          if (time - started > 2000) moving.delete(key);
        if (moving.size) schedule();
      });
    };
    const moving = new Map<EventTarget, number>();
    const cardMotion = (event: TransitionEvent | AnimationEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest(
          "[data-card-info-id], [data-card-uuid], .scene-board-card",
        )
      )
        return undefined;
      if (
        "animationName" in event &&
        getComputedStyle(target).animationIterationCount.includes("infinite")
      )
        return undefined;
      return target;
    };
    const motionStart = (event: TransitionEvent | AnimationEvent) => {
      const target = cardMotion(event);
      if (!target) return;
      moving.set(target, performance.now());
      schedule();
    };
    const motionEnd = (event: TransitionEvent | AnimationEvent) => {
      const target = cardMotion(event);
      if (target) moving.delete(target);
      schedule();
    };
    scheduleMeasure.current = schedule;
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    element.addEventListener("transitionrun", motionStart);
    element.addEventListener("animationstart", motionStart);
    element.addEventListener("transitionend", motionEnd);
    element.addEventListener("transitioncancel", motionEnd);
    element.addEventListener("animationend", motionEnd);
    element.addEventListener("animationcancel", motionEnd);
    window.addEventListener("resize", schedule);
    window.addEventListener("neos:duel-layout", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => {
      scheduleMeasure.current = () => {};
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      mutations.disconnect();
      resize.disconnect();
      element.removeEventListener("transitionrun", motionStart);
      element.removeEventListener("animationstart", motionStart);
      element.removeEventListener("transitionend", motionEnd);
      element.removeEventListener("transitioncancel", motionEnd);
      element.removeEventListener("animationend", motionEnd);
      element.removeEventListener("animationcancel", motionEnd);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("neos:duel-layout", schedule);
      document.removeEventListener("visibilitychange", schedule);
      element.removeEventListener("pointerover", over);
      element.removeEventListener("pointerout", out);
      element.removeEventListener("pointerdown", down, true);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", blur);
      window.removeEventListener("neos:locate-card-link", locate);
    };
  }, [root, active]);
  const edges = relatedCardLinks(cards, active);
  const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return createPortal(
    <div
      className="card-information-layer"
      aria-hidden="true"
      style={{
        clipPath: `inset(${clip.y}px calc(100% - ${
          clip.x + clip.width
        }px) calc(100% - ${clip.y + clip.height}px) ${clip.x}px)`,
      }}
    >
      <svg className="card-link-lines">
        {edges.map((edge) => {
          const from = rects.find((rect) => rect.id === edge.source),
            to = rects.find((rect) => rect.id === edge.target);
          return from && to ? (
            <line
              key={`${edge.kind}:${edge.source}:${edge.target}`}
              data-testid="card-link-line"
              data-link-kind={edge.kind}
              x1={from.x + from.width / 2}
              y1={from.y + from.height / 2}
              x2={to.x + to.width / 2}
              y2={to.y + to.height / 2}
              strokeDasharray={edge.kind === "card" ? "5 4" : undefined}
            />
          ) : null;
        })}
      </svg>
      {rects.map((rect) => {
        const card = cards.find((c) => c.id === rect.id);
        if (!card) return null;
        const counters = counterEntries(card.counters);
        const rowHeight = Math.min(
          16,
          (rect.height - 4) / Math.max(1, counters.length),
        );
        return (
          <div
            key={rect.id}
            className="card-information-rect"
            data-info-id={rect.id}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          >
            {linked.has(rect.id) && (
              <div
                className="card-link-outline"
                data-testid="card-link-outline"
                data-link-active={rect.id === active}
              />
            )}
            <div className="card-counter-stack">
              {counters.map(({ type, count }) => (
                <span
                  key={type}
                  data-testid="card-counter-badge"
                  data-counter-type={type}
                  data-counter-count={count}
                  style={{
                    color: counterColor(type),
                    height: rowHeight,
                    fontSize: Math.min(12, rowHeight - 2),
                  }}
                >
                  <i />
                  {count}
                </span>
              ))}
            </div>
            {rect.power && card?.stats && (
              <div
                style={{
                  position: "absolute",
                  left: rect.power.x - rect.x,
                  top: rect.power.y - rect.y,
                  width: rect.power.width,
                }}
              >
                <CompactCardStats stats={card.stats} />
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
