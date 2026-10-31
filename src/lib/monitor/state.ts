// Pure status transition for one check result. No I/O, unit-tested.
//
// Rules: 2 consecutive failures → down; 1 success → up.
// A single failure keeps the previous status (an "up" monitor stays up).

export type MonitorStatus = "pending" | "up" | "down";

export const FAILURES_TO_DOWN = 2;

export type TransitionInput = { status: MonitorStatus; consecutiveFailures: number };

export type TransitionResult = {
  status: MonitorStatus;
  consecutiveFailures: number;
  /**
   * "down": open an incident and alert.
   * "recovered": was down, now up → close the incident and alert.
   * null: nothing to alert.
   */
  event: "down" | "recovered" | null;
  /** True whenever the monitor is now up but wasn't before: close any open incident. */
  closeIncident: boolean;
};

export function nextState(prev: TransitionInput, ok: boolean): TransitionResult {
  if (ok) {
    return {
      status: "up",
      consecutiveFailures: 0,
      event: prev.status === "down" ? "recovered" : null,
      // pending→up also closes: a monitor paused while down comes back as pending
      // with its incident still open.
      closeIncident: prev.status !== "up",
    };
  }

  const failures = prev.consecutiveFailures + 1;
  if (failures >= FAILURES_TO_DOWN && prev.status !== "down") {
    return { status: "down", consecutiveFailures: failures, event: "down", closeIncident: false };
  }
  return { status: prev.status, consecutiveFailures: failures, event: null, closeIncident: false };
}
