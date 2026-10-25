import { Divider } from "antd";
import type { ReactNode } from "react";

import { fetchCard, getCardImgUrl } from "@/api";
import { statsPlaybackMessages } from "@/variant/statsPlaybackMessages";

import { CardEffectText } from "../CardEffectText";
import {
  CardCounters,
  type InformationCard,
  RelatedCards,
} from "../CardInformation";
import { CardStatsDetails } from "../CardStats";
import { CardIdentityDetails } from "../CardStats/CardIdentity";

type StatsInput = Parameters<typeof CardStatsDetails>[0]["stats"];
type IdentityInput = Parameters<typeof CardIdentityDetails>[0]["current"];

/** Card detail body shared by online duels, replays and the hand test.
 * Callers pass only what the viewer may see; opening, closing and live
 * tracking stay with each mode's own panel. */
export function CardDetailContent({
  code,
  language,
  imageClassName,
  stats,
  live = false,
  counters,
  countersTestId,
  identity,
  related,
  description,
  descriptionClassName,
  children,
}: {
  /** Visible card code; 0 shows the card back. */
  code: number;
  language: string;
  imageClassName?: string;
  /** Omit for non-monsters. */
  stats?: StatsInput;
  /** Stats are the card's current field values. */
  live?: boolean;
  counters?: InformationCard["counters"];
  countersTestId?: string;
  identity?: IdentityInput;
  related?: {
    id?: string;
    cards: readonly InformationCard[];
    onLocate?: (id: string) => void;
  };
  /** Printed text; defaults to the code's card text. */
  description?: string;
  descriptionClassName?: string;
  /** Mode-specific lines (position, hints, materials). */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="card-stat-overview">
        <img
          className={`card-detail-image ${imageClassName ?? ""}`}
          src={getCardImgUrl(code, !code)}
          alt={code ? fetchCard(code).text.name ?? "" : ""}
        />
        <div className="card-detail-info">
          {stats && (
            <CardStatsDetails language={language} live={live} stats={stats} />
          )}
          {counters && (
            <CardCounters counters={counters} testId={countersTestId} />
          )}
        </div>
      </div>
      {!!code && (
        <CardIdentityDetails
          code={code}
          current={identity}
          language={language}
        />
      )}
      {children}
      {related && (
        <RelatedCards
          id={related.id}
          cards={related.cards}
          language={language}
          onLocate={related.onLocate}
        />
      )}
      <Divider style={{ margin: "0.875rem 0" }} />
      <strong className="card-printed-description-label">
        {statsPlaybackMessages(language).printed}
      </strong>
      <div className={descriptionClassName}>
        <CardEffectText
          desc={description ?? (code ? fetchCard(code).text.desc : "")}
        />
      </div>
    </>
  );
}
