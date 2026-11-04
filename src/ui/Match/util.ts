import { subscribe } from "valtio";

import { sendChat, ygopro } from "@/api";
import { getUIContainer, initUIContainer } from "@/container/compat";
import { WebSocketStream } from "@/infra";
import { initSocket } from "@/middleware/socket";
import { pollSocketLooper } from "@/service/executor";
import {
  type HistorySnapshot,
  historyStore,
  initStore,
  matStore,
  resetUniverse,
  RoomStage,
  roomStore,
  SideStage,
  sideStore,
} from "@/stores";
import { getLanguage, serverLanguageCommand } from "@/variant";
import { connectionStore } from "@/variant/connection";
import {
  finishConnectionResume,
  onReconnectOffer,
  prepareConnectionResume,
  type ResumeKind,
} from "@/variant/connectionResume";
import {
  clearSavedHistory,
  restoreSavedHistory,
  saveHistory,
  setHistoryOwner,
} from "@/variant/historyResume";
import { siteMessages } from "@/variant/messages";
import { isRoomCommand } from "@/variant/roomLink";
import { requestSpectatorSeat } from "@/variant/spectatorSession";

let activeConnection: WebSocketStream | undefined;
interface Join {
  ip: string;
  player: string;
  passWd: string;
  spectate?: boolean;
  customOnConnected?: (conn: WebSocketStream) => void;
}
let session:
  | {
      join: Join;
      resume?: {
        kind: ResumeKind;
        deck?: Uint8Array;
        side: ReturnType<typeof sideStore.getSideDeck>;
        editor: typeof sideStore.editor;
        sideStage: SideStage;
        fieldExpected: boolean;
        deadline: number;
        /** Spectators get the whole match from the host instead. */
        history?: HistorySnapshot;
      };
    }
  | undefined;
let recovery: Promise<void> | undefined;
let checking: WebSocketStream | undefined;
let wasHidden = false;
let installed = false;
const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const disconnectSrvpro = () => {
  session = undefined;
  // Leaving on purpose. A reloaded page has no connection yet and keeps its
  // saved log until the host says whether this game can be rejoined.
  if (activeConnection) clearSavedHistory();
  setHistoryOwner(undefined);
  if (activeConnection) finishConnectionResume(activeConnection, false);
  activeConnection?.close();
  activeConnection = undefined;
  connectionStore.resumeRoute = undefined;
};

function wire(join: Join) {
  const conn = initSocket(join);
  if (join.spectate) requestSpectatorSeat(conn);
  activeConnection = conn;
  conn.onUnexpectedClose = () => {
    if (activeConnection !== conn) return;
    if (conn.resuming) finishConnectionResume(conn, false);
    else if (
      conn.joinedRoom &&
      !conn.endedRoom &&
      !conn.protocolFailed &&
      !matStore.duelEnd &&
      !document.hidden
    )
      void reconnectSrvpro();
  };
  return conn;
}

/** Restore the frozen session, never the form's later edits or a changed Side deck. */
export function reconnectSrvpro() {
  if (recovery) return recovery;
  const original = session,
    old = activeConnection;
  if (!original || !old || document.hidden || navigator.onLine === false)
    return Promise.resolve();
  if (!original.resume) {
    if (
      !old.joinedRoom ||
      old.endedRoom ||
      old.protocolFailed ||
      matStore.duelEnd
    )
      return Promise.resolve();
    const observer =
      roomStore.selfType === ygopro.StocTypeChange.SelfType.OBSERVER;
    if (!observer && !old.duelStarted && isRoomCommand(original.join.passWd))
      return Promise.resolve();
    if (!observer && old.duelStarted && !old.initialDeckPayload)
      return Promise.resolve();
    original.resume = {
      kind: observer ? "observer" : old.duelStarted ? "player" : "waiting",
      deck: old.initialDeckPayload?.slice(),
      side: JSON.parse(JSON.stringify(sideStore.getSideDeck())),
      editor: sideStore.editor
        ? JSON.parse(JSON.stringify(sideStore.editor))
        : undefined,
      sideStage: sideStore.stage,
      history:
        !observer && old.duelStarted ? historyStore.snapshotMatch() : undefined,
      fieldExpected:
        roomStore.stage === RoomStage.DUEL_START &&
        ![
          SideStage.SIDE_CHANGING,
          SideStage.SIDE_CHANGED,
          SideStage.TP_SELECTING,
          SideStage.TP_SELECTED,
        ].includes(sideStore.stage),
      // Stay within the host's default 90s window; deployment may be shorter.
      deadline: (old.disconnectedAt ?? Date.now()) + 60000,
    };
  }
  const saved = original.resume;
  const task = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (
        session !== original ||
        document.hidden ||
        Date.now() >= saved.deadline
      )
        break;
      if (attempt) await delay(attempt * 1000);
      if (session !== original || document.hidden) break;
      activeConnection?.close();
      resetUniverse();
      if (saved.history) historyStore.restoreMatch(saved.history);
      sideStore.setSideDeck(saved.side);
      sideStore.editor = saved.editor
        ? JSON.parse(JSON.stringify(saved.editor))
        : undefined;
      sideStore.stage = saved.sideStage;
      const conn = wire({
        ...original.join,
        spectate: saved.kind === "observer",
      });
      conn.initialDeckPayload = saved.deck?.slice();
      conn.duelStarted = saved.kind === "player";
      connectionStore.epoch++;
      connectionStore.state = "recovering";
      connectionStore.detail = siteMessages(getLanguage()).connectionRecovering;
      initUIContainer(conn);
      const restored = new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(
          () => finishConnectionResume(conn, false),
          Math.min(12000, saved.deadline - Date.now()),
        );
        prepareConnectionResume(
          conn,
          saved.kind,
          (ok) => {
            window.clearTimeout(timer);
            resolve(ok);
          },
          saved.fieldExpected,
        );
      });
      void pollSocketLooper(getUIContainer(), () => activeConnection === conn);
      if (await restored) {
        if (session !== original || activeConnection !== conn) return;
        original.resume = undefined;
        connectionStore.state = "connected";
        connectionStore.detail = "";
        // A spectator is restored on TYPE_CHANGE, before the host replays the
        // match history; it never edits a Side deck, so keep it on the duel
        // instead of flashing the Side (or room) page until MSG_START arrives.
        connectionStore.resumeRoute =
          saved.kind === "observer"
            ? saved.fieldExpected
              ? "/duel"
              : "/waitroom"
            : sideStore.stage !== SideStage.NONE &&
              sideStore.stage !== SideStage.DUEL_START
            ? "/side"
            : roomStore.stage === RoomStage.DUEL_START
            ? "/duel"
            : "/waitroom";
        return;
      }
      if (session !== original) return;
      // A normal join/denied recovery is not a transport retry. Do not upload,
      // ready, create another match, or replay an earlier duel response.
      const joined = conn.joinedRoom;
      conn.close();
      if (joined || roomStore.errorMsg) break;
    }
    if (session === original) {
      connectionStore.state = "disconnected";
      connectionStore.detail = siteMessages(
        getLanguage(),
      ).connectionResumeFailed;
    }
  };
  recovery = task().finally(() => {
    recovery = undefined;
  });
  return recovery;
}

let saveTimer = 0;
const persistHistory = () => {
  window.clearTimeout(saveTimer);
  saveHistory(
    sideStore.stage === SideStage.NONE ||
      sideStore.stage === SideStage.DUEL_START,
  );
};

function installForegroundRecovery() {
  if (installed) return;
  installed = true;
  // Batched: a burst of rows is written once, and the last ones on leaving.
  subscribe(historyStore, () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistHistory, 1000);
  });
  window.addEventListener("pagehide", persistHistory);
  // This tab's saved log belongs to the game the host now offers to rejoin.
  onReconnectOffer(restoreSavedHistory);
  const check = async () => {
    if (document.hidden || recovery || !session || navigator.onLine === false)
      return;
    const conn = activeConnection;
    if (
      !conn ||
      checking === conn ||
      (!session.resume && (conn.cancelled || !conn.joinedRoom))
    )
      return;
    checking = conn;
    try {
      if (conn.ws.readyState === WebSocket.OPEN) {
        // Safari can leave a dead socket reporting OPEN. A language command is
        // harmless and has a server acknowledgement, unlike replaying a move.
        const received = conn.receivedMessages;
        const probe = () => {
          try {
            sendChat(conn, serverLanguageCommand(getLanguage()));
          } catch {}
        };
        probe();
        // A five-second delayed reply is not proof of a dead cross-border
        // connection. Probe once more before replacing the frozen session.
        const retryAt = Date.now() + 5000;
        const until = retryAt + 7000;
        let retried = false;
        while (
          activeConnection === conn &&
          !document.hidden &&
          conn.ws.readyState === WebSocket.OPEN &&
          conn.receivedMessages === received &&
          Date.now() < until
        ) {
          if (!retried && Date.now() >= retryAt) {
            retried = true;
            probe();
          }
          await delay(100);
        }
        if (
          activeConnection !== conn ||
          document.hidden ||
          conn.receivedMessages !== received
        )
          return;
      }
      if (conn.ws.readyState !== WebSocket.CONNECTING) await reconnectSrvpro();
    } finally {
      if (checking === conn) checking = undefined;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) wasHidden = true;
    else if (wasHidden) {
      wasHidden = false;
      void check();
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void check();
  });
  window.addEventListener("online", () => void check());
}

export const finishSrvproReplays = async () => {
  const conn = activeConnection;
  await conn?.replayCapture.finish();
  if (activeConnection === conn) disconnectSrvpro();
};

// 连接SRVPRO服务
export const connectSrvpro = async (params: Join) => {
  // 初始化sqlite
  if (
    initStore.sqlite.progress !== 1 ||
    !initStore.i18n ||
    !initStore.forbidden
  ) {
    throw new Error("Game resources have not finished loading");
  }

  disconnectSrvpro();
  session = { join: { ...params } };
  setHistoryOwner(params);
  installForegroundRecovery();
  const conn = wire(params);
  initUIContainer(conn);
  void pollSocketLooper(getUIContainer(), () => activeConnection === conn);
};
