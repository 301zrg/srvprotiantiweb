import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  QuestionCircleOutlined,
  RetweetOutlined,
  SwapOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Input, message, Switch, Tooltip } from "antd";
import { HTML5toTouch } from "rdndmb-html5-to-touch";
import { useEffect, useState } from "react";
import { DndProvider } from "react-dnd-multi-backend";
import { useTranslation } from "react-i18next";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { proxy, useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";

import { type CardMeta, fetchCard, forbidden } from "@/api";
import { isExtraDeckCard } from "@/common";
import { useMobileInterface } from "@/hook";
import { AudioActionType, changeScene } from "@/infra/audio";
import { setPracticeDeck } from "@/practice/session";
import { deckStore, emptyDeck, type IDeck, initStore } from "@/stores";
import { activeDeck, selectActiveDeck } from "@/stores/deckSelection";
import { useI18N } from "@/ui/I18N";
import {
  Background,
  DeckCardMouseUpEvent,
  DeckZone,
  Loading,
  ScrollableArea,
} from "@/ui/Shared";
import { Type } from "@/ui/Shared/DeckZone";
import { MobileHomeLink } from "@/ui/Shared/MobileHomeLink";
import { deckImportMessages } from "@/variant/deckImportMessages";
import { deckMessages } from "@/variant/deckMessages";
import { storageKey } from "@/variant/deployment";
import { mobileMessages } from "@/variant/mobileMessages";
import { previewMessages } from "@/variant/previewMessages";

import { CardDetail } from "./CardDetail";
import { DeckDatabase } from "./DeckDatabase";
import { DeckSelect } from "./DeckSelect";
import styles from "./index.module.scss";
import { editDeckStore } from "./store";
import {
  copyDeckToClipboard,
  downloadDeckAsYDK,
  editingDeckToIDeck,
  iDeckToEditingDeck,
  shareDeckAsYDK,
} from "./utils";

export const loader: LoaderFunction = async () => {
  // 必须先加载卡组，不然页面会崩溃
  if (!initStore.decks) {
    await new Promise<void>((rs) => {
      subscribeKey(initStore, "decks", (done) => done && rs());
    });
  }

  // 同时，等待禁卡表的加载
  if (!initStore.forbidden) {
    await new Promise<void>((rs) => {
      subscribeKey(initStore, "forbidden", (done) => done && rs());
    });
  }

  // 最后，等待I18N文案的加载
  if (!initStore.i18n) {
    await new Promise<void>((rs) => {
      subscribeKey(initStore, "i18n", (done) => done && rs());
    });
  }

  // A direct /build visit can import this module before IndexedDB is ready.
  const preferred = activeDeck() ?? emptyDeck;
  if (
    !deckStore.get(selectedDeck.deck.deckName) ||
    selectedDeck.deck.deckName !== preferred.deckName
  ) {
    setSelectedDeck(preferred);
  }

  // 更新场景
  changeScene(AudioActionType.BGM_DECK);

  return null;
};

export const selectedCard = proxy({
  id: 23995346,
  open: false,
});

function storedEditingDeck() {
  try {
    return deckStore.get(
      sessionStorage.getItem(storageKey("editingDeckName")) ?? "",
    );
  } catch {
    return undefined;
  }
}

const selectedDeck = proxy<{ deck: IDeck }>({
  deck: storedEditingDeck() ?? deckStore.decks.at(0) ?? emptyDeck,
});

let practiceEditorSource: string | undefined;

export const setSelectedDeck = (deck: IDeck) => {
  selectedDeck.deck = deck;
  selectActiveDeck(deck.deckName);
  try {
    sessionStorage.setItem(storageKey("editingDeckName"), deck.deckName);
  } catch {}
};

export const Component: React.FC = () => {
  const snapDecks = useSnapshot(deckStore);
  const { progress } = useSnapshot(initStore.sqlite);
  const { deck: snapSelectedDeck } = useSnapshot(selectedDeck);

  const { message } = App.useApp();
  const { language } = useI18N();
  const mobileText = mobileMessages(language);
  const [mobileTab, setMobileTab] = useState<"manage" | "deck" | "search">(
    "deck",
  );
  const { t: i18n } = useTranslation("BuildDeck");
  const handleDeckEditorReset = async () => {
    editDeckStore.set(await iDeckToEditingDeck(selectedDeck.deck as IDeck));
    message.info(`${i18n("ResetSuccessful")}`);
  };

  const handleDeckEditorSave = async () => {
    const tmpIDeck = editingDeckToIDeck(editDeckStore);
    const result = await deckStore.update(selectedDeck.deck.deckName, tmpIDeck);
    if (result) {
      setSelectedDeck(tmpIDeck);
      message.info(`${i18n("SaveSuccessful")}`);
      editDeckStore.edited = false;
    } else {
      message.error(deckMessages(language).saveFailed);
    }
  };

  const handleDeckEditorShuffle = () => {
    editDeckStore.shuffle(editDeckStore);
  };

  const handleDeckEditorSort = () => {
    editDeckStore.sort(editDeckStore);
  };

  return (
    <DndProvider options={HTML5toTouch}>
      <Background />
      <div
        className={styles.layout}
        data-mobile-tab={mobileTab}
        style={{ width: "100%" }}
      >
        <div className={styles.mobileNavigation}>
          <MobileHomeLink />
          <div
            className={styles.mobileTabs}
            role="tablist"
            aria-label={mobileText.editDeck}
          >
            {(
              [
                ["manage", mobileText.manageDecks],
                ["deck", mobileText.editDeck],
                ["search", mobileText.searchCards],
              ] as const
            ).map(([tab, label]) => (
              <Button
                key={tab}
                role="tab"
                aria-selected={mobileTab === tab}
                type={mobileTab === tab ? "primary" : "text"}
                data-testid={`deck-tab-${tab}`}
                onClick={() => setMobileTab(tab)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.sider} data-testid="deck-manage-panel">
          <ScrollableArea
            className={styles["deck-select-container"]}
            hostClassName={styles.scrollHost}
          >
            <DeckSelect
              decks={snapDecks.decks as IDeck[]}
              selected={snapSelectedDeck.deckName}
              onSelect={(name) => {
                setSelectedDeck(deckStore.get(name) ?? emptyDeck);
                setMobileTab("deck");
              }}
              onDelete={async (name) => await deckStore.delete(name)}
              onDownload={(name) => {
                if (
                  !snapDecks.persistenceAvailable &&
                  selectedDeck.deck.deckName === name
                ) {
                  downloadDeckAsYDK(editingDeckToIDeck(editDeckStore));
                  return;
                }
                const deck = deckStore.get(name);
                if (deck) downloadDeckAsYDK(deck);
              }}
              onCopy={async (name) => {
                const deck = deckStore.get(name);
                if (deck) return await copyDeckToClipboard(deck);
                else return false;
              }}
              onShare={(name) => {
                const deck =
                  !snapDecks.persistenceAvailable &&
                  selectedDeck.deck.deckName === name
                    ? editingDeckToIDeck(editDeckStore)
                    : deckStore.get(name);
                return deck
                  ? shareDeckAsYDK(deck)
                  : Promise.reject(
                      new Error(deckMessages(language).saveFailed),
                    );
              }}
            />
          </ScrollableArea>
        </div>
        <div className={styles.content}>
          {!snapDecks.persistenceAvailable && (
            <Alert
              data-testid="deck-storage-warning"
              type="warning"
              showIcon
              message={deckImportMessages(language).memory}
              style={{ flexShrink: 0 }}
            />
          )}
          <div className={styles.editorColumns}>
            {progress === 1 ? (
              <>
                <div className={styles.deck} data-testid="deck-editor-panel">
                  <DeckEditor
                    deck={snapSelectedDeck as IDeck}
                    onClear={editDeckStore.clear}
                    onReset={handleDeckEditorReset}
                    onSave={handleDeckEditorSave}
                    onShuffle={handleDeckEditorShuffle}
                    onSort={handleDeckEditorSort}
                  />
                </div>
                <div className={styles.select} data-testid="deck-search-panel">
                  <DeckDatabase />
                </div>
              </>
            ) : (
              <div className={styles.container}>
                <Loading progress={progress * 100} />
              </div>
            )}
          </div>
        </div>
        <div className={styles.detailHost}>
          <HigherCardDetail />
        </div>
      </div>
    </DndProvider>
  );
};
Component.displayName = "Build";

/** 正在编辑的卡组 */
export const DeckEditor: React.FC<{
  deck: IDeck;
  onShuffle: () => void;
  onSort: () => void;
  onClear: () => void;
  onReset: () => void;
  onSave: () => void;
}> = ({ deck, onClear, onReset, onSave, onShuffle, onSort }) => {
  const navigate = useNavigate();
  const snapEditDeck = useSnapshot(editDeckStore);
  const { language } = useI18N();
  const [deckName, setDeckName] = useState(editDeckStore.deckName);
  const mobile = useMobileInterface();
  const [reorderMode, setReorderMode] = useState(false);
  const text = deckMessages(language);
  const preview = previewMessages(language);
  const bannedCounts = new Map<number, number>();
  for (const card of [
    ...snapEditDeck.main,
    ...snapEditDeck.extra,
    ...snapEditDeck.side,
  ]) {
    const key = card.data.alias || card.id;
    bannedCounts.set(key, (bannedCounts.get(key) ?? 0) + 1);
  }
  const violatesBanlist = [
    ...snapEditDeck.main,
    ...snapEditDeck.extra,
    ...snapEditDeck.side,
  ].some(
    (card) =>
      (bannedCounts.get(card.data.alias || card.id) ?? 0) >
      Math.min(3, forbidden.get(card) ?? 3),
  );

  useEffect(() => {
    // Practice copies the draft; returning must keep its unsaved name/order.
    if (practiceEditorSource === deck.deckName) {
      practiceEditorSource = undefined;
      return;
    }
    practiceEditorSource = undefined;
    iDeckToEditingDeck(deck).then(editDeckStore.set);
    setDeckName(deck.deckName);
    setReorderMode(false);
  }, [deck]);
  useEffect(() => {
    editDeckStore.deckName = deckName;
  }, [deckName]);

  // Refresh text without rebuilding the editor or discarding unsaved cards.
  useEffect(() => {
    for (const type of ["main", "extra", "side"] as const) {
      editDeckStore[type] = editDeckStore[type].map((card) =>
        fetchCard(card.id),
      );
    }
  }, [language]);

  const handleSwitchCard = (type: Type, card: CardMeta, index?: number) => {
    const cardType = card.data.type ?? 0;
    const isSide = type === "side";
    const targetType = isSide
      ? isExtraDeckCard(cardType)
        ? "extra"
        : "main"
      : "side";
    const { result, reason } = editDeckStore.canAdd(card, targetType, type);
    if (result) {
      editDeckStore.remove(type, card, index);
      editDeckStore.add(targetType, card);
    } else {
      message.error(reason);
    }
  };

  const handleAddCard = (card: CardMeta, type: Type) => {
    const { result, reason } = editDeckStore.canAdd(card, type, "search");
    if (result) editDeckStore.add(type, card);
    else message.error(reason);
  };

  const showSelectedCard = (card: CardMeta) => {
    selectedCard.id = card.id;
    selectedCard.open = true;
  };

  const handleMouseUp = (
    type: "main" | "extra" | "side",
    payload: DeckCardMouseUpEvent,
  ) => {
    const { event, card, index } = payload;
    switch (event.button) {
      // 左键
      case 0:
        showSelectedCard(card);
        break;
      // 中键
      case 1:
        handleSwitchCard(type, card, index);
        break;
      // 右键
      case 2:
        editDeckStore.remove(type, card, index);
        break;
      default:
        break;
    }
    event.preventDefault();
  };
  const { t: i18n } = useTranslation("BuildDeck");
  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <div className={styles.deckNameRow}>
          <EditOutlined aria-hidden />
          <Input.TextArea
            autoSize={{ minRows: 1 }}
            placeholder={i18n("EnterTheDeckName")}
            variant="borderless"
            className={styles.deckName}
            data-testid="deck-name"
            aria-label={i18n("EnterTheDeckName")}
            onChange={(e) => setDeckName(e.target.value)}
            value={deckName}
          />
        </div>
        <div className={styles.editorActions}>
          <Tooltip title={preview.ignoreBanlistHelp}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
              }}
            >
              <Switch
                data-testid="deck-ignore-banlist"
                checked={snapEditDeck.ignoreBanlist}
                onChange={(value) => {
                  editDeckStore.ignoreBanlist = value;
                }}
              />
              {preview.ignoreBanlist}
            </label>
          </Tooltip>
          <Button
            data-testid="deck-practice"
            onClick={() => {
              practiceEditorSource = deck.deckName;
              setPracticeDeck(editingDeckToIDeck(editDeckStore));
              navigate("/practice");
            }}
          >
            {preview.practice}
          </Button>
          {mobile && (
            <Button
              data-testid="deck-reorder-toggle"
              aria-pressed={reorderMode}
              type={reorderMode ? "primary" : "text"}
              size="small"
              icon={<HolderOutlined />}
              onClick={() => setReorderMode(!reorderMode)}
            >
              {reorderMode ? text.finishOrder : text.manualOrder}
            </Button>
          )}
          <Button
            type="text"
            size="small"
            icon={<SwapOutlined />}
            onClick={onShuffle}
          >
            {i18n("Shuffle")}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<RetweetOutlined />}
            onClick={onSort}
          >
            {text.autoSort}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={onClear}
          >
            {i18n("Clear")}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            onClick={() => onReset()}
          >
            {i18n("Reset")}
          </Button>
          <Button
            data-testid="deck-save"
            type={snapEditDeck.edited ? "primary" : "text"}
            size="small"
            icon={<CheckOutlined />}
            onClick={() => onSave()}
          >
            {i18n("Save")}
          </Button>
          <Tooltip title={i18n("QuestionCircleTooltip")}>
            <QuestionCircleOutlined />
          </Tooltip>
        </div>
      </div>
      {mobile && reorderMode && (
        <p className={styles.orderHelp}>{text.orderHelp}</p>
      )}
      {!snapEditDeck.ignoreBanlist && violatesBanlist && (
        <Alert
          type="warning"
          message={preview.banlistWarning}
          showIcon
          style={{ flexShrink: 0 }}
        />
      )}
      <ScrollableArea
        className={styles["deck-zone"]}
        hostClassName={styles.scrollHost}
      >
        {(["main", "extra", "side"] as const).map((type) => (
          <DeckZone
            key={type}
            compact
            type={type}
            cards={[...snapEditDeck[type]]}
            canAdd={editDeckStore.canAdd}
            onChange={(card, source, destination, index) => {
              editDeckStore.add(destination, card);
              if (source !== "search") {
                editDeckStore.remove(source, card, index);
              }
            }}
            onElementMouseUp={(event) => handleMouseUp(type, event)}
            onDoubleClick={(card) => handleAddCard(card, type)}
            onAddCard={handleAddCard}
            onMoveCard={(card, source, index) =>
              handleSwitchCard(source, card, index)
            }
            onRemoveCard={(card, source, index) =>
              editDeckStore.remove(source, card, index)
            }
            onReorder={(from, to) => editDeckStore.reorder(type, from, to)}
            reorderMode={mobile && reorderMode}
          />
        ))}
      </ScrollableArea>
    </div>
  );
};

const HigherCardDetail: React.FC = () => {
  const { id, open } = useSnapshot(selectedCard);
  return (
    <CardDetail
      open={open}
      code={id}
      onClose={() => (selectedCard.open = false)}
    />
  );
};
