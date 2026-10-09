import { App } from "antd";
import React, { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { proxy, useSnapshot } from "valtio";

import { fetchStrings, Region } from "@/api";
import { getUIContainer } from "@/container/compat";
import { resetDuel } from "@/stores";

import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

interface EndProps {
  isOpen: boolean;
  isWin: boolean;
  reason?: string;
}

const defaultProps: EndProps = {
  isOpen: false,
  isWin: false,
};

const localStore = proxy(defaultProps);

export const EndModal: React.FC = () => {
  const { t } = useTranslation("ClientUI");
  const container = getUIContainer();
  const { message } = App.useApp();
  const { isOpen, isWin, reason } = useSnapshot(localStore);
  const navigate = useNavigate();

  const onReturn = () => {
    resetDuel();
    rs();

    if (container.conn.isClosed()) {
      message.info(t("ServerClosed"));

      navigate("/match");
    }
  };

  return (
    <NeosModal
      title={fetchStrings(Region.System, 1500)}
      open={isOpen}
      onOk={onReturn}
      onCancel={onReturn}
    >
      <div
        className={styles["end-container"]}
        data-testid="duel-end-modal"
        data-duel-result={isWin ? "win" : "defeated"}
      >
        <p
          className={styles.result}
          data-testid="duel-end-result"
          style={{ "--text-color": isWin ? "blue" : "red" } as CSSProperties}
        >
          {t(isWin ? "Win" : "Defeat")}
        </p>
        <p className={styles.reason}>{reason}</p>
      </div>
    </NeosModal>
  );
};

let rs: (arg?: any) => void = () => {};

export const displayEndModal = async (isWin: boolean, reason?: string) => {
  localStore.isWin = isWin;
  localStore.reason = reason;
  localStore.isOpen = true;
  await new Promise<void>((resolve) => (rs = resolve)); // 等待在组件内resolve
  localStore.isOpen = false;
  localStore.isWin = false;
  localStore.reason = undefined;
};
