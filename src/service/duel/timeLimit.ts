import { sendTimeConfirm, ygopro } from "@/api";
import { Container } from "@/container";
import { calibrateClock } from "@/variant/duelClock";

export default function handleTimeLimit(
  container: Container,
  timeLimit: ygopro.StocTimeLimit,
) {
  const context = container.context;
  context.matStore.timeLimits.set(timeLimit.player, timeLimit.left_time);
  calibrateClock(
    timeLimit.player,
    timeLimit.left_time,
    container.conn.takeTimeLimitArrival?.() ?? Date.now(),
  );
  if (
    !container.conn.confirmsTimeLimitsOnArrival &&
    context.matStore.isMe(timeLimit.player)
  ) {
    sendTimeConfirm(container.conn);
  }
}
