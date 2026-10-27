// 卡牌排序弹窗
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card } from "antd";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { sendSortCardResponse } from "@/api";
import { CardMeta, getCardImgUrl } from "@/api/cards";
import { getUIContainer } from "@/container/compat";
import { useI18N } from "@/ui/I18N";
import { duelInteractionMessages } from "@/variant/duelInteraction";

import { NeosModal } from "../NeosModal";

interface SortOption {
  meta: CardMeta;
  response: number;
}
interface SortCardModalProps {
  isOpen: boolean;
  options: SortOption[];
}
const defaultProps = {
  isOpen: false,
  options: [],
};

const localStore = proxy<SortCardModalProps>(defaultProps);
// This dnd-kit version treats numeric id=0 as no active node. Keep wire indices
// numeric, but give the drag UI a nonempty string id, including the first card.
const sortId = (response: number) => `sort-${response}`;

export const SortCardModal = () => {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const container = getUIContainer();
  const { isOpen, options } = useSnapshot(localStore);
  const [items, setItems] = useState(options);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onFinish = () => {
    sendSortCardResponse(
      container.conn,
      items.map((item) => item.response),
    );
    rs();
  };
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(
          (item) => sortId(item.response) === active.id,
        );
        const newIndex = items.findIndex(
          (item) => sortId(item.response) === over.id,
        );
        if (oldIndex < 0 || newIndex < 0) return items;
        // @ts-ignore
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    setItems(options);
  }, [options]);

  return (
    <NeosModal
      title={t("SortCards")}
      open={isOpen}
      zIndex={1300}
      footer={
        <>
          <Button
            data-testid="duel-sort-reset"
            onClick={() => setItems(options)}
          >
            {duelInteractionMessages(language).sortReset}
          </Button>
          <Button data-testid="duel-sort-submit" onClick={onFinish}>
            {t("Confirm")}
          </Button>
        </>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((item) => sortId(item.response))}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableItem
              key={item.response}
              id={item.response}
              meta={item.meta}
            />
          ))}
        </SortableContext>
      </DndContext>
    </NeosModal>
  );
};

const SortableItem = (props: { id: number; meta: CardMeta }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: sortId(props.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      data-testid="duel-sort-item"
      data-sort-response={props.id}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Card
        style={{ width: "6.25rem" }}
        cover={
          <img
            alt={props.meta.id.toString()}
            src={getCardImgUrl(props.meta.id)}
          />
        }
      />
    </div>
  );
};

let rs: (arg?: any) => void = () => {};

export const displaySortCardModal = async (options: SortOption[]) => {
  localStore.options = options;
  localStore.isOpen = true;
  await new Promise<void>((resolve) => (rs = resolve));
  localStore.isOpen = false;
  localStore.options = [];
};
