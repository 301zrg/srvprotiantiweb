import { App, Button, Input } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { AudioActionType, changeScene } from "@/infra/audio";
import { resetUniverse, roomStore } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { Background } from "@/ui/Shared";
import { duelWebSocketUrl, validateDuelWebSocketUrl } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { siteMessages } from "@/variant/messages";

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
  const [nickname, setNickname] = useState(
    () =>
      joinFormDraft.nickname ?? localStorage.getItem("playerNickname") ?? "",
  );
  const [roomName, setRoomName] = useState(() => joinFormDraft.roomName ?? "");
  const [connecting, setConnecting] = useState(false);
  const { joined, errorMsg } = useSnapshot(roomStore);
  const connection = useSnapshot(connectionStore);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = siteMessages(language);
  const endpointError = validateDuelWebSocketUrl(language);

  useEffect(() => {
    if (joined) navigate("/waitroom");
  }, [joined, navigate]);

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

  const connect = async () => {
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
    if (nickname.includes("$")) localStorage.removeItem("playerNickname");
    else localStorage.setItem("playerNickname", nickname);
    setConnecting(true);
    try {
      await connectSrvpro({
        ip: duelWebSocketUrl,
        player: nickname,
        passWd: roomName,
      });
    } catch (error) {
      setConnecting(false);
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

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
        <h1>{text.connect}</h1>
        <label htmlFor="player-nickname">{text.nickname}</label>
        <Input
          id="player-nickname"
          value={nickname}
          maxLength={19}
          onChange={(event) => {
            setNickname(event.target.value);
            joinFormDraft.nickname = event.target.value;
          }}
          autoComplete="off"
        />
        <small>{text.nicknameHint}</small>
        <label htmlFor="room-name">{text.room}</label>
        <Input
          id="room-name"
          value={roomName}
          maxLength={19}
          onChange={(event) => {
            setRoomName(event.target.value);
            joinFormDraft.roomName = event.target.value;
          }}
          onPressEnter={connect}
        />
        <p>{text.roomHint}</p>
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
          {text.join}
        </Button>
        <Button onClick={() => navigate("/build")}>{text.edit}</Button>
      </div>
    </>
  );
};
