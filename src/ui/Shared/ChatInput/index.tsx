import { SendOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { useI18N } from "@/ui/I18N";
import {
  type QuickCommand,
  quickCommands,
  quickCommandStore,
} from "@/variant/quickCommands";
import { roomMessages } from "@/variant/roomMessages";

import type { useChat } from "../chatHook";
import styles from "./index.module.scss";

/** Same draft and keyboard behaviour in the room, duel and siding chats. */
export function ChatInput({
  controller: { input, setInput, onSend, onQuickCommand },
  testId,
}: {
  controller: Pick<
    ReturnType<typeof useChat>,
    "input" | "setInput" | "onSend" | "onQuickCommand"
  >;
  testId: string;
}) {
  const { t } = useTranslation("Chat");
  const { language } = useI18N();
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const awaiting = useSnapshot(quickCommandStore);
  // With a landscape keyboard open there is only room for the draft.
  const [cramped, setCramped] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () =>
      setCramped((viewport?.height ?? window.innerHeight) < 300);
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const send = () => {
    if (input?.trim()) onSend();
  };
  return (
    <>
      {!cramped && (
        <div
          className={styles.quickCommands}
          data-testid={`${testId}-commands`}
        >
          {(Object.keys(quickCommands) as QuickCommand[]).map((command) => (
            <Button
              key={command}
              type="text"
              className={awaiting[command] ? styles.awaiting : undefined}
              data-testid={`${testId}-command-${command}`}
              disabled={awaiting[command]}
              aria-busy={awaiting[command]}
              title={
                awaiting[command]
                  ? roomMessages(language).awaitingReply
                  : undefined
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onQuickCommand(command)}
            >
              {quickCommands[command].text}
            </Button>
          ))}
        </div>
      )}
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
    </>
  );
}
