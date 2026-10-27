import {
  DeleteOutlined,
  MoreOutlined,
  PlusOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { App, Button, Dropdown } from "antd";
import classNames from "classnames";
import React, { useState } from "react";
import { useDrop } from "react-dnd";

import { CardMeta } from "@/api";
import { useI18N } from "@/ui/I18N";
import { deckMessages } from "@/variant/deckMessages";

import {
  DeckCard,
  type DeckCardDragItem,
  DeckCardMouseUpEvent,
} from "../DeckCard";
import styles from "./index.module.scss";

/** 正在组卡的zone，包括main/extra/side
 * 该组件内部没有引用任何store，是解耦的*/
export type Type = "main" | "extra" | "side";
export const DeckZone: React.FC<{
  type: Type;
  cards: CardMeta[];
  canAdd: (
    card: CardMeta,
    type: Type,
    source: Type | "search",
  ) => { result: boolean; reason: string };
  onChange: (
    card: CardMeta,
    source: Type | "search",
    destination: Type,
    index?: number,
  ) => void;
  onElementMouseUp: (event: DeckCardMouseUpEvent) => void;
  onDoubleClick?: (card: CardMeta) => void;
  onMoveCard?: (card: CardMeta, type: Type, index?: number) => void;
  onAddCard?: (card: CardMeta, type: Type) => void;
  onReorder?: (from: number, to: number) => void;
  reorderMode?: boolean;
  getMoveLabel?: (card: CardMeta, type: Type) => string;
  getMoveShortLabel?: (card: CardMeta, type: Type) => string;
  onRemoveCard?: (card: CardMeta, type: Type, index?: number) => void;
  is408?: boolean;
  compact?: boolean;
}> = ({
  type,
  cards,
  canAdd,
  onChange,
  onElementMouseUp: onElementMouseUp,
  onDoubleClick,
  onMoveCard,
  onAddCard,
  onReorder,
  reorderMode = false,
  getMoveLabel,
  getMoveShortLabel,
  onRemoveCard,
  is408,
  compact = false,
}) => {
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = deckMessages(language);
  const [allowToDrop, setAllowToDrop] = useState(false);
  const [{ isOver }, dropRef] = useDrop<
    DeckCardDragItem,
    unknown,
    { isOver: boolean }
  >({
    accept: ["Card"], // 指明该区域允许接收的拖放物。可以是单个，也可以是数组
    // 里面的值就是useDrag所定义的type
    // 当拖拽物在这个拖放区域放下时触发,这个item就是拖拽物的item（拖拽物携带的数据）
    canDrop: (item) => !item.reorderOnly || item.source === type,
    drop: ({ value, source, index }, monitor) => {
      if (monitor.didDrop()) return;
      if (type === source) return;
      const { result, reason } = canAdd(value, type, source);
      if (result) {
        onChange(value, source, type, index);
      } else {
        message.error(reason);
      }
    },
    hover: ({ value, source }) => {
      setAllowToDrop(
        type !== source ? canAdd(value, type, source).result : true,
      );
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });
  return (
    <div
      data-testid={`deck-zone-${type}`}
      data-card-count={cards.length}
      data-compact-cards={compact}
      className={classNames(styles[type], {
        [styles.over]: isOver,
        [styles["not-allow-to-drop"]]: isOver && !allowToDrop,
      })}
      ref={dropRef}
    >
      <div className={styles["card-continer"]}>
        {cards.map((card, i) => (
          <div key={`${type}-${i}-${card.id}`} style={{ minWidth: 0 }}>
            <DeckCard
              value={card}
              source={type}
              onMouseUp={onElementMouseUp}
              onDoubleClick={onDoubleClick}
              is408={is408}
              index={i}
              onReorder={onReorder}
              reorderMode={reorderMode}
            />
            {!reorderMode && (onMoveCard || onRemoveCard || onAddCard) && (
              <>
                <div className={styles["card-actions"]}>
                  {onMoveCard && (
                    <Button
                      size="small"
                      aria-label={`${getMoveLabel?.(card, type) ?? text.move} ${
                        card.text.name
                      }`}
                      data-testid="deck-card-move-action"
                      title={text.move}
                      icon={onAddCard ? <SwapOutlined /> : undefined}
                      onClick={() => onMoveCard(card, type, i)}
                    >
                      {!onAddCard && text.moveShort}
                    </Button>
                  )}
                  {onAddCard && (
                    <Button
                      size="small"
                      data-testid="deck-card-add"
                      aria-label={`${text.add} ${card.text.name}`}
                      title={text.add}
                      icon={<PlusOutlined />}
                      onClick={() => onAddCard(card, type)}
                    />
                  )}
                  {onRemoveCard && (
                    <Button
                      size="small"
                      aria-label={`${text.remove} ${card.text.name}`}
                      data-testid="deck-card-remove"
                      title={text.remove}
                      icon={onAddCard ? <DeleteOutlined /> : undefined}
                      onClick={() => onRemoveCard(card, type, i)}
                    >
                      {!onAddCard && text.removeShort}
                    </Button>
                  )}
                </div>
                {compact &&
                  (onMoveCard && !onRemoveCard ? (
                    <Button
                      className={styles["card-menu"]}
                      data-testid="deck-card-move"
                      aria-label={`${getMoveLabel?.(card, type) ?? text.move} ${
                        card.text.name
                      }`}
                      icon={<SwapOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveCard(card, type, i);
                      }}
                    >
                      {getMoveShortLabel?.(card, type) ?? text.moveShort}
                    </Button>
                  ) : (
                    <Dropdown
                      trigger={["click"]}
                      destroyPopupOnHide
                      menu={{
                        items: [
                          ...(onMoveCard
                            ? [
                                {
                                  key: "move",
                                  label:
                                    getMoveLabel?.(card, type) ?? text.move,
                                  icon: <SwapOutlined />,
                                  onClick: () => onMoveCard(card, type, i),
                                },
                              ]
                            : []),
                          ...(onAddCard
                            ? [
                                {
                                  key: "add",
                                  label: text.add,
                                  icon: <PlusOutlined />,
                                  onClick: () => onAddCard(card, type),
                                },
                              ]
                            : []),
                          ...(onRemoveCard
                            ? [
                                {
                                  key: "remove",
                                  label: text.remove,
                                  icon: <DeleteOutlined />,
                                  danger: true,
                                  onClick: () => onRemoveCard(card, type, i),
                                },
                              ]
                            : []),
                        ],
                      }}
                    >
                      <Button
                        className={styles["card-menu"]}
                        data-testid="deck-card-menu"
                        aria-label={`${text.cardActions} ${card.text.name}`}
                        icon={<MoreOutlined />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Dropdown>
                  ))}
              </>
            )}
          </div>
        ))}
        <div className={styles["editing-zone-name"]}>
          {`${type.toUpperCase()}: ${cards.length}`}
        </div>
      </div>
    </div>
  );
};
