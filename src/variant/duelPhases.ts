export type PhaseKey = "dp" | "sp" | "mp1" | "bp" | "mp2" | "ep";
export const phaseKeys: PhaseKey[] = ["dp", "sp", "mp1", "bp", "mp2", "ep"];

export const corePhaseKey = (phase: number): PhaseKey | undefined =>
  phase === 1
    ? "dp"
    : phase === 2
    ? "sp"
    : phase === 4
    ? "mp1"
    : phase >= 8 && phase <= 128
    ? "bp"
    : phase === 256
    ? "mp2"
    : phase === 512
    ? "ep"
    : undefined;

/** Online protobuf phases are ordinal values, unlike the Core bit flags. */
export const onlinePhaseKey = (phase: number): PhaseKey | undefined =>
  phase === 1
    ? "dp"
    : phase === 2
    ? "sp"
    : phase === 3
    ? "mp1"
    : phase >= 4 && phase <= 8
    ? "bp"
    : phase === 9
    ? "mp2"
    : phase === 10
    ? "ep"
    : undefined;

export function phaseAction(
  state: {
    current: PhaseKey | undefined;
    command?: "idle" | "battle";
    ownTurn: boolean;
    enableBp: boolean;
    enableM2: boolean;
    enableEp: boolean;
  },
  target: PhaseKey,
) {
  if (!state.ownTurn || !state.command || state.current === target) return;
  const source = state.command;
  if (
    source === "idle" &&
    (state.current === "mp1" || state.current === "mp2")
  ) {
    if (target === "bp" && state.current === "mp1" && state.enableBp)
      return { source, response: 6 };
    if (target === "ep" && state.enableEp) return { source, response: 7 };
  }
  if (source === "battle" && state.current === "bp") {
    if (target === "mp2" && state.enableM2) return { source, response: 2 };
    if (target === "ep" && state.enableEp) return { source, response: 3 };
  }
}
