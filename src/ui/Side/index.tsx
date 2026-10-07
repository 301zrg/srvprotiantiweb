import { CheckOutlined, UndoOutlined } from "@ant-design/icons";
import { App, Button, Space } from "antd";
import { HTML5toTouch } from "rdndmb-html5-to-touch";
import React, { useEffect, useState } from "react";
import { DndProvider } from "react-dnd-multi-backend";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { CardMeta, fetchCard, sendUpdateDeck } from "@/api";
import { isExtraDeckCard } from "@/common";
import { getUIContainer } from "@/container/compat";
import { AudioActionType, changeScene } from "@/infra/audio";
import { IDeck, roomStore, SideStage, sideStore } from "@/stores";
import { requireSession } from "@/ui/requireSession";
import { deckMessages } from "@/variant/deckMessages";

import { CardDetail } from "../BuildDeck/CardDetail";
import { useI18N } from "../I18N";
import { Background, DeckZone, ScrollableArea, Type, useChat } from "../Shared";
import { Chat } from "../WaitRoom/Chat";
import styles from "./index.module.scss";
import { TpModal } from "./TpModal";

export const loader: LoaderFunction = async () => {
  const redirected = requireSession();
  if (redirected) return redirected;
  // 更新场景
  changeScene(AudioActionType.BGM_DECK);
  return null;
};

export const Component: React.FC = () => {
  const chat = useChat();
  const { language } = useI18N();
  const text = deckMessages(language);
  const container = getUIContainer();
  const { message } = App.useApp();
  const initialDeck = sideStore.getSideDeck();
  const { stage } = useSnapshot(sideStore);
  const { errorMsg } = useSnapshot(roomStore);
  const [deck, setDeck] = useState<IDeck>(initialDeck);
  const [selectedCard, setSelectedCard] = useState(0);
  const navigate = useNavigate();
  const canAdd = (card: CardMeta, type: Type, _source: Type | "search") => {
    const cardType = card.data.type ?? 0;
    if (
      (type === "extra" && !isExtraDeckCard(cardType)) ||
      (type === "main" && isExtraDeckCard(cardType))
    ) {
      return { result: false, reason: text.typeMismatch };
    } else {
      return { result: true, reason: "" };
    }
  };
  const onChange = (
    card: CardMeta,
    source: Type | "search",
    destination: Type,
  ) => {
    setDeck((prev) => {
      const deck = {
        ...prev,
        main: [...prev.main],
        extra: [...prev.extra],
        side: [...prev.side],
      };
      if (source !== "search") {
        const removeIndex = deck[source].findIndex((id) => id === card.id);
        if (removeIndex !== -1) {
          deck[source].splice(removeIndex, 1);
        }
      }
      deck[destination].push(card.id);

      return deck;
    });
  };
  const onReset = () => {
    setDeck({
      ...initialDeck,
      main: [...initialDeck.main],
      extra: [...initialDeck.extra],
      side: [...initialDeck.side],
    });
    message.info(text.resetDone);
  };
  const onSummit = () => {
    const original = [
      ...initialDeck.main,
      ...initialDeck.extra,
      ...initialDeck.side,
    ].sort((a, b) => a - b);
    const updated = [...deck.main, ...deck.extra, ...deck.side].sort(
      (a, b) => a - b,
    );
    if (
      JSON.stringify(original) !== JSON.stringify(updated) ||
      deck.main.length > 60 ||
      deck.extra.length > 15 ||
      deck.side.length > 15
    ) {
      message.error(text.sideInvalid);
      return;
    }
    sendUpdateDeck(container.conn, deck);
    sideStore.setSideDeck(deck);
  };

  useEffect(() => {
    if (stage === SideStage.SIDE_CHANGED) {
      message.info(text.sideChanged);
    }
    if (stage === SideStage.DUEL_START) {
      // 决斗开始，跳转
      navigate("/duel");
    }
  }, [stage]);
  useEffect(() => {
    if (errorMsg !== undefined && errorMsg !== "") {
      message.error(errorMsg);
      roomStore.errorMsg = undefined;
    }
  }, [errorMsg]);

  return (
    <DndProvider options={HTML5toTouch}>
      <Background />
      <div className={styles.container} data-language={language}>
        <div className={styles.sider}>
          <Chat controller={chat} />
        </div>
        <div className={styles.content}>
          <div className={styles["deck-container"]}>
            <Space className={styles.title}>
              <div>{text.sideTitle}</div>
              <Space style={{ marginRight: 6 }}>
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={onReset}
                >
                  {text.reset}
                </Button>
                <Button
                  type="primary"
                  data-testid="side-confirm"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={stage > SideStage.SIDE_CHANGING}
                  onClick={onSummit}
                >
                  {text.confirm}
                </Button>
              </Space>
            </Space>
            <ScrollableArea
              className={styles["deck-zone"]}
              hostClassName={styles.scrollHost}
            >
              {(["main", "extra", "side"] as const).map((type) => (
                <DeckZone
                  key={type}
                  type={type}
                  cards={[...deck[type]].map((id) => fetchCard(id))}
                  canAdd={canAdd}
                  onChange={onChange}
                  onElementMouseUp={(event) => setSelectedCard(event.card.id)}
                  onMoveCard={(card, source) => {
                    const target =
                      source === "side"
                        ? isExtraDeckCard(card.data.type ?? 0)
                          ? "extra"
                          : "main"
                        : "side";
                    onChange(card, source, target);
                  }}
                />
              ))}
            </ScrollableArea>
          </div>
        </div>
        <div className={styles["detail-container"]}>
          <CardDetail
            code={selectedCard}
            open={selectedCard !== 0}
            onClose={() => setSelectedCard(0)}
          />
        </div>
      </div>
      <TpModal />
    </DndProvider>
  );
};
