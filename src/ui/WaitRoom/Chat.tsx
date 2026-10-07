import { Button, Input } from "antd";
import { useTranslation } from "react-i18next";

import { useI18N } from "@/ui/I18N";
import { IconFont, ScrollableArea, useChat } from "@/ui/Shared";
import { roomMessages } from "@/variant/roomMessages";

import styles from "./Chat.module.scss";

interface ChatItem {
  name: string;
  time: string;
  content: string;
}

export const Chat: React.FC<{ controller: ReturnType<typeof useChat> }> = ({
  controller,
}) => {
  const { dialogs, input, setInput, ref, onSend } = controller;
  const { t: i18n } = useTranslation("Chat");
  const { language } = useI18N();
  return (
    <div className={styles.chat} data-testid="waitroom-chat">
      <ScrollableArea
        className={styles.dialogs}
        hostClassName={styles.scrollHost}
        elementProps={
          {
            "data-testid": "waitroom-chat-dialogs",
          } as React.HTMLAttributes<HTMLElement>
        }
        ref={ref}
      >
        {dialogs.map((item, idx) => (
          <DialogItem key={idx} {...item} />
        ))}
      </ScrollableArea>
      <div className={styles.input}>
        <Input.TextArea
          variant="borderless"
          data-testid="waitroom-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder={i18n("PleaseEnterChatContent")}
          onPressEnter={(e) => {
            e.preventDefault();
            onSend();
          }}
        />
        <Button
          type="text"
          data-testid="waitroom-chat-send"
          aria-label={roomMessages(language).send}
          icon={<IconFont type="icon-send" size={16} />}
          onClick={onSend}
        />
      </div>
    </div>
  );
};

const DialogItem: React.FC<ChatItem> = ({ name, time, content }) => {
  return (
    <div className={styles.item} data-testid="waitroom-chat-message">
      <div className={styles.name}>
        {name}
        <span className={styles.time}>{time}</span>
      </div>
      <div className={styles.content}>{content}</div>
    </div>
  );
};
