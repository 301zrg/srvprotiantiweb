import { ygopro } from "@/api/ocgcore/idl/ocgcore";
import type { WebSocketStream } from "@/infra";

export type ResumeKind = "player" | "observer" | "waiting";
interface Resume {
  kind: ResumeKind;
  offered: boolean;
  joined: boolean;
  sent: boolean;
  fieldExpected: boolean;
  fieldReceived: boolean;
  timers: Set<number>;
  deck?: Uint8Array;
  complete: (ok: boolean) => void;
}
const resumes = new WeakMap<WebSocketStream, Resume>();
// SRVPro's explicit pre-reconnect notice is sent before JOIN_GAME. A normal
// join must never be readied by an automatic recovery, especially an expired TT.
const offers = new Set([
  "You will be reconnected to your previous game. Please pick your previous deck.",
  "你有未完成的对局，即将重新连接，请选择你在本局决斗中使用的卡组并准备。",
  "이전 게임에 다시 연결됩니다. 이전 덱을 선택하십시오.",
  "これから先程のゲームに再接続します。 前回のデッキを選択して下さい。",
]);

export function prepareConnectionResume(
  conn: WebSocketStream,
  kind: ResumeKind,
  complete: (ok: boolean) => void,
  fieldExpected = true,
) {
  conn.resuming = true;
  resumes.set(conn, {
    kind,
    offered: false,
    joined: false,
    sent: false,
    fieldExpected,
    fieldReceived: false,
    timers: new Set(),
    deck: conn.initialDeckPayload?.slice(),
    complete,
  });
}

export function finishConnectionResume(conn: WebSocketStream, ok: boolean) {
  const resume = resumes.get(conn);
  if (!resume) return;
  resumes.delete(conn);
  conn.resuming = false;
  resume.complete(ok);
}

export function checkConnectionResume(
  conn: WebSocketStream,
  pb: ygopro.YgoStocMsg,
) {
  const resume = resumes.get(conn);
  if (!resume) return;
  if (pb.msg === "stoc_chat" && pb.stoc_chat.player >= 8) {
    const text = pb.stoc_chat.msg
      .replace(/\0+$/, "")
      .trim()
      .replace(/^\[Server\]:\s*/u, "")
      .replace(/\s+/gu, " ");
    if (offers.has(text)) resume.offered = true;
  }
  if (pb.msg === "stoc_join_game") resume.joined = true;
  if (
    resume.kind === "player" &&
    resume.offered &&
    resume.joined &&
    !resume.sent &&
    resume.deck
  ) {
    resume.sent = true;
    conn.ws.send(resume.deck);
  }
  if (pb.msg === "stoc_type_change" && resume.joined) {
    if (
      resume.kind === "observer" &&
      pb.stoc_type_change.self_type === ygopro.StocTypeChange.SelfType.OBSERVER
    )
      finishConnectionResume(conn, true);
    else if (resume.kind === "waiting") finishConnectionResume(conn, true);
  }
  if (
    resume.kind === "player" &&
    resume.sent &&
    ["stoc_select_hand", "stoc_select_tp", "stoc_change_side"].includes(pb.msg)
  )
    finishConnectionResume(conn, true);
  if (resume.kind === "player" && resume.sent) {
    if (!resume.fieldExpected && pb.msg === "stoc_duel_start")
      finishConnectionResume(conn, true);
    if (
      pb.msg === "stoc_game_msg" &&
      pb.stoc_game_msg.gameMsg === "reload_field"
    )
      resume.fieldReceived = true;
    // SRVPro consumes FIELD_FINISH internally. RequestField sends both timers
    // after every zone query, so these confirm that the snapshot was applied.
    if (resume.fieldReceived && pb.msg === "stoc_time_limit") {
      resume.timers.add(pb.stoc_time_limit.player);
      if (resume.timers.size === 2) finishConnectionResume(conn, true);
    }
  }
  if (["stoc_error_msg", "stoc_duel_end"].includes(pb.msg))
    finishConnectionResume(conn, false);
}

export function finishFieldResume(conn: WebSocketStream) {
  const resume = resumes.get(conn);
  if (resume?.kind === "player" && resume.sent)
    finishConnectionResume(conn, true);
}
