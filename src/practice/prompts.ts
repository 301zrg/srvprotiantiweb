/** Local Core choices. These objects never enter the online protocol/store. */
export interface PracticeChoice {
  index: number;
  code?: number;
  player?: number;
  location?: number;
  sequence?: number;
  description?: number;
  action?: number;
  value?: number;
  forced?: boolean;
}
export interface PracticeRequest {
  id: number;
  message: number;
  player: number;
  kind:
    | "idle"
    | "battle"
    | "chain"
    | "yesno"
    | "option"
    | "cards"
    | "tribute"
    | "sum"
    | "unselect"
    | "place"
    | "position"
    | "counter"
    | "sort"
    | "bits"
    | "announce";
  choices: PracticeChoice[];
  min: number;
  max: number;
  cancelable: boolean;
  description?: number;
  code?: number;
  target?: number;
  mode?: number;
  must?: PracticeChoice[];
  opcodes?: number[];
}
export const practiceResponseMessages = new Set([
  10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 25, 26, 132, 140, 141,
  142, 143,
]);

export function parsePracticeRequest(
  bytes: Uint8Array,
  id: number,
): PracticeRequest {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => v.getUint8(p++);
  const u16 = () => {
    const value = v.getUint16(p, true);
    p += 2;
    return value;
  };
  const u32 = () => {
    const value = v.getUint32(p, true);
    p += 4;
    return value;
  };
  const message = u8();
  const request: PracticeRequest = {
    id,
    message,
    player: 0,
    kind: "option",
    choices: [],
    min: 1,
    max: 1,
    cancelable: false,
  };
  if (message === 23) request.mode = u8();
  request.player = u8();
  if (request.player !== 0 && request.player !== 1)
    throw new Error("Invalid Core requesting player");
  const card = (index: number): PracticeChoice => ({
    index,
    code: u32() & 0x7fffffff,
    player: u8(),
    location: u8(),
    sequence: u8(),
  });
  const cards = (extra: "none" | "byte" | "word" | "short" = "none") =>
    Array.from({ length: u8() }, (_, i) => {
      const c = card(i);
      if (extra === "byte") c.value = u8();
      if (extra === "word") c.value = u32();
      if (extra === "short") c.value = u16();
      return c;
    });
  if (message === 11 || message === 10) {
    request.kind = message === 11 ? "idle" : "battle";
    const groups = message === 11 ? 6 : 2;
    for (let action = 0; action < groups; action++) {
      const group = cards(
        (message === 11 && action === 5) || (message === 10 && action === 0)
          ? "word"
          : message === 10
          ? "byte"
          : "none",
      );
      request.choices.push(
        ...group.map((c) => ({
          ...c,
          action,
          description:
            action === (message === 11 ? 5 : 0) ? c.value : undefined,
          value: (c.index << 16) | action,
        })),
      );
    }
    const phases = message === 11 ? [6, 7, 8] : [2, 3];
    for (const action of phases)
      if (u8()) request.choices.push({ index: 0, action, value: action });
  } else if (message === 16) {
    request.kind = "chain";
    const count = u8();
    u8();
    u32();
    u32();
    request.choices = Array.from({ length: count }, (_, index) => {
      u8();
      const forced = !!u8();
      const c = card(index);
      u8();
      return { ...c, forced, description: u32(), value: index };
    });
    request.cancelable = !request.choices.some((c) => c.forced);
  } else if (message === 12 || message === 13) {
    request.kind = "yesno";
    if (message === 12) {
      request.code = u32();
      u32();
    }
    request.description = u32();
    request.choices = [0, 1].map((value) => ({ index: value, value }));
  } else if (message === 14 || message === 143 || message === 142) {
    const values = Array.from({ length: u8() }, u32);
    request.kind = message === 142 ? "announce" : "option";
    if (message === 142) request.opcodes = values;
    else
      request.choices = values.map((value, index) => ({
        index,
        value: index,
        ...(message === 14
          ? { description: value }
          : { description: undefined, code: undefined, action: value }),
      }));
  } else if (message === 15 || message === 20) {
    request.kind = message === 15 ? "cards" : "tribute";
    request.cancelable = !!u8();
    request.min = u8();
    request.max = u8();
    request.choices = cards("byte");
  } else if (message === 26) {
    request.kind = "unselect";
    request.cancelable = !!u8();
    request.cancelable = !!u8() || request.cancelable;
    u8();
    u8();
    request.choices = cards("byte");
    const selected = cards("byte");
    request.choices.push(
      ...selected.map((c, i) => ({
        ...c,
        index: i + request.choices.length,
        forced: true,
      })),
    );
  } else if (message === 23) {
    request.kind = "sum";
    request.target = u32();
    request.min = u8();
    request.max = u8();
    request.must = cards("word");
    request.choices = cards("word");
  } else if (message === 18 || message === 24) {
    request.kind = "place";
    request.min = request.max = u8();
    request.cancelable = request.min === 0;
    const mask = u32();
    for (let bit = 0; bit < 32; bit++)
      if (!(mask & (1 << bit)))
        request.choices.push({
          index: bit,
          player: bit < 16 ? request.player : 1 - request.player,
          location: bit % 16 < 8 ? 4 : 8,
          sequence: bit % 8,
        });
  } else if (message === 19) {
    request.kind = "position";
    request.code = u32();
    const mask = u8();
    request.choices = [1, 2, 4, 8]
      .filter((value) => mask & value)
      .map((value) => ({ index: value, value }));
  } else if (message === 22) {
    request.kind = "counter";
    request.description = u16();
    request.target = u16();
    request.choices = cards("short");
  } else if (message === 25) {
    request.kind = "sort";
    request.choices = cards();
    request.min = request.max = request.choices.length;
    request.cancelable = true;
  } else if (message === 140 || message === 141) {
    request.kind = "bits";
    request.min = request.max = u8();
    const mask = u32();
    for (let bit = 0; bit < 32; bit++)
      if (mask & (1 << bit))
        request.choices.push({ index: bit, value: 1 << bit });
  } else if (message === 132) {
    request.choices = [1, 2, 3].map((value) => ({
      index: value,
      value,
      action: value,
    }));
  } else throw new Error(`Unsupported local Core request ${message}`);
  if (p !== bytes.length)
    throw new Error(`Core request ${message} has unexpected bytes`);
  return request;
}

export type PracticeAnswer = number | number[];
const integer = (n: number) => Number.isSafeInteger(n);
const word = (n: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, n, true);
  return out;
};
/** Validate visible shape before Core performs the final rules validation. */
export function encodePracticeAnswer(
  request: PracticeRequest,
  answer: PracticeAnswer,
): Uint8Array | undefined {
  if (typeof answer === "number") {
    if (!integer(answer)) return;
    if (answer === -1 && request.cancelable)
      return request.kind === "sort"
        ? new Uint8Array([255])
        : request.kind === "place"
        ? new Uint8Array([request.player, 0, 0])
        : word(-1);
    if (request.kind === "announce")
      return answer > 0 && answer < 0x80000000 ? word(answer) : undefined;
    if (
      request.choices.some((c) => c.value === answer) &&
      ["idle", "battle", "chain", "yesno", "option", "position"].includes(
        request.kind,
      )
    )
      return word(answer);
    return;
  }
  if (!answer.every(integer)) return;
  if (request.kind === "counter") {
    if (
      answer.length !== request.choices.length ||
      answer.some((n, i) => n < 0 || n > (request.choices[i].value || 0)) ||
      answer.reduce((a, b) => a + b, 0) !== request.target
    )
      return;
    const bytes = new Uint8Array(answer.length * 2);
    const v = new DataView(bytes.buffer);
    answer.forEach((n, i) => v.setUint16(i * 2, n, true));
    return bytes;
  }
  if (
    new Set(answer).size !== answer.length ||
    answer.some((index) => !request.choices.some((c) => c.index === index))
  )
    return;
  if (request.kind === "tribute") {
    if (
      answer.length > request.max ||
      answer.reduce((n, index) => n + (request.choices[index].value || 0), 0) <
        request.min
    )
      return;
  } else if (
    request.kind !== "sum" &&
    (answer.length < request.min || answer.length > request.max)
  )
    return;
  if (request.kind === "place")
    return new Uint8Array(
      answer.flatMap((index) => {
        const c = request.choices.find((c) => c.index === index)!;
        return [c.player!, c.location!, c.sequence!];
      }),
    );
  if (request.kind === "bits")
    return word(answer.reduce((mask, index) => mask | (1 << index), 0));
  if (request.kind === "sort") {
    // UI lists old indices in the desired order; Core expects each old
    // index's destination rank (PROCESSOR_SORT_DECK uses tc[rank] = card).
    const ranks = new Uint8Array(answer.length);
    answer.forEach((oldIndex, newPosition) => {
      ranks[oldIndex] = newPosition;
    });
    return ranks;
  }
  if (request.kind === "sum") {
    if (
      answer.length < request.min ||
      (request.mode === 0 && answer.length > request.max)
    )
      return;
    const values = [
      ...(request.must || []),
      ...answer.map((index) => request.choices[index]),
    ].map((c) => [c.value! & 65535, c.value! >>> 16].filter((n) => n > 0));
    let sums = new Set([0]);
    for (const options of values)
      sums = new Set([...sums].flatMap((sum) => options.map((n) => sum + n)));
    const minimums = values.map((options) => Math.min(...options));
    if (request.mode === 0) {
      if (!sums.has(request.target!)) return;
    } else if (
      Math.max(...sums) < request.target! ||
      minimums.reduce((sum, value) => sum + value, 0) - Math.min(...minimums) >=
        request.target!
    )
      return;
    const mandatory = (request.must || []).map((_, i) => i);
    return new Uint8Array([
      mandatory.length + answer.length,
      ...mandatory,
      ...answer,
    ]);
  }
  return new Uint8Array([answer.length, ...answer]);
}
