import { siteStorage } from "./deployment";

interface JoinForm {
  nickname: string;
  roomName: string;
}
let draft: JoinForm | undefined;

function saved(key: string) {
  try {
    return siteStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function readJoinForm(): JoinForm {
  return (draft ??= {
    nickname: saved("playerNickname"),
    roomName: saved("playerRoomName"),
  });
}

export function saveJoinForm(change: Partial<JoinForm>) {
  draft = { ...readJoinForm(), ...change };
  // Credentials stay in this tab's memory; cache only the public portions.
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
  for (const key of ["playerNickname", "playerRoomName"]) {
    try {
      siteStorage.removeItem(key);
    } catch {}
  }
}
