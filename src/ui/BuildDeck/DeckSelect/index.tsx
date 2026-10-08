import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  ShareAltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Modal } from "antd";
import React, { useRef, useState } from "react";

import { importDeckContent } from "@/service/deckImport";
import { deckStore, IDeck } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { DeckImportError } from "@/variant/deckImport";
import { deckImportMessages } from "@/variant/deckImportMessages";
import { deckMessages } from "@/variant/deckMessages";

import styles from "./index.module.scss";

export const DeckSelect: React.FC<{
  decks: IDeck[];
  selected: string;
  onSelect: (deckName: string) => unknown;
  onDelete: (deckName: string) => Promise<unknown>;
  onDownload: (deckName: string) => unknown;
  onCopy: (deckName: string) => Promise<unknown>;
  onShare: (deckName: string) => Promise<"shared" | "downloaded" | "cancelled">;
}> = ({ decks, selected, onSelect, onDelete, onDownload, onCopy, onShare }) => {
  const { message } = App.useApp();
  const { language } = useI18N();
  const text = deckMessages(language);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const addYdk = async (ydkText: string, name: string) => {
    try {
      const result = await importDeckContent(
        { format: "ydk", text: ydkText },
        name,
        text.deck,
      );
      onSelect(result.deck.deckName);
      if (result.persisted) message.success(text.imported);
      else message.warning(deckImportMessages(language).memory, 8);
      if (result.unknown)
        message.warning(`${result.unknown} ${text.unknownCards}`);
      setPasteOpen(false);
      setPasteText("");
    } catch (error) {
      message.error(
        error instanceof DeckImportError
          ? deckImportMessages(language).errors[error.code]
          : text.saveFailed,
      );
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
            if (file.size > 65536)
              message.error(deckImportMessages(language).errors["too-large"]);
            else
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
              data-testid="deck-share"
              title={text.share}
              aria-label={`${text.share} ${deck.deckName}`}
              icon={<ShareAltOutlined />}
              onClick={async (event) => {
                event.stopPropagation();
                try {
                  if ((await onShare(deck.deckName)) === "downloaded")
                    message.info(text.shareFallback);
                } catch {
                  message.error(text.saveFailed);
                }
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
