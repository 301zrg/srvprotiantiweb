import { CheckOutlined } from "@ant-design/icons";
import { CheckCard } from "@ant-design/pro-components";
import { Button, Card, Segmented, Space, Tooltip } from "antd";
import classnames from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { type CardMeta, Region, ygopro } from "@/api";
import { fetchStrings } from "@/api";
import { getUIContainer, hasUIContainer } from "@/container/compat";
import { useMobileInterface } from "@/hook";
import { cardStore, CardType, isMe, matStore } from "@/stores";
import {
  bindFieldSelection,
  fieldSpotKey,
  focusFieldSelection,
  onlineFieldSpot,
} from "@/stores/fieldSelectionStore";
import { FieldSelectionGrid } from "@/ui/Duel/FieldSelection";
import { useI18N } from "@/ui/I18N";
import { ScrollableArea, YgoCard } from "@/ui/Shared";
import { duelInteractionMessages } from "@/variant/duelInteraction";
import { duelResultMessages } from "@/variant/duelResultMessages";
import { type DuelTiming, formatChainContext } from "@/variant/duelTiming";
import {
  fieldPosition,
  fieldPositionLabel,
  fieldSelectionMessages,
} from "@/variant/fieldSelection";
import { mobileMessages } from "@/variant/mobileMessages";

import { groupBy } from "../../utils";
import { closeCardModal, showCardModal } from "../CardModal";
import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

export interface SelectCardsModalProps {
  isOpen: boolean;
  min: number;
  max: number;
  single: boolean;
  selecteds: Snapshot<Option[]>; // 已经选择了的卡
  selectables: Snapshot<Option[]>; // 最多选择多少卡
  mustSelects: Snapshot<Option[]>; // 单选
  cancelable: boolean; // 能否取消
  finishable: boolean; // 选择足够了之后，能否确认
  totalLevels: number; // 需要的总等级数（用于同调/仪式/...）
  overflow: boolean; // 选择等级时候，是否可以溢出
  isChain?: boolean; // 是否是 select_chain 选择
  chainContext?: { source?: DuelTiming["event"]; hint0: number; hint1: number };
  onSubmit: (options: Snapshot<Option[]>) => void;
  onCancel: () => void;
  onFinish: () => void;
}

export const SelectCardsModal: React.FC<SelectCardsModalProps> = ({
  isOpen,
  min,
  max,
  single,
  selecteds,
  selectables,
  mustSelects,
  cancelable,
  finishable,
  totalLevels,
  overflow,
  isChain = false,
  chainContext,
  onSubmit,
  onCancel,
  onFinish,
}) => {
  const { t } = useTranslation("ClientUI");
  const mobile = useMobileInterface();
  const { language } = useI18N();
  const boardCards = useSnapshot(cardStore).inner;
  useSnapshot(matStore);
  const viewPlayer = isMe(0) ? 0 : 1;
  const fieldWords = fieldSelectionMessages(language);
  const grouped = groupBy(selectables, (option) => option.location?.zone!);
  const [result, setResult] = useState<[ygopro.CardZone, Option[]][]>([]);
  const [submitable, setSubmitable] = useState(false);
  const emptyChain = isChain && selectables.length === 0;
  const [inspecting, setInspecting] = useState(false);
  useEffect(() => {
    setInspecting(false);
  }, [isOpen]);
  const address = (option: Snapshot<Option>) =>
    option.location ? onlineFieldSpot(option.location) : undefined;
  const spatialOptions = useMemo(
    () =>
      !isChain
        ? [...selectables, ...selecteds, ...mustSelects].filter((option) => {
            const spot = address(option);
            return spot && fieldPosition(spot, viewPlayer);
          })
        : [],
    [selectables, selecteds, mustSelects, isChain, viewPlayer],
  );
  const spatial = spatialOptions.length > 0;
  const chosen = result.flatMap(([, options]) => options);
  const sameOption = (left: Snapshot<Option>, right: Snapshot<Option>) => {
    if (left.response !== undefined && right.response !== undefined)
      return left.response === right.response;
    if (left === right) return true;
    const a = left.location;
    const b = right.location;
    return (
      !!a &&
      !!b &&
      a.controller === b.controller &&
      a.zone === b.zone &&
      a.sequence === b.sequence &&
      a.is_overlay === b.is_overlay &&
      a.overlay_sequence === b.overlay_sequence &&
      left.effectDesc === right.effectDesc
    );
  };
  const selected = (option: Snapshot<Option>) =>
    chosen.some((item) => sameOption(item, option));
  const label = (option: Snapshot<Option>) => {
    const spot = address(option);
    if (spot)
      return fieldPositionLabel(spot, viewPlayer, language, (id) =>
        fetchStrings(Region.System, id),
      );
    const location = option.location;
    if (!location) return "";
    const owners = duelResultMessages(language);
    return `${
      isMe(location.controller) ? owners.self : owners.opponent
    } · ${fetchStrings(Region.System, location.zone + 1000)} (${
      location.sequence + 1
    })${
      location.is_overlay
        ? ` · ${fetchStrings(Region.System, 1007)} (${
            location.overlay_sequence + 1
          })`
        : ""
    }`;
  };
  const toggle = (option: Snapshot<Option>) =>
    setResult((previous) =>
      previous.map(([zone, values]) => [
        zone,
        zone !== option.location?.zone
          ? values
          : values.some((item) => sameOption(item, option))
          ? values.filter((item) => !sameOption(item, option))
          : [...values, option as Option],
      ]),
    );
  const entries = () =>
    spatialOptions.map((option) => {
      const spot = address(option)!;
      const fixed = !selectables.includes(option);
      return {
        key: fieldSpotKey(spot),
        spot,
        selected: fixed || selected(option),
        fixed,
      };
    });
  const binding = useRef<ReturnType<typeof bindFieldSelection>>();
  useEffect(() => {
    if (!isOpen || !spatial) return;
    const current = bindFieldSelection(
      entries(),
      (key) => {
        const option = selectables.find((option) => {
          const spot = address(option);
          return spot && fieldSpotKey(spot) === key;
        });
        if (option) toggle(option);
      },
      hasUIContainer() ? getUIContainer().conn.signal : undefined,
    );
    binding.current = current;
    return () => {
      current.release();
      if (binding.current === current) binding.current = undefined;
    };
  }, [isOpen, spatialOptions]);
  useEffect(() => {
    binding.current?.update(entries());
  }, [result, spatialOptions]);
  const locate = (option: Snapshot<Option>) => {
    closeCardModal();
    setInspecting(true);
    const spot = address(option);
    if (spot) focusFieldSelection(fieldSpotKey(spot));
  };
  const displayCode = (option: Snapshot<Option>) => {
    if (
      !option.location ||
      !hasUIContainer() ||
      isMe(option.location.controller)
    )
      return option.meta.id;
    const location =
      getUIContainer().context.cardStore.find(
        option.location as ygopro.CardLocation,
      )?.location ?? option.location;
    return address(option) && [1, 3, 5].includes(location.position)
      ? 0
      : option.meta.id;
  };
  const liveTargeted = (option: Snapshot<Option>) => {
    const location = option.location;
    if (!location || !hasUIContainer()) return !!option.targeted;
    return !!boardCards.find((card) => {
      const at = card.location;
      return (
        at.controller === location.controller &&
        at.zone === location.zone &&
        at.sequence === location.sequence &&
        at.is_overlay === location.is_overlay &&
        (!at.is_overlay || at.overlay_sequence === location.overlay_sequence)
      );
    })?.targeted;
  };

  const hint = useSnapshot(matStore.hint);
  const preHintMsg = hint.esHint || "";
  const selectHintMsg = hint.esSelectHint || t("SelectCard");

  const minMaxText = min === max ? min : `${min}-${max}`;

  const { t: i18n } = useTranslation("SelectCardModal");

  useEffect(() => {
    const initial: [ygopro.CardZone, Option[]][] = grouped.map(([zone, _]) => [
      zone,
      [] as Option[],
    ]);
    setResult(initial);
  }, [selectables]);

  // 判断是否可以提交
  useEffect(() => {
    const flatResult = result.map(([_, v]) => v).flat();
    const [sumLevel1, sumLevel2] = (["level1", "level2"] as const).map((key) =>
      [...mustSelects, ...flatResult]
        .map((option) => option[key] || 0)
        .reduce((sum, current) => sum + current, 0),
    );
    const levelMatched = overflow
      ? sumLevel1 >= totalLevels || sumLevel2 >= totalLevels
      : sumLevel1 === totalLevels || sumLevel2 === totalLevels;
    setSubmitable(
      single
        ? flatResult.length === 1
        : flatResult.length >= min && flatResult.length <= max && levelMatched,
    );
  }, [result]);

  const zoneOptions = grouped.map((x) => ({
    value: x[0],
    label: fetchStrings(Region.System, x[0] + 1000),
  }));

  const [selectedZone, setSelectedZone] = useState(zoneOptions[0]?.value);

  useEffect(() => {
    setSelectedZone(zoneOptions[0]?.value);
  }, [selectables]);

  // 文案
  const [submitText, finishText, cancelText] = [1211, 1296, 1295].map((n) =>
    fetchStrings(Region.System, n),
  );

  // Quick select if possiable
  const onQuickSelect = (option: Option) => {
    if (spatial) return;
    if (max === 1 || single) {
      // if `max` is 1, it means that we can just select one,
      // so quick selection is possiable in this case.
      closeCardModal();
      onSubmit([option]);
    }
  };

  const renderOption = (card: Snapshot<Option>, j = 0) => {
    const spot = address(card);
    const position = spot && fieldPosition(spot, viewPlayer);
    const code = displayCode(card);
    const targeted = liveTargeted(card);
    const location =
      card.location && hasUIContainer()
        ? getUIContainer().context.cardStore.find(
            card.location as ygopro.CardLocation,
          )?.location ?? card.location
        : card.location;
    const defense = location && [2, 3].includes(location.position);
    return (
      <Tooltip
        title={card.effectDesc}
        placement="bottom"
        key={`${card.response}:${j}`}
      >
        <div
          className={styles.fieldOption}
          data-testid="duel-select-card-option"
          data-card-code={code}
          data-card-controller={card.location?.controller}
          data-card-zone={
            card.location?.zone === undefined
              ? undefined
              : ygopro.CardZone[card.location.zone]
          }
          data-card-zone-value={card.location?.zone}
          data-card-sequence={card.location?.sequence}
          data-card-response={card.response}
          data-field-selected={selected(card)}
          data-field-defense={!!position && !!defense}
          data-card-targeted={targeted}
          aria-label={label(card) || undefined}
          onMouseEnter={() => {
            if (isOpen && spatial && spot)
              focusFieldSelection(fieldSpotKey(spot));
          }}
          onDoubleClick={() => onQuickSelect(card as Option)}
        >
          <CheckCard
            cover={
              <div className={styles.fieldCover}>
                <YgoCard
                  code={code}
                  targeted={targeted}
                  disabled={card.disabled}
                  className={styles.fieldImage}
                />
                {selected(card) && (
                  <CheckOutlined className={styles.fieldCheck} />
                )}
              </div>
            }
            className={classnames(styles["check-card"], {
              [styles.opponent]:
                !spatial &&
                card.location?.controller !== undefined &&
                !isMe(card.location.controller),
            })}
            value={card}
            onClick={() => {
              if (!mobile && code > 0)
                showCardModal({ ...card, meta: card.meta } as Option);
            }}
          />
          {!position && label(card) && (
            <span
              className={styles.optionLocation}
              data-testid="duel-selection-location"
            >
              {label(card)}
            </span>
          )}
          {targeted && (
            <span
              className={styles.targetTag}
              data-testid="duel-selection-targeted"
            >
              {t("Targeted")}
            </span>
          )}
          {spatial && position && (
            <>
              <Button
                className={styles.preview}
                data-testid="duel-select-card-locate"
                aria-label={`${fieldWords.locate}: ${label(card)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  locate(card);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {fieldWords.locate}
              </Button>
            </>
          )}
          {mobile && (!spatial || !position || code > 0) && (
            <Button
              className={styles.preview}
              data-testid="duel-select-card-preview"
              aria-label={`${mobileMessages(language).viewCard} ${
                code ? card.meta.text.name : ""
              }`}
              onClick={(event) => {
                event.stopPropagation();
                showCardModal(card);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {mobileMessages(language).viewCard}
            </Button>
          )}
        </div>
      </Tooltip>
    );
  };

  return (
    <NeosModal
      title={
        <>
          <span>
            {isChain && chainContext
              ? formatChainContext(
                  chainContext.source,
                  chainContext.hint0,
                  chainContext.hint1,
                  language,
                )
              : preHintMsg}
          </span>
          <span>{emptyChain ? "" : selectHintMsg}</span>
          {!isChain && (
            <span>
              ({i18n("PleaseSelect")} {minMaxText} {i18n("Cards")})
            </span>
          )}
          <span>{single ? i18n("SelectOneCardAtTime") : ""}</span>
        </>
      } // TODO: 这里可以再细化一些
      width={"38.25rem"}
      okButtonProps={{
        disabled: !submitable,
      }}
      open={isOpen}
      minimized={emptyChain || spatial ? inspecting : undefined}
      onMinimizedChange={emptyChain || spatial ? setInspecting : undefined}
      minimizedActions={
        emptyChain ? (
          <Button data-testid="duel-chain-continue" onClick={onCancel}>
            {submitText}
          </Button>
        ) : spatial ? (
          <Button
            data-testid="duel-field-selection-back"
            onClick={() => setInspecting(false)}
          >
            {fieldWords.back}
          </Button>
        ) : undefined
      }
      afterClose={() => {
        // Modal每次展示时都会消费`esHint`和`esSelectHint`，
        // 否则这些提示会保留到下一次Modal展示，可能会疑惑玩家
        matStore.hint.esHint = undefined;
        matStore.hint.esSelectHint = undefined;
      }}
      footer={
        emptyChain ? (
          <>
            <Button data-testid="duel-select-card-cancel" onClick={onCancel}>
              {fetchStrings(Region.System, 1214)}
            </Button>
            <Button
              data-testid="duel-chain-inspect"
              type="primary"
              onClick={() => setInspecting(true)}
            >
              {fetchStrings(Region.System, 1213)}
            </Button>
          </>
        ) : (
          <>
            <Button
              data-testid="duel-select-card-reset"
              onClick={() => {
                closeCardModal();
                setResult(grouped.map(([zone]) => [zone, []]));
              }}
            >
              {duelInteractionMessages(language).reset}
            </Button>
            {cancelable && (
              <Button
                data-testid="duel-select-card-cancel"
                onClick={() => {
                  closeCardModal();
                  onCancel();
                }}
              >
                {cancelText}
              </Button>
            )}
            {finishable && (
              <Button
                data-testid="duel-select-card-finish"
                type="primary"
                onClick={() => {
                  closeCardModal();
                  onFinish();
                }}
              >
                {finishText}
              </Button>
            )}
            <Button
              data-testid="duel-select-card-submit"
              type="primary"
              disabled={!submitable}
              onClick={() => {
                closeCardModal();
                onSubmit([...mustSelects, ...result.map(([_, v]) => v).flat()]);
              }}
            >
              {submitText}
            </Button>
          </>
        )
      }
    >
      <Space
        data-testid="duel-select-cards-modal"
        data-select-min={min}
        data-select-max={max}
        data-select-single={single}
        data-select-is-chain={isChain}
        data-select-cancelable={cancelable}
        data-select-finishable={finishable}
        direction="vertical"
        style={{ width: "100%", overflow: "hidden" }}
      >
        {emptyChain && (
          <p>
            {fetchStrings(Region.System, 201)}
            <br />
            {fetchStrings(Region.System, 202)}
          </p>
        )}
        {!spatial && (
          <Selector
            zoneOptions={zoneOptions}
            selectedZone={selectedZone}
            onChange={setSelectedZone as any}
          />
        )}
        <ScrollableArea maxHeight="50vh">
          <div className={styles.container}>
            <CheckCard.Group
              className={spatial ? styles.spatialGroup : styles["check-group"]}
              multiple
              value={
                (spatial
                  ? chosen
                  : result.find(([zone]) => zone === selectedZone)?.[1] ??
                    []) as any
              }
              onChange={(res: any) =>
                setResult((previous) =>
                  previous.map(([zone, values]) => [
                    zone,
                    spatial
                      ? res.filter(
                          (option: Option) => option.location?.zone === zone,
                        )
                      : zone === selectedZone
                      ? res
                      : values,
                  ]),
                )
              }
            >
              {spatial ? (
                <FieldSelectionGrid
                  options={selectables}
                  address={address}
                  viewPlayer={viewPlayer}
                  language={language}
                  renderOption={renderOption}
                />
              ) : (
                grouped
                  .filter(([zone]) => zone === selectedZone)
                  .flatMap(([, options]) => options.map(renderOption))
              )}
            </CheckCard.Group>
          </div>
        </ScrollableArea>
        {spatial && (
          <div
            className={styles.selectionSummary}
            data-testid="duel-field-selection-summary"
          >
            <span>
              {chosen.length + mustSelects.length}/{max}{" "}
              {fetchStrings(Region.System, 212)}
            </span>
            {[...mustSelects, ...chosen].map((option, i) => (
              <span key={i}>{label(option) || option.meta.text.name}</span>
            ))}
          </div>
        )}
        <p>
          <span>
            {/* TODO: 这里的字体可以调整下 */}
            {selecteds.length > 0 ? fetchStrings(Region.System, 212) : ""}
          </span>
        </p>
        <div className={styles["check-group"]}>
          {selecteds.map((card, i) => (
            <Tooltip
              title={card.effectDesc}
              placement="bottom"
              key={grouped.length + i}
            >
              <div>
                <Card
                  cover={
                    <YgoCard
                      code={displayCode(card)}
                      targeted={liveTargeted(card)}
                      className={styles.card}
                    />
                  }
                  className={styles["check-card"]}
                  onClick={() => {
                    if (displayCode(card) > 0) showCardModal(card);
                  }}
                />
              </div>
            </Tooltip>
          ))}
        </div>
      </Space>
    </NeosModal>
  );
};

/** 选择区域 */
const Selector: React.FC<{
  zoneOptions: {
    value: ygopro.CardZone;
    label: string;
  }[];
  selectedZone: ygopro.CardZone;
  onChange: (value: ygopro.CardZone) => void;
}> = ({ zoneOptions, selectedZone, onChange }) =>
  zoneOptions.length > 1 ? (
    <Segmented
      block
      options={zoneOptions}
      style={{ margin: "10px 0" }}
      value={selectedZone}
      onChange={onChange as any}
    />
  ) : (
    <></>
  );

export interface Option {
  // card id
  meta: CardMeta;
  location?: ygopro.CardLocation;
  // 效果
  effectDesc?: string;
  // 作为素材的cost，比如同调召唤的星级
  level1?: number;
  level2?: number;
  response?: number;
  targeted?: boolean;
  disabled?: boolean;
  // 便于直接返回这个信息
  //
  // 尽量不要用这个字段
  card?: CardType;
}
