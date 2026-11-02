import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} })); // index.ts imports the DB client; not used here
vi.mock("../mail", () => ({ sendMail: vi.fn(async () => {}) }));

const { sendSlack, sendToChannels } = await import("./index");
const { sendMail } = await import("../mail");

const hook = "https://hooks.slack.com/services/T0/B0/abcd";
const slack = { text: "hello", blocks: [], attachments: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(sendMail).mockReset();
});

describe("sendSlack", () => {
  it("POSTs the payload as PasuMonitor without following redirects", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendSlack(hook, slack);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(hook);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ username: "PasuMonitor", icon_emoji: ":shield:", ...slack });
  });

  it("throws with status and body on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no_service", { status: 404 })));
    await expect(sendSlack(hook, slack)).rejects.toThrow("Slack 응답 404: no_service");
  });
});

describe("sendToChannels", () => {
  it("sends to every channel and reports failures per channel without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid_token", { status: 403 })));
    const results = await sendToChannels(
      [
        { id: "1", type: "slack", name: "슬랙", target: hook },
        { id: "2", type: "email", name: "메일", target: "ops@example.com" },
      ],
      { subject: "[DOWN] API", text: "body", slack },
    );
    expect(results.map((r) => r.error)).toEqual(["Slack 응답 403: invalid_token", null]);
    expect(sendMail).toHaveBeenCalledWith({ to: "ops@example.com", subject: "[Pasu Monitor] [DOWN] API", text: "body" });
  });
});
