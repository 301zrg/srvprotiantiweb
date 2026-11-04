import { proxy } from "valtio";

import { ygopro } from "@/api";
import { Context } from "@/container";
import { onlinePhaseKey, type PhaseKey } from "@/variant/duelPhases";
import type { DuelResult } from "@/variant/duelResults";
import { matchGame } from "@/variant/matchGame";

import { NeosStore } from "./shared";

export enum HistoryOp {
  MOVE = 1,
  EFFECT = 2,
  TARGETED = 3,
  CONFIRMED = 4,
  ATTACK = 5,
  SUMMON = 6,
  SP_SUMMON = 7,
  FLIP_SUMMON = 8,
  SET = 9,
  ANNOUNCE = 10,
  RESULT = 11,
  TURN = 12,
  PHASE = 13,
  DAMAGE = 14,
  RECOVER = 15,
  LP = 16,
  DRAW = 17,
  POSITION = 18,
  WIN = 19,
  /** The connection dropped here; what happened meanwhile was not received. */
  GAP = 20,
}

export interface History {
  card: number;
  opponent: boolean;
  currentLocation?: ygopro.CardLocation;
  operation: HistoryOp;
  target?: ygopro.CardZone;
  player?: number;
  result?: DuelResult;
  source?: "server" | "response";
  /** Summons and set cards: where the card goes, with its slot. */
  targetLocation?: ygopro.CardLocation;
  /** Attack target; absent for direct attacks. */
  attackTarget?: ygopro.CardLocation;
  turn?: number;
  phase?: PhaseKey;
  amount?: number;
  text?: string;
  /** Game of the match this row belongs to. */
  game?: number;
}

/** What a row needs from its game once the live duel state has moved on. */
export interface HistoryGame {
  game: number;
  /** Room seats differ from Core order: Core player 0 sits in seat 1. */
  swapped: boolean;
  /** This client's player went first (meaningless for spectators). */
  selfFirst: boolean;
}

/** A player's log across a reconnection, which rebuilds every other store. */
export interface HistorySnapshot {
  rows: History[];
  games: HistoryGame[];
  game: number;
}

export class HistoryStore implements NeosStore {
  /** The whole match: players side with the opponent's earlier cards in view. */
  historys: History[] = [];
  games: HistoryGame[] = [];
  declaration?: { serial: number; result: DuelResult };
  private declarationSerial = 0;
  private lastPhase?: PhaseKey;

  /** Every entry carries the turn and phase it happened in. */
  private add(context: Context, entry: History) {
    this.historys.push({
      turn: context.matStore.turnCount,
      phase: onlinePhaseKey(context.matStore.phase.currentPhase),
      game: matchGame.number,
      ...entry,
    });
  }

  /** MSG_START: a new game, or the current one again after a reconnection. */
  beginGame(context: Context) {
    this.closeGame();
    const game = {
      game: matchGame.number,
      swapped: context.matStore.observerSwapped,
      selfFirst: context.matStore.isMe(0),
    };
    const known = this.games.findIndex((item) => item.game === game.game);
    if (known >= 0) this.games[known] = game;
    else this.games.push(game);
  }

  /** The rows stay; only state tied to the finished game goes. */
  closeGame() {
    this.lastPhase = undefined;
    this.declaration = undefined;
  }

  private notifyDeclaration(result: DuelResult) {
    if (
      ["option", "race", "attribute", "number", "zone", "card"].includes(
        result.kind,
      )
    )
      this.declaration = { serial: ++this.declarationSerial, result };
  }

  putMove(
    context: Context,
    card: number,
    from: ygopro.CardLocation,
    to: ygopro.CardLocation,
  ) {
    // TODO: Refinement
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(from.controller),
      currentLocation: from,
      operation: HistoryOp.MOVE,
      target: to.zone,
      targetLocation: to,
      player: from.controller,
    });
  }

  putEffect(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      currentLocation: location,
      operation: HistoryOp.EFFECT,
      player: location.controller,
    });
  }

  putAnnounce(
    context: Context,
    card: number,
    player: number,
    source: "server" | "response" = "server",
  ) {
    const last = this.historys.at(-1);
    if (
      source === "server" &&
      last?.source === "response" &&
      last.operation === HistoryOp.ANNOUNCE &&
      last.player === player &&
      last.card === card
    ) {
      last.source = "server";
      return;
    }
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(player),
      operation: HistoryOp.ANNOUNCE,
      player,
      source,
    });
  }

  putResult(
    context: Context,
    result: DuelResult,
    player: number,
    card = 0,
    source: "server" | "response" = "server",
  ) {
    const last = this.historys.at(-1);
    if (
      source === "server" &&
      last?.source === "response" &&
      last.operation === HistoryOp.RESULT &&
      last.player === player &&
      JSON.stringify(last.result) === JSON.stringify(result)
    ) {
      last.source = "server";
      return;
    }
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(player),
      operation: HistoryOp.RESULT,
      player,
      result,
      source,
    });
    this.notifyDeclaration(result);
  }

  putTargeted(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      currentLocation: location,
      operation: HistoryOp.TARGETED,
      player: location.controller,
    });
  }

  putConfirmed(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      currentLocation: location,
      operation: HistoryOp.CONFIRMED,
      player: location.controller,
    });
  }

  putSummon(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      operation: HistoryOp.SUMMON,
      player: location.controller,
      targetLocation: location,
    });
  }

  putSpSummon(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      operation: HistoryOp.SP_SUMMON,
      player: location.controller,
      targetLocation: location,
    });
  }

  putFlipSummon(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      operation: HistoryOp.FLIP_SUMMON,
      player: location.controller,
      targetLocation: location,
    });
  }

  putSet(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      operation: HistoryOp.SET,
      player: location.controller,
      targetLocation: location,
    });
  }

  putTurn(context: Context, player: number) {
    this.lastPhase = undefined;
    this.add(context, {
      card: 0,
      opponent: !context.matStore.isMe(player),
      operation: HistoryOp.TURN,
      player,
    });
  }

  /** Only the battle phase gets its own row; its steps share it. */
  putPhase(context: Context) {
    const previous = this.lastPhase;
    this.lastPhase = onlinePhaseKey(context.matStore.phase.currentPhase);
    if (this.lastPhase === "bp" && previous !== "bp")
      this.add(context, {
        card: 0,
        opponent: false,
        operation: HistoryOp.PHASE,
      });
  }

  putLp(
    context: Context,
    player: number,
    operation: HistoryOp.DAMAGE | HistoryOp.RECOVER | HistoryOp.LP,
    amount: number,
  ) {
    this.add(context, {
      card: 0,
      opponent: !context.matStore.isMe(player),
      operation,
      player,
      amount,
    });
  }

  putDraw(context: Context, player: number, amount: number) {
    this.add(context, {
      card: 0,
      opponent: !context.matStore.isMe(player),
      operation: HistoryOp.DRAW,
      player,
      amount,
    });
  }

  putPosition(context: Context, card: number, location: ygopro.CardLocation) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(location.controller),
      currentLocation: location,
      operation: HistoryOp.POSITION,
      player: location.controller,
    });
  }

  putAttack(
    context: Context,
    card: number,
    from: ygopro.CardLocation,
    target?: ygopro.CardLocation,
  ) {
    this.add(context, {
      card,
      opponent: !context.matStore.isMe(from.controller),
      currentLocation: from,
      operation: HistoryOp.ATTACK,
      player: from.controller,
      attackTarget: target,
    });
  }

  putWin(context: Context, player: number, text: string) {
    this.add(context, {
      card: 0,
      opponent: !context.matStore.isMe(player),
      operation: HistoryOp.WIN,
      player,
      text,
    });
  }

  snapshotMatch(): HistorySnapshot {
    return {
      rows: [...this.historys],
      games: [...this.games],
      game: matchGame.number,
    };
  }

  /** Back after a reconnection, with the gap marked: the host sends the field
   * again but not what happened while the connection was down. */
  restoreMatch({ rows, games, game }: HistorySnapshot) {
    const last = rows.at(-1);
    this.historys =
      last && last.operation !== HistoryOp.GAP
        ? [
            ...rows,
            { card: 0, opponent: false, operation: HistoryOp.GAP, game },
          ]
        : [...rows];
    this.games = [...games];
    matchGame.number = game;
  }

  reset(): void {
    this.historys = [];
    this.games = [];
    this.closeGame();
  }
}

export const historyStore = proxy(new HistoryStore());
