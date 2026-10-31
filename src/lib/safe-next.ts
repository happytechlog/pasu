/**
 * Post-login redirect target. Only same-origin relative paths are allowed;
 * anything else (absolute URLs, protocol-relative "//host", "/\host") → "/".
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(value)) return "/";
  return value;
}
