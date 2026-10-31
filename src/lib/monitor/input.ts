import { z } from "zod";
import { normalizeExpectedStatus } from "./expected-status";

export const INTERVALS = [60, 300] as const;
export const TIMEOUT_MIN_SEC = 1;
export const TIMEOUT_MAX_SEC = 30;

// Validates the monitor create/edit form. Values arrive as FormData strings.
export const monitorInputSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(100, "이름은 100자 이내로 입력하세요."),
  url: z
    .string()
    .trim()
    .min(1, "URL을 입력하세요.")
    .max(2000, "URL이 너무 깁니다.")
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";
      } catch {
        return false;
      }
    }, "http:// 또는 https://로 시작하는 올바른 URL을 입력하세요."),
  intervalSec: z.coerce
    .number()
    .refine((v) => (INTERVALS as readonly number[]).includes(v), "체크 간격은 1분 또는 5분입니다."),
  method: z.enum(["GET", "HEAD"], { error: "메서드는 GET 또는 HEAD입니다." }),
  timeoutSec: z.coerce
    .number({ error: "타임아웃은 숫자로 입력하세요." })
    .int("타임아웃은 정수(초)로 입력하세요.")
    .min(TIMEOUT_MIN_SEC, `타임아웃은 ${TIMEOUT_MIN_SEC}~${TIMEOUT_MAX_SEC}초입니다.`)
    .max(TIMEOUT_MAX_SEC, `타임아웃은 ${TIMEOUT_MIN_SEC}~${TIMEOUT_MAX_SEC}초입니다.`),
  expectedStatus: z
    .string()
    .transform((v, ctx) => {
      const n = normalizeExpectedStatus(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "기대 상태코드는 200, 2xx처럼 쉼표로 구분해 입력하세요." });
        return z.NEVER;
      }
      return n;
    }),
  channelIds: z.array(z.uuid()).default([]),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;

/** Raw form values, echoed back on validation errors so the form keeps them. */
export type MonitorFormValues = {
  name: string;
  url: string;
  intervalSec: string;
  method: string;
  timeoutSec: string;
  expectedStatus: string;
  channelIds: string[];
};

export function formValues(fd: FormData): MonitorFormValues {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    name: s("name"),
    url: s("url"),
    intervalSec: s("intervalSec"),
    method: s("method"),
    timeoutSec: s("timeoutSec"),
    expectedStatus: s("expectedStatus"),
    channelIds: fd.getAll("channelIds").filter((v): v is string => typeof v === "string"),
  };
}
