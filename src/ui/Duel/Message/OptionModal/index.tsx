import { CloseOutlined } from "@ant-design/icons";
import { CheckCard } from "@ant-design/pro-components";
import { Button, Segmented } from "antd";
import { chunk } from "lodash-es";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { sendSelectOptionResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { RpsRequest } from "@/service/mora/request";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { RandomRpsControls } from "@/ui/WaitRoom/RandomRpsControls";
import { connectionStore } from "@/variant/connection";
import { duelInteractionMessages } from "@/variant/duelInteraction";

import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

type Options = { info: string; response: number }[];

const defaultStore = {
  title: "",
  isOpen: false,
  active: false,
  min: 1,
  requestId: 0,
  randomRps: false,
  rpsId: 0,
  options: [] satisfies Options as Options,
};
const store = proxy(defaultStore);
const rpsRequest = new RpsRequest();
let requestConn: ReturnType<typeof getUIContainer>["conn"] | undefined;
let requestEpoch = 0;

// 一页最多4个选项
const MAX_NUM_PER_PAGE = 4;

export const OptionModal = () => {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const text = duelInteractionMessages(language);
  const snap = useSnapshot(store);
  const { title, isOpen, min, options, active, requestId, randomRps, rpsId } =
    snap;
  const { randomRpsMode } = useSnapshot(settingStore);
  const { epoch, state } = useSnapshot(connectionStore);
  // options可能太多，因此分页展示
  const [page, setPage] = useState(0);
  const maxPage = Math.ceil(options.length / MAX_NUM_PER_PAGE);
  const [selecteds, setSelecteds] = useState<number[][]>([]);
  const grouped = chunk(options, MAX_NUM_PER_PAGE);
  const submitCurrent = (response: number) => {
    // eslint-disable-next-line valtio/state-snapshot-rule -- Reject a click retained from an older render.
    if (store.requestId === requestId) submit(response);
  };

  const onSummit = () => {
    const responses = selecteds.flat();
    if (responses.length > 0) {
      const response = responses.reduce((res, current) => res | current, 0); // 多个选择求或
      submitCurrent(response);
    }
  };

  useEffect(() => {
    setPage(0);
    setSelecteds(Array.from({ length: maxPage }).map((_) => []));
  }, [options, requestId, rpsId]);

  useEffect(() => {
    if (isOpen && randomRps && requestConn) {
      store.rpsId = rpsRequest.begin(requestConn, requestEpoch, randomRpsMode);
    }
  }, [randomRpsMode, isOpen, randomRps, requestId]);

  useEffect(() => {
    if (
      isOpen &&
      randomRps &&
      (epoch !== requestEpoch ||
        state === "disconnected" ||
        state === "connecting")
    ) {
      rpsRequest.invalidate();
      rs(undefined);
    }
  }, [epoch, state, isOpen, randomRps]);

  const onQuickSelect = (response: number) => {
    if (store.min === 1) {
      submitCurrent(response);
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
        {randomRps && requestConn && (
          <RandomRpsControls
            request={rpsRequest}
            requestId={rpsId}
            owner={requestConn}
            epoch={epoch}
            testPrefix="effect"
            onSelect={submitCurrent}
          />
        )}
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
  config?: { randomRps?: boolean },
) => {
  const requestId = ++store.requestId;
  store.randomRps = config?.randomRps === true;
  store.active = false;
  store.title = title;
  store.options = options;
  store.min = min;
  store.isOpen = true;
  const conn = getUIContainer().conn;
  requestConn = conn;
  requestEpoch = connectionStore.epoch;
  store.rpsId = rpsRequest.begin(
    conn,
    requestEpoch,
    settingStore.randomRpsMode,
  );
  const response = await new Promise<number>((resolve) => {
    rs = (value) => {
      if (store.requestId !== requestId) return;
      if (value !== undefined || config?.randomRps) {
        submit = () => {};
        rpsRequest.invalidate();
        // Cancellation of effect RPS settles the old handler without a packet.
        resolve(value ?? 0);
      }
    };
    submit = (value) => {
      if (store.requestId !== requestId || !store.isOpen) return;
      if (
        config?.randomRps &&
        (getUIContainer().conn !== conn ||
          conn.ws?.readyState !== 1 ||
          connectionStore.state === "disconnected" ||
          connectionStore.state === "connecting" ||
          !rpsRequest.consume(
            store.rpsId,
            conn,
            connectionStore.epoch,
            settingStore.randomRpsMode,
          ))
      )
        return;
      sendSelectOptionResponse(conn, value);
      rs(value);
    };
  });
  if (store.requestId === requestId) store.isOpen = false;
  return response;
};

/** Choosing an active effect is a local draft, not SELECT_OPTION from Core. */
export const displayActiveOptionModal = (
  title: string,
  options: Options,
  signal: AbortSignal,
) => {
  if (signal.aborted) return Promise.resolve(undefined);
  store.requestId++;
  store.randomRps = false;
  rpsRequest.invalidate();
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
