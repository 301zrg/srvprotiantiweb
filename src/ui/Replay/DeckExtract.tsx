import "./DeckExtract.css";

import { Button, Drawer, message, Modal, theme } from "antd";
import { useEffect, useState } from "react";

import { useMobileInterface } from "@/hook";
import { downloadFile, shareOrDownloadFile } from "@/infra/fileExport";
import {
  type ExtractedReplayDeck,
  extractReplayDecks,
  saveExtractedDeck,
  UnsupportedReplayExtraction,
} from "@/replay/extract";
import { sha256 } from "@/replay/hash";
import { getReplay } from "@/replay/library";
import { localizeReplayText } from "@/replay/localizedText";
import { deckStore } from "@/stores/deckStore";
import { deckAsYdkFile } from "@/ui/BuildDeck/utils";
import { useI18N } from "@/ui/I18N";
import type { Language } from "@/variant";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

interface Props {
  replayId: string;
  closeLabel: string;
  onClose(): void;
}

export function DeckExtract({ replayId, closeLabel, onClose }: Props) {
  const { language } = useI18N();
  const mobile = useMobileInterface();
  const { token } = theme.useToken();
  const words = previewMessages(language);
  const [decks, setDecks] = useState<ExtractedReplayDeck[]>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<number, string>>({});
  useEffect(() => {
    let disposed = false;
    void getReplay(replayId)
      .then(async ({ entry, blob }) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if ((await sha256(bytes)) !== entry.hash)
          throw new Error("本地录像原件校验失败");
        const extracted = await extractReplayDecks(bytes, {
          title: entry.title,
          filename: entry.filename,
        });
        if (!disposed) setDecks(extracted);
      })
      .catch((reason) => {
        if (!disposed)
          setError(
            reason instanceof UnsupportedReplayExtraction
              ? words.extractUnsupported
              : previewFormat(words.extractFailed, {
                  reason: localizeReplayText(
                    reason instanceof Error ? reason.message : String(reason),
                    language as Language,
                  ),
                }),
          );
      });
    return () => {
      disposed = true;
    };
  }, [replayId, language, words]);

  const save = async (players: number[]) => {
    if (!decks || saving) return;
    setSaving(true);
    try {
      for (const player of players) {
        const deck = await saveExtractedDeck(decks[player], deckStore);
        setSaved((old) => ({ ...old, [player]: deck.deckName }));
        if (players.length === 1)
          message.success(
            previewFormat(words.deckSaved, { name: deck.deckName }),
          );
      }
      if (players.length === 2) message.success(words.bothSaved);
    } catch {
      message.error(words.deckSaveFailed);
    } finally {
      setSaving(false);
    }
  };
  const content = (
    <div
      className="replay-deck-extract"
      style={
        {
          "--replay-extract-border": token.colorBorder,
          "--replay-extract-secondary": token.colorTextSecondary,
          "--replay-extract-success": token.colorSuccessText,
          "--replay-extract-error": token.colorErrorText,
        } as React.CSSProperties
      }
    >
      <p className="replay-extract-help">{words.extractHelp}</p>
      {error && (
        <p className="replay-extract-error" role="alert">
          {error}
        </p>
      )}
      {!decks && !error && <p role="status">{words.extractLoading}</p>}
      {decks?.map((deck, player) => (
        <section key={player} className="replay-extracted-deck">
          <h3>{deck.playerName}</h3>
          <p>
            {previewFormat(words.deckCounts, {
              main: deck.main.length,
              extra: deck.extra.length,
            })}
          </p>
          <p className="replay-extract-name">{deck.deckName}</p>
          <div className="replay-extract-actions">
            <Button disabled={saving} onClick={() => void save([player])}>
              {words.saveDeck}
            </Button>
            <Button
              onClick={() => {
                const file = deckAsYdkFile(deck);
                if (mobile) void shareOrDownloadFile(file, deck.deckName);
                else downloadFile(file);
              }}
            >
              {words.downloadYdk}
            </Button>
          </div>
          {saved[player] && (
            <p className="replay-extract-saved" role="status">
              {previewFormat(words.deckSaved, { name: saved[player] })}
            </p>
          )}
        </section>
      ))}
      <div className="replay-extract-footer">
        <Button
          type="primary"
          disabled={!decks || saving}
          loading={saving}
          onClick={() => void save([0, 1])}
        >
          {words.saveBoth}
        </Button>
        <Button onClick={onClose}>{closeLabel}</Button>
      </div>
    </div>
  );
  return mobile ? (
    <Drawer
      open
      title={words.replayDecks}
      placement="bottom"
      height="min(90dvh, 620px)"
      onClose={onClose}
      rootClassName="replay-extract-shell"
      destroyOnClose
    >
      {content}
    </Drawer>
  ) : (
    <Modal
      open
      centered
      title={words.replayDecks}
      onCancel={onClose}
      footer={null}
      width={560}
      rootClassName="replay-extract-shell"
      destroyOnClose
    >
      {content}
    </Modal>
  );
}
