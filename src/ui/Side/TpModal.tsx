import { Button, Modal } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { sendTpResult } from "@/api";
import { getUIContainer } from "@/container/compat";
import { SideStage, sideStore } from "@/stores";

import styles from "./TpModal.module.scss";

export const TpModal: React.FC = () => {
  const { t } = useTranslation("ClientUI");
  const container = getUIContainer();
  const { stage } = useSnapshot(sideStore);

  return (
    <Modal
      centered
      open={stage === SideStage.TP_SELECTING}
      footer={<></>}
      closable={false}
    >
      <div className={styles.container}>
        <Button
          data-testid="side-tp-first"
          onClick={() => {
            sendTpResult(container.conn, true);
            sideStore.stage = SideStage.TP_SELECTED;
          }}
        >
          {t("First")}
        </Button>
        <Button
          onClick={() => {
            sendTpResult(container.conn, false);
            sideStore.stage = SideStage.TP_SELECTED;
          }}
        >
          {t("Second")}
        </Button>
      </div>
    </Modal>
  );
};
