import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  QuestionCircleOutlined,
  RetweetOutlined,
  SwapOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { App, Button, Input, message, Tooltip } from "antd";
import { HTML5toTouch } from "rdndmb-html5-to-touch";
import { useEffect, useState } from "react";
import { DndProvider } from "react-dnd-multi-backend";
import { useTranslation } from "react-i18next";
import { LoaderFunction } from "react-router-dom";
import { proxy, useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";

import { type CardMeta, fetchCard } from "@/api";
import { isExtraDeckCard } from "@/common";
import { AudioActionType, changeScene } from "@/infra/audio";
import { deckStore, emptyDeck, type IDeck, initStore } from "@/stores";
import { useI18N } from "@/ui/I18N";
import {
  Background,
  DeckCardMouseUpEvent,
  DeckZone,
  Loading,
  ScrollableArea,
} from "@/ui/Shared";
import { Type } from "@/ui/Shared/DeckZone";
import { deckMessages } from "@/variant/deckMessages";
import { mobileMessages } from "@/variant/mobileMessages";

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

  // 更新场景
  changeScene(AudioActionType.BGM_DECK);

  return null;
};

export const selectedCard = proxy({
  id: 23995346,
  open: false,
});

const selectedDeck = proxy<{ deck: IDeck }>({
  deck: deckStore.decks.at(0) ?? emptyDeck,
});

export const setSelectedDeck = (deck: IDeck) => {
  selectedDeck.deck = deck;
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
      editDeckStore.set(await iDeckToEditingDeck(selectedDeck.deck as IDeck));
      message.error(deckMessages(language).saveFailed);
      editDeckStore.edited = false;
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
                const deck = deckStore.get(name);
                if (deck) downloadDeckAsYDK(deck);
              }}
              onCopy={async (name) => {
                const deck = deckStore.get(name);
                if (deck) return await copyDeckToClipboard(deck);
                else return false;
              }}
            />
          </ScrollableArea>
        </div>
        <div className={styles.content}>
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
  const snapEditDeck = useSnapshot(editDeckStore);
  const { language } = useI18N();
  const [deckName, setDeckName] = useState(editDeckStore.deckName);

  useEffect(() => {
    iDeckToEditingDeck(deck).then(editDeckStore.set);
    setDeckName(deck.deckName);
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

  const handleSwitchCard = (type: Type, card: CardMeta) => {
    const cardType = card.data.type ?? 0;
    const isSide = type === "side";
    const targetType = isSide
      ? isExtraDeckCard(cardType)
        ? "extra"
        : "main"
      : "side";
    const { result, reason } = editDeckStore.canAdd(card, targetType, type);
    if (result) {
      editDeckStore.remove(type, card);
      editDeckStore.add(targetType, card);
    } else {
      message.error(reason);
    }
  };

  const showSelectedCard = (card: CardMeta) => {
    selectedCard.id = card.id;
    selectedCard.open = true;
  };

  const handleMouseUp = (
    type: "main" | "extra" | "side",
    payload: DeckCardMouseUpEvent,
  ) => {
    const { event, card } = payload;
    switch (event.button) {
      // 左键
      case 0:
        showSelectedCard(card);
        break;
      // 中键
      case 1:
        handleSwitchCard(type, card);
        break;
      // 右键
      case 2:
        editDeckStore.remove(type, card);
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
        <Input
          placeholder={i18n("EnterTheDeckName")}
          variant="borderless"
          prefix={<EditOutlined />}
          className={styles.deckName}
          data-testid="deck-name"
          onChange={(e) => setDeckName(e.target.value)}
          value={deckName}
        />
        <div className={styles.editorActions}>
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
            {i18n("Sort")}
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
      <ScrollableArea
        className={styles["deck-zone"]}
        hostClassName={styles.scrollHost}
      >
        {(["main", "extra", "side"] as const).map((type) => (
          <DeckZone
            key={type}
            type={type}
            cards={[...snapEditDeck[type]]}
            canAdd={editDeckStore.canAdd}
            onChange={(card, source, destination) => {
              editDeckStore.add(destination, card);
              if (source !== "search") {
                editDeckStore.remove(source, card);
              }
            }}
            onElementMouseUp={(event) => handleMouseUp(type, event)}
            onDoubleClick={(card) => {
              if (editDeckStore.canAdd(card, type, "search").result) {
                editDeckStore.add(type, card);
              }
            }}
            onMoveCard={(card, source) => handleSwitchCard(source, card)}
            onRemoveCard={(card, source) => editDeckStore.remove(source, card)}
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
