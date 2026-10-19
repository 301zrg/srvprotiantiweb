import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import type { PracticeConfig, PracticeFrame } from "@/practice/engine";
import type { PracticeAnswer, PracticeRequest } from "@/practice/prompts";
import { settingStore } from "@/stores/settingStore";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { ReplayAudio } from "../Replay/audio";
import { type SceneFrame, sceneSteps, seedScene } from "../Replay/scene";

/** Owns one local Core session. It never accesses online stores or transport. */
export function usePracticeSession(language: string) {
  const words = previewMessages(language);
  const audioSetting = useSnapshot(settingStore).audio;
  const [frame, setFrame] = useState<PracticeFrame>();
  const [scene, setScene] = useState<SceneFrame>();
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<Worker>();
  const generation = useRef(0);
  const pending = useRef<PracticeRequest>();
  const retryConfig = useRef<PracticeConfig>();
  const currentScene = useRef<SceneFrame>();
  const currentFrame = useRef<PracticeFrame>();
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
      setFrame(undefined);
      setScene(undefined);
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
      local.onmessage = ({ data }) => {
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
        currentFrame.current = incoming;
        pending.current = incoming.pending;
        setFrame(incoming);
        setBusy(false);
        setResponding(false);
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
              arm(15000);
              local.postMessage({ type: "next" });
            },
            incoming.events.length ? 90 : 0,
          );
      };
      arm(120000);
      local.postMessage({
        type: "open",
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
      id: request.id,
      player: request.player,
      answer: value,
    });
    return true;
  };
  return {
    frame,
    scene,
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
