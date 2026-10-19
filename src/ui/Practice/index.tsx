import "./style.css";

import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Select,
  Spin,
} from "antd";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { fetchCard, fetchStrings, getCardImgUrl, Region } from "@/api";
import { type PracticeConfig, type PracticeFrame } from "@/practice/engine";
import type { PracticeAnswer, PracticeRequest } from "@/practice/prompts";
import { createPracticeSeed, getPracticeDeck } from "@/practice/session";
import type { ReplayCard } from "@/replay/messages";
import { deckStore, type IDeck } from "@/stores/deckStore";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { ReplayAudio } from "../Replay/audio";
import { positionLabel } from "../Replay/cardState";
import { FieldBoard } from "../Replay/FieldBoard";
import { type SceneFrame, sceneSteps, seedScene } from "../Replay/scene";
import { PracticeChoices } from "./Choices";

export { setPracticeDeck } from "@/practice/session";

const cloneDeck = (deck: {
  deckName: string;
  main: readonly number[];
  extra: readonly number[];
  side: readonly number[];
}): IDeck => ({
  deckName: deck.deckName,
  main: [...deck.main],
  extra: [...deck.extra],
  side: [...deck.side],
});
const phaseLabel = (phase: number) =>
  (
    ({
      1: "DP",
      2: "SP",
      4: "MP1",
      8: "BP",
      16: "BP",
      32: "BP",
      64: "BP",
      128: "BP",
      256: "MP2",
      512: "EP",
    }) as Record<number, string>
  )[phase] || String(phase);

export function Component() {
  const { language } = useI18N();
  const words = previewMessages(language);
  const { t } = useTranslation("ClientUI");
  const navigate = useNavigate();
  const decks = useSnapshot(deckStore).decks;
  const audioSetting = useSnapshot(settingStore).audio;
  const [draft] = useState(getPracticeDeck);
  const [deckA, setDeckA] = useState(draft ? "draft" : "local:0");
  const [deckB, setDeckB] = useState(draft ? "draft" : "local:0");
  const [hand, setHand] = useState(5);
  const [noShuffle, setNoShuffle] = useState(false);
  const [frame, setFrame] = useState<PracticeFrame>();
  const [scene, setScene] = useState<SceneFrame>();
  const [view, setView] = useState(0);
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const [inspected, setInspected] = useState<ReplayCard>();
  const worker = useRef<Worker>();
  const page = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const pending = useRef<PracticeRequest>();
  const retryConfig = useRef<PracticeConfig>();
  const currentScene = useRef<SceneFrame>();
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const next = useRef<ReturnType<typeof setTimeout>>();
  const audio = useRef<ReplayAudio>();
  if (!audio.current) audio.current = new ReplayAudio();

  const stop = useCallback(() => {
    generation.current++;
    pending.current = undefined;
    clearTimeout(timeout.current);
    clearTimeout(next.current);
    worker.current?.terminate();
    worker.current = undefined;
    audio.current?.stop();
  }, []);
  useEffect(
    () => () => {
      stop();
      audio.current?.dispose();
    },
    [stop],
  );
  useEffect(() => {
    audio.current?.configure(
      !!audioSetting.enableSoundEffects,
      audioSetting.soundEffectsVolume ?? 0.7,
    );
  }, [audioSetting.enableSoundEffects, audioSetting.soundEffectsVolume]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) audio.current?.stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useLayoutEffect(() => {
    if (
      !frame?.pending ||
      (window.innerWidth >= 1024 && window.innerHeight >= 600)
    )
      return;
    const host = page.current;
    const choices = host?.querySelector<HTMLElement>(".practice-choices");
    if (host && choices)
      host.scrollTop +=
        choices.getBoundingClientRect().top -
        host.getBoundingClientRect().top -
        8;
  }, [frame?.pending?.id]);

  const selectedDeck = (id: string) =>
    id === "draft" ? draft : decks[Number(id.slice(6))];
  const options = [
    ...(draft
      ? [{ value: "draft", label: draft.deckName || words.deckA }]
      : []),
    ...decks.map((deck, i) => ({ value: `local:${i}`, label: deck.deckName })),
  ];
  const fail = (reason: string) => {
    stop();
    setBusy(false);
    setResponding(false);
    setError(previewFormat(words.practiceStopped, { reason }));
  };
  const armTimeout = (millis: number) => {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => fail(words.practiceLoadFailed), millis);
  };
  const start = (retry = false) => {
    const a = selectedDeck(deckA),
      b = selectedDeck(deckB);
    if (!retry && (!a || !b)) return;
    const config = retry
      ? retryConfig.current
      : {
          decks: [cloneDeck(a!), cloneDeck(b!)] as [IDeck, IDeck],
          seed: createPracticeSeed(),
          hand,
          noShuffle,
          rules: practiceProfile.rules,
        };
    if (!config) return;
    audio.current?.unlock();
    stop();
    retryConfig.current = structuredClone(config);
    setFrame(undefined);
    setScene(undefined);
    currentScene.current = undefined;
    setError("");
    setBusy(true);
    setResponding(false);
    setInspected(undefined);
    setView(0);
    const epoch = generation.current;
    const local = new Worker(
      new URL("../../practice/worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = local;
    local.onerror = () => {
      if (epoch === generation.current) fail(words.practiceLoadFailed);
    };
    local.onmessage = ({ data }) => {
      if (epoch !== generation.current) return;
      if (data.type === "error") {
        fail(data.text);
        return;
      }
      if (data.type === "rejected") {
        setResponding(false);
        return;
      }
      if (data.type !== "frame") return;
      clearTimeout(timeout.current);
      const incoming = data.frame as PracticeFrame;
      pending.current = incoming.pending;
      setFrame(incoming);
      setBusy(false);
      setResponding(false);
      if (incoming.pending) setView(incoming.pending.player);
      let nextScene = seedScene(incoming, currentScene.current);
      if (currentScene.current) {
        const steps = sceneSteps(currentScene.current, incoming);
        for (const step of steps)
          if (step.action) audio.current?.play(step.action, 1);
        nextScene = steps.at(-1) || nextScene;
      }
      currentScene.current = nextScene;
      setScene(nextScene);
      if (!incoming.pending)
        next.current = setTimeout(
          () => {
            if (epoch !== generation.current) return;
            armTimeout(15000);
            local.postMessage({ type: "next" });
          },
          incoming.events.length ? 90 : 0,
        );
    };
    armTimeout(120000);
    local.postMessage({
      type: "open",
      base: new URL(
        `${import.meta.env.BASE_URL}replay/${practiceProfile.revision}/`,
        window.location.origin,
      ).href,
      config,
    });
  };
  const answer = (request: PracticeRequest, value: PracticeAnswer) => {
    // Object identity also guards a destroyed Worker's reused numeric request id.
    if (pending.current !== request || !worker.current || responding) return;
    audio.current?.unlock();
    pending.current = undefined;
    setResponding(true);
    armTimeout(15000);
    worker.current.postMessage({
      type: "respond",
      id: request.id,
      player: request.player,
      answer: value,
    });
  };
  const text = Array.from({ length: 25 }, () => "");
  [1001, 1002, 1003, 1000, 1006, 1004, 1005].forEach((id, i) => {
    text[16 + i] = fetchStrings(Region.System, id);
  });
  const card = inspected && fetchCard(inspected.code);
  return (
    <main
      ref={page}
      className="practice-page replay-player"
      data-testid="practice-page"
    >
      <header className="practice-header">
        <h1>{words.practice}</h1>
        <Button
          onClick={() => {
            stop();
            navigate("/build");
          }}
        >
          {words.returnEditor}
        </Button>
      </header>
      <p>{words.practiceRules}</p>
      <p>{words.practiceHelp}</p>
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
          onChange={(e) => setNoShuffle(e.target.checked)}
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
          onClick={() => start()}
        >
          {words.startPractice}
        </Button>
      </div>
      <div className="practice-toolbar">
        <Button
          data-testid="practice-redeal"
          disabled={!retryConfig.current}
          onClick={() => start()}
        >
          {words.redeal}
        </Button>
        <Button
          data-testid="practice-retry"
          disabled={!retryConfig.current}
          onClick={() => start(true)}
        >
          {words.retryHand}
        </Button>
        <Button disabled={!frame} onClick={() => setView((old) => 1 - old)}>
          {words.switchView}
        </Button>
        <Button
          aria-pressed={!!audioSetting.enableSoundEffects}
          onClick={() => {
            const enabled = !settingStore.audio.enableSoundEffects;
            settingStore.saveAudioConfig({ enableSoundEffects: enabled });
            audio.current?.configure(
              enabled,
              settingStore.audio.soundEffectsVolume ?? 0.7,
            );
            if (enabled) audio.current?.unlock();
          }}
        >
          {audioSetting.enableSoundEffects ? words.soundOn : words.soundOff}
        </Button>
      </div>
      {busy && (
        <div className="practice-loading" role="status">
          <Spin />
          <span>{words.practiceLoading}</span>
        </div>
      )}
      {error && <Alert type="error" message={error} showIcon />}
      {frame && (
        <p
          className="practice-state"
          data-testid="practice-state"
          data-turn={frame.turn}
          data-lp-a={frame.lp[0]}
          data-lp-b={frame.lp[1]}
        >
          {previewFormat(words.turnStatus, {
            turn: frame.turn,
            player: frame.turnPlayer === 0 ? "A" : "B",
            phase: phaseLabel(frame.phase),
          })}{" "}
          · A {frame.lp[0]} LP · B {frame.lp[1]} LP
        </p>
      )}
      <div className="practice-game">
        {frame?.pending && !error && (
          <PracticeChoices
            key={`${generation.current}:${frame.pending.id}`}
            request={frame.pending}
            language={language}
            disabled={responding}
            onAnswer={answer}
          />
        )}
        {scene && (
          <div className="practice-board">
            <FieldBoard
              frame={scene}
              view={view}
              reveal
              language={language}
              text={text}
              onInspect={setInspected}
              onPause={() => {}}
            />
          </div>
        )}
      </div>
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
}
