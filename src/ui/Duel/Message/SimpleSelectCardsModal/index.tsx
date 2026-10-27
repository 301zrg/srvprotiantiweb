// import "./index.scss";
import { INTERNAL_Snapshot as Snapshot, proxy, useSnapshot } from "valtio";

import { closeCardListModal } from "../CardListModal";
import { closeCardModal } from "../CardModal";
import { type Option, SelectCardsModal } from "../SelectCardsModal";

const defaultProps = {
  isOpen: false,
  selectables: [] as Option[],
};

const localStore = proxy(defaultProps);

export const SimpleSelectCardsModal: React.FC = () => {
  const { isOpen, selectables } = useSnapshot(localStore);
  return (
    <SelectCardsModal
      isOpen={isOpen}
      min={1}
      max={1}
      single={false}
      selecteds={[]}
      mustSelects={[]}
      selectables={selectables}
      cancelable
      finishable={false}
      totalLevels={0}
      overflow
      onSubmit={rs}
      onFinish={() => rs([])}
      onCancel={() => rs([])}
    />
  );
};

let rs: (options: Snapshot<Option[]>) => void = () => {};

export const displaySimpleSelectCardsModal = async (
  args: Omit<typeof defaultProps, "isOpen">,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) return [];
  // Existing detail/zone drawers otherwise cover the candidate footer on phones.
  closeCardModal();
  closeCardListModal();
  localStore.selectables = args.selectables;
  localStore.isOpen = true;
  const res = await new Promise<Snapshot<Option[]>>((resolve) => {
    const abort = () => settle([]);
    const settle = (value: Snapshot<Option[]>) => {
      if (rs !== settle) return;
      signal?.removeEventListener("abort", abort);
      rs = () => {};
      localStore.isOpen = false;
      resolve(value);
    };
    rs = settle;
    signal?.addEventListener("abort", abort, { once: true });
  });
  return res;
};
