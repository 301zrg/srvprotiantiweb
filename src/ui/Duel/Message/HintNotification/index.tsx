import { MessageOutlined } from "@ant-design/icons";
import { message, notification } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { fetchStrings, Region } from "@/api";
import { useConfig } from "@/config";
import { useMediaQuery } from "@/hook";
import { HandResult, matStore } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { useChat } from "@/ui/Shared";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import styles from "./index.module.scss";
import { chatPresentation } from "./presentation";

const NeosConfig = useConfig();
const serverChatKey = "server-chat";

let globalMsgApi: ReturnType<typeof message.useMessage>[0] | undefined;
export const HintNotification = () => {
  const { t } = useTranslation("ClientUI");
  const { t: handText } = useTranslation("WaitRoom");
  const { serverMessageMode } = useSnapshot(settingStore);
  const portrait = useMediaQuery("(orientation: portrait)");
  const { language } = useI18N();
  const text = previewMessages(language);
  const matSnap = useSnapshot(matStore);
  const hintState = matSnap.hint;
  const toss = matSnap.tossResult;
  const handResults = matSnap.handResults;
  const error = matSnap.error;

  const { dialogs } = useChat(true);
  const seenDialogs = useRef(0);
  const chatVisible = useRef(false);
  const [summary, setSummary] = useState<{ name: string; content: string }>();
  const [unread, setUnread] = useState(0);
  const [msgApi, msgContextHolder] = message.useMessage({
    maxCount: NeosConfig.ui.hint.maxCount,
  });
  const [notiApi, notiContextHolder] = notification.useNotification({
    maxCount: NeosConfig.ui.hint.maxCount,
  });

  globalMsgApi = msgApi;
  useEffect(() => {
    if (hintState && hintState.msg) {
      msgApi.info(`${hintState.msg}`);
    }
  }, [hintState.msg]);

  useEffect(() => {
    if (toss) {
      msgApi.info(`${toss}`);
    }
  }, [toss]);

  useEffect(() => {
    const meHand = handResults.me;
    const opHand = handResults.op;
    if (meHand !== HandResult.UNKNOWN && opHand !== HandResult.UNKNOWN) {
      msgApi.info(
        t("HandResults", {
          me: handText(getHandResultKey(meHand)),
          op: handText(getHandResultKey(opHand)),
        }),
      );
    }
  }, [handResults]);

  useEffect(() => {
    if (error !== "") {
      msgApi.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (dialogs.length <= seenDialogs.current) return;
    seenDialogs.current = dialogs.length;
    const latest = dialogs.at(-1);
    if (!latest) return;
    const presentation = chatPresentation(
      serverMessageMode,
      portrait,
      latest.isServer,
    );
    if (presentation === "summary") {
      setSummary(latest);
      if (!chatVisible.current) setUnread((count) => count + 1);
    } else if (presentation === "popup") {
      notiApi.open({
        key: latest.isServer ? serverChatKey : undefined,
        message: latest.name,
        description: latest.content,
        icon: <MessageOutlined />,
      });
    }
  }, [dialogs, serverMessageMode, portrait, notiApi]);

  useEffect(() => {
    const presentation = chatPresentation(serverMessageMode, portrait, true);
    if (presentation !== "popup") notiApi.destroy(serverChatKey);
    if (presentation !== "summary") {
      setSummary(undefined);
      setUnread(0);
    }
  }, [serverMessageMode, portrait, notiApi]);

  useEffect(() => {
    const read = (event: Event) => {
      chatVisible.current =
        (event as CustomEvent<{ open?: boolean }>).detail?.open ?? true;
      if (chatVisible.current) setUnread(0);
    };
    window.addEventListener("neos:duel-chat-read", read);
    return () => window.removeEventListener("neos:duel-chat-read", read);
  }, []);

  return (
    <>
      {msgContextHolder}
      {notiContextHolder}
      {serverMessageMode === "auto" && portrait && summary && unread > 0 && (
        <button
          type="button"
          data-testid="duel-message-summary"
          className={styles.summary}
          title={`${summary.name}: ${summary.content}`}
          onClick={() => {
            setUnread(0);
            window.dispatchEvent(new CustomEvent("neos:open-duel-chat"));
          }}
        >
          <span className={styles.unread}>
            {previewFormat(text.unreadMessages, { count: unread })}
          </span>
          <span className={styles.preview} role="status" aria-live="polite">
            {summary.content}
          </span>
        </button>
      )}
    </>
  );
};

// 防抖的waiting msg
let isWaiting = false;
let destoryTimer: NodeJS.Timeout | undefined;
const waitingKey = "waiting";
export const showWaiting = (open: boolean) => {
  if (open) {
    if (!isWaiting) {
      globalMsgApi?.open({
        type: "loading",
        content: fetchStrings(Region.System, 1390),
        key: waitingKey,
        className: styles["message"],
        duration: 0,
      });
      clearTimeout(destoryTimer);
      isWaiting = true;
      destoryTimer = undefined;
    }
  } else {
    if (!destoryTimer) {
      destoryTimer = setTimeout(() => {
        globalMsgApi?.destroy(waitingKey);
        isWaiting = false;
      }, 1000);
    }
  }
};

function getHandResultKey(res: HandResult): string {
  switch (res) {
    case HandResult.UNKNOWN:
      return "[?]";
    case HandResult.ROCK:
      return "Rock";
    case HandResult.PAPER:
      return "Paper";
    case HandResult.SCISSOR:
      return "Scissors";
  }
}
