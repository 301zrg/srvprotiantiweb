import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { matStore, roomStore } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import {
  SidebarFrame,
  sidebarStatusClass,
} from "@/ui/Shared/DuelShell/SidebarFrame";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { displayPlayerId } from "@/variant/playerIds";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { ActionHistoryContent } from "../Message/ActionHistory";
import { closeCardListModal } from "../Message/CardListModal";
import { closeCardModal } from "../Message/CardModal";
import { ChatBox, showChatBox } from "../PlayMat/ChatBox";
import { LifeBar, spectatorName } from "../PlayMat/LifeBar";
import { duelPhaseLabel, Menu } from "../PlayMat/Menu";

/** Online duel controls on the shared sidebar frame. */
export const DuelSidebar = ({ wide }: { wide: boolean }) => {
  const { hidePlayerIds } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  const revision = clientRevisionMessages(language);
  const { turnCount, currentPlayer, selfType, observerSwapped, phase } =
    useSnapshot(matStore);
  const room = useSnapshot(roomStore);
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

  return (
    <SidebarFrame
      wide={wide}
      top={[
        <LifeBar key="life" docked={wide} />,
        <Menu key="menu" docked={wide} />,
      ]}
      status={
        <div
          className={sidebarStatusClass}
          data-testid="duel-turn-status"
          role="status"
        >
          <div>
            {previewFormat(text.turnStatus, {
              turn: turnCount,
              player: displayPlayerId(player, hidePlayerIds),
              phase: duelPhaseLabel(
                language,
                phase.currentPhase,
                phase.battleTiming,
              ),
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
      }
      tabsLabel={text.displayMessages}
      expandLabels={{
        expand: revision.expandLogs,
        collapse: revision.collapseLogs,
      }}
      closePanels={() => {
        closeCardModal();
        closeCardListModal();
      }}
      openEvents={{
        "neos:open-duel-chat": "chat",
        "neos:open-duel-history": "history",
      }}
      onOpenTab={(tab) => {
        if (tab === "chat") showChatBox();
      }}
      tabs={[
        {
          key: "history",
          label: text.history,
          testId: "duel-history-tab",
          render: ({ active, wide }) =>
            wide && active && <ActionHistoryContent embedded />,
        },
        {
          key: "chat",
          label: text.chat,
          testId: "duel-chat-tab",
          render: ({ active, wide, collapse }) => (
            <ChatBox
              key="chat"
              embedded={wide}
              visible={active}
              onCloseEmbedded={collapse}
            />
          ),
        },
      ]}
    />
  );
};
