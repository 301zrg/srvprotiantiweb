import { useLayoutEffect, useReducer } from "react";
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
import { type ZoneRect, zoneRect } from "@/ui/Shared/DuelBoard/geometry";
import {
  ZoneBlock,
  ZoneCount,
  ZoneIndex,
  ZoneLayer,
} from "@/ui/Shared/DuelBoard/ZoneBlock";

import { displayCardListModal } from "../../Message/CardListModal";
import { onlineSpot } from "../boardSpot";
import { matConfig } from "../css";

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

const rectOf = (controller: number, zone: ygopro.CardZone, sequence: number) =>
  zoneRect(matConfig, onlineSpot({ controller, zone, sequence })!);

const BgBlock: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    rect: ZoneRect;
    disabled?: boolean;
    highlight?: boolean;
    glowing?: boolean;
    chains: ChainProps;
    [data: `data-${string}`]: unknown;
  }
> = ({ chains, children, ...rest }) => (
  <ZoneBlock {...rest}>
    {children}
    <BgChain {...chains} />
  </ZoneBlock>
);

/** Extra monster zones: each slot is shared by both players. */
const BgExtraRow: React.FC<{
  meSnap: Snapshot<BlockState[]>;
  opSnap: Snapshot<BlockState[]>;
}> = ({ meSnap, opSnap }) => {
  const container = getUIContainer();
  const meController = getController();
  const opController = getController(true);

  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <BgBlock
          key={i}
          rect={rectOf(meController, MZONE, i + 5)}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[MZONE]}
          data-zone-value={MZONE}
          data-controller={meController}
          data-sequence={i + 5}
          data-place-selectable={
            !!meSnap[i].interactivity || !!opSnap[1 - i].interactivity
          }
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
    </>
  );
};

const BgRow: React.FC<{
  szone?: boolean;
  opponent?: boolean;
  snap: Snapshot<BlockState[]>;
}> = ({ szone = false, opponent = false, snap }) => {
  const { showZoneIndexes } = useSnapshot(settingStore);
  const container = getUIContainer();
  const controller = getController(opponent);
  const zone = szone ? SZONE : MZONE;

  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <BgBlock
          key={i}
          rect={rectOf(controller, zone, i)}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[zone]}
          children={
            showZoneIndexes ? (
              <ZoneIndex index={i + 1} rect={rectOf(controller, zone, i)} />
            ) : undefined
          }
          data-zone-value={zone}
          data-controller={controller}
          data-sequence={i}
          data-place-selectable={!!snap[i].interactivity}
          onClick={() => onBlockClick(container, snap[i].interactivity)}
          disabled={snap[i].disabled}
          highlight={!!snap[i].interactivity}
          chains={{
            chains: toChainMarkers(snap[i].chainIndex, {
              controller,
              zone,
              sequence: i,
            }),
            op: opponent,
          }}
        />
      ))}
    </>
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
  const pileProps = (zone: ygopro.CardZone) => {
    const rect = rectOf(controller, zone, 0);
    return {
      rect,
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
        <ZoneCount
          count={getN(zone)}
          rect={rect}
          depth={zone === DECK || zone === EXTRA ? getN(zone) + 2 : 4}
        />
      ) : undefined,
    };
  };

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
    <>
      <BgBlock
        {...pileProps(REMOVED)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[REMOVED]}
        data-zone-value={REMOVED}
        data-controller={controller}
        data-place-selectable={false}
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
        glowing={!op && glowingGraveyard}
        chains={{
          chains: genChains(grave, GRAVE),
          op,
          nBelow: getN(GRAVE),
        }}
      />
      <BgBlock
        rect={rectOf(controller, SZONE, 5)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[SZONE]}
        data-zone-value={SZONE}
        data-controller={controller}
        data-sequence={5}
        data-place-selectable={!!field.interactivity}
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
        chains={{ chains: [] }}
      />
      <BgBlock
        {...pileProps(EXTRA)}
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[EXTRA]}
        data-zone-value={EXTRA}
        data-controller={controller}
        data-place-selectable={false}
        glowing={!op && glowingExtra}
        chains={{
          chains: genChains(extra, EXTRA),
          op,
          nBelow: getN(EXTRA),
        }}
      />
    </>
  );
};

export const Bg: React.FC = () => {
  const snap = useSnapshot(placeStore.inner);
  const { hostInfo } = useSnapshot(roomStore);
  // Zone rects read the live geometry; re-render when the Mat re-lays out.
  // A layout effect, so it is registered before the parent Mat's first update.
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => {
    window.addEventListener("neos:duel-layout", relayout);
    return () => window.removeEventListener("neos:duel-layout", relayout);
  }, []);
  return (
    <ZoneLayer>
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
    </ZoneLayer>
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
      container.context.matStore.hint.msg = "";
      cardStore.inner.forEach((card) => (card.idleInteractivities = []));
      placeStore.clearAllInteractivity();
      placeStore.startPlaceSelection(1);
    }
  }
};
