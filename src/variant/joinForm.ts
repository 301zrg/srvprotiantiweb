import { siteStorage, storageKey } from "./deployment";

interface JoinForm {
  nickname: string;
  roomName: string;
}
let draft: JoinForm | undefined;
const SESSION_KEY = storageKey("joinFormDraft");

function savedDraft(): JoinForm | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
    if (
      value &&
      typeof value.nickname === "string" &&
      typeof value.roomName === "string"
    )
      return { nickname: value.nickname, roomName: value.roomName };
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
  return (draft ??= savedDraft() ?? {
    nickname: saved("playerNickname") ?? "",
    roomName: saved("playerRoomName") ?? "TT",
  });
}

export function saveJoinForm(change: Partial<JoinForm>) {
  draft = { ...readJoinForm(), ...change };
  saveDraft(draft);
  // The shared persistent cache keeps public portions; full inputs belong to
  // this tab so another player's edits do not overwrite its credentials.
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
  draft = { nickname: "", roomName: "" };
  saveDraft(draft);
  for (const key of ["playerNickname", "playerRoomName"]) {
    try {
      // Remember an intentional reset so refreshing after spectating stays empty.
      if (key === "playerRoomName") siteStorage.setItem(key, "");
      else siteStorage.removeItem(key);
    } catch {}
  }
}
