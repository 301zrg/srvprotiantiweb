import { SendOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useI18N } from "@/ui/I18N";
import { roomMessages } from "@/variant/roomMessages";

import type { useChat } from "../chatHook";
import styles from "./index.module.scss";

/** Same draft and keyboard behaviour in the room, duel and siding chats. */
export function ChatInput({
  controller: { input, setInput, onSend },
  testId,
}: {
  controller: Pick<ReturnType<typeof useChat>, "input" | "setInput" | "onSend">;
  testId: string;
}) {
  const { t } = useTranslation("Chat");
  const { language } = useI18N();
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const send = () => {
    if (input?.trim()) onSend();
  };
  return (
    <div className={styles.composer} data-testid="chat-composer">
      <Input.TextArea
        ref={(ref) => {
          textArea.current = ref?.resizableTextArea?.textArea ?? null;
        }}
        variant="borderless"
        data-testid={`${testId}-input`}
        aria-label={t("PleaseEnterChatContent")}
        value={input ?? ""}
        onChange={(event) => setInput(event.target.value)}
        autoSize={{ minRows: 1, maxRows: 3 }}
        onResize={() => {
          requestAnimationFrame(() => {
            const element = textArea.current;
            if (
              element &&
              element === document.activeElement &&
              element.selectionStart === element.value.length &&
              element.selectionEnd === element.value.length
            )
              element.scrollTop = element.scrollHeight;
          });
        }}
        placeholder={t("PleaseEnterChatContent")}
        onPressEnter={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            event.shiftKey
          )
            return;
          event.preventDefault();
          send();
        }}
      />
      <Button
        type="text"
        data-testid={`${testId}-send`}
        aria-label={roomMessages(language).send}
        icon={<SendOutlined />}
        onMouseDown={(event) => event.preventDefault()}
        onClick={send}
      />
    </div>
  );
}
