import { isRoomCommand } from "./roomLink";

export const webEntryIntents = [
  "regular",
  "ladder",
  "deck-editor",
  "replay-list",
  "spectate",
] as const;
export type WebEntryIntent = (typeof webEntryIntents)[number];
export interface WebEntry {
  intent: WebEntryIntent;
  room?: string;
  autojoin: boolean;
  nickname?: string;
}
export interface WebEntryRequest {
  entry: WebEntry;
  bridge?: { origin: string; request: string };
}
export type WebEntryError = "invalid-link" | "bridge-unavailable";

const privateKeys = [
  "username",
  "password",
  "account",
  "player",
  "nickname",
  "passwd",
  "token",
];
const entryKeys = [
  "v",
  "intent",
  "room",
  "spectate",
  "autojoin",
  "bridge",
  "origin",
  "request",
  ...privateKeys,
];

export function validEntryNickname(value: string): boolean {
  const parts = value.split("$");
  return (
    !!value.trim() &&
    value.length <= 19 &&
    !/[\0\r\n\\]/.test(value) &&
    parts.length <= 2 &&
    parts.every(Boolean)
  );
}

export function webEntryRoute(intent: WebEntryIntent) {
  if (intent === "deck-editor") return "/build";
  if (intent === "replay-list") return "/replays";
  return "/match";
}

/** Only claim explicit entry links; preserve unrelated hash routes and base paths. */
export function readWebEntry(
  url: URL,
): { url: URL; request?: WebEntryRequest; error?: WebEntryError } | undefined {
  const [route, hashQuery = ""] = url.hash.slice(1).split("?", 2);
  const outer = url.searchParams;
  if (route !== "/entry" && (!outer.has("intent") || (route && route !== "/")))
    return;
  const hash = new URLSearchParams(hashQuery);
  const params = new URLSearchParams();
  let invalid = url.href.length > 4096;
  for (const key of entryKeys) {
    const values = [...outer.getAll(key), ...hash.getAll(key)];
    if (values.length > 1) invalid = true;
    if (values.length) params.set(key, values[0]);
    outer.delete(key);
  }
  // Keep language and unrelated outer parameters, but consume all entry inputs.
  url.hash = "/entry";
  const intent = params.get("intent") as WebEntryIntent;
  const room = params.get("room") ?? undefined;
  const autojoin = params.get("autojoin");
  const bridge = params.get("bridge");
  invalid ||=
    !webEntryIntents.includes(intent) ||
    (params.has("v") && params.get("v") !== "1") ||
    (autojoin !== null && autojoin !== "0" && autojoin !== "1") ||
    (bridge !== null && bridge !== "1") ||
    privateKeys.some((key) => params.has(key)) ||
    (room !== undefined &&
      (!room.trim() || room.length > 19 || /[\0\r\n$]/.test(room))) ||
    (intent === "spectate" && (!room || isRoomCommand(room))) ||
    (bridge === null && (params.has("origin") || params.has("request")));
  if (invalid) return { url, error: "invalid-link" };
  return {
    url,
    request: {
      entry: { intent, room, autojoin: autojoin !== "0" },
      bridge:
        bridge === "1"
          ? {
              origin: params.get("origin") ?? "",
              request: params.get("request") ?? "",
            }
          : undefined,
    },
  };
}

export function entryNickname(credentials: unknown): string | undefined {
  if (credentials === undefined) return;
  if (!credentials || typeof credentials !== "object")
    throw new Error("invalid-link");
  const { username, password } = credentials as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password ||
    username.includes("$") ||
    password.includes("$")
  )
    throw new Error("invalid-link");
  const nickname = `${username}$${password}`;
  if (!validEntryNickname(nickname)) throw new Error("invalid-link");
  return nickname;
}
