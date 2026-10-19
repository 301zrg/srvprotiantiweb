import assert from "node:assert/strict";
import { chatPresentation } from "../src/ui/Duel/Message/HintNotification/presentation.ts";

for (const [mode, portrait, server, want] of [
  ["auto", true, true, "summary"],
  ["auto", false, true, "popup"],
  ["record", true, true, "record"],
  ["record", false, true, "record"],
  ["popup", true, true, "popup"],
  ["popup", false, true, "popup"],
  ["record", true, false, "popup"],
]) assert.equal(chatPresentation(mode, portrait, server), want, `${mode}, portrait=${portrait}, server=${server}`);
console.log("Chat presentation: adaptive portrait summary, desktop popup, explicit popup, record-only and player chat passed.");
