import "./phaseBar.css";

import { Button } from "antd";

import { type PhaseKey, phaseKeys } from "@/variant/duelPhases";

/** Presentation shared by online play and the isolated local practice session. */
export const PhaseBar = ({
  current,
  turnOwner,
  actions,
  labels,
  testId = "duel-phase-bar",
}: {
  current?: PhaseKey;
  turnOwner: "self" | "opponent";
  actions: Partial<Record<PhaseKey, () => void>>;
  labels?: Partial<Record<PhaseKey, string>>;
  testId?: string;
}) => (
  <div
    className="duel-phase-bar"
    data-testid={testId}
    data-turn-owner={turnOwner}
  >
    {phaseKeys.map((phase) => (
      <Button
        key={phase}
        data-testid={`phase-${phase}`}
        data-phase={phase}
        data-current={current === phase}
        aria-current={current === phase ? "step" : undefined}
        title={labels?.[phase]}
        aria-label={labels?.[phase] || phase.toUpperCase()}
        disabled={!actions[phase]}
        onClick={actions[phase]}
      >
        {phase.toUpperCase()}
      </Button>
    ))}
  </div>
);
