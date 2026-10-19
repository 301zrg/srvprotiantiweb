import "./style.css";

import { SettingOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Modal,
  Select,
  Spin,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { fetchCard, fetchStrings, getCardImgUrl, Region } from "@/api";
import type { PracticeConfig } from "@/practice/engine";
import { practicePhaseChoices } from "@/practice/interactions";
import {
  encodePracticeAnswer,
  type PracticeChoice,
  type PracticeRequest,
} from "@/practice/prompts";
import { createPracticeSeed, getPracticeDeck } from "@/practice/session";
import type { ReplayCard } from "@/replay/messages";
import { deckStore } from "@/stores/deckStore";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { openSettingPanel } from "@/ui/Setting";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { duelInteractionMessages } from "@/variant/duelInteraction";
import { corePhaseKey } from "@/variant/duelPhases";
import { mobileMessages } from "@/variant/mobileMessages";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { PhaseBar } from "../Duel/PhaseBar";
import { positionLabel } from "../Replay/cardState";
import { PracticeBoard } from "./Board";
import { PracticeChoices } from "./Choices";
import { usePracticeSession } from "./usePracticeSession";
export { setPracticeDeck } from "@/practice/session";

export const Component = () => {
  const { language } = useI18N();
  const words = previewMessages(language);
  const revision = clientRevisionMessages(language);
  const interaction = duelInteractionMessages(language);
  const { t } = useTranslation("ClientUI");
  const navigate = useNavigate();
  const decks = useSnapshot(deckStore).decks;
  const [draft] = useState(getPracticeDeck);
  const [deckA, setDeckA] = useState(draft ? "draft" : "local:0");
  const [deckB, setDeckB] = useState(draft ? "draft" : "local:0");
  const [hand, setHand] = useState(5);
  const [noShuffle, setNoShuffle] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [inspected, setInspected] = useState<ReplayCard>();
  const [confirmation, setConfirmation] = useState<{
    request: PracticeRequest;
    choice: PracticeChoice;
    label: string;
  }>();
  const autoStarted = useRef(false);
  const session = usePracticeSession(language);
  const {
    frame,
    scene,
    busy,
    responding,
    error,
    start,
    stop,
    answer,
    retryConfig,
  } = session;
  const request = frame?.pending;
  const selectedDeck = (id: string) =>
    id === "draft" ? draft : decks[Number(id.slice(6))];
  const options = [
    ...(draft
      ? [{ value: "draft", label: draft.deckName || words.deckA }]
      : []),
    ...decks.map((deck, i) => ({ value: `local:${i}`, label: deck.deckName })),
  ];
  const config = (): PracticeConfig | undefined => {
    const a = selectedDeck(deckA),
      b = selectedDeck(deckB);
    if (!a?.main.length || !b?.main.length) return;
    const clone = (d: typeof a) => ({
      deckName: d.deckName,
      main: [...d.main],
      extra: [...d.extra],
      side: [...d.side],
    });
    return {
      decks: [clone(a), clone(b)],
      seed: createPracticeSeed(),
      hand,
      noShuffle,
      rules: practiceProfile.rules,
    };
  };
  const begin = (retry = false) => {
    const next = retry ? retryConfig.current : config();
    if (!next) {
      setSetupOpen(true);
      return;
    }
    setSetupOpen(false);
    setInspected(undefined);
    start(next);
  };
  useEffect(() => {
    if (
      autoStarted.current ||
      !selectedDeck(deckA)?.main.length ||
      !selectedDeck(deckB)?.main.length
    )
      return;
    autoStarted.current = true;
    begin();
    // Only first entry starts automatically; later option changes require Start.
  }, [decks, draft, deckA, deckB]);
  useEffect(() => {
    setSelected([]);
    setConfirmation(undefined);
    setPromptOpen(
      !!request &&
        ![
          "idle",
          "battle",
          "chain",
          "place",
          "cards",
          "tribute",
          "sum",
          "unselect",
          "sort",
        ].includes(request.kind),
    );
  }, [request?.id, session.generation]);
  const choose = (choice: PracticeChoice, label = "") => {
    if (!request || responding) return;
    if (
      settingStore.confirmOperations &&
      ["idle", "battle"].includes(request.kind)
    )
      setConfirmation({ request, choice, label });
    else answer(request, choice.value!);
  };
  const toggle = (choice: PracticeChoice) => {
    if (!request || responding) return;
    if (
      (request.kind === "place" && request.min === 1) ||
      request.kind === "unselect"
    ) {
      answer(request, [choice.index]);
      return;
    }
    setSelected((old) =>
      old.includes(choice.index)
        ? old.filter((i) => i !== choice.index)
        : [...old, choice.index],
    );
  };
  const selection =
    request &&
    ["cards", "tribute", "sum", "place", "unselect", "sort"].includes(
      request.kind,
    );
  const phaseChoices = practicePhaseChoices(
    responding || error ? undefined : request,
  );
  const currentPhase = corePhaseKey(frame?.phase ?? 0);
  const card = inspected && fetchCard(inspected.code);
  return (
    <main className="practice-session" data-testid="practice-page">
      {scene && (
        <PracticeBoard
          frame={scene}
          request={request}
          language={language}
          disabled={responding || !!error}
          selected={selected}
          onToggle={toggle}
          onChoose={choose}
          onInspect={setInspected}
        />
      )}
      <aside className="practice-session-rail">
        <header className="practice-session-title">
          <h1>{words.practice}</h1>
          <Button
            icon={<SettingOutlined />}
            data-testid="practice-settings"
            aria-label={mobileMessages(language).settings}
            onClick={() => openSettingPanel({ defaultKey: "operations" })}
          />
        </header>
        <PhaseBar
          current={currentPhase}
          turnOwner={frame?.turnPlayer === 1 ? "opponent" : "self"}
          actions={Object.fromEntries(
            Object.entries(phaseChoices).map(([phase, choice]) => [
              phase,
              () => choose(choice!, phase.toUpperCase()),
            ]),
          )}
        />
        {frame && (
          <div
            className="practice-session-state"
            data-testid="practice-state"
            data-turn={frame.turn}
            data-lp-a={frame.lp[0]}
            data-lp-b={frame.lp[1]}
          >
            {previewFormat(words.turnStatus, {
              turn: frame.turn,
              player: frame.turnPlayer === 0 ? "A" : "B",
              phase: currentPhase?.toUpperCase() || "",
            })}
            {request && (
              <strong data-testid="practice-active-player">
                {previewFormat(words.activeSide, {
                  player: request.player === 0 ? "A" : "B",
                })}
              </strong>
            )}
          </div>
        )}
        <div className="practice-session-controls">
          <Button
            data-testid="practice-setup"
            onClick={() => setSetupOpen(true)}
          >
            {revision.practiceSetup}
          </Button>
          <Button
            data-testid="practice-retry"
            disabled={!retryConfig.current}
            onClick={() => begin(true)}
          >
            {words.retryHand}
          </Button>
          <Button
            data-testid="practice-redeal"
            disabled={!retryConfig.current}
            onClick={() => begin()}
          >
            {words.redeal}
          </Button>
          <Button
            onClick={() => {
              stop();
              navigate("/build");
            }}
          >
            {words.returnEditor}
          </Button>
        </div>
        {busy && (
          <div className="practice-loading" role="status">
            <Spin />
            <span>{words.practiceLoading}</span>
          </div>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        {request && !error && (
          <div className="practice-response-tools">
            {!["idle", "battle"].includes(request.kind) && (
              <Button
                data-testid="practice-open-prompt"
                onClick={() => setPromptOpen(true)}
              >
                {words.operations}
              </Button>
            )}
            {request.kind === "chain" && request.cancelable && (
              <Button
                data-testid="practice-cancel"
                disabled={responding}
                onClick={() => answer(request, -1)}
              >
                {fetchStrings(Region.System, 1214)}
              </Button>
            )}
            {selection && (
              <>
                <span>
                  {selected.length} / {request.min}–{request.max || "∞"}
                </span>
                <Button
                  data-testid="practice-board-confirm"
                  disabled={
                    responding || !encodePracticeAnswer(request, selected)
                  }
                  onClick={() => answer(request, selected)}
                >
                  {t("Confirm")}
                </Button>
                <Button onClick={() => setSelected([])}>
                  {interaction.reset}
                </Button>
                {request.cancelable && (
                  <Button onClick={() => answer(request, -1)}>
                    {t("Cancel")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </aside>
      <Modal
        open={setupOpen}
        onCancel={() => setSetupOpen(false)}
        title={revision.practiceSetup}
        centered
        footer={null}
        width={680}
      >
        <p>{words.practiceRules}</p>
        <p>{revision.practiceHelp}</p>
        <div className="practice-setup">
          <label>
            <span>{words.deckA}</span>
            <Select
              aria-label={words.deckA}
              value={deckA}
              options={options}
              onChange={setDeckA}
            />
          </label>
          <label>
            <span>{words.deckB}</span>
            <Select
              aria-label={words.deckB}
              value={deckB}
              options={options}
              onChange={setDeckB}
            />
          </label>
          <label>
            <span>{words.startingHand}</span>
            <InputNumber
              aria-label={words.startingHand}
              min={0}
              max={60}
              value={hand}
              onChange={(n) => setHand(n ?? 5)}
            />
          </label>
          <Checkbox
            checked={noShuffle}
            onChange={(event) => setNoShuffle(event.target.checked)}
          >
            {words.noShuffle}
          </Checkbox>
          <Button
            type="primary"
            data-testid="practice-start"
            disabled={
              !selectedDeck(deckA)?.main.length ||
              !selectedDeck(deckB)?.main.length
            }
            onClick={() => begin()}
          >
            {words.startPractice}
          </Button>
        </div>
      </Modal>
      <Modal
        open={promptOpen && !!request && !error}
        onCancel={() => setPromptOpen(false)}
        centered
        width={720}
        footer={null}
        title={words.operations}
        destroyOnClose
      >
        {request && (
          <PracticeChoices
            key={`${session.generation}:${request.id}`}
            request={request}
            language={language}
            disabled={responding}
            selected={selected}
            onSelectedChange={setSelected}
            onAnswer={(pending, value) => {
              answer(pending, value);
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!confirmation}
        title={interaction.title}
        centered
        zIndex={1300}
        onCancel={() => setConfirmation(undefined)}
        footer={
          <>
            <Button
              data-testid="practice-action-cancel"
              onClick={() => setConfirmation(undefined)}
            >
              {interaction.cancel}
            </Button>
            <Button
              type="primary"
              data-testid="practice-action-confirm"
              onClick={() => {
                if (confirmation)
                  answer(confirmation.request, confirmation.choice.value!);
                setConfirmation(undefined);
              }}
            >
              {interaction.confirm}
            </Button>
          </>
        }
      >
        {confirmation?.label}
      </Modal>
      <Drawer
        open={!!inspected}
        title={card?.text.name || words.details}
        onClose={() => setInspected(undefined)}
        width={400}
      >
        {inspected && (
          <>
            <img
              className="practice-detail-image"
              src={getCardImgUrl(inspected.code)}
              alt={card?.text.name || ""}
            />
            <p>{positionLabel(inspected, language)}</p>
            <p>
              {inspected.attack}/{inspected.defense}
            </p>
            <p className="practice-description">{card?.text.desc}</p>
          </>
        )}
        <Button onClick={() => setInspected(undefined)}>{t("Confirm")}</Button>
      </Drawer>
    </main>
  );
};
