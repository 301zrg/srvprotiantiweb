import { siteStorage, storageKey } from "./deployment";

interface JoinForm {
  nickname: string;
  roomName: string;
}
let draft: JoinForm | undefined;
const SESSION_KEY = storageKey("joinFormDraft");
const SAVED_KEY = "joinFormSaved";

function parseForm(raw: string | null): JoinForm | undefined {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      value &&
      typeof value.nickname === "string" &&
      typeof value.roomName === "string"
    )
      return { nickname: value.nickname, roomName: value.roomName };
  } catch {}
}

function savedDraft(): JoinForm | undefined {
  try {
    return parseForm(sessionStorage.getItem(SESSION_KEY));
  } catch {}
}

function saveDraft(value: JoinForm) {
  try {
    // Keep the exact form, including passwords, across reloads of this tab.
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {}
}

function saved(key: string) {
  try {
    return siteStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readJoinForm(): JoinForm {
  if (draft) return draft;
  const tab = savedDraft();
  const browser = parseForm(saved(SAVED_KEY));
  draft = tab ??
    browser ?? {
      nickname: saved("playerNickname") ?? "",
      roomName: saved("playerRoomName") ?? "TT",
    };
  // Migrate complete pre-update tab inputs once, without overwriting newer
  // ordinary input saved by another tab. Spectator forms never call save.
  if (tab && !browser) saveBrowserDraft(tab);
  return draft;
}

function saveBrowserDraft(value: JoinForm) {
  try {
    siteStorage.setItem(SAVED_KEY, JSON.stringify({ version: 1, ...value }));
  } catch {}
}

export function saveJoinForm(change: Partial<JoinForm>) {
  draft = { ...readJoinForm(), ...change };
  saveDraft(draft);
  saveBrowserDraft(draft);
  // Keep legacy public-only fields for compatibility; complete input now has
  // an explicitly separate durable record, as requested by the user.
  for (const [field, key] of [
    ["nickname", "playerNickname"],
    ["roomName", "playerRoomName"],
  ] as const) {
    try {
      siteStorage.setItem(key, draft[field].split("$")[0]);
    } catch {}
  }
}

export function clearJoinForm() {
  saveJoinForm({ nickname: "", roomName: "" });
}
