import {
  CheckOutlined,
  MessageOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { App, Badge, Button } from "antd";
import { HTML5toTouch } from "rdndmb-html5-to-touch";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DndProvider } from "react-dnd-multi-backend";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { CardMeta, fetchCard, sendUpdateDeck } from "@/api";
import { isExtraDeckCard } from "@/common";
import { getUIContainer } from "@/container/compat";
import { useMediaQuery } from "@/hook";
import { AudioActionType, changeScene } from "@/infra/audio";
import { IDeck, matStore, roomStore, SideStage, sideStore } from "@/stores";
import { requireSession } from "@/ui/requireSession";
import { deckMessages } from "@/variant/deckMessages";
import { mobileMessages } from "@/variant/mobileMessages";

import { CardDetail } from "../BuildDeck/CardDetail";
import { EndModal } from "../Duel/Message/EndModal";
import { useI18N } from "../I18N";
import { Background, DeckZone, Type, useChat } from "../Shared";
import { DuelPanel } from "../Shared/DuelPanel";
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
  const [initialDeck] = useState(() => sideStore.getEditor().initialDeck);
  const { stage } = useSnapshot(sideStore);
  const { errorMsg } = useSnapshot(roomStore);
  const { duelEnd } = useSnapshot(matStore);
  const [deck, setDeck] = useState<IDeck>(() => sideStore.getEditor().draft);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState(0);
  const [feedback, setFeedback] = useState<
    "resetDone" | "sideInvalid" | "sideChanged"
  >();
  const navigate = useNavigate();
  // Same breakpoint that hides the chat column: there chat (system notices
  // included) opens in an overlay panel instead of squeezing the deck grid.
  const compact = useMediaQuery(
    "(max-width: 1024px), (max-height: 600px) and (pointer: coarse), (hover: none) and (pointer: coarse)",
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  const unread = chatOpen ? 0 : chat.dialogs.length - chatSeen;
  useEffect(() => {
    if (!chatOpen) return;
    setChatSeen(chat.dialogs.length);
    const viewport = chat.ref.current?.osInstance()?.elements().viewport;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [chatOpen, chat.dialogs.length]);
  useLayoutEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = sideStore.getEditor().scrollTop;
  }, []);
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
    if (sideStore.stage !== SideStage.SIDE_CHANGING) return;
    setFeedback(undefined);
    const current = sideStore.getEditor().draft;
    const updated = {
      ...current,
      main: [...current.main],
      extra: [...current.extra],
      side: [...current.side],
    };
    if (source !== "search") {
      const removeIndex = updated[source].findIndex((id) => id === card.id);
      if (removeIndex !== -1) {
        updated[source].splice(removeIndex, 1);
      }
    }
    updated[destination].push(card.id);
    // Save synchronously: a close event may follow before React commits.
    sideStore.getEditor().draft = updated;
    setDeck(updated);
  };
  const onReset = () => {
    if (sideStore.stage !== SideStage.SIDE_CHANGING) return;
    const updated = {
      ...initialDeck,
      main: [...initialDeck.main],
      extra: [...initialDeck.extra],
      side: [...initialDeck.side],
    };
    sideStore.getEditor().draft = updated;
    setDeck(updated);
    setFeedback("resetDone");
  };
  const onSummit = () => {
    if (sideStore.stage !== SideStage.SIDE_CHANGING) return;
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
      setFeedback("sideInvalid");
      return;
    }
    sendUpdateDeck(container.conn, deck);
    sideStore.setSideDeck(deck);
    sideStore.stage = SideStage.SIDE_CHANGED;
  };

  useEffect(() => {
    if (stage === SideStage.SIDE_CHANGING) {
      // CHANGE_SIDE is authoritative and reopens editing, including its hint.
      setFeedback(undefined);
    }
    if (stage === SideStage.SIDE_CHANGED) {
      setFeedback("sideChanged");
    }
    if (stage === SideStage.DUEL_START) {
      // 决斗开始，跳转
      navigate("/duel");
    }
  }, [stage]);
  useEffect(() => {
    // A final opponent disconnect may end the match during Side too.
    if (duelEnd) navigate("/match");
  }, [duelEnd, navigate]);
  useEffect(() => {
    if (errorMsg !== undefined && errorMsg !== "") {
      message.error(errorMsg);
      roomStore.errorMsg = undefined;
    }
  }, [errorMsg]);

  return (
    <DndProvider options={HTML5toTouch}>
      <Background />
      <div
        className={styles.container}
        data-testid="side-page"
        data-language={language}
      >
        {!compact && (
          <div className={styles.sider}>
            <Chat controller={chat} />
          </div>
        )}
        <div className={styles.content}>
          <div className={styles["deck-container"]}>
            <div className={styles.title}>
              <h2>{text.sideTitle}</h2>
              <div className={styles.actions}>
                {compact && (
                  <Badge count={unread} size="small" overflowCount={99}>
                    <Button
                      data-testid="side-chat"
                      size="small"
                      icon={<MessageOutlined />}
                      onClick={() => setChatOpen(true)}
                    >
                      {mobileMessages(language).chat}
                    </Button>
                  </Badge>
                )}
                <Button
                  data-testid="side-reset"
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={stage !== SideStage.SIDE_CHANGING}
                  onClick={onReset}
                >
                  {text.reset}
                </Button>
                <Button
                  type="primary"
                  data-testid="side-confirm"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={stage !== SideStage.SIDE_CHANGING}
                  onClick={onSummit}
                >
                  {text.confirm}
                </Button>
              </div>
            </div>
            <div className={styles.help}>
              <div className={styles.counts} data-testid="side-counts">
                <span>
                  {text.mainShort}: {deck.main.length}
                </span>
                <span>
                  {text.extraShort}: {deck.extra.length}
                </span>
                <span>
                  {text.sideShort}: {deck.side.length}
                </span>
              </div>
              <p>{text.sideHelp}</p>
              {feedback && (
                <div
                  className={styles.feedback}
                  data-testid="side-feedback"
                  role={feedback === "sideInvalid" ? "alert" : "status"}
                >
                  {text[feedback]}
                </div>
              )}
            </div>
            <div
              ref={scrollRef}
              data-testid="side-scroll-area"
              className={styles["deck-zone"]}
              onScroll={(event) => {
                if (sideStore.editor)
                  sideStore.editor.scrollTop = event.currentTarget.scrollTop;
              }}
            >
              {(["main", "extra", "side"] as const).map((type) => (
                <DeckZone
                  key={type}
                  compact
                  type={type}
                  cards={[...deck[type]].map((id) => fetchCard(id))}
                  canAdd={canAdd}
                  onChange={onChange}
                  onElementMouseUp={(event) => setSelectedCard(event.card.id)}
                  getMoveLabel={(card, source) =>
                    source === "side"
                      ? isExtraDeckCard(card.data.type ?? 0)
                        ? text.moveToExtra
                        : text.moveToMain
                      : text.moveToSide
                  }
                  getMoveShortLabel={(card, source) =>
                    source === "side"
                      ? isExtraDeckCard(card.data.type ?? 0)
                        ? text.extraShort
                        : text.mainShort
                      : text.sideShort
                  }
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
            </div>
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
      {compact && (
        <DuelPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          title={mobileMessages(language).chat}
          testId="side-chat-panel"
          bodyClassName={styles.chatPanel}
        >
          <Chat controller={chat} />
        </DuelPanel>
      )}
      <EndModal />
      <TpModal />
    </DndProvider>
  );
};
