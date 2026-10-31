import { describe, expect, it } from "vitest";
import { nextState, type MonitorStatus } from "./state";

const s = (status: MonitorStatus, consecutiveFailures = 0) => ({ status, consecutiveFailures });

describe("nextState", () => {
  it("pending + success → up, closes leftover incident, no alert", () => {
    expect(nextState(s("pending"), true)).toEqual({ status: "up", consecutiveFailures: 0, event: null, closeIncident: true });
  });

  it("up + success → up, nothing to do", () => {
    expect(nextState(s("up"), true)).toEqual({ status: "up", consecutiveFailures: 0, event: null, closeIncident: false });
  });

  it("down + success → up with recovered event", () => {
    expect(nextState(s("down", 5), true)).toEqual({ status: "up", consecutiveFailures: 0, event: "recovered", closeIncident: true });
  });

  it("first failure keeps previous status", () => {
    expect(nextState(s("up"), false)).toMatchObject({ status: "up", consecutiveFailures: 1, event: null });
    expect(nextState(s("pending"), false)).toMatchObject({ status: "pending", consecutiveFailures: 1, event: null });
  });

  it("second consecutive failure → down", () => {
    expect(nextState(s("up", 1), false)).toEqual({ status: "down", consecutiveFailures: 2, event: "down", closeIncident: false });
    expect(nextState(s("pending", 1), false)).toMatchObject({ status: "down", event: "down" });
  });

  it("further failures while down don't re-alert", () => {
    expect(nextState(s("down", 2), false)).toEqual({ status: "down", consecutiveFailures: 3, event: null, closeIncident: false });
  });

  it("a success resets the failure streak", () => {
    let st = nextState(s("up"), false);
    st = nextState(st, true);
    st = nextState(st, false);
    expect(st).toMatchObject({ status: "up", consecutiveFailures: 1, event: null });
  });

  it("full cycle: up → down → recovered", () => {
    const events: (string | null)[] = [];
    let st = s("pending");
    for (const ok of [true, false, false, false, true, true]) {
      const r = nextState(st, ok);
      events.push(r.event);
      st = r;
    }
    expect(events).toEqual([null, null, "down", null, "recovered", null]);
  });
});
