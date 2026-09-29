import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Modal } from "antd";
import React, { useRef, useState } from "react";
import YGOProDeck from "ygopro-deck-encode";

import { fetchCard } from "@/api";
import { deckStore, IDeck } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { deckMessages } from "@/variant/deckMessages";

import styles from "./index.module.scss";

export const DeckSelect: React.FC<{
  decks: IDeck[];
  selected: string;
  onSelect: (deckName: string) => unknown;
  onDelete: (deckName: string) => Promise<unknown>;
  onDownload: (deckName: string) => unknown;
  onCopy: (deckName: string) => Promise<unknown>;
}> = ({ decks, selected, onSelect, onDelete, onDownload, onCopy }) => {
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = deckMessages(language);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const addYdk = async (ydkText: string, name: string) => {
    try {
      const parsed = YGOProDeck.fromYdkString(ydkText);
      if (!parsed.main.length && !parsed.extra.length && !parsed.side.length) {
        throw new Error(text.emptyImport);
      }
      const deckName = name || `${text.deck} ${new Date().toLocaleString()}`;
      if (!(await deckStore.add({ deckName, ...parsed }))) {
        throw new Error(text.duplicate);
      }
      onSelect(deckName);
      message.success(text.imported);
      const unknown = [...parsed.main, ...parsed.extra, ...parsed.side].filter(
        (id) => !fetchCard(id).text.name,
      ).length;
      if (unknown) message.warning(`${unknown} ${text.unknownCards}`);
      setPasteOpen(false);
      setPasteText("");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className={styles["deck-select"]}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8 }}>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={async () => {
            const deckName = `${text.deck} ${new Date().toLocaleString()}`;
            if (
              await deckStore.add({ deckName, main: [], extra: [], side: [] })
            )
              onSelect(deckName);
          }}
        >
          {text.newDeck}
        </Button>
        <Button
          data-testid="deck-import-file"
          size="small"
          icon={<UploadOutlined />}
          onClick={() => fileInput.current?.click()}
        >
          {text.importFile}
        </Button>
        <Button size="small" onClick={() => setPasteOpen(true)}>
          {text.pasteText}
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".ydk,text/plain"
        style={{ display: "none" }}
        onChange={async (event) => {
          for (const file of Array.from(event.target.files ?? [])) {
            await addYdk(await file.text(), file.name.replace(/\.ydk$/i, ""));
          }
          event.target.value = "";
        }}
      />
      {decks.map((deck) => (
        <div
          key={deck.deckName}
          className={styles.item}
          onClick={() => onSelect(deck.deckName)}
        >
          {selected === deck.deckName && <div className={styles.selected} />}
          <span
            style={{ zIndex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {deck.deckName}
          </span>
          <div className={styles.btns} style={{ opacity: 1, zIndex: 1 }}>
            <Button
              size="small"
              type="text"
              aria-label={`${text.copy} ${deck.deckName}`}
              icon={<CopyOutlined />}
              onClick={async (event) => {
                event.stopPropagation();
                message[(await onCopy(deck.deckName)) ? "success" : "error"](
                  text.copied,
                );
              }}
            />
            <Button
              size="small"
              type="text"
              aria-label={`${text.download} ${deck.deckName}`}
              icon={<DownloadOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onDownload(deck.deckName);
              }}
            />
            <Button
              size="small"
              type="text"
              aria-label={`${text.remove} ${deck.deckName}`}
              icon={<DeleteOutlined />}
              onClick={async (event) => {
                event.stopPropagation();
                await onDelete(deck.deckName);
                if (selected === deck.deckName)
                  onSelect(deckStore.decks[0]?.deckName ?? "");
              }}
            />
          </div>
        </div>
      ))}
      <Modal
        open={pasteOpen}
        title={text.pasteTitle}
        onCancel={() => setPasteOpen(false)}
        onOk={() =>
          addYdk(pasteText, `${text.deck} ${new Date().toLocaleString()}`)
        }
        okText={text.import}
      >
        <Input.TextArea
          rows={10}
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder="#main\n...\n#extra\n...\n!side"
        />
        <Button
          style={{ marginTop: 8 }}
          onClick={async () => {
            try {
              setPasteText(await navigator.clipboard.readText());
            } catch {
              message.info(text.manualPaste);
            }
          }}
        >
          {text.readClipboard}
        </Button>
      </Modal>
    </div>
  );
};
