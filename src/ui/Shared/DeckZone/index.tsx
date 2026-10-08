import { DeleteOutlined, MoreOutlined, SwapOutlined } from "@ant-design/icons";
import { App, Button, Dropdown } from "antd";
import classNames from "classnames";
import React, { useState } from "react";
import { useDrop } from "react-dnd";

import { CardMeta } from "@/api";
import { useI18N } from "@/ui/I18N";
import { deckMessages } from "@/variant/deckMessages";

import { DeckCard, DeckCardMouseUpEvent } from "../DeckCard";
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
  ) => void;
  onElementMouseUp: (event: DeckCardMouseUpEvent) => void;
  onDoubleClick?: (card: CardMeta) => void;
  onMoveCard?: (card: CardMeta, type: Type) => void;
  onRemoveCard?: (card: CardMeta, type: Type) => void;
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
  onRemoveCard,
  is408,
  compact = false,
}) => {
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = deckMessages(language);
  const [allowToDrop, setAllowToDrop] = useState(false);
  const [{ isOver }, dropRef] = useDrop({
    accept: ["Card"], // 指明该区域允许接收的拖放物。可以是单个，也可以是数组
    // 里面的值就是useDrag所定义的type
    // 当拖拽物在这个拖放区域放下时触发,这个item就是拖拽物的item（拖拽物携带的数据）
    drop: ({ value, source }: { value: CardMeta; source: Type | "search" }) => {
      if (type === source) return;
      const { result, reason } = canAdd(value, type, source);
      if (result) {
        onChange(value, source, type);
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
          <div key={card.id + i + type} style={{ minWidth: 0 }}>
            <DeckCard
              value={card}
              source={type}
              onMouseUp={onElementMouseUp}
              onDoubleClick={onDoubleClick}
              is408={is408}
            />
            {(onMoveCard || onRemoveCard) && (
              <>
                <div className={styles["card-actions"]}>
                  {onMoveCard && (
                    <Button
                      size="small"
                      aria-label={`${text.move} ${card.text.name}`}
                      onClick={() => onMoveCard(card, type)}
                    >
                      {text.moveShort}
                    </Button>
                  )}
                  {onRemoveCard && (
                    <Button
                      size="small"
                      aria-label={`${text.remove} ${card.text.name}`}
                      onClick={() => onRemoveCard(card, type)}
                    >
                      {text.removeShort}
                    </Button>
                  )}
                </div>
                {compact && (
                  <Dropdown
                    trigger={["click"]}
                    destroyPopupOnHide
                    menu={{
                      items: [
                        ...(onMoveCard
                          ? [
                              {
                                key: "move",
                                label: text.move,
                                icon: <SwapOutlined />,
                                onClick: () => onMoveCard(card, type),
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
                                onClick: () => onRemoveCard(card, type),
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
                )}
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
