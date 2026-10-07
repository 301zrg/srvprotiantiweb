import { Button, Input } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { useI18N } from "@/ui/I18N";
import { IconFont, ScrollableArea, useChat } from "@/ui/Shared";
import { DuelPanel } from "@/ui/Shared/DuelPanel";
import { mobileMessages } from "@/variant/mobileMessages";

import styles from "./index.module.scss";

const store = proxy({ open: false });

interface ChatItem {
  name: string;
  content: string;
}

export const ChatBox: React.FC = () => {
  const { language } = useI18N();
  const { open } = useSnapshot(store);
  const { dialogs, input, setInput, ref, onSend } = useChat(true);
  const { t: i18n } = useTranslation("Chat");
  const onClose = () => (store.open = false);

  return (
    <DuelPanel
      open={open}
      placement="bottom"
      title={mobileMessages(language).chat}
      testId="duel-chat-panel"
      onClose={onClose}
    >
      <div className={styles.container}>
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

export const openChatBox = () => (store.open = !store.open);
