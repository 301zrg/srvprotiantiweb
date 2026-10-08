import React, { memo, useRef, useState } from "react";
import { useDrag } from "react-dnd";

import { CardMeta, forbidden, forbidden_408, getCardImgUrl } from "@/api";
import { useConfig } from "@/config";
import { useMobileInterface } from "@/hook";

import { Type } from "../DeckZone";
import styles from "./index.module.scss";

const { assetsPath } = useConfig();

export interface DeckCardMouseUpEvent {
  event: React.MouseEvent;
  card: CardMeta;
}

/** 组卡页和Side页使用的单张卡片，增加了文字和禁限数量 */
export const DeckCard: React.FC<{
  value: CardMeta;
  source: Type | "search";
  onMouseUp?: (event: DeckCardMouseUpEvent) => void;
  onMouseEnter?: () => void;
  onDoubleClick?: (card: CardMeta) => void;
  is408?: boolean;
}> = memo(
  ({ value, source, onMouseUp, onMouseEnter, onDoubleClick, is408 }) => {
    const ref = useRef<HTMLDivElement>(null);
    const mobile = useMobileInterface();
    const [{ isDragging }, drag] = useDrag({
      type: "Card",
      // Touch dragging consumes swipe gestures before the editor can scroll.
      // Mobile already provides explicit add / move / remove controls.
      canDrag: !mobile,
      item: { value, source },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });
    drag(ref);
    const [loadedCode, setLoadedCode] = useState<number | null>(null);
    const showText = loadedCode !== value.id;
    const limitCnt = is408 ? forbidden_408.get(value) : forbidden.get(value);

    return (
      <div
        className={styles.card}
        ref={ref}
        style={{ opacity: isDragging && source !== "search" ? 0 : 1 }}
        data-testid="deck-card"
        data-card-code={value.id}
        role="button"
        tabIndex={0}
        aria-label={value.text.name || String(value.id)}
        onClick={(event) => onMouseUp?.({ event, card: value })}
        onMouseUp={(event) =>
          event.button !== 0 &&
          onMouseUp?.({
            event,
            card: value,
          })
        }
        onPointerEnter={(event) => {
          if (
            event.pointerType === "mouse" &&
            window.matchMedia("(hover: hover)").matches
          )
            onMouseEnter?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
        onDoubleClick={() => onDoubleClick?.(value)}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        {showText && <div className={styles.cardname}>{value.text.name}</div>}
        <img
          className={styles.cardcover}
          data-card-image
          src={getCardImgUrl(value.id)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{ opacity: showText ? 0 : 1 }}
          onLoad={() => setLoadedCode(value.id)}
          onError={() => setLoadedCode(null)}
        />
        {limitCnt !== undefined && (
          <img
            className={styles.cardlimit}
            src={`${assetsPath}/Limit0${limitCnt}.png`}
          />
        )}
      </div>
    );
  },
);
