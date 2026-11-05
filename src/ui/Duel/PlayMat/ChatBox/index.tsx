import { CloseOutlined } from "@ant-design/icons";
import { Button } from "antd";
import classNames from "classnames";
import React, { useEffect } from "react";
import { proxy, useSnapshot } from "valtio";

import { useI18N } from "@/ui/I18N";
import { ScrollableArea, useChat } from "@/ui/Shared";
import { ChatInput } from "@/ui/Shared/ChatInput";
import { DuelPanel, hasDuelSidebar } from "@/ui/Shared/DuelPanel";
import { mobileMessages } from "@/variant/mobileMessages";

import styles from "./index.module.scss";

const store = proxy({ open: false });

interface ChatItem {
  name: string;
  content: string;
}

export const ChatBox: React.FC<{
  embedded?: boolean;
  visible?: boolean;
  onCloseEmbedded?: () => void;
}> = ({ embedded = false, visible = true, onCloseEmbedded }) => {
  const { language } = useI18N();
  const { open } = useSnapshot(store);
  const chat = useChat(true);
  const { dialogs, ref } = chat;
  const onClose = () => (store.open = false);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("neos:duel-chat-read", {
        detail: { open: embedded ? visible : open },
      }),
    );
  }, [embedded, visible, open, dialogs]);

  const content = (
    <div
      className={classNames(styles.container, { [styles.embedded]: embedded })}
      data-testid={embedded ? "duel-chat-panel" : undefined}
      style={embedded && !visible ? { display: "none" } : undefined}
    >
      {embedded && (
        <Button
          data-testid="duel-chat-close"
          size="small"
          aria-label={mobileMessages(language).close}
          icon={<CloseOutlined />}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClose();
            onCloseEmbedded?.();
          }}
        />
      )}
      <ScrollableArea
        className={styles.dialogs}
        hostClassName={styles.scrollHost}
        ref={ref}
      >
        {dialogs.map((item, idx) => (
          <DialogItem key={idx} {...item} />
        ))}
      </ScrollableArea>
      <ChatInput controller={chat} testId="duel-chat" />
    </div>
  );
  if (embedded) return content;
  return (
    <DuelPanel
      open={open}
      placement="bottom"
      title={mobileMessages(language).chat}
      testId="duel-chat-panel"
      followControlSide
      fitViewport
      bodyClassName={styles.panelBody}
      onClose={onClose}
    >
      {content}
    </DuelPanel>
  );
};

const DialogItem: React.FC<ChatItem> = ({ name, content }) => (
  <div className={styles.item}>
    <div className={styles.name}>{name}</div>
    <span>{` > `}</span>
    <div className={styles.content}>{content}</div>
  </div>
);

export const showChatBox = () => {
  store.open = true;
};
export const openChatBox = () => {
  if (hasDuelSidebar())
    window.dispatchEvent(new CustomEvent("neos:open-duel-chat"));
  else store.open = !store.open;
};
