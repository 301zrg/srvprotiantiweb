import "./rps.css";

import { Button, Modal, Popover, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { getUIContainer } from "@/container/compat";
import { eventbus, Task } from "@/infra";
import { RpsHand, RpsRequest } from "@/service/mora/request";
import { RoomStage, roomStore } from "@/stores/roomStore";
import { settingStore } from "@/stores/settingStore";
import { connectionStore } from "@/variant/connection";

import { IconFont } from "../Shared";
import { RandomRpsControls } from "./RandomRpsControls";
import { RoomSettingsButton } from "./RoomSettingsButton";

export enum Mora {
  Rock = "rock",
  Scissors = "scissors",
  Paper = "paper",
}

export enum Tp {
  First = 1,
  Second = 2,
}

export const MoraPopover: React.FC<
  React.PropsWithChildren<{ onSelect?: (result: Mora) => void }>
> = ({ children, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const request = useRef(new RpsRequest()).current;
  const owner = useRef(getUIContainer().conn);
  const { randomRpsMode } = useSnapshot(settingStore);
  const { epoch, state } = useSnapshot(connectionStore);
  const { stage } = useSnapshot(roomStore);

  // 需要在mora的service之中，emit一个事件，让这个组件监听到，然后打开popover
  useEffect(() => {
    // 这里不能用`once`，因为如果双方猜拳结果一样的话会重新猜拳
    const show = () => {
      owner.current = getUIContainer().conn;
      setRequestId(
        request.begin(
          owner.current,
          connectionStore.epoch,
          settingStore.randomRpsMode,
        ),
      );
      setOpen(true);
    };
    eventbus.on(Task.Mora, show);
    return () => {
      eventbus.off(Task.Mora, show);
      request.invalidate();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setRequestId(
      request.begin(owner.current, connectionStore.epoch, randomRpsMode),
    );
  }, [randomRpsMode]);

  useEffect(() => {
    request.invalidate();
    setOpen(false);
  }, [epoch]);

  useEffect(() => {
    if (
      state === "disconnected" ||
      state === "connecting" ||
      stage !== RoomStage.HAND_SELECTING
    ) {
      request.invalidate();
      setOpen(false);
    }
  }, [state, stage]);

  const onClick = (result: Mora) => {
    if (
      roomStore.stage !== RoomStage.HAND_SELECTING ||
      getUIContainer().conn !== owner.current ||
      owner.current.ws?.readyState !== 1 ||
      connectionStore.state === "disconnected" ||
      connectionStore.state === "connecting" ||
      !request.consume(
        requestId,
        owner.current,
        connectionStore.epoch,
        settingStore.randomRpsMode,
      )
    )
      return false;
    onSelect?.(result);
    setOpen(false);
    return true;
  };

  const { t: i18n } = useTranslation("WaitRoom");

  const map = {
    [Mora.Rock]: i18n("Rock"),
    [Mora.Scissors]: i18n("Scissors"),
    [Mora.Paper]: i18n("Paper"),
  };

  return (
    <>
      {children}
      <Modal
        open={open}
        centered
        width={420}
        footer={null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        zIndex={1200}
        style={{ maxWidth: "calc(100vw - 24px)" }}
        bodyStyle={{ maxHeight: "calc(100dvh - 160px)", overflowY: "auto" }}
        title={
          <div className="room-rps-title">
            <span>{i18n("PlsRockPaperScissors")}</span>
            <RoomSettingsButton testId="rps-settings" />
          </div>
        }
      >
        <div className="room-rps-panel" data-testid="room-rps-panel">
          <div className="room-rps-hands">
            {[Mora.Rock, Mora.Scissors, Mora.Paper].map((mora) => (
              <Button
                key={mora}
                data-testid={`waitroom-mora-${mora}`}
                size="large"
                style={{ minHeight: 64, minWidth: 0, padding: 4 }}
                type="text"
                icon={<IconFont type={`icon-hand-${mora}`} size={16} />}
                onClick={() => onClick(mora)}
              >
                {map[mora]}
              </Button>
            ))}
          </div>
          <RandomRpsControls
            request={request}
            requestId={requestId}
            owner={owner.current}
            epoch={epoch}
            testPrefix="waitroom"
            onSelect={(hand: RpsHand) =>
              onClick([Mora.Rock, Mora.Scissors, Mora.Paper][hand - 1])
            }
          />
        </div>
      </Modal>
    </>
  );
};

export const TpPopover: React.FC<
  React.PropsWithChildren<{
    onSelect?: (result: Tp) => void;
  }>
> = ({ children, onSelect }) => {
  const [open, setOpen] = useState(false);
  const { t: i18n } = useTranslation("Popover");
  // 需要在mora的service之中，emit一个事件，让这个组件监听到，然后打开popover
  useEffect(() => {
    const show = () => setOpen(true);
    eventbus.on(Task.Tp, show);
    return () => {
      eventbus.off(Task.Tp, show);
    };
  }, []);

  const onClick = (result: Tp) => {
    result; // 这里send结果给服务器
    onSelect?.(result);
    setOpen(false);
  };

  const map = {
    [Tp.First]: i18n("First"),
    [Tp.Second]: i18n("Second"),
  };

  return (
    <Popover
      overlayStyle={{ backdropFilter: "blur(0.625rem)" }}
      content={
        <Space wrap style={{ maxWidth: "min(420px, calc(100vw - 48px))" }}>
          {[Tp.First, Tp.Second].map((item) => (
            <Button
              key={item}
              data-testid={`waitroom-tp-${
                item === Tp.First ? "first" : "second"
              }`}
              size="large"
              style={{ minHeight: 44, minWidth: 80 }}
              type="text"
              icon={
                <IconFont
                  type={`icon-${item === Tp.First ? "one" : "two"}`}
                  size={16}
                />
              }
              onClick={() => onClick(item)}
            >
              {map[item]}
            </Button>
          ))}
        </Space>
      }
      open={open}
      placement="bottom"
    >
      {children}
    </Popover>
  );
};
