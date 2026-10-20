import type { PracticeRequest } from "./prompts";

/** Same modes as online: all=0, ignore=1, smart=2. Never skip forced effects. */
export function passPracticeChain(
  request: PracticeRequest | undefined,
  mode: number,
) {
  return (
    !!request &&
    request.kind === "chain" &&
    request.cancelable &&
    !request.choices.some((choice) => choice.forced) &&
    (!request.choices.length ||
      mode === 1 ||
      (mode === 2 && request.specialCount === 0))
  );
}
