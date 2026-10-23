import { ReplayEngine, type ReplayFrame } from "../replay/engine";
import { parseQuery, splitCoreMessages } from "../replay/messages";
import type { ReplayRuntime } from "../replay/runtime";
import type { IDeck } from "../stores/deckStore";
import { passPracticeChain } from "./chain";
import {
  encodePracticeAnswer,
  parsePracticeRequest,
  type PracticeAnswer,
  type PracticeRequest,
  practiceResponseMessages,
} from "./prompts";

export interface PracticeConfig {
  decks: [IDeck, IDeck];
  seed: number[];
  hand: number;
  noShuffle: boolean;
  /** Fixed by the environment profile, never selected by the player. */
  rules: number;
}
export interface PracticeFrame extends ReplayFrame {
  pending?: PracticeRequest;
  ignoredWins: number;
}
function shuffled(source: number[], random: () => number) {
  const cards = [...source];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Interactive local duel. No replay response stream or network connection exists. */
export class PracticeEngine {
  private handle = 0;
  private config!: PracticeConfig;
  private pending?: PracticeRequest;
  private serial = 0;
  private step = 0;
  private ignoredWins = 0;
  private chainMode = 2;
  constructor(private core: ReplayRuntime) {}
  setChainMode(mode = 2) {
    this.chainMode = [0, 1, 2].includes(mode) ? mode : 2;
  }
  install(cards: Uint8Array, scripts: Uint8Array) {
    new ReplayEngine(this.core).install(cards, scripts);
  }
  private allocate(bytes: Uint8Array) {
    const p = this.core._malloc(bytes.length || 1);
    if (!p) throw new Error("Practice memory limit");
    this.core.HEAPU8.set(bytes, p);
    return p;
  }
  private check() {
    const message = this.core.UTF8ToString(this.core._replay_error());
    if (message) throw new Error(message);
  }
  open(config: PracticeConfig): PracticeFrame {
    this.close();
    if (
      !Number.isInteger(config.hand) ||
      config.hand < 0 ||
      config.hand > 60 ||
      config.seed.length !== 4 ||
      config.seed.some(
        (n) => !Number.isInteger(n) || n < 0 || n > 0xffffffff,
      ) ||
      ![1, 2, 3, 4, 5].includes(config.rules)
    )
      throw new Error("Invalid practice configuration");
    for (const deck of config.decks) {
      if (
        !deck.main.length ||
        deck.main.length > 60 ||
        deck.extra.length > 15 ||
        [...deck.main, ...deck.extra].some(
          (n) => !Number.isInteger(n) || n <= 0 || n > 0x7fffffff,
        )
      )
        throw new Error("Invalid practice deck");
    }
    this.config = structuredClone(config);
    this.step = 0;
    this.ignoredWins = 0;
    const seed = this.allocate(
      new Uint8Array(new Uint32Array(config.seed).buffer),
    );
    try {
      this.handle = this.core._replay_create(seed, config.seed[0], 0);
    } finally {
      this.core._free(seed);
    }
    this.check();
    if (!this.handle || !this.core._replay_has_special(this.handle))
      throw new Error("706 script initialization failed");
    // Shuffle only the starting main decks. No-shuffle must not suppress future
    // shuffles required by card effects (DUEL_PSEUDO_SHUFFLE would do that).
    let state = config.seed.reduce(
      (a, n) => (Math.imul(a ^ n, 1664525) + 1013904223) >>> 0,
      0x9e3779b9,
    );
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let player = 0; player < 2; player++) {
      this.core._set_player_info(this.handle, player, 8000, config.hand, 1);
      const deck = config.decks[player];
      const main = config.noShuffle ? deck.main : shuffled(deck.main, random);
      for (const code of [...main].reverse())
        this.core._new_card(this.handle, code, player, player, 1, 0, 8);
      for (const code of deck.extra)
        this.core._new_card(this.handle, code, player, player, 64, 0, 8);
    }
    this.check();
    this.core._start_duel(this.handle, config.rules << 16);
    this.check();
    return this.frame([]);
  }
  respond(id: number, player: number, answer: PracticeAnswer): boolean {
    const pending = this.pending;
    if (
      !this.handle ||
      !pending ||
      id !== pending.id ||
      player !== pending.player
    )
      return false;
    const bytes = encodePracticeAnswer(pending, answer);
    if (!bytes || bytes.length > 64) return false;
    const buffer = new Uint8Array(256);
    buffer.set(bytes);
    const p = this.allocate(buffer);
    try {
      this.core._set_responseb(this.handle, p);
    } finally {
      this.core._free(p);
    }
    this.pending = undefined;
    return true;
  }
  next(): PracticeFrame {
    if (!this.handle) throw new Error("Practice is closed");
    if (this.pending) {
      if (passPracticeChain(this.pending, this.chainMode))
        this.respond(this.pending.id, this.pending.player, -1);
      else return this.frame([]);
    }
    const started = performance.now();
    for (let i = 0; i < 10000; i++) {
      if (performance.now() - started > 4000)
        throw new Error("Practice Core timeout");
      const result = this.core._process(this.handle) >>> 0;
      this.check();
      const size = result & 0xfffffff;
      if (size > 256 * 1024) throw new Error("Practice Core message limit");
      let events: number[][] = [];
      if (size) {
        const p = this.core._malloc(size);
        if (!p) throw new Error("Practice memory limit");
        let messages: Uint8Array[];
        try {
          this.core._get_message(this.handle, p);
          messages = splitCoreMessages(this.core.HEAPU8.slice(p, p + size));
        } finally {
          this.core._free(p);
        }
        for (const message of messages) {
          if (message[0] === 1)
            throw new Error("Core rejected the selected action (MSG_RETRY)");
          // Native adjust_step resets win flags without terminating the duel.
          // EDO-style continuous test mode ignores only the presentation event.
          if (message[0] === 5) {
            this.ignoredWins++;
            continue;
          }
          if (practiceResponseMessages.has(message[0])) {
            if (this.pending)
              throw new Error("Multiple simultaneous Core requests");
            this.pending = parsePracticeRequest(message, ++this.serial);
            if (passPracticeChain(this.pending, this.chainMode))
              this.respond(this.pending.id, this.pending.player, -1);
          }
          events.push(Array.from(message));
        }
      }
      if (result & 0x20000000) throw new Error("Practice Core stopped");
      if (size) {
        this.step++;
        return this.frame(events);
      }
    }
    throw new Error("Practice Core processing limit");
  }
  private frame(events: number[][]): PracticeFrame {
    const cards = [];
    const buffer = this.core._malloc(256 * 1024);
    if (!buffer) throw new Error("Practice query memory limit");
    try {
      for (let player = 0; player < 2; player++)
        for (const location of [1, 2, 4, 8, 16, 32, 64]) {
          const size = this.core._query_field_card(
            this.handle,
            player,
            location,
            0xfcfff,
            buffer,
            0,
          );
          if (size < 0 || size > 256 * 1024)
            throw new Error("Practice query limit");
          cards.push(
            ...parseQuery(
              this.core.HEAPU8.slice(buffer, buffer + size),
              player,
              location,
            ),
          );
        }
    } finally {
      this.core._free(buffer);
    }
    this.check();
    return {
      names: this.config.decks.map(
        (d, i) => `${i === 0 ? "A" : "B"} · ${d.deckName}`,
      ),
      lp: [0, 1].map((i) => this.core._replay_state(this.handle, i)),
      turn: this.core._replay_state(this.handle, 2),
      phase: this.core._replay_state(this.handle, 3),
      turnPlayer: this.core._replay_state(this.handle, 4),
      cards,
      events,
      step: this.step,
      consumed: 0,
      total: 0,
      pending: this.pending,
      ignoredWins: this.ignoredWins,
    };
  }
  close() {
    this.serial++;
    this.pending = undefined;
    if (this.handle) this.core._end_duel(this.handle);
    this.handle = 0;
  }
}
