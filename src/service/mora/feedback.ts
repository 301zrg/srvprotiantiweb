import { proxy } from "valtio";

export type RpsOutcome = "win" | "lose" | "tie";
/** 706 wire hands: scissors=1, rock=2, paper=3. */
export function rpsOutcome(
  me: number,
  opponent: number,
): RpsOutcome | undefined {
  if (![1, 2, 3].includes(me) || ![1, 2, 3].includes(opponent)) return;
  if (me === opponent) return "tie";
  return (me === 1 && opponent === 3) ||
    (me === 2 && opponent === 1) ||
    (me === 3 && opponent === 2)
    ? "win"
    : "lose";
}

export const rpsFeedback = proxy({
  played: { serial: 0, hand: 0 },
  result: { serial: 0, outcome: "" as RpsOutcome | "" },
});
export function notifyRpsPlayed(hand: number) {
  if ([1, 2, 3].includes(hand))
    rpsFeedback.played = { serial: rpsFeedback.played.serial + 1, hand };
}
export function notifyRpsResult(me: number, opponent: number) {
  const outcome = rpsOutcome(me, opponent);
  if (outcome)
    rpsFeedback.result = { serial: rpsFeedback.result.serial + 1, outcome };
}
