import { ygopro } from "@/api";
import { Container } from "@/container";

export default (
  container: Container,
  becomeTarget: ygopro.StocGameMessage.MsgBecomeTarget,
) => {
  const context = container.context;
  for (const location of becomeTarget.locations) {
    const target = context.cardStore.at(
      location.zone,
      location.controller,
      location.sequence,
    );
    if (target) {
      console.info(`${target.meta.text.name} become target`);
      // HintSelection uses this packet for automatic processing too; those
      // notifications have no CHAIN_END to clear a retained target marker.
      target.targeted = context.matStore.chains.length > 0;
      target.targetFlash = (target.targetFlash ?? 0) + 1;

      context.historyStore.putTargeted(context, target.code, location);
    } else {
      console.warn(`<BecomeTarget>target from ${location} is null`);
    }
  }
};
