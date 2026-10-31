import { HolderOutlined } from "@ant-design/icons";
import { Button } from "antd";
import React, { memo, useLayoutEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";

import { CardMeta, forbidden, forbidden_408 } from "@/api";
import { useConfig } from "@/config";
import { useMobileInterface } from "@/hook";
import { useCardImage, useNearViewport } from "@/hook/useCardImage";
import { useI18N } from "@/ui/I18N";
import { deckMessages } from "@/variant/deckMessages";

import { Type } from "../DeckZone";
import styles from "./index.module.scss";

const { assetsPath } = useConfig();

export interface DeckCardMouseUpEvent {
  event: React.MouseEvent;
  card: CardMeta;
  index?: number;
}

export interface DeckCardDragItem {
  value: CardMeta;
  source: Type | "search";
  index?: number;
  reorderOnly?: boolean;
}

/** 组卡页和Side页使用的单张卡片，增加了文字和禁限数量 */
export const DeckCard: React.FC<{
  value: CardMeta;
  source: Type | "search";
  onMouseUp?: (event: DeckCardMouseUpEvent) => void;
  onMouseEnter?: () => void;
  onDoubleClick?: (card: CardMeta) => void;
  is408?: boolean;
  index?: number;
  onReorder?: (from: number, to: number) => void;
  reorderMode?: boolean;
}> = memo(
  ({
    value,
    source,
    onMouseUp,
    onMouseEnter,
    onDoubleClick,
    is408,
    index,
    onReorder,
    reorderMode = false,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLButtonElement>(null);
    const suppressClick = useRef(false);
    const mobile = useMobileInterface();
    const { language } = useI18N();
    const text = deckMessages(language);
    const [{ isDragging }, drag, preview] = useDrag<
      DeckCardDragItem,
      unknown,
      { isDragging: boolean }
    >({
      type: "Card",
      canDrag: !mobile || (reorderMode && !!onReorder),
      item: () => {
        suppressClick.current = true;
        return { value, source, index, reorderOnly: mobile };
      },
      end: () => {
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });
    const [{ isOver }, drop] = useDrop<
      DeckCardDragItem,
      unknown,
      { isOver: boolean }
    >({
      accept: "Card",
      canDrop: (item) =>
        !!onReorder &&
        item.source === source &&
        item.index !== undefined &&
        index !== undefined &&
        item.index !== index,
      drop: (item) => {
        if (item.index !== undefined && index !== undefined)
          onReorder?.(item.index, index);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    });
    drop(ref);
    preview(ref);
    // The conditional touch handle must mount before its connector reads the ref.
    useLayoutEffect(() => {
      drag(mobile ? handleRef : ref);
    }, [drag, mobile, reorderMode]);
    // A search page mounts ~200 cards: fetch only those near the visible part
    // of the scroll area instead of everything native lazy-loading prefetches.
    const near = useNearViewport(ref);
    const image = useCardImage(value.id, false, near);
    const [loadedCode, setLoadedCode] = useState<number | null>(null);
    const showText = loadedCode !== value.id;
    const limitCnt = is408 ? forbidden_408.get(value) : forbidden.get(value);

    return (
      <>
        <div
          className={styles.card}
          ref={ref}
          style={{ opacity: isDragging && source !== "search" ? 0 : 1 }}
          data-testid="deck-card"
          data-card-code={value.id}
          data-card-index={index}
          data-reorder-target={isOver}
          role="button"
          tabIndex={0}
          aria-label={value.text.name || String(value.id)}
          onClick={(event) =>
            !suppressClick.current && onMouseUp?.({ event, card: value, index })
          }
          onMouseUp={(event) =>
            event.button !== 0 &&
            onMouseUp?.({
              event,
              card: value,
              index,
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
            src={image}
            alt=""
            draggable={false}
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
        {mobile && reorderMode && onReorder && index !== undefined && (
          <Button
            ref={handleRef}
            className={styles.reorderHandle}
            data-testid="deck-card-reorder"
            aria-label={`${text.manualOrder} ${value.text.name} ${index + 1}`}
            icon={<HolderOutlined />}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const delta = ["ArrowLeft", "ArrowUp"].includes(event.key)
                ? -1
                : ["ArrowRight", "ArrowDown"].includes(event.key)
                ? 1
                : 0;
              if (delta) {
                event.preventDefault();
                onReorder(index, index + delta);
              }
            }}
          >
            {index + 1}
          </Button>
        )}
      </>
    );
  },
);
