import { Button } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { sendSelectEffectYnResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";

import { NeosModal } from "../NeosModal";

interface YesNoModalProps {
  isOpen: boolean;
  msg?: string;
}
const defaultProps = { isOpen: false };

const localStore = proxy<YesNoModalProps>(defaultProps);

export const YesNoModal: React.FC = () => {
  const { t } = useTranslation("ClientUI");
  const container = getUIContainer();
  const { isOpen, msg } = useSnapshot(localStore);
  const hint = useSnapshot(matStore.hint);

  const preHintMsg = hint?.esHint || "";

  return (
    <NeosModal
      title={`${preHintMsg} ${msg}`}
      open={isOpen}
      width={"25rem"}
      afterClose={() => (matStore.hint.esHint = undefined)}
      footer={
        <>
          <Button
            data-testid="duel-yesno-no"
            onClick={() => {
              sendSelectEffectYnResponse(container.conn, false);
              rs(false);
            }}
          >
            {t("Cancel")}
          </Button>
          <Button
            data-testid="duel-yesno-yes"
            type="primary"
            onClick={() => {
              sendSelectEffectYnResponse(container.conn, true);
              rs(true);
            }}
          >
            {t("Confirm")}
          </Button>
        </>
      }
    >
      <div data-testid="duel-yesno-modal" />
    </NeosModal>
  );
};

let rs: (response: boolean) => void = () => {};

export const displayYesNoModal = async (msg: string) => {
  localStore.msg = msg;
  localStore.isOpen = true;
  const response = await new Promise<boolean>((resolve) => (rs = resolve));
  localStore.isOpen = false;
  return response;
};
