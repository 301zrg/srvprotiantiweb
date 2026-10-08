import type { CSSProperties } from "react";

import { fetchCard, getCardImgUrl } from "@/api";
import type { ReplayCard } from "@/replay/messages";

import {
  concealReplayCard,
  isDefense,
  isFaceDown,
  positionLabel,
  replayCardWords,
  replayCounters,
} from "./cardState";

export function ReplayCardTile({
  card,
  language,
  reveal,
  zoneLabel,
  onInspect,
  className = "",
  style,
}: {
  card: ReplayCard;
  language: string;
  reveal: boolean;
  zoneLabel: string;
  onInspect: (card: ReplayCard) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const t = replayCardWords(language);
  const hidden = concealReplayCard(card, reveal);
  const name = hidden
    ? t.facedown
    : fetchCard(card.code).text.name || String(card.code);
  const counters = replayCounters(card);
  return (
    <button
      className={`replay-card ${isFaceDown(card) ? "replay-facedown" : ""} ${
        isDefense(card) ? "replay-defense" : ""
      } ${className}`}
      style={style}
      data-player={card.player}
      data-location={card.location}
      data-sequence={card.sequence}
      data-position={card.position}
      onClick={() => onInspect(card)}
      aria-label={`${name}，${zoneLabel}，${positionLabel(card, language)}`}
    >
      <div className="replay-card-image">
        <img src={getCardImgUrl(card.code, hidden)} loading="lazy" alt={name} />
      </div>
      <span>{name}</span>
      <span className="replay-position">{positionLabel(card, language)}</span>
      {(card.location === 4 || card.location === 8) && (
        <small>
          {t.slot} {card.sequence + 1}
        </small>
      )}
      {card.location === 4 && (
        <small>
          {card.attack}/{card.defense}
          {card.overlay.length
            ? ` · ${t.materials} ${card.overlay.length}`
            : ""}
        </small>
      )}
      {!!counters.length && (
        <small className="replay-counter-count">
          {t.counters} {counters.reduce((n, c) => n + c.count, 0)}
        </small>
      )}
      {!!((card.status || 0) & 1) && (
        <small className="replay-negated">{t.disabled}</small>
      )}
      {!!((card.status || 0) & 0x4000000) && (
        <small className="replay-negated">{t.forbidden}</small>
      )}
    </button>
  );
}
