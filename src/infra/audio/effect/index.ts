import { subscribe } from "valtio";

import { settingStore } from "@/stores/settingStore";

import { audioContextManger } from "../core/manager";
import { AudioActionType } from "../type";

subscribe(
  settingStore,
  () => {
    if (!settingStore.audio.enableSoundEffects)
      audioContextManger.stopEffects();
    else
      audioContextManger.updateEffectsVolume(
        settingStore.audio.soundEffectsVolume,
      );
  },
  true,
);

export function playEffect(effect: AudioActionType) {
  if (!settingStore.audio.enableSoundEffects) return;
  return audioContextManger.playEffect(
    effect,
    settingStore.audio.soundEffectsVolume,
  );
}
