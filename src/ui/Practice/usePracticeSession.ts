import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { passPracticeChain } from "@/practice/chain";
import type { PracticeConfig, PracticeFrame } from "@/practice/engine";
import {
  type PracticeAnswer,
  practiceHintResults,
  type PracticeRequest,
} from "@/practice/prompts";
import { settingStore } from "@/stores/settingStore";
import { duelResultSource } from "@/variant/duelResults";
import { advanceCoreTiming, type DuelTiming } from "@/variant/duelTiming";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { ReplayAudio } from "../Replay/audio";
import type { PracticeSceneFrame } from "./materials";
import {
  advancePracticeScene,
  type PracticeHistoryEntry,
} from "./presentation";

/** Owns one local Core session. It never accesses online stores or transport. */
export function usePracticeSession(language: string) {
  const words = previewMessages(language);
  const audioSetting = useSnapshot(settingStore).audio;
  const chainSetting = useSnapshot(settingStore).chainSetting;
  const [frame, setFrame] = useState<PracticeFrame>();
  const [scene, setScene] = useState<PracticeSceneFrame>();
  const [history, setHistory] = useState<PracticeHistoryEntry[]>([]);
  const [timing, setTiming] = useState<DuelTiming>({});
  const [feedback, setFeedback] = useState<
    ReturnType<typeof practiceHintResults>
  >([]);
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<Worker>();
  const generation = useRef(0);
  const pending = useRef<PracticeRequest>();
  const retryConfig = useRef<PracticeConfig>();
  const currentScene = useRef<PracticeSceneFrame>();
  const currentFrame = useRef<PracticeFrame>();
  const currentTiming = useRef<DuelTiming>({});
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

  const start = useCallback(
    (config: PracticeConfig) => {
      audio.current?.unlock();
      stop();
      retryConfig.current = structuredClone(config);
      currentScene.current = undefined;
      currentFrame.current = undefined;
      currentTiming.current = {};
      setFrame(undefined);
      setScene(undefined);
      setHistory([]);
      setTiming({});
      setFeedback([]);
      setError("");
      setBusy(true);
      setResponding(false);
      const epoch = generation.current;
      const local = new Worker(
        new URL("../../practice/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = local;
      const fail = (reason: string) => {
        if (epoch !== generation.current) return;
        stop();
        setBusy(false);
        setResponding(false);
        setError(previewFormat(words.practiceStopped, { reason }));
      };
      const arm = (millis: number) => {
        clearTimeout(timeout.current);
        timeout.current = setTimeout(
          () => fail(words.practiceLoadFailed),
          millis,
        );
      };
      local.onerror = () => fail(words.practiceLoadFailed);
      local.onmessage = async ({ data }) => {
        if (epoch !== generation.current) return;
        if (data.type === "error") {
          fail(data.text);
          return;
        }
        if (data.type === "rejected") {
          clearTimeout(timeout.current);
          pending.current = currentFrame.current?.pending;
          setResponding(false);
          return;
        }
        if (data.type !== "frame") return;
        clearTimeout(timeout.current);
        const incoming = data.frame as PracticeFrame;
        const cards =
          currentScene.current?.cards ??
          currentFrame.current?.cards ??
          incoming.cards;
        currentTiming.current = advanceCoreTiming(
          currentTiming.current,
          incoming.events,
          (player, location, sequence) =>
            cards.find(
              (card) =>
                card.player === player &&
                card.location === location &&
                card.sequence === sequence,
            )?.code,
        );
        setTiming(currentTiming.current);
        currentFrame.current = incoming;
        const update = advancePracticeScene(incoming, currentScene.current);
        const nextScene = update.scene;
        for (const action of update.actions) audio.current?.play(action, 1);
        const results = practiceHintResults(incoming.events);
        if (results.length) setFeedback(results);
        const resultEntries: PracticeHistoryEntry[] = results.map(
          ({ player, result }) => ({
            action: {
              kind: "result",
              player,
              code:
                result.kind === "card"
                  ? result.value
                  : duelResultSource(result),
            },
            result,
            turn: incoming.turn,
            phase: incoming.phase,
          }),
        );
        if (update.entries.length || resultEntries.length)
          setHistory((old) =>
            [...old, ...update.entries, ...resultEntries].slice(-500),
          );
        currentScene.current = nextScene;
        if (update.animation.length) {
          pending.current = undefined;
          setResponding(true);
          for (const step of update.animation) {
            if (epoch !== generation.current) return;
            setScene(step);
            await new Promise((resolve) => setTimeout(resolve, 180));
          }
          if (epoch !== generation.current) return;
        }
        pending.current = incoming.pending;
        setFrame(incoming);
        setBusy(false);
        setResponding(false);
        setScene(nextScene);
        if (!incoming.pending)
          next.current = setTimeout(
            () => {
              if (epoch !== generation.current) return;
              arm(15000);
              local.postMessage({
                type: "next",
                chainMode: settingStore.chainSetting,
              });
            },
            incoming.events.length ? 90 : 0,
          );
      };
      arm(120000);
      local.postMessage({
        type: "open",
        chainMode: settingStore.chainSetting,
        base: new URL(
          `${import.meta.env.BASE_URL}replay/${practiceProfile.revision}/`,
          window.location.origin,
        ).href,
        config,
      });
    },
    [stop, words.practiceLoadFailed, words.practiceStopped],
  );
  const answer = (request: PracticeRequest, value: PracticeAnswer) => {
    if (pending.current !== request || !worker.current) return false;
    audio.current?.unlock();
    pending.current = undefined;
    setResponding(true);
    const epoch = generation.current;
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (epoch !== generation.current) return;
      stop();
      setBusy(false);
      setResponding(false);
      setError(words.practiceLoadFailed);
    }, 15000);
    worker.current.postMessage({
      type: "respond",
      chainMode: settingStore.chainSetting,
      id: request.id,
      player: request.player,
      answer: value,
    });
    return true;
  };
  useEffect(() => {
    if (frame?.pending && passPracticeChain(frame.pending, chainSetting))
      answer(frame.pending, -1);
  }, [frame?.pending, chainSetting]);
  return {
    frame,
    scene,
    history,
    timing,
    feedback,
    busy,
    responding,
    error,
    start,
    stop,
    answer,
    retryConfig,
    generation: generation.current,
  };
}
