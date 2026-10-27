import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { BlockState, isMe, matStore, placeStore } from "@/stores";
import { BgChain, type ChainMarker } from "@/ui/Shared";

import styles from "./index.module.scss";

const { HAND } = ygopro.CardZone;

const getController = (opponent = false) => {
  if (opponent) return isMe(0) ? 1 : 0;

  return isMe(0) ? 0 : 1;
};

export const HandChain: React.FC = () => {
  const snap = useSnapshot(placeStore.inner);
  const { me, op } = snap[HAND];
  const { selfType, observerView } = useSnapshot(matStore);
  const flipped =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer &&
    observerView === 1;

  const genChains = (states: Snapshot<BlockState[]>, opponent = false) => {
    const controller = getController(opponent !== flipped);
    const chains: ChainMarker[] = states.flatMap((state, sequence) =>
      state.chainIndex.map((index) => ({
        controller,
        index,
        sequence,
        zone: HAND,
      })),
    );
    chains.sort((a, b) => a.index - b.index);

    return chains;
  };

  return (
    <div className={styles.container}>
      <div className={styles.me}>
        <BgChain chains={genChains(flipped ? op : me)} />
      </div>
      <div className={styles.op}>
        <BgChain chains={genChains(flipped ? me : op, true)} op />
      </div>
    </div>
  );
};
