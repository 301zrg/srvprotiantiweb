/** Mask presentation only; never rewrite protocol, stored identity or chat text. */
export const displayPlayerId = (name: string, hidden: boolean) =>
  hidden ? "********" : name;
