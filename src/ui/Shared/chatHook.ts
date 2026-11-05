// 聊天框的通用Hook

import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { sendChat } from "@/api";
import { getUIContainer } from "@/container/compat";
// TODO: access store via `Container`
import { chatStore, isServerSender } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { displayPlayerId } from "@/variant/playerIds";

export const useChat = (isDuel: boolean = false, ordered = isDuel) => {
  const { hidePlayerIds, chatOrder, historyOrder } = useSnapshot(settingStore);
  // Duel, spectating and side-deck chats follow the order setting.
  const newestFirst =
    ordered &&
    (chatOrder === "newest" ||
      (chatOrder === "history" && historyOrder === "newest"));
  const container = getUIContainer();
  const [input, setInput] = useState<string | undefined>(undefined);
  const { entries } = useSnapshot(chatStore);
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

  // New lines, and switching the order, jump to the newest message.
  useEffect(() => {
    requestAnimationFrame(scrollToLatest);
  }, [newestFirst, entries.length]);

  const dialogs = useMemo(() => {
    const list = entries.map((entry) => {
      const name = (isDuel ? entry.duelName : entry.seatName) ?? "?";
      const isServer = isServerSender(entry.sender);
      return {
        name: isServer ? name : displayPlayerId(name, hidePlayerIds),
        time: entry.time,
        content: entry.message,
        isServer,
      };
    });
    return newestFirst ? list.reverse() : list;
  }, [entries, isDuel, hidePlayerIds, newestFirst]);
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
