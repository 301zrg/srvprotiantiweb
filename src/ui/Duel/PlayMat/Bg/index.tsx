import classnames from "classnames";
import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { fetchStrings, Region, sendSelectPlaceResponse, ygopro } from "@/api";
import { Container } from "@/container";
import { getUIContainer } from "@/container/compat";
import {
  type BlockState,
  cardStore,
  isMe,
  type PlaceInteractivity,
  placeStore,
  roomStore,
} from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { BgChain, type ChainMarker, type ChainProps } from "@/ui/Shared";

import { displayCardListModal } from "../../Message/CardListModal";
import styles from "./index.module.scss";

const { DECK, MZONE, SZONE, EXTRA, GRAVE, REMOVED } = ygopro.CardZone;

const getController = (opponent = false) => {
  if (opponent) return isMe(0) ? 1 : 0;

  return isMe(0) ? 0 : 1;
};

const toChainMarkers = (
  chainIndex: readonly number[],
  location: Omit<ChainMarker, "index">,
): ChainMarker[] =>
  chainIndex.map((index) => ({
    ...location,
    index,
  }));

const BgBlock: React.FC<
  React.HTMLProps<HTMLDivElement> & {
    disabled?: boolean;
    highlight?: boolean;
    glowing?: boolean;
    chains: ChainProps;
  }
> = ({
  disabled = false,
  highlight = false,
  glowing = false,
  className,
  chains,
  children,
  ...rest
}) => (
  <div
    {...rest}
    className={classnames(styles.block, className, {
      [styles.highlight]: highlight,
      [styles.glowing]: glowing,
    })}
  >
    {children}
    {<DisabledCross disabled={disabled} />}
    {<BgChain {...chains} />}
  </div>
);

const BgExtraRow: React.FC<{
  meSnap: Snapshot<BlockState[]>;
  opSnap: Snapshot<BlockState[]>;
}> = ({ meSnap, opSnap }) => {
  const container = getUIContainer();
  const meController = getController();
  const opController = getController(true);

  return (
    <div className={classnames(styles.row)}>
      {Array.from({ length: 2 }).map((_, i) => (
        <BgBlock
          key={i}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[MZONE]}
          data-zone-value={MZONE}
          data-controller={meController}
          data-sequence={i + 5}
          data-place-selectable={
            !!meSnap[i].interactivity || !!opSnap[1 - i].interactivity
          }
          className={styles.extra}
          onClick={() => {
            onBlockClick(container, meSnap[i].interactivity);
            onBlockClick(container, opSnap[1 - i].interactivity);
          }}
          disabled={meSnap[i].disabled || opSnap[1 - i].disabled}
          highlight={!!meSnap[i].interactivity || !!opSnap[1 - i].interactivity}
          chains={{
            chains: [
              ...toChainMarkers(meSnap[i].chainIndex, {
                controller: meController,
                zone: MZONE,
                sequence: i + 5,
              }),
              ...toChainMarkers(opSnap[1 - i].chainIndex, {
                controller: opController,
                zone: MZONE,
                sequence: 6 - i,
              }),
            ],
          }}
        />
      ))}
    </div>
  );
};

const BgRow: React.FC<{
  szone?: boolean;
  opponent?: boolean;
  snap: Snapshot<BlockState[]>;
}> = ({ szone = false, opponent = false, snap }) => {
  const container = getUIContainer();
  const controller = getController(opponent);
  const zone = szone ? SZONE : MZONE;

  return (
    <div className={classnames(styles.row, { [styles.opponent]: opponent })}>
      {Array.from({ length: 5 }).map((_, i) => (
        <BgBlock
          key={i}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[zone]}
          data-zone-value={zone}
          data-controller={controller}
          data-sequence={i}
          data-place-selectable={!!snap[i].interactivity}
          className={classnames({ [styles.szone]: szone })}
          onClick={() => onBlockClick(container, snap[i].interactivity)}
          disabled={snap[i].disabled}
          highlight={!!snap[i].interactivity}
          chains={{
            chains: toChainMarkers(snap[i].chainIndex, {
              controller,
              zone,
              sequence: i,
            }),
          }}
        />
      ))}
    </div>
  );
};

const BgOtherBlocks: React.FC<{ op?: boolean }> = ({ op }) => {
  const { showZoneCounts } = useSnapshot(settingStore);
  useSnapshot(cardStore);
  const container = getUIContainer();
  const controller = getController(op);
  const judgeGlowing = (zone: ygopro.CardZone) =>
    !!cardStore
      .at(zone, controller)
      .reduce((sum, c) => (sum += c.idleInteractivities.length), 0);
  const glowingExtra = judgeGlowing(EXTRA);
  const glowingGraveyard = judgeGlowing(GRAVE);
  const glowingBanish = judgeGlowing(REMOVED);
  const snap = useSnapshot(placeStore.inner);
  const field = op ? snap[SZONE].op[5] : snap[SZONE].me[5];
  const grave = op ? snap[GRAVE].op : snap[GRAVE].me;
  const removed = op ? snap[REMOVED].op : snap[REMOVED].me;
  const extra = op ? snap[EXTRA].op : snap[EXTRA].me;

  const getN = (zone: ygopro.CardZone) => cardStore.at(zone, controller).length;
  const pileProps = (zone: ygopro.CardZone) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": `${fetchStrings(
      Region.System,
      (
        {
          [DECK]: 1000,
          [EXTRA]: 1006,
          [GRAVE]: 1004,
          [REMOVED]: 1005,
        } as Record<number, number>
      )[zone],
    )} (${getN(zone)})`,
    "data-card-count": getN(zone),
    onClick: () => displayCardListModal({ isZone: true, zone, controller }),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        displayCardListModal({ isZone: true, zone, controller });
      }
    },
    children: showZoneCounts ? (
      <span
        data-testid="zone-count-badge"
        className={styles.count}
        style={
          {
            "--zone-count-depth": `${
              zone === DECK || zone === EXTRA ? getN(zone) + 2 : 4
            }px`,
          } as React.CSSProperties
        }
      >
        {getN(zone)}
      </span>
    ) : undefined,
  });

  const genChains = (states: Snapshot<BlockState[]>, zone: ygopro.CardZone) => {
    const chains: ChainMarker[] = states.flatMap((state, sequence) =>
      toChainMarkers(state.chainIndex, {
        controller,
        zone,
        sequence,
      }),
    );
    chains.sort((a, b) => a.index - b.index);

    return chains;
  };

  return (
    <div className={classnames(styles["other-blocks"], { [styles.op]: op })}>
      <BgBlock
        {...pileProps(REMOVED)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[REMOVED]}
        data-zone-value={REMOVED}
        data-controller={controller}
        data-place-selectable={false}
        className={styles.banish}
        glowing={!op && glowingBanish}
        chains={{
          chains: genChains(removed, REMOVED),
          op,
          nBelow: getN(REMOVED),
        }}
      />
      <BgBlock
        {...pileProps(GRAVE)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[GRAVE]}
        data-zone-value={GRAVE}
        data-controller={controller}
        data-place-selectable={false}
        className={styles.graveyard}
        glowing={!op && glowingGraveyard}
        chains={{
          chains: genChains(grave, GRAVE),
          op,
          nBelow: getN(GRAVE),
        }}
      />
      <BgBlock
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[SZONE]}
        data-zone-value={SZONE}
        data-controller={controller}
        data-sequence={5}
        data-place-selectable={!!field.interactivity}
        className={styles.field}
        onClick={() => onBlockClick(container, field.interactivity)}
        disabled={field.disabled}
        highlight={!!field.interactivity}
        chains={{
          chains: toChainMarkers(field.chainIndex, {
            controller,
            zone: SZONE,
            sequence: 5,
          }),
          op,
        }}
      />
      <BgBlock
        {...pileProps(DECK)}
        data-testid="duel-zone"
        data-zone="DECK"
        data-zone-value={DECK}
        data-controller={controller}
        data-place-selectable={false}
        className={styles.deck}
        chains={{ chains: [] }}
      />
      <BgBlock
        {...pileProps(EXTRA)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[EXTRA]}
        data-zone-value={EXTRA}
        data-controller={controller}
        data-place-selectable={false}
        className={classnames(styles.deck, styles["extra-deck"])}
        glowing={!op && glowingExtra}
        chains={{
          chains: genChains(extra, EXTRA),
          op,
          nBelow: getN(EXTRA),
        }}
      />
    </div>
  );
};

export const Bg: React.FC = () => {
  const snap = useSnapshot(placeStore.inner);
  const { hostInfo } = useSnapshot(roomStore);
  return (
    <div className={styles["mat-bg"]}>
      <BgRow snap={snap[SZONE].op} szone opponent />
      <BgRow snap={snap[MZONE].op} opponent />
      {(hostInfo?.duelRule ?? 2) >= 4 && (
        <BgExtraRow
          meSnap={snap[MZONE].me.slice(5, 7)}
          opSnap={snap[MZONE].op.slice(5, 7)}
        />
      )}
      <BgRow snap={snap[MZONE].me} />
      <BgRow snap={snap[SZONE].me} szone />
      <BgOtherBlocks />
      <BgOtherBlocks op />
    </div>
  );
};

const onBlockClick = (
  container: Container,
  placeInteractivity: PlaceInteractivity,
) => {
  if (placeInteractivity) {
    placeStore.pushPlaceResponse(placeInteractivity.response);
    if (
      placeStore.selectPlaceResponses.length >=
      placeStore.selectPlaceRequiredCount
    ) {
      sendSelectPlaceResponse(container.conn, placeStore.selectPlaceResponses);
      cardStore.inner.forEach((card) => (card.idleInteractivities = []));
      placeStore.clearAllInteractivity();
      placeStore.startPlaceSelection(1);
    }
  }
};

const DisabledCross: React.FC<{ disabled: boolean }> = ({ disabled }) => (
  <div
    className={classnames(styles["disabled-cross"], {
      [styles.show]: disabled,
    })}
  ></div>
);
