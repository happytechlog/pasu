import { describe, expect, it } from "vitest";
import { smtpPort } from "./mail";

describe("smtpPort", () => {
  it("uses a valid port", () => {
    expect(smtpPort("587")).toBe(587);
    expect(smtpPort("465")).toBe(465);
  });

  it("falls back to the Mailpit default when unset, empty or invalid", () => {
    for (const raw of [undefined, "", "  ", "abc", "0", "-1", "65536", "25.5"]) {
      expect(smtpPort(raw)).toBe(1025);
    }
  });
});
