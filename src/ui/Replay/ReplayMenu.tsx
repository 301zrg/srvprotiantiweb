import { EllipsisOutlined } from "@ant-design/icons";
import { Button, InputNumber, Modal, Select } from "antd";
import { type ReactNode, useState } from "react";

import { DuelPanel } from "@/ui/Shared/DuelPanel";
import styles from "@/ui/Shared/DuelShell/menu.module.scss";
import { MenuFrame } from "@/ui/Shared/DuelShell/MenuFrame";
import type { PhaseKey } from "@/variant/duelPhases";

import { PhaseBar } from "../Duel/PhaseBar";

export interface ReplayAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Toggle state (sound, reveal). */
  pressed?: boolean;
  /** Shown in the full sidebar; otherwise only under "more". */
  pinned?: boolean;
  testId?: string;
}

/** Replay controls in the duel toolbar slot. A full-height sidebar shows
 * every control; short landscape and portrait keep the common ones and move
 * the rest into "more", so every action stays reachable. */
export const ReplayMenu = ({
  docked,
  compact,
  label,
  phase,
  common,
  others,
  speed,
  jump,
  moreLabel,
}: {
  docked: boolean;
  compact: boolean;
  label: string;
  phase: { current?: PhaseKey; turnOwner: "self" | "opponent" };
  /** Always on the bar (play/pause, step, and history in portrait). */
  common: ReplayAction[];
  others: ReplayAction[];
  speed: {
    label: string;
    value: number;
    options: number[];
    onChange: (value: number) => void;
  };
  jump: {
    label: string;
    inputLabel: string;
    cancelLabel: string;
    confirmLabel: string;
    value: string;
    onChange: (value: string) => void;
    onJump: () => void;
    onCancel?: () => void;
    disabled: boolean;
  };
  moreLabel: string;
}) => {
  const [jumping, setJumping] = useState(false);
  const [more, setMore] = useState(false);
  const button = (action: ReplayAction, withLabel = docked) => (
    <Button
      key={action.key}
      type="text"
      icon={action.icon}
      disabled={action.disabled}
      aria-pressed={action.pressed}
      aria-label={action.label}
      title={action.label}
      data-testid={action.testId}
      onClick={action.onClick}
    >
      {withLabel && action.label}
    </Button>
  );
  const speedSelect = (
    <Select
      key="speed"
      aria-label={speed.label}
      value={speed.value}
      options={speed.options.map((n) => ({ value: n, label: `${n}×` }))}
      onChange={speed.onChange}
      popupMatchSelectWidth={false}
    />
  );
  const full = docked && !compact;
  // The full sidebar pins the frequent controls; "more" holds the rest.
  const panelActions = full
    ? others.filter((action) => !action.pinned)
    : others;
  const moreButton = (
    <Button
      type="text"
      icon={<EllipsisOutlined />}
      aria-label={moreLabel}
      title={moreLabel}
      data-testid="replay-more"
      onClick={() => setMore(true)}
    >
      {full && moreLabel}
    </Button>
  );
  return (
    <>
      <MenuFrame
        docked={docked}
        label={label}
        phaseBar={
          <PhaseBar
            current={phase.current}
            turnOwner={phase.turnOwner}
            actions={{}}
          />
        }
        primary={
          full ? (
            <>
              {common.map((action) => button(action))}
              {speedSelect}
              {others
                .filter((action) => action.pinned)
                .map((action) => button(action))}
              {moreButton}
              <div className={styles.replayJump}>
                <InputNumber
                  aria-label={jump.inputLabel}
                  min={1}
                  max={999}
                  value={Number(jump.value) || undefined}
                  onChange={(value) => jump.onChange(String(value ?? ""))}
                />
                <Button
                  type="text"
                  disabled={jump.disabled}
                  onClick={jump.onJump}
                >
                  {jump.label}
                </Button>
                {jump.onCancel && (
                  <Button type="text" onClick={jump.onCancel}>
                    {jump.cancelLabel}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {common.map((action) => button(action, false))}
              {speedSelect}
              {moreButton}
            </>
          )
        }
      />
      {/* A docked panel, not a dropdown: short screens have no room above or
          below the toolbar for every control. */}
      <DuelPanel
        open={more}
        onClose={() => setMore(false)}
        title={moreLabel}
        testId="replay-more-panel"
        followControlSide
      >
        <div className={styles.replayMore}>
          {panelActions.map((action) => (
            <Button
              key={action.key}
              icon={action.icon}
              disabled={action.disabled}
              aria-pressed={action.pressed}
              aria-label={action.label}
              data-testid={action.testId}
              onClick={() => {
                setMore(false);
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          ))}
          {!full && (
            <Button
              disabled={jump.disabled && !jump.onCancel}
              onClick={() => {
                setMore(false);
                setJumping(true);
              }}
            >
              {jump.label}
            </Button>
          )}
        </div>
      </DuelPanel>
      <Modal
        open={jumping}
        title={jump.label}
        centered
        width={320}
        zIndex={1300}
        onCancel={() => setJumping(false)}
        footer={[
          jump.onCancel && (
            <Button
              key="cancel-seek"
              onClick={() => {
                jump.onCancel?.();
                setJumping(false);
              }}
            >
              {jump.cancelLabel}
            </Button>
          ),
          <Button
            key="jump"
            type="primary"
            disabled={jump.disabled}
            onClick={() => {
              jump.onJump();
              setJumping(false);
            }}
          >
            {jump.confirmLabel}
          </Button>,
        ]}
      >
        <InputNumber
          aria-label={jump.inputLabel}
          min={1}
          max={999}
          value={Number(jump.value) || undefined}
          style={{ width: "100%" }}
          onChange={(value) => jump.onChange(String(value ?? ""))}
        />
      </Modal>
    </>
  );
};
