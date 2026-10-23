import { AimOutlined, CheckOutlined } from "@ant-design/icons";
import { animated, to, useSpring } from "@react-spring/web";
import { Dropdown, type MenuProps } from "antd";
import classnames from "classnames";
import React, { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { Region, sendSelectMultiResponse } from "@/api";
import { fetchStrings, getCardStr, ygopro } from "@/api";
import { getUIContainer } from "@/container/compat";
import { useMediaQuery, useMobileInterface } from "@/hook";
import { eventbus, Task } from "@/infra";
import {
  cardStore,
  CardType,
  Interactivity,
  InteractType,
  isCardDisabled,
  isMe,
} from "@/stores";
import {
  fieldSelectionStore,
  fieldSpotKey,
  focusFieldSelection,
  onlineFieldSpot,
  toggleFieldSelection,
} from "@/stores/fieldSelectionStore";
import { showCardModal as displayCardModal } from "@/ui/Duel/Message/CardModal";
import { useI18N } from "@/ui/I18N";
import { replayCardWords } from "@/ui/Replay/cardState";
import { YgoCard } from "@/ui/Shared";
import { counterDescription } from "@/ui/Shared/CardInformation";
import { fieldPosition, fieldPositionLabel } from "@/variant/fieldSelection";
import { previewMessages } from "@/variant/previewMessages";

import {
  displayActiveOptionModal,
  displayCardListModal,
  displaySimpleSelectCardsModal,
  runActiveAction,
} from "../../Message";
import {
  clearSelectInfo,
  interactTypeToIcon,
  interactTypeToString,
} from "../../utils";
import { visibleDeckCode } from "../deckVisibility";
import styles from "./index.module.scss";
import {
  attack,
  type AttackOptions,
  focus,
  move,
  type MoveOptions,
} from "./springs";
import type { FocusOptions, SpringApiProps } from "./springs/types";

const { HAND, DECK, GRAVE, REMOVED, EXTRA, MZONE, SZONE, TZONE } =
  ygopro.CardZone;

export const Card: React.FC<{
  idx: number;
  overlayCount: number;
  hostPosition?: ygopro.CardPosition;
  deckReversed: boolean;
}> = React.memo(({ idx, overlayCount, hostPosition, deckReversed }) => {
  const container = getUIContainer();
  const portrait = useMediaQuery("(orientation: portrait)");
  const mobile = useMobileInterface();
  const actionFirst = portrait && mobile;
  const { language } = useI18N();
  const words = previewMessages(language);
  const card = cardStore.inner[idx];
  const snap = useSnapshot(card);
  const fieldSnap = useSnapshot(fieldSelectionStore);
  const fieldSpot = onlineFieldSpot(snap.location);
  const fieldKey = fieldSpot ? fieldSpotKey(fieldSpot) : "";
  const fieldEntry = fieldSnap.active
    ? fieldSnap.entries.find((entry) => entry.key === fieldKey)
    : undefined;
  const fieldCandidate =
    !!fieldEntry || snap.selectInfo.selectable || snap.selectInfo.selected;
  const fieldChosen = fieldEntry?.selected || snap.selectInfo.selected;
  const fieldFocused = !!fieldEntry && fieldSnap.focused === fieldKey;
  const fieldPositionInfo =
    fieldSpot && fieldPosition(fieldSpot, isMe(0) ? 0 : 1);
  const fieldLabel = fieldSpot
    ? fieldPositionLabel(fieldSpot, isMe(0) ? 0 : 1, language, (id) =>
        fetchStrings(Region.System, id),
      )
    : "";

  const [spring, api] = useSpring<SpringApiProps>(
    () =>
      ({
        x: 0,
        y: 0,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        zIndex: 0,
        height: 0,
        focusScale: 1,
        focusDisplay: "none",
        focusOpacity: 1,
        subZ: 0,
        opacity: 1,
      }) satisfies SpringApiProps,
  );

  const [glowing, setGrowing] = useState(false);
  const [classFocus, setClassFocus] = useState(false);

  // >>> 动画 >>>
  /** 动画序列的promise */
  const animationQueue = useRef(Promise.resolve());
  const mounted = useRef(false);

  const addToAnimation = (p: () => Promise<void>) => {
    const next = animationQueue.current.then(() =>
      mounted.current ? p() : undefined,
    );
    // Preserve the error for this caller without poisoning later animations.
    animationQueue.current = next.catch(() => {});
    return next;
  };

  useEffect(() => {
    mounted.current = true;
    const unregisterMove = eventbus.register(
      Task.Move,
      card.uuid,
      async (options?: MoveOptions) => {
        await addToAnimation(() => move({ card, api, options }));
      },
    );

    const unregisterFocus = eventbus.register(
      Task.Focus,
      card.uuid,
      async (options?: FocusOptions) => {
        await addToAnimation(async () => {
          setClassFocus(true);
          try {
            await focus({ card, api, options });
          } finally {
            if (mounted.current) setClassFocus(false);
          }
        });
      },
    );

    const unregisterAttack = eventbus.register(
      Task.Attack,
      card.uuid,
      async (options: AttackOptions) => {
        await addToAnimation(() => attack({ card, api, options }));
      },
    );
    // State may already contain catch-up messages received before this mount.
    void addToAnimation(() => move({ card, api }));
    const relayout = () => {
      void addToAnimation(() => move({ card, api }));
    };
    window.addEventListener("neos:duel-layout", relayout);
    return () => {
      window.removeEventListener("neos:duel-layout", relayout);
      mounted.current = false;
      unregisterMove();
      unregisterFocus();
      unregisterAttack();
      api.stop(true);
    };
  }, []);

  const materialLayoutMounted = useRef(false);
  useEffect(() => {
    if (
      materialLayoutMounted.current &&
      (card.location.is_overlay || card.location.zone === DECK)
    )
      void addToAnimation(() => move({ card, api }));
    materialLayoutMounted.current = true;
  }, [
    overlayCount,
    hostPosition,
    deckReversed,
    snap.deckReversed,
    snap.location.position,
  ]);

  // <<< 动画 <<<

  // >>> 效果 >>>
  const idleInteractivities = snap.idleInteractivities;
  useEffect(() => {
    setGrowing(
      !!idleInteractivities.length &&
        [MZONE, SZONE, HAND, TZONE].includes(card.location.zone),
    );
  }, [idleInteractivities]);

  const [dropdownMenu, setDropdownMenu] = useState({
    items: [] as DropdownItem[],
  });

  // 是否禁用下拉菜单
  const [dropdownMenuDisabled, setDropdownMenuDisabled] = useState(false);

  // 发动效果
  // 1. 下拉菜单里面选择[召唤 / 特殊召唤 /.../效果发动]
  // 2. 如果是非效果发动，那么直接选择哪张卡(单张卡直接选择那张)
  // 3. 如果是效果发动，那么选择哪张卡，然后选择效果
  const handleDropdownMenu = (cards: CardType[], isField: boolean) => {
    const map = new Map<Interactivity<number>["interactType"], CardType[]>();
    cards.forEach((card) => {
      card.idleInteractivities.forEach(({ interactType }) => {
        if (!map.has(interactType)) {
          map.set(interactType, []);
        }
        map.get(interactType)?.push(card);
      });
    });

    if (!map.size) {
      setDropdownMenuDisabled(true);
      return false;
    } else {
      setDropdownMenuDisabled(false);
    }
    const actions = [...map.entries()];
    const nonEffectActions = actions.filter(
      ([action]) => action !== InteractType.ACTIVATE,
    );
    const getNonEffectInteractivity = (action: InteractType, card: CardType) =>
      card.idleInteractivities.find((item) => item.interactType === action)!;
    const nonEffectItem: DropdownItem[] = nonEffectActions.map(
      ([action, cards], key) => ({
        key,
        "data-testid": `duel-action-${InteractType[action].toLowerCase()}`,
        "data-action-type": InteractType[action],
        "data-action-card-count": cards.length,
        "data-action-response":
          cards.length === 1
            ? getNonEffectInteractivity(action, cards[0]).response
            : undefined,
        "data-action-response-source":
          cards.length === 1
            ? getNonEffectInteractivity(action, cards[0]).responseSource
            : undefined,
        label: interactTypeToString(action),
        icon: interactTypeToIcon(action),
        onClick: (event) => {
          // The menu is portaled; bubbling to the card would reopen its drawer.
          event.domEvent.stopPropagation();
          void runActiveAction(container, async (lease) => {
            // Freeze the response before a candidate window or confirmation.
            const candidates = cards
              .filter((card) => getNonEffectInteractivity(action, card))
              .map((card) => ({
                card,
                ...getNonEffectInteractivity(action, card),
              }));
            let selected = candidates[0];
            if (!selected) return;
            if (isField) {
              const option = await displaySimpleSelectCardsModal(
                {
                  selectables: candidates.map(({ card }) => ({
                    meta: card.meta,
                    location: card.location,
                    response: getNonEffectInteractivity(action, card).response,
                    card,
                  })),
                },
                lease.signal,
              );
              if (!option.length) return;
              selected = candidates.find(
                (item) => item.card.uuid === option[0].card?.uuid,
              )!;
            }
            if (!selected) return;
            return {
              response: selected.response,
              responseSource: selected.responseSource,
              label: `${interactTypeToString(action)} · ${
                selected.card.meta.text.name ?? selected.card.code
              }`,
            };
          });
        },
      }),
    );
    const hasEffect =
      cards.reduce(
        (prev, acc) => [
          ...prev,
          ...acc.idleInteractivities.filter(
            ({ interactType }) => interactType === InteractType.ACTIVATE,
          ),
        ],
        [] as Interactivity<number>[],
      ).length > 0;
    const effectItem: DropdownItem = {
      key: nonEffectItem.length,
      "data-testid": "duel-action-activate",
      "data-action-type": InteractType[InteractType.ACTIVATE],
      label: interactTypeToString(InteractType.ACTIVATE),
      icon: interactTypeToIcon(InteractType.ACTIVATE),
      onClick: (event) => {
        event.domEvent.stopPropagation();
        void runActiveAction(container, async (lease) => {
          const candidates = cards
            .map((card) => ({
              card,
              effects: card.idleInteractivities
                .filter((item) => item.interactType === InteractType.ACTIVATE)
                .map((item) => ({ ...item })),
            }))
            .filter((item) => item.effects.length > 0);
          let selected = candidates[0];
          if (isField) {
            const option = await displaySimpleSelectCardsModal(
              {
                selectables: candidates.map(({ card }) => ({
                  meta: card.meta,
                  location: card.location,
                  card,
                })),
              },
              lease.signal,
            );
            if (!option.length) return;
            selected = candidates.find(
              (item) => item.card.uuid === option[0].card?.uuid,
            )!;
          }
          if (!selected || !lease.valid()) return;
          const { card, effects } = selected;
          let effect = effects[0];
          let effectLabel = "";
          if (effects.length > 1) {
            const options = effects.map((item) => ({
              info:
                item.activateIndex !== undefined
                  ? getCardStr(card.meta, item.activateIndex & 0xf) ?? "[:?]"
                  : "[:?]",
              response: item.response,
            }));
            const response = await displayActiveOptionModal(
              fetchStrings(Region.System, 556),
              options,
              lease.signal,
            );
            if (response === undefined) return;
            effect = effects.find((item) => item.response === response)!;
            effectLabel =
              options.find((item) => item.response === response)?.info ?? "";
          }
          if (!effect) return;
          return {
            response: effect.response,
            responseSource: effect.responseSource,
            label: `${interactTypeToString(InteractType.ACTIVATE)} · ${
              card.meta.text.name ?? card.code
            }${effectLabel ? ` · ${effectLabel}` : ""}`,
          };
        });
      },
    };
    setDropdownMenu({
      items: [
        ...nonEffectItem,
        ...(hasEffect ? [effectItem] : []),
        ...(!isField
          ? [
              ...(overlayCount && !card.location.is_overlay
                ? [
                    {
                      key: "materials",
                      label: `${
                        replayCardWords(language).materials
                      } (${overlayCount})`,
                      onClick: (
                        event: Parameters<NonNullable<MenuProps["onClick"]>>[0],
                      ) => {
                        event.domEvent.stopPropagation();
                        displayCardListModal({ isZone: false, monster: card });
                      },
                    },
                  ]
                : []),
              ...(actionFirst
                ? [
                    {
                      key: "details",
                      label: words.details,
                      onClick: (
                        event: Parameters<NonNullable<MenuProps["onClick"]>>[0],
                      ) => {
                        event.domEvent.stopPropagation();
                        displayCardModal(card);
                      },
                    },
                  ]
                : []),
            ]
          : []),
      ],
    });
    return true;
  };

  const onClick = () => {
    const onCardClick = (card: CardType) => {
      const selectInfo = card.selectInfo;
      if (selectInfo.selectable || selectInfo.selected) {
        if (selectInfo.response !== undefined) {
          sendSelectMultiResponse(container.conn, [selectInfo.response]);
          clearSelectInfo();
        } else {
          console.error("card is selectable but the response is undefined!");
        }
        setDropdownMenuDisabled(true);
        return;
      }
      const hasActions = handleDropdownMenu([card], false);
      if (!hasActions || !actionFirst) {
        if (overlayCount && !card.location.is_overlay) {
          displayCardListModal({ isZone: false, monster: card });
        } else displayCardModal(card);
      }
    };

    const onFieldClick = (card: CardType) => {
      displayCardListModal({
        isZone: true,
        zone: card.location.zone,
        controller: card.location.controller,
      });
      // 收集这个zone的所有交互，并且在下拉菜单之中显示
      const cards = cardStore.at(card.location.zone, card.location.controller);
      handleDropdownMenu(cards, true);
    };

    if ([MZONE, SZONE, HAND].includes(card.location.zone)) {
      onCardClick(card);
    } else if ([DECK, EXTRA, GRAVE, REMOVED].includes(card.location.zone)) {
      onFieldClick(card);
    }
  };
  // <<< 效果 <<<

  const location = snap.location;
  const shownCode =
    location.zone === DECK
      ? visibleDeckCode(snap, deckReversed)
      : snap.code === 0
      ? snap.meta.id
      : snap.code;
  const disabled = isCardDisabled(snap as CardType);
  const idleActions = snap.idleInteractivities
    .map(({ interactType }) => InteractType[interactType])
    .join(" ");
  const idleActionResponses = snap.idleInteractivities
    .map(
      ({ interactType, response }) =>
        `${InteractType[interactType]}:${response}`,
    )
    .join(" ");
  const idleActionSources = snap.idleInteractivities
    .map(
      ({ interactType, responseSource }) =>
        `${InteractType[interactType]}:${responseSource ?? "idle"}`,
    )
    .join(" ");
  const attackInteractivity = snap.idleInteractivities.find(
    ({ interactType }) => interactType === InteractType.ATTACK,
  );

  return (
    <animated.div
      data-testid="duel-card"
      data-card-uuid={snap.uuid}
      data-card-info-host={
        !location.is_overlay && fieldSpot ? snap.uuid : undefined
      }
      data-card-code={location.zone === DECK ? shownCode : snap.code}
      data-card-controller={location.controller}
      data-card-zone={ygopro.CardZone[location.zone]}
      data-card-zone-value={location.zone}
      data-card-sequence={location.sequence}
      data-card-position={ygopro.CardPosition[location.position]}
      data-card-position-value={location.position}
      data-card-is-overlay={location.is_overlay}
      title={location.is_overlay ? snap.meta.text.name : undefined}
      data-material-count={location.is_overlay ? undefined : overlayCount}
      data-card-overlay-sequence={location.overlay_sequence}
      data-card-is-token={snap.isToken}
      data-card-status={snap.status}
      data-card-selectable={snap.selectInfo.selectable}
      data-card-selected={snap.selectInfo.selected}
      data-card-targeted={snap.targeted}
      data-card-disabled={disabled}
      data-field-selected={fieldCandidate ? !!fieldChosen : undefined}
      data-field-focused={fieldCandidate ? fieldFocused : undefined}
      data-card-idle-actions={idleActions}
      data-card-idle-responses={idleActionResponses}
      data-card-idle-response-sources={idleActionSources}
      data-card-attack-directable={attackInteractivity?.directAttackAble}
      className={classnames(styles["mat-card"], {
        /* 有可操作选项或者已被选中*/
        [styles.glowing]: glowing || snap.selectInfo.selected,
        [styles.shining]: snap.selectInfo.selectable, // 可以被选中
        [styles.targetCandidate]: fieldCandidate,
        [styles.targetSelected]: fieldCandidate && fieldChosen,
        [styles.targetFocused]: fieldFocused,
      })}
      style={
        {
          transform: to(
            [spring.x, spring.y, spring.z, spring.rx, spring.ry, spring.rz],
            (x, y, z, rx, ry, rz) =>
              `translate(${x}px, ${y}px) rotateX(${rx}deg) rotateZ(${rz}deg)`,
          ),
          "--z": spring.z,
          "--sub-z": spring.subZ.to([0, 50, 100], [0, 200, 0]), // 中间高，两边低
          "--ry": spring.ry,
          height: spring.height,
          zIndex: spring.zIndex,
          "--focus-scale": spring.focusScale,
          "--focus-display": spring.focusDisplay,
          "--focus-opacity": spring.focusOpacity,
          opacity: spring.opacity,
        } as any as CSSProperties
      }
      onClick={onClick}
      onClickCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea")
        )
          return;
        if (fieldEntry && toggleFieldSelection(fieldKey)) {
          event.preventDefault();
          event.stopPropagation();
          setDropdownMenuDisabled(true);
        }
      }}
      onMouseEnter={() => {
        if (fieldEntry) focusFieldSelection(fieldKey);
      }}
      role={fieldSpot ? "button" : undefined}
      tabIndex={fieldSpot ? 0 : undefined}
      aria-label={fieldSpot ? fieldLabel : undefined}
      aria-pressed={fieldEntry ? !!fieldChosen : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (fieldEntry && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          toggleFieldSelection(fieldKey);
        } else if (fieldSpot && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          event.currentTarget
            .querySelector<HTMLElement>('[data-testid="duel-card-trigger"]')
            ?.click();
        }
      }}
    >
      {fieldCandidate && fieldPositionInfo && (
        <animated.span
          className={styles.targetLabel}
          data-testid="duel-field-marker"
          data-slot={fieldPositionInfo.slot}
          title={fieldLabel}
          style={{
            transform: spring.rz.to(
              (rz) =>
                `translateZ(2px) rotate(calc(-${rz}deg - var(--duel-view-rotation, 0deg)))`,
            ),
          }}
        >
          {fieldChosen && <CheckOutlined />}
          {fieldPositionInfo.slot ?? <AimOutlined />}
        </animated.span>
      )}
      <div className={styles.focus} />
      <div className={styles.shadow} />
      <Dropdown
        menu={dropdownMenu}
        placement="top"
        overlayClassName={classnames(styles.dropdown, {
          [styles["dropdown-disabled"]]: dropdownMenuDisabled,
        })}
        arrow
        trigger={["click"]}
      >
        <div
          data-testid="duel-card-trigger"
          data-card-info-id={
            !location.is_overlay && fieldSpot ? snap.uuid : undefined
          }
          title={counterDescription(snap.counters) || undefined}
          className={classnames(styles["img-wrap"], {
            [styles.focusing]: classFocus,
          })}
        >
          <YgoCard
            className={styles.cover}
            code={shownCode}
            disabled={disabled}
            targetFlash={snap.targetFlash}
          />
          <YgoCard className={styles.back} isBack />
        </div>
      </Dropdown>
      {!location.is_overlay && overlayCount > 0 && (
        <button
          type="button"
          className={styles.materialCount}
          data-testid="duel-material-count"
          style={{
            transform: `translateZ(1px) rotate(calc(-${
              (isMe(location.controller) ? 0 : 180) +
              ([
                ygopro.CardPosition.DEFENSE,
                ygopro.CardPosition.FACEUP_DEFENSE,
                ygopro.CardPosition.FACEDOWN_DEFENSE,
              ].includes(location.position)
                ? 90
                : 0)
            }deg - var(--duel-view-rotation, 0deg)))`,
          }}
          aria-label={`${
            replayCardWords(language).materials
          } (${overlayCount})`}
          onClick={(event) => {
            event.stopPropagation();
            displayCardListModal({ isZone: false, monster: card });
          }}
        >
          {overlayCount}
        </button>
      )}
      {snap.targeted ? <div className={styles.streamer} /> : <></>}
    </animated.div>
  );
});

// >>> 下拉菜单：点击动作 >>>
type DropdownItem = NonNullable<MenuProps["items"]>[number] & {
  onClick: NonNullable<MenuProps["onClick"]>;
  "data-testid"?: string;
  "data-action-type"?: string;
};

// <<< 下拉菜单 <<<

const call =
  <Options,>(task: Task) =>
  (uuid: string, options?: Options extends undefined ? never : Options) =>
    eventbus.call(task, uuid, options);

export const callCardMove = call<MoveOptions>(Task.Move);
export const callCardFocus = call<FocusOptions>(Task.Focus);
export const callCardAttack = call<AttackOptions>(Task.Attack);
