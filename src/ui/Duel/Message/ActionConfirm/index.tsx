import { Button, Modal, Space, Typography } from "antd";
import { proxy, useSnapshot } from "valtio";

import { sendSelectBattleCmdResponse, sendSelectIdleCmdResponse } from "@/api";
import { type Container } from "@/container";
import {
  type ActionLease,
  claimActionRequest,
} from "@/service/duel/actionRequest";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { duelInteractionMessages } from "@/variant/duelInteraction";

const store = proxy({ open: false, label: "" });
let finish: (accepted: boolean) => void = () => {};

export const ActionConfirm = () => {
  const { open, label } = useSnapshot(store);
  const { language } = useI18N();
  const text = duelInteractionMessages(language);
  return (
    <Modal
      open={open}
      title={text.title}
      centered
      width={380}
      zIndex={1300}
      onCancel={() => finish(false)}
      maskClosable
      keyboard
      destroyOnClose
      footer={
        <Space wrap>
          <Button
            style={{ minHeight: 44 }}
            data-testid="duel-action-cancel"
            onClick={() => finish(false)}
          >
            {text.cancel}
          </Button>
          <Button
            style={{ minHeight: 44 }}
            type="primary"
            data-testid="duel-action-confirm"
            onClick={() => finish(true)}
          >
            {text.confirm}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph data-testid="duel-action-confirm-label">
        {label}
      </Typography.Paragraph>
    </Modal>
  );
};

function confirmAction(label: string, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  finish(false);
  return new Promise<boolean>((resolve) => {
    store.label = label;
    store.open = true;
    const abort = () => settle(false);
    const settle = (accepted: boolean) => {
      if (finish !== settle) return;
      finish = () => {};
      signal.removeEventListener("abort", abort);
      store.open = false;
      resolve(accepted);
    };
    finish = settle;
    signal.addEventListener("abort", abort, { once: true });
  });
}

export interface ActiveAction {
  response: number;
  responseSource?: "idle" | "battle";
  label: string;
}

export async function runActiveAction(
  container: Container,
  choose: (
    lease: ActionLease,
  ) => ActiveAction | undefined | Promise<ActiveAction | undefined>,
) {
  const lease = claimActionRequest(container);
  if (!lease) return false;
  try {
    const action = await choose(lease);
    if (
      !action ||
      !lease.valid() ||
      (action.responseSource ?? "idle") !== lease.source
    )
      return false;
    if (
      settingStore.confirmOperations &&
      !(await confirmAction(action.label, lease.signal))
    )
      return false;
    return lease.submit(() => {
      if (action.responseSource === "battle")
        sendSelectBattleCmdResponse(container.conn, action.response);
      else sendSelectIdleCmdResponse(container.conn, action.response);
      container.context.cardStore.inner.forEach((card) => {
        card.idleInteractivities = [];
      });
    });
  } finally {
    lease.release();
  }
}
