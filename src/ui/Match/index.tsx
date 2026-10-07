import { App, Button, Input } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { AudioActionType, changeScene } from "@/infra/audio";
import { resetUniverse, RoomStage, roomStore } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { Background } from "@/ui/Shared";
import { duelWebSocketUrl, validateDuelWebSocketUrl } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { siteStorage } from "@/variant/deployment";
import { siteMessages } from "@/variant/messages";
import {
  isRoomCommand,
  readRoomLink,
  type RoomLink,
  websiteObserverNickname,
} from "@/variant/roomLink";

import styles from "./index.module.scss";
import { connectSrvpro, disconnectSrvpro } from "./util";

const joinFormDraft: { nickname?: string; roomName?: string } = {};

export const loader = () => {
  disconnectSrvpro();
  resetUniverse();
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component = () => {
  const { search } = useLocation();
  return (
    <JoinRoomForm
      key={search}
      link={readRoomLink(new URLSearchParams(search))}
    />
  );
};

const JoinRoomForm = ({ link }: { link?: RoomLink }) => {
  const spectate = !!link?.spectate;
  const autoStarted = useRef(false);
  const [invalidLink, setInvalidLink] = useState(!!link?.invalid);
  const [nickname, setNickname] = useState(
    () =>
      link?.nickname ??
      (spectate
        ? websiteObserverNickname
        : joinFormDraft.nickname ??
          siteStorage.getItem("playerNickname") ??
          ""),
  );
  const [roomName, setRoomName] = useState(
    () => link?.room ?? joinFormDraft.roomName ?? "",
  );
  const [connecting, setConnecting] = useState(false);
  const { joined, errorMsg, selfType, stage } = useSnapshot(roomStore);
  const connection = useSnapshot(connectionStore);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = siteMessages(language);
  const endpointError = validateDuelWebSocketUrl(language);

  useEffect(() => {
    if (
      joined &&
      (!spectate || selfType === ygopro.StocTypeChange.SelfType.OBSERVER)
    )
      navigate(stage === RoomStage.DUEL_START ? "/duel" : "/waitroom", {
        replace: !!link,
      });
  }, [joined, selfType, stage, spectate, link, navigate]);

  useEffect(() => {
    if (
      !spectate ||
      !connecting ||
      !joined ||
      selfType === ygopro.StocTypeChange.SelfType.OBSERVER
    )
      return;
    const timer = window.setTimeout(() => {
      disconnectSrvpro();
      resetUniverse();
      setConnecting(false);
      message.error(text.spectatorNotAccepted);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [
    spectate,
    connecting,
    joined,
    selfType,
    message,
    text.spectatorNotAccepted,
  ]);

  useEffect(() => {
    if (errorMsg) {
      message.error(errorMsg);
      setConnecting(false);
      roomStore.errorMsg = undefined;
    }
  }, [errorMsg, message]);

  useEffect(() => {
    if (connection.state === "disconnected") setConnecting(false);
  }, [connection.state]);

  const connect = useCallback(async () => {
    if (invalidLink) return message.error(text.invalidRoomLink);
    if (endpointError) return message.error(endpointError);
    const nicknameParts = nickname.split("$");
    if (
      !nickname.trim() ||
      nickname.length > 19 ||
      /[\0\r\n\\]/.test(nickname) ||
      nicknameParts.length > 2 ||
      nicknameParts.some((part) => !part)
    ) {
      return message.error(text.invalidNick);
    }
    if (!roomName.trim() || roomName.length > 19 || /[\0\r\n]/.test(roomName)) {
      return message.error(text.invalidRoom);
    }
    if (spectate && isRoomCommand(roomName))
      return message.error(text.spectatorRoomCommand);
    if (!spectate) {
      if (nickname.includes("$")) siteStorage.removeItem("playerNickname");
      else siteStorage.setItem("playerNickname", nickname);
    }
    setConnecting(true);
    try {
      await connectSrvpro({
        ip: duelWebSocketUrl,
        player: nickname,
        passWd: roomName,
        spectate,
      });
    } catch (error) {
      setConnecting(false);
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [invalidLink, endpointError, nickname, roomName, spectate, message, text]);

  useEffect(() => {
    if (!spectate || !link?.autojoin || autoStarted.current) return;
    autoStarted.current = true;
    void connect();
  }, [spectate, link?.autojoin, connect]);

  return (
    <>
      <Background />
      <div
        className={styles.container}
        style={{
          maxWidth: 480,
          width: "calc(100% - 32px)",
          height: "auto",
          padding: 24,
          display: "grid",
          gap: 18,
          background: "#1b2130e8",
          borderRadius: 12,
        }}
      >
        <h1>{spectate ? text.spectate : text.connect}</h1>
        {spectate && connecting && (
          <p role="status">{text.spectatorLinkHint}</p>
        )}
        {spectate && !link?.autojoin && <p>{text.spectatorManualHint}</p>}
        <label htmlFor="player-nickname">{text.nickname}</label>
        <Input
          id="player-nickname"
          value={nickname}
          maxLength={19}
          onChange={(event) => {
            setNickname(event.target.value);
            setInvalidLink(false);
            if (!spectate) joinFormDraft.nickname = event.target.value;
          }}
          autoComplete="off"
        />
        <small>
          {spectate ? text.spectatorNicknameHint : text.nicknameHint}
        </small>
        <label htmlFor="room-name">{text.room}</label>
        <Input
          id="room-name"
          value={roomName}
          maxLength={19}
          onChange={(event) => {
            setRoomName(event.target.value);
            setInvalidLink(false);
            if (!spectate) joinFormDraft.roomName = event.target.value;
          }}
          onPressEnter={connect}
        />
        <p>{spectate ? text.spectatorRoomCommand : text.roomHint}</p>
        {invalidLink && <p role="alert">{text.invalidRoomLink}</p>}
        {endpointError && <p role="alert">{endpointError}</p>}
        {connection.state === "disconnected" && (
          <p role="alert">{connection.detail}</p>
        )}
        <Button
          data-testid="connect-submit"
          type="primary"
          size="large"
          loading={connecting}
          disabled={!!endpointError}
          onClick={connect}
        >
          {spectate ? text.spectate : text.join}
        </Button>
        {link && (
          <Button onClick={() => navigate("/match")}>{text.back}</Button>
        )}
        <Button onClick={() => navigate("/build")}>{text.edit}</Button>
      </div>
    </>
  );
};
