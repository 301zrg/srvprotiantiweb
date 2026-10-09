import {
  CheckCircleFilled,
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  LogoutOutlined,
  MessageOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";

import {
  sendHandResult,
  sendHsNotReady,
  sendHsReady,
  sendHsStart,
  sendHsToDuelList,
  sendHsToObserver,
  sendTpResult,
  sendUpdateDeck,
  ygopro,
} from "@/api";
import PlayerState = ygopro.StocHsPlayerChange.State;
import SelfType = ygopro.StocTypeChange.SelfType;
import { App, Avatar, Button, Select } from "antd";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { useConfig } from "@/config";
import { getUIContainer } from "@/container/compat";
import { useMobileInterface } from "@/hook";
import { AudioActionType, changeScene } from "@/infra/audio";
import { closeSocket } from "@/middleware/socket";
import {
  accountStore,
  deckStore,
  IDeck,
  Player,
  resetUniverse,
  RoomStage,
  roomStore,
  sideStore,
} from "@/stores";
import { activeDeck, selectActiveDeck } from "@/stores/deckSelection";
import { I18NSelector, useI18N } from "@/ui/I18N";
import { requireSession } from "@/ui/requireSession";
import { Background, IconFont, useChat } from "@/ui/Shared";
import { DuelPanel } from "@/ui/Shared/DuelPanel";
import { roomMessages } from "@/variant/roomMessages";

import { Chat } from "./Chat";
import styles from "./index.module.scss";
import { Mora, MoraPopover, Tp, TpPopover } from "./Popover";

const NeosConfig = useConfig();

export const loader: LoaderFunction = async () => {
  const redirected = requireSession();
  if (redirected) return redirected;
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component: React.FC = () => {
  const container = getUIContainer();
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = roomMessages(language);
  const mobile = useMobileInterface();
  const chat = useChat();
  const { user } = useSnapshot(accountStore);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [deck, setDeck] = useState<IDeck | undefined>(() => {
    const selected = activeDeck();
    return selected ? JSON.parse(JSON.stringify(selected)) : undefined;
  });
  const [pendingState, setPendingState] = useState<PlayerState>();
  const room = useSnapshot(roomStore);
  const me = room.getMePlayer();
  const ready = me?.state === PlayerState.READY;
  const observer = room.selfType === SelfType.OBSERVER;
  const seatCount = room.hostInfo?.mode === 2 ? 4 : 2;
  const mySeat = room.players.findIndex((player) => player?.isMe);
  const navigate = useNavigate();

  const onDeckSelected = (deckName: string) => {
    const selected = deckStore.get(deckName);
    if (!selected) return;
    if (ready) sendHsNotReady(container.conn);
    // YGOPRO_SERVER_MODE automatically readies a player on UPDATE_DECK.
    // Selecting locally must not upload or implicitly confirm a deck.
    setDeck(JSON.parse(JSON.stringify(selected)));
    selectActiveDeck(deckName);
  };

  const onReady = () => {
    if (!me || observer || roomStore.stage !== RoomStage.WAITING) return;
    if (ready) {
      setPendingState(PlayerState.NO_READY);
      sendHsNotReady(container.conn);
    } else if (deck) {
      setPendingState(PlayerState.READY);
      sideStore.setSideDeck(deck);
      sendUpdateDeck(container.conn, deck);
      sendHsReady(container.conn);
    } else {
      message.error(text.noDeck);
    }
  };

  useEffect(() => {
    if (pendingState === undefined) return;
    if (me?.state === pendingState || room.errorMsg) {
      setPendingState(undefined);
      return;
    }
    const timeout = window.setTimeout(() => setPendingState(undefined), 8000);
    return () => window.clearTimeout(timeout);
  }, [pendingState, me?.state, room.errorMsg]);
  useEffect(() => {
    if (room.stage === RoomStage.DUEL_START) navigate("/duel");
  }, [room.stage, navigate]);
  useEffect(() => {
    if (room.errorMsg) {
      message.error(room.errorMsg);
      roomStore.errorMsg = undefined;
    }
  }, [room.errorMsg, message]);

  return (
    <div
      data-testid="waitroom"
      className={classNames(styles.container, {
        [styles.collapsed]: collapsed,
      })}
    >
      <Background />
      {!mobile && (
        <aside className={styles.sider} data-testid="waitroom-sidebar">
          <h2>{text.chat}</h2>
          <Chat controller={chat} />
        </aside>
      )}
      {mobile && (
        <DuelPanel
          open={mobileChatOpen}
          onClose={() => setMobileChatOpen(false)}
          title={text.chat}
          testId="waitroom-chat-panel"
          bodyClassName={styles.chatPanelBody}
        >
          <Chat controller={chat} />
        </DuelPanel>
      )}
      <div className={styles.content}>
        <header className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <h1>{text.title}</h1>
            <I18NSelector />
          </div>
          <SideButtons
            collapsed={collapsed}
            mobile={mobile}
            chatOpen={mobileChatOpen}
            switchCollapse={() =>
              mobile
                ? setMobileChatOpen(!mobileChatOpen)
                : setCollapsed(!collapsed)
            }
          />
        </header>
        <div className={styles.scrollViewport} data-testid="waitroom-scroll">
          <div className={styles.wrap}>
            {room.hostInfo && (
              <div data-testid="room-host-info" className={styles.hostInfo}>
                <div className={styles.ruleValues}>
                  <span>{`Mode: ${
                    ["Single", "Match", "Tag"][room.hostInfo.mode] ??
                    room.hostInfo.mode
                  }`}</span>
                  <span>{`MR: ${room.hostInfo.duelRule}`}</span>
                  <span>{`LP: ${room.hostInfo.startLp}`}</span>
                </div>
                <details>
                  <summary>{`LF: 0x${room.hostInfo.lflist
                    .toString(16)
                    .padStart(8, "0")}`}</summary>
                  {`${room.hostInfo.timeLimit}s · Hand: ${room.hostInfo.startHand}`}
                </details>
                {(room.hostInfo.lflist !== 0x73ec4051 ||
                  room.hostInfo.duelRule !== 2) && (
                  <p role="status" className={styles.warning}>
                    {text.rulesWarning}
                  </p>
                )}
              </div>
            )}
            {seatCount === 4 && (
              <p className={styles.warning} data-testid="waitroom-tag-warning">
                {text.tagWarning}
              </p>
            )}
            <Controller
              selectedDeck={deck}
              disabled={
                room.stage !== RoomStage.WAITING ||
                observer ||
                pendingState !== undefined
              }
              onDeckChange={onDeckSelected}
            />
            <div className={styles.players} data-testid="waitroom-players">
              {Array.from({ length: seatCount }, (_, seat) => {
                const player = room.players[seat];
                const own = !!player?.isMe;
                const teammate =
                  seatCount === 4 &&
                  mySeat >= 0 &&
                  Math.floor(seat / 2) === Math.floor(mySeat / 2);
                return (
                  <PlayerZone
                    key={seat}
                    seat={seat}
                    player={player}
                    avatar={own ? user?.avatar_url : undefined}
                    label={`${
                      seatCount === 4
                        ? `${seat < 2 ? text.teamA : text.teamB} · `
                        : ""
                    }${
                      own ? text.me : teammate ? text.teammate : text.opponent
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <footer className={styles.actionBar}>
          {room.stage === RoomStage.WAITING && (
            <p
              className={styles.hint}
              data-testid="waitroom-ready-hint"
              aria-live="polite"
            >
              {observer
                ? text.observerHint
                : ready
                ? text.readyHint
                : text.confirmHint}
            </p>
          )}
          <div className={styles.actionButtons}>
            {room.stage === RoomStage.WAITING && !observer && (
              <Button
                data-testid="waitroom-ready-toggle"
                data-player-ready={ready}
                aria-pressed={ready}
                type={ready ? "default" : "primary"}
                size="large"
                icon={ready ? <CloseOutlined /> : <CheckOutlined />}
                className={styles.readyButton}
                disabled={!me || !deck}
                loading={pendingState !== undefined}
                onClick={onReady}
              >
                {ready ? text.cancel : text.prepare}
              </Button>
            )}
            <ActionButton
              onMoraSelect={(mora) => {
                sendHandResult(container.conn, mora);
                roomStore.stage = RoomStage.HAND_SELECTED;
              }}
              onTpSelect={(tp) => {
                sendTpResult(container.conn, tp === Tp.First);
                roomStore.stage = RoomStage.TP_SELECTED;
              }}
            />
          </div>
        </footer>
      </div>
    </div>
  );
};

const PlayerZone: React.FC<{
  seat: number;
  player?: Player;
  avatar?: string;
  label: string;
}> = ({ seat, player, avatar, label }) => {
  const { language } = useI18N();
  const text = roomMessages(language);
  const occupied = !!player && player.state !== PlayerState.LEAVE;
  const ready = occupied && player.state === PlayerState.READY;
  return (
    <div
      data-testid={`waitroom-player-${player?.isMe ? "me" : "op"}`}
      data-player-seat={seat}
      data-player-name={occupied ? player.name : ""}
      data-player-ready={ready}
      className={classNames(styles.player, {
        [styles.ready]: ready,
        [styles.empty]: !occupied,
        [styles.me]: player?.isMe,
      })}
    >
      <Avatar
        size={44}
        src={
          occupied
            ? avatar || `${NeosConfig.assetsPath}/default-avatar.png`
            : undefined
        }
      />
      <div className={styles.identity}>
        <div className={styles.playerLabel}>{label}</div>
        <div className={styles.name} title={occupied ? player.name : undefined}>
          {occupied ? player.name : text.emptySeat}
        </div>
      </div>
      <span
        className={classNames(styles.status, { [styles.readyStatus]: ready })}
      >
        {ready && <CheckCircleFilled />}
        {occupied ? (ready ? text.ready : text.notReady) : "—"}
      </span>
    </div>
  );
};

const Controller: React.FC<{
  selectedDeck?: IDeck;
  disabled: boolean;
  onDeckChange: (deckName: string) => void;
}> = ({ selectedDeck, disabled, onDeckChange }) => {
  const container = getUIContainer();
  const { language } = useI18N();
  const text = roomMessages(language);
  const decks = useSnapshot(deckStore).decks;
  const room = useSnapshot(roomStore);
  return (
    <div className={styles.controller}>
      <div className={styles.deckSelection}>
        <label htmlFor="waitroom-deck">{text.selectDeck}</label>
        <Select
          id="waitroom-deck"
          aria-label={text.selectDeck}
          data-testid="waitroom-deck-select"
          showSearch
          size="large"
          value={selectedDeck?.deckName}
          placeholder={text.noDeck}
          disabled={disabled}
          options={decks.map((deck) => ({
            value: deck.deckName,
            label: deck.deckName,
          }))}
          onChange={onDeckChange}
        />
        {selectedDeck && (
          <small data-testid="waitroom-deck-counts">{`Main ${selectedDeck.main.length} · Extra ${selectedDeck.extra.length} · Side ${selectedDeck.side.length}`}</small>
        )}
      </div>
      <Button
        data-testid="waitroom-role-toggle"
        size="large"
        disabled={room.stage !== RoomStage.WAITING}
        icon={<IconFont type="icon-record" size={18} />}
        onClick={() => {
          if (room.selfType !== SelfType.OBSERVER)
            sendHsToObserver(container.conn);
          else sendHsToDuelList(container.conn);
        }}
      >
        {room.selfType === SelfType.OBSERVER
          ? text.joinDuelist
          : text.joinSpectator}
        {!!room.observerCount && ` (${room.observerCount})`}
      </Button>
    </div>
  );
};

const SideButtons: React.FC<{
  switchCollapse: () => void;
  collapsed: boolean;
  mobile: boolean;
  chatOpen: boolean;
}> = ({ switchCollapse, collapsed, mobile, chatOpen }) => {
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = roomMessages(language);
  const expanded = mobile ? chatOpen : !collapsed;
  return (
    <div className={styles.sideButtons}>
      <Button
        data-testid="waitroom-chat-toggle"
        aria-expanded={expanded}
        icon={<MessageOutlined />}
        onClick={switchCollapse}
      >
        {mobile ? text.chat : expanded ? text.hideChat : text.showChat}
      </Button>
      <Button
        data-testid="waitroom-leave"
        danger
        icon={<LogoutOutlined />}
        onClick={() => {
          closeSocket(getUIContainer().conn);
          resetUniverse();
          navigate("/match");
        }}
      >
        {text.leave}
      </Button>
    </div>
  );
};

const ActionButton: React.FC<{
  onMoraSelect: (mora: Mora) => void;
  onTpSelect: (tp: Tp) => void;
}> = ({ onMoraSelect, onTpSelect }) => {
  const container = getUIContainer();
  const room = useSnapshot(roomStore);
  const { t: i18n } = useTranslation("WaitRoom");
  const { language } = useI18N();
  const text = roomMessages(language);
  const { stage, isHost, players } = room;
  const seatCount = room.hostInfo?.mode === 2 ? 4 : 2;
  const requiredPlayers =
    seatCount === 4
      ? [players[0], players[1], players[2], players[3]]
      : [players[0], players[1]];
  const allReady = requiredPlayers.every(
    (player) => player?.state === PlayerState.READY,
  );
  const waiting = stage === RoomStage.WAITING;
  const disabled =
    waiting && (!isHost || !allReady || room.selfType === SelfType.OBSERVER);
  const actionDisabled = waiting
    ? disabled
    : stage !== RoomStage.HAND_SELECTING && stage !== RoomStage.TP_SELECTING;
  return (
    <MoraPopover onSelect={onMoraSelect}>
      <TpPopover onSelect={onTpSelect}>
        <Button
          data-testid="waitroom-start"
          data-room-stage={stage}
          data-room-is-host={isHost}
          aria-disabled={actionDisabled}
          className={styles.startButton}
          size="large"
          disabled={actionDisabled}
          icon={
            waiting ? (
              <PlayCircleOutlined />
            ) : stage === RoomStage.HAND_SELECTING ? (
              <IconFont type="icon-mora" size={20} />
            ) : (
              <LoadingOutlined />
            )
          }
          onClick={() => {
            if (waiting && !disabled) sendHsStart(container.conn);
          }}
        >
          {waiting
            ? isHost
              ? allReady
                ? text.start
                : text.waitReady
              : text.waitHost
            : stage === RoomStage.HAND_SELECTING
            ? i18n("PlsRockPaperScissors")
            : stage === RoomStage.HAND_SELECTED
            ? i18n("WaitOpponentPlayRockPaperScissors")
            : stage === RoomStage.TP_SELECTING
            ? i18n("PlsChooseWhoGoesFirst")
            : i18n("WaitingForGameToStart")}
        </Button>
      </TpPopover>
    </MoraPopover>
  );
};
