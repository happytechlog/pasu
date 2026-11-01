import { z } from "zod";

// Form schema for public status pages ("/settings/status-pages").

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const statusPageInputSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(80, "제목은 80자 이하로 입력하세요."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "주소는 영문 소문자, 숫자, 하이픈(-)으로 1~40자이며 하이픈으로 시작하거나 끝날 수 없습니다."),
  monitorIds: z.array(z.uuid()).max(100),
});

export type StatusPageInput = z.infer<typeof statusPageInputSchema>;
export type StatusPageFormValues = { title: string; slug: string; monitorIds: string[] };

export function statusPageFormValues(fd: FormData): StatusPageFormValues {
  return {
    title: String(fd.get("title") ?? ""),
    slug: String(fd.get("slug") ?? ""),
    monitorIds: fd.getAll("monitorIds").map(String),
  };
}
