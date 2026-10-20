import { CompressOutlined, ExpandOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { matStore, roomStore } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { displayPlayerId } from "@/variant/playerIds";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { ActionHistoryContent } from "../Message/ActionHistory";
import { closeCardListModal } from "../Message/CardListModal";
import { closeCardModal } from "../Message/CardModal";
import { ChatBox, showChatBox } from "../PlayMat/ChatBox";
import { LifeBar, spectatorName } from "../PlayMat/LifeBar";
import { duelPhaseLabel, Menu } from "../PlayMat/Menu";
import styles from "./index.module.scss";

/** Keep controls and chat mounted when rotating; only their placement changes. */
export const DuelSidebar = ({ wide }: { wide: boolean }) => {
  const { hidePlayerIds } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  const revision = clientRevisionMessages(language);
  const [expanded, setExpanded] = useState(false);
  const { turnCount, currentPlayer, selfType, observerSwapped, phase } =
    useSnapshot(matStore);
  const room = useSnapshot(roomStore);
  const [active, setActive] = useState<"history" | "chat">("history");
  const content = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const feedbackSlot = useRef<HTMLDivElement>(null);
  const observing =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  const player =
    currentPlayer < 0
      ? "?"
      : observing
      ? spectatorName(
          room.players,
          room.hostInfo?.mode === 2,
          currentPlayer,
          observerSwapped,
        )
      : matStore.isMe(currentPlayer)
      ? room.getMePlayer()?.name ?? "?"
      : room.getOpPlayer()?.name ?? "?";
  const selectTab = (tab: "history" | "chat") => {
    if (wide) {
      closeCardModal();
      closeCardListModal();
    }
    setActive(tab);
    if (wide && window.matchMedia("(max-height: 600px)").matches)
      setExpanded(true);
  };

  useEffect(() => {
    const chat = () => {
      selectTab("chat");
      showChatBox();
    };
    const history = () => selectTab("history");
    window.addEventListener("neos:open-duel-chat", chat);
    window.addEventListener("neos:open-duel-history", history);
    return () => {
      window.removeEventListener("neos:open-duel-chat", chat);
      window.removeEventListener("neos:open-duel-history", history);
    };
  }, [wide]);

  useLayoutEffect(() => {
    if (!wide || !content.current) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--duel-sidebar-content-top",
        `${content.current?.getBoundingClientRect().top ?? 180}px`,
      );
      document.documentElement.style.setProperty(
        "--duel-feedback-top",
        `${feedbackSlot.current?.getBoundingClientRect().top ?? 0}px`,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(content.current);
    if (controls.current) observer.observe(controls.current);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty(
        "--duel-sidebar-content-top",
      );
    };
  }, [wide, expanded]);

  return (
    <aside
      className={wide ? styles.sidebar : styles.shell}
      data-testid={wide ? "duel-sidebar" : undefined}
      data-duel-sidebar={wide ? "true" : undefined}
      data-logs-expanded={expanded}
    >
      <div
        ref={controls}
        className={wide ? styles.controls : styles.shell}
        data-testid={wide ? "duel-sidebar-controls" : undefined}
      >
        <LifeBar docked={wide} />
        {wide && (
          <div
            className={styles.status}
            data-testid="duel-turn-status"
            role="status"
          >
            <div>
              {previewFormat(text.turnStatus, {
                turn: turnCount,
                player: displayPlayerId(player, hidePlayerIds),
                phase: duelPhaseLabel(language, phase.currentPhase),
              })}
            </div>
            {!observing && currentPlayer >= 0 && (
              <strong>
                {matStore.isMe(currentPlayer)
                  ? text.yourAction
                  : text.opponentAction}
              </strong>
            )}
          </div>
        )}
        <Menu docked={wide} />
      </div>
      {wide && (
        <div
          ref={feedbackSlot}
          className={styles.feedbackSlot}
          data-testid="duel-feedback-slot"
        />
      )}
      {wide && (
        <nav className={styles.tabs} aria-label={text.displayMessages}>
          <Button
            data-testid="duel-history-tab"
            type={active === "history" ? "primary" : "text"}
            aria-pressed={active === "history"}
            onClick={() => selectTab("history")}
          >
            {text.history}
          </Button>
          <Button
            data-testid="duel-chat-tab"
            type={active === "chat" ? "primary" : "text"}
            aria-pressed={active === "chat"}
            onClick={() => selectTab("chat")}
          >
            {text.chat}
          </Button>
          <Button
            className={styles.expand}
            data-testid="duel-expand-logs"
            title={expanded ? revision.collapseLogs : revision.expandLogs}
            aria-label={expanded ? revision.collapseLogs : revision.expandLogs}
            aria-expanded={expanded}
            icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={() => {
              closeCardModal();
              closeCardListModal();
              setExpanded((old) => !old);
            }}
          />
        </nav>
      )}
      <div ref={content} className={wide ? styles.content : styles.shell}>
        {wide && active === "history" && <ActionHistoryContent embedded />}
        <ChatBox key="chat" embedded={wide} visible={active === "chat"} />
      </div>
    </aside>
  );
};
