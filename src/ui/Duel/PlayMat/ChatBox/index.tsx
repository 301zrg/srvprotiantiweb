import { CloseOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { useI18N } from "@/ui/I18N";
import { IconFont, ScrollableArea, useChat } from "@/ui/Shared";
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
  const { dialogs, input, setInput, ref, onSend } = useChat(true);
  const { t: i18n } = useTranslation("Chat");
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
      <div className={styles.input}>
        <Input.TextArea
          variant="borderless"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoSize
          placeholder={i18n("PleaseEnterChatContent")}
          onPressEnter={(e) => {
            e.preventDefault();
            onSend();
          }}
        />
        <Button
          aria-label={i18n("PleaseEnterChatContent")}
          type="text"
          icon={<IconFont type="icon-send" size={14} />}
          onClick={onSend}
        />
      </div>
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
