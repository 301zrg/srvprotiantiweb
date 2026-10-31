// 聊天框的通用Hook

import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { sendChat, ygopro } from "@/api";
import { getUIContainer } from "@/container/compat";
// TODO: access store via `Container`
import { chatStore, isMe, matStore, roomStore } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { displayPlayerId } from "@/variant/playerIds";

interface ChatItem {
  name: string;
  time: string;
  content: string;
  isServer: boolean;
}

export const useChat = (isDuel: boolean = false, ordered = isDuel) => {
  const { hidePlayerIds, chatOrder, historyOrder } = useSnapshot(settingStore);
  // Duel, spectating and side-deck chats follow the order setting.
  const newestFirst =
    ordered &&
    (chatOrder === "newest" ||
      (chatOrder === "history" && historyOrder === "newest"));
  const container = getUIContainer();
  const [chatList, setChatList] = useState<ChatItem[]>([]);
  const [input, setInput] = useState<string | undefined>(undefined);
  const chat = useSnapshot(chatStore);
  /** 滚动条的ref */
  const ref = useRef<OverlayScrollbarsComponentRef<"div">>(null);

  /** Scroll to the newest message: the bottom, or the top when newest first. */
  const scrollToLatest = () => {
    const viewport = ref.current?.osInstance()?.elements().viewport;
    if (viewport) {
      viewport.scrollTop = newestFirst ? 0 : viewport.scrollHeight;
    }
  };

  /** 发信息 */
  const onSend = () => {
    if (input !== undefined) {
      sendChat(container.conn, input);
      setInput("");
    }
  };

  // 获取消息发送者的名字
  const getSenderName = (sender: number) => {
    if (sender < 4) {
      if (isDuel) {
        // Like YGOPro's ChatLocalPlayer/OppositePlayer: duel IDs follow Core
        // order; the roster follows room seats. A view flip changes neither.
        const teamBit = roomStore.hostInfo?.mode === 2 ? 2 : 1;
        let swapped = matStore.observerSwapped;
        if (
          matStore.selfType !==
          ygopro.StocGameMessage.MsgStart.PlayerType.Observer
        ) {
          const selfSeat = roomStore.players.findIndex(
            (player) => player?.isMe,
          );
          if (selfSeat < 0) return;
          swapped = (selfSeat & teamBit) !== (isMe(0) ? 0 : teamBit);
        }
        return roomStore.players[sender ^ (swapped ? teamBit : 0)]?.name;
      } else {
        return roomStore.players[sender]?.name;
      }
    } else if (sender === 8 || (sender >= 11 && sender <= 19)) {
      return "System";
    }
    // Native STOC_CHAT uses a hidden-name prefix for watchers/unknown sources.
    // SRVPro may already include a watcher nickname in the message body.
    return "********";
  };

  useEffect(() => {
    if (chatStore.sender >= 0 && chatStore.message.length !== 0) {
      const { sender } = chatStore;
      const name = getSenderName(sender) ?? "?";
      setChatList((prev) => [
        ...prev,
        {
          name: name,
          time: formatTimeToHHMMSS(),
          content: chatStore.message,
          isServer: sender === 8 || (sender >= 11 && sender <= 19),
        },
      ]);
      scrollToLatest();
    }
  }, [chat]);

  // Switching the order jumps to the newest message as well.
  useEffect(() => {
    requestAnimationFrame(scrollToLatest);
  }, [newestFirst]);

  const dialogs = useMemo(() => {
    const list = chatList.map((item) => ({
      ...item,
      name: item.isServer
        ? item.name
        : displayPlayerId(item.name, hidePlayerIds),
    }));
    return newestFirst ? list.reverse() : list;
  }, [chatList, hidePlayerIds, newestFirst]);
  return {
    dialogs,
    /** Newest message whatever the display order (for notifications). */
    latest: newestFirst ? dialogs[0] : dialogs.at(-1),
    newestFirst,
    input,
    setInput,
    ref,
    onSend,
  };
};

function formatTimeToHHMMSS() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
