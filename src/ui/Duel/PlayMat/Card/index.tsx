import { animated, to, useSpring } from "@react-spring/web";
import { Dropdown, type MenuProps } from "antd";
import classnames from "classnames";
import React, { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import {
  type CardMeta,
  Region,
  sendSelectBattleCmdResponse,
  sendSelectMultiResponse,
} from "@/api";
import {
  fetchStrings,
  getCardStr,
  sendSelectIdleCmdResponse,
  ygopro,
} from "@/api";
import { Container } from "@/container";
import { getUIContainer } from "@/container/compat";
import { eventbus, Task } from "@/infra";
import {
  cardStore,
  CardType,
  Interactivity,
  InteractType,
  isCardDisabled,
} from "@/stores";
import { showCardModal as displayCardModal } from "@/ui/Duel/Message/CardModal";
import { YgoCard } from "@/ui/Shared";

import {
  displayCardListModal,
  displayOptionModal,
  displaySimpleSelectCardsModal,
} from "../../Message";
import {
  clearAllIdleInteractivities,
  clearSelectInfo,
  interactTypeToIcon,
  interactTypeToString,
} from "../../utils";
import styles from "./index.module.scss";
import {
  attack,
  type AttackOptions,
  focus,
  move,
  type MoveOptions,
} from "./springs";
import type { SpringApiProps } from "./springs/types";

const { HAND, GRAVE, REMOVED, EXTRA, MZONE, SZONE, TZONE } = ygopro.CardZone;

export const Card: React.FC<{ idx: number }> = React.memo(({ idx }) => {
  const container = getUIContainer();
  const card = cardStore.inner[idx];
  const snap = useSnapshot(card);

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
      async () => {
        await addToAnimation(async () => {
          setClassFocus(true);
          await focus({ card, api });
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
    return () => {
      mounted.current = false;
      unregisterMove();
      unregisterFocus();
      unregisterAttack();
      api.stop(true);
    };
  }, []);

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
      return;
    } else {
      setDropdownMenuDisabled(false);
    }
    const actions = [...map.entries()];
    const nonEffectActions = actions.filter(
      ([action]) => action !== InteractType.ACTIVATE,
    );
    const getNonEffectInteractivity = (action: InteractType, card: CardType) =>
      card.idleInteractivities.find((item) => item.interactType === action)!;
    const sendInteractionResponse = (interactivity: Interactivity<number>) => {
      if (interactivity.responseSource === "battle") {
        sendSelectBattleCmdResponse(container.conn, interactivity.response);
      } else {
        sendSelectIdleCmdResponse(container.conn, interactivity.response);
      }
    };
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
        onClick: async () => {
          if (!isField) {
            // 单卡: 直接召唤/特殊召唤/...
            const card = cards[0];
            sendInteractionResponse(getNonEffectInteractivity(action, card));
            clearAllIdleInteractivities();
          } else {
            // 场地: 选择卡片
            // TODO: hint
            const option = await displaySimpleSelectCardsModal({
              selectables: cards.map((card) => ({
                meta: card.meta,
                location: card.location,
                response: getNonEffectInteractivity(action, card).response,
                card,
              })),
            });
            if (option.length > 0) {
              sendInteractionResponse(
                getNonEffectInteractivity(action, option[0].card as CardType),
              );
              clearAllIdleInteractivities();
            }
          }
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
      onClick: async () => {
        let tmpCard: CardType;
        if (!isField) {
          // 单卡: 直接发动这个卡的效果
          tmpCard = cards[0];
        } else {
          // 场地: 选择卡片
          // TODO: hint
          const option = await displaySimpleSelectCardsModal({
            selectables: cards
              // 过滤掉不能发效果的卡
              .filter(
                (card) =>
                  card.idleInteractivities.find(
                    ({ interactType }) =>
                      interactType === InteractType.ACTIVATE,
                  ) !== undefined,
              )
              .map((card) => ({
                meta: card.meta,
                location: card.location,
                card,
              })),
          });
          tmpCard = option[0].card! as any; // 一定会有的，有输入则定有输出
        }
        // 选择发动哪个效果
        handleEffectActivation(
          container,
          tmpCard.idleInteractivities
            .filter(
              ({ interactType }) => interactType === InteractType.ACTIVATE,
            )
            .map((x) => ({
              desc: interactTypeToString(x.interactType),
              response: x.response,
              responseSource: x.responseSource,
              effectCode: x.activateIndex,
            })),
          tmpCard.meta,
        );
      },
    };
    setDropdownMenu({
      items: [...nonEffectItem, ...(hasEffect ? [effectItem] : [])],
    });
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
      }

      // 中央弹窗展示选中卡牌信息
      // TODO: 同一张卡片，是否重复点击会关闭CardModal？
      displayCardModal(card);
      handleDropdownMenu([card], false);

      // 侧边栏展示超量素材信息
      const overlayMaterials = cardStore.findOverlay(
        card.location.zone,
        card.location.controller,
        card.location.sequence,
      );
      if (overlayMaterials.length > 0) {
        displayCardListModal({
          isZone: false,
          monster: card,
        });
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
    } else if ([EXTRA, GRAVE, REMOVED].includes(card.location.zone)) {
      onFieldClick(card);
    }
  };
  // <<< 效果 <<<

  const location = snap.location;
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
      data-card-code={snap.code}
      data-card-controller={location.controller}
      data-card-zone={ygopro.CardZone[location.zone]}
      data-card-zone-value={location.zone}
      data-card-sequence={location.sequence}
      data-card-position={ygopro.CardPosition[location.position]}
      data-card-position-value={location.position}
      data-card-is-overlay={location.is_overlay}
      data-card-overlay-sequence={location.overlay_sequence}
      data-card-is-token={snap.isToken}
      data-card-status={snap.status}
      data-card-selectable={snap.selectInfo.selectable}
      data-card-selected={snap.selectInfo.selected}
      data-card-targeted={snap.targeted}
      data-card-disabled={disabled}
      data-card-idle-actions={idleActions}
      data-card-idle-responses={idleActionResponses}
      data-card-idle-response-sources={idleActionSources}
      data-card-attack-directable={attackInteractivity?.directAttackAble}
      className={classnames(styles["mat-card"], {
        /* 有可操作选项或者已被选中*/
        [styles.glowing]: glowing || snap.selectInfo.selected,
        [styles.shining]: snap.selectInfo.selectable, // 可以被选中
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
    >
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
          className={classnames(styles["img-wrap"], {
            [styles.focusing]: classFocus,
          })}
        >
          <YgoCard
            className={styles.cover}
            code={snap.code === 0 ? snap.meta.id : snap.code}
            disabled={disabled}
          />
          <YgoCard className={styles.back} isBack />
        </div>
      </Dropdown>
      {snap.targeted ? <div className={styles.streamer} /> : <></>}
    </animated.div>
  );
});

// >>> 下拉菜单：点击动作 >>>
interface Interactivy {
  desc: string;
  response: number;
  responseSource?: "idle" | "battle";
  effectCode: number | undefined;
}

type DropdownItem = NonNullable<MenuProps["items"]>[number] & {
  onClick: () => void;
  "data-testid"?: string;
  "data-action-type"?: string;
};

const handleEffectActivation = (
  container: Container,
  effectInteractivies: Interactivy[],
  meta?: CardMeta,
) => {
  if (!effectInteractivies.length) return;
  else if (effectInteractivies.length === 1) {
    // 如果只有一个效果，点击直接触发
    if (effectInteractivies[0].responseSource === "battle") {
      sendSelectBattleCmdResponse(
        container.conn,
        effectInteractivies[0].response,
      );
    } else {
      sendSelectIdleCmdResponse(
        container.conn,
        effectInteractivies[0].response,
      );
    }
  } else {
    // optionsModal
    const options = effectInteractivies.map((effect) => {
      const effectMsg =
        meta && effect.effectCode
          ? getCardStr(meta, effect.effectCode & 0xf) ?? "[:?]"
          : "[:?]";
      return {
        info: effectMsg,
        response: effect.response,
      };
    });
    displayOptionModal(fetchStrings(Region.System, 556), options, 1); // 主动发动效果，所以不需要await，但是以后可能要留心
  }
};

// <<< 下拉菜单 <<<

const call =
  <Options,>(task: Task) =>
  (uuid: string, options?: Options extends undefined ? never : Options) =>
    eventbus.call(task, uuid, options);

export const callCardMove = call<MoveOptions>(Task.Move);
export const callCardFocus = call(Task.Focus);
export const callCardAttack = call<AttackOptions>(Task.Attack);
