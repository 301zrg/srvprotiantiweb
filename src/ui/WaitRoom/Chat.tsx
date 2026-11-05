import { ScrollableArea, useChat } from "@/ui/Shared";
import { ChatInput } from "@/ui/Shared/ChatInput";

import styles from "./Chat.module.scss";

interface ChatItem {
  name: string;
  time: string;
  content: string;
}

export const Chat: React.FC<{ controller: ReturnType<typeof useChat> }> = ({
  controller,
}) => {
  const { dialogs, ref } = controller;
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
      <ChatInput controller={controller} testId="waitroom-chat" />
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
