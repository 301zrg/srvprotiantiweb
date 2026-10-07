export const websiteObserverNickname = "observer from web";

export interface RoomLink {
  room: string;
  nickname?: string;
  spectate: boolean;
  invalid: boolean;
}

/** Query strings carry public room names, never account or room credentials. */
export function readRoomLink(params: URLSearchParams): RoomLink | undefined {
  if (!params.has("room") && !params.has("spectate")) return;
  const room = params.get("room") ?? "";
  const nickname = params.get("nickname") ?? undefined;
  const mode = params.get("spectate");
  return {
    room,
    nickname,
    spectate: mode === "1",
    invalid:
      (mode !== null && mode !== "0" && mode !== "1") ||
      room.includes("$") ||
      !!nickname?.includes("$"),
  };
}

/** Also accept ?room=... on static index URLs, including subdirectory hosts. */
export function normalizeRoomLink(url: URL): URL | undefined {
  const outer = url.searchParams;
  if (!outer.has("room") && !outer.has("spectate")) return;
  const hash = url.hash.slice(1);
  const queryIndex = hash.indexOf("?");
  const route = queryIndex < 0 ? hash : hash.slice(0, queryIndex);
  const search = queryIndex < 0 ? "" : hash.slice(queryIndex + 1);
  if (route && route !== "/" && route !== "/match") return;
  const params = new URLSearchParams(search);
  for (const key of ["room", "spectate", "nickname"]) {
    if (!params.has(key) && outer.has(key)) params.set(key, outer.get(key)!);
    outer.delete(key);
  }
  url.hash = `/match?${params}`;
  return url;
}

export function isRoomCommand(room: string): boolean {
  return (
    /^(TT|S|M|T|R|W|IP|RC)$/i.test(room.trim()) ||
    /^(AI|R#|(?:RECOVER|RC)\d)/i.test(room.trim())
  );
}
