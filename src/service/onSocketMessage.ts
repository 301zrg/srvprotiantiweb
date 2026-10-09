/*
 * 长连接消息事件订阅处理逻辑
 *
 * */
import { adaptStoc } from "@/api/ocgcore/ocgAdapter/adapter";
import { YgoProPacketFramer } from "@/api/ocgcore/ocgAdapter/packet";
import { Container } from "@/container";
import {
  checkConnectionResume,
  finishFieldResume,
} from "@/variant/connectionResume";

import handleGameMsg from "./duel/gameMsg";
import handleTimeLimit from "./duel/timeLimit";
import handleDeckCount from "./mora/deckCount";
import handleSelectHand from "./mora/selectHand";
import handleSelectTp from "./mora/selectTp";
import handleChat from "./room/chat";
import handleDuelEnd from "./room/duelEnd";
import handleDuelStart from "./room/duelStart";
import handleErrorMsg from "./room/errorMsg";
import handleHandResult from "./room/handResult";
import handleHsPlayerChange from "./room/hsPlayerChange";
import handleHsPlayerEnter from "./room/hsPlayerEnter";
import handleHsWatchChange from "./room/hsWatchChange";
import handleJoinGame from "./room/joinGame";
import handleTypeChange from "./room/typeChange";
import { handleChangeSide } from "./side/changeSide";
import { handleWaitingSide } from "./side/waitingSide";

/*
 * 先将从长连接中读取到的二进制数据通过Adapter转成protobuf结构体，
 * 然后再分发到各个处理函数中去处理。
 *
 * */

const connections = new WeakMap<
  Container,
  { animation: Promise<void>; framer: YgoProPacketFramer }
>();

export default async function handleSocketMessage(
  container: Container,
  e: MessageEvent,
) {
  // 确保按序执行
  let state = connections.get(container);
  if (!state) {
    state = { animation: Promise.resolve(), framer: new YgoProPacketFramer() };
    connections.set(container, state);
  }
  state.animation = state.animation.then(() =>
    _handle(container, e, state!.framer),
  );
  await state.animation;
}

// FIXME: 下面的所有`handler`中访问`Store`的时候都应该通过`Container`进行访问
async function _handle(
  container: Container,
  e: MessageEvent,
  framer: YgoProPacketFramer,
) {
  const packets = framer.push(e.data);
  container.conn.pendingPackets = packets.length;

  for (const packet of packets) {
    if (container.conn.cancelled) return;
    container.conn.pendingPackets--;
    if (packet.proto === 0x17) continue; // Independently saved at network arrival.
    if (packet.proto === 0x30) {
      // Only a complete server field snapshot confirms an in-duel recovery.
      finishFieldResume(container.conn);
      continue;
    }
    const pb = adaptStoc(packet);

    switch (pb.msg) {
      case "stoc_join_game": {
        container.conn.joinedRoom = true;
        handleJoinGame(container, pb);
        break;
      }
      case "stoc_chat": {
        handleChat(container, pb);
        break;
      }
      case "stoc_hs_player_change": {
        handleHsPlayerChange(container, pb);
        break;
      }
      case "stoc_hs_watch_change": {
        handleHsWatchChange(container, pb);
        break;
      }
      case "stoc_hs_player_enter": {
        handleHsPlayerEnter(container, pb);
        break;
      }
      case "stoc_type_change": {
        handleTypeChange(container, pb);
        break;
      }
      case "stoc_select_hand": {
        handleSelectHand(container, pb);
        break;
      }
      case "stoc_hand_result": {
        handleHandResult(container, pb);
        break;
      }
      case "stoc_select_tp": {
        handleSelectTp(container, pb);
        break;
      }
      case "stoc_deck_count": {
        handleDeckCount(container, pb);
        break;
      }
      case "stoc_duel_start": {
        container.conn.duelStarted = true;
        handleDuelStart(container, pb);
        break;
      }
      case "stoc_duel_end": {
        handleDuelEnd(container, pb);
        break;
      }
      case "stoc_game_msg": {
        await handleGameMsg(container, pb);

        break;
      }
      case "stoc_time_limit": {
        handleTimeLimit(container, pb.stoc_time_limit);
        break;
      }
      case "stoc_error_msg": {
        await handleErrorMsg(container, pb.stoc_error_msg);
        break;
      }
      case "stoc_change_side": {
        handleChangeSide(container, pb.stoc_change_side);
        break;
      }
      case "stoc_waiting_side": {
        handleWaitingSide(container, pb.stoc_waiting_side);
        break;
      }
      default: {
        console.log(packet);

        break;
      }
    }
    checkConnectionResume(container.conn, pb);
  }
}
