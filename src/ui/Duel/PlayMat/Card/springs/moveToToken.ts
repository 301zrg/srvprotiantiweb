import type { MoveFunc } from "./types";
import { asyncStart } from "./utils";

export const moveToToken: MoveFunc = async (props) => {
  const { api, signal } = props;
  await asyncStart(
    api,
    signal,
  )({
    height: 0,
    opacity: 0,
  });
  if (!signal?.aborted) api.set({ opacity: 1 });
};
