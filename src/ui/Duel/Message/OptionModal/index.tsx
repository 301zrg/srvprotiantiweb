import { CloseOutlined } from "@ant-design/icons";
import { CheckCard } from "@ant-design/pro-components";
import { Button, Segmented } from "antd";
import { chunk } from "lodash-es";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { sendSelectOptionResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { useI18N } from "@/ui/I18N";
import { duelInteractionMessages } from "@/variant/duelInteraction";

import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

type Options = { info: string; response: number }[];

const defaultStore = {
  title: "",
  isOpen: false,
  active: false,
  min: 1,
  options: [] satisfies Options as Options,
};
const store = proxy(defaultStore);

// 一页最多4个选项
const MAX_NUM_PER_PAGE = 4;

export const OptionModal = () => {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const text = duelInteractionMessages(language);
  const snap = useSnapshot(store);
  const { title, isOpen, min, options, active } = snap;
  // options可能太多，因此分页展示
  const [page, setPage] = useState(0);
  const maxPage = Math.ceil(options.length / MAX_NUM_PER_PAGE);
  const [selecteds, setSelecteds] = useState<number[][]>([]);
  const grouped = chunk(options, MAX_NUM_PER_PAGE);

  const onSummit = () => {
    const responses = selecteds.flat();
    if (responses.length > 0) {
      const response = responses.reduce((res, current) => res | current, 0); // 多个选择求或
      submit(response);
    }
  };

  useEffect(() => {
    setPage(0);
    setSelecteds(Array.from({ length: maxPage }).map((_) => []));
  }, [options]);

  const onQuickSelect = (response: number) => {
    if (store.min === 1) {
      submit(response);
    }
  };

  return (
    <NeosModal
      title={title}
      open={isOpen}
      zIndex={1300}
      {...(active
        ? { onCancel: () => rs(undefined), closeIcon: <CloseOutlined /> }
        : {})}
      footer={
        <>
          {active && (
            <Button
              data-testid="duel-active-option-cancel"
              onClick={() => rs(undefined)}
            >
              {text.cancel}
            </Button>
          )}
          <Button
            data-testid="duel-option-reset"
            onClick={() =>
              setSelecteds(Array.from({ length: maxPage }, () => []))
            }
          >
            {text.reset}
          </Button>
          <Button
            data-testid="duel-option-submit"
            disabled={selecteds.flat().length !== min}
            onClick={onSummit}
          >
            {t("Confirm")}
          </Button>
        </>
      }
    >
      <div data-testid="duel-option-modal" data-option-min={min}>
        <Selector page={page} maxPage={maxPage} onChange={setPage as any} />
        {grouped.map(
          (options, i) =>
            i === page && (
              <div className={styles.container} key={i}>
                <CheckCard.Group
                  bordered
                  multiple
                  value={selecteds[i]}
                  className={styles["check-card-group"]}
                  onChange={(values: any) => {
                    const v = selecteds.map((x, i) =>
                      i === page ? values : x,
                    );
                    setSelecteds(v);
                  }}
                >
                  {options.map((option, idx) => (
                    <div
                      key={idx}
                      data-testid="duel-option-item"
                      data-option-response={option.response}
                      data-option-text={option.info}
                      onDoubleClick={() => onQuickSelect(option.response)}
                    >
                      <CheckCard
                        className={styles["check-card"]}
                        description={option.info}
                        value={option.response}
                      />
                    </div>
                  ))}
                </CheckCard.Group>
              </div>
            ),
        )}
      </div>
    </NeosModal>
  );
};

/* 选择区域 */
const Selector: React.FC<{
  page: number;
  maxPage: number;
  onChange: (value: number) => void;
}> = ({ page, maxPage, onChange }) =>
  maxPage > 1 ? (
    <Segmented
      block
      options={Array.from({ length: maxPage }).map((_, idx) => idx)}
      style={{ margin: "0.625rem 0" }}
      value={page}
      onChange={onChange as any}
    ></Segmented>
  ) : (
    <></>
  );

let rs: (response: number | undefined) => void = () => {};
let submit: (response: number) => void = () => {};
export const displayOptionModal = async (
  title: string,
  options: Options,
  min: number,
) => {
  store.active = false;
  store.title = title;
  store.options = options;
  store.min = min;
  store.isOpen = true;
  const conn = getUIContainer().conn;
  const response = await new Promise<number>((resolve) => {
    rs = (value) => {
      if (value !== undefined) {
        submit = () => {};
        resolve(value);
      }
    };
    submit = (value) => {
      sendSelectOptionResponse(conn, value);
      rs(value);
    };
  });
  store.isOpen = false;
  return response;
};

/** Choosing an active effect is a local draft, not SELECT_OPTION from Core. */
export const displayActiveOptionModal = (
  title: string,
  options: Options,
  signal: AbortSignal,
) => {
  if (signal.aborted) return Promise.resolve(undefined);
  store.title = title;
  store.options = options;
  store.min = 1;
  store.active = true;
  store.isOpen = true;
  return new Promise<number | undefined>((resolve) => {
    const abort = () => settle(undefined);
    const settle = (value: number | undefined) => {
      if (rs !== settle) return;
      signal.removeEventListener("abort", abort);
      rs = () => {};
      submit = () => {};
      store.isOpen = false;
      resolve(value);
    };
    rs = settle;
    submit = settle;
    signal.addEventListener("abort", abort, { once: true });
  });
};
