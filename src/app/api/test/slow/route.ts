// Dev-only target for verifying timeouts. 404 in production.
// GET /api/test/slow?ms=15000 → waits, then 200 (max 60s)
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not Found", { status: 404 });
  const ms = Math.min(Math.max(Number(new URL(request.url).searchParams.get("ms")) || 15000, 0), 60000);
  await new Promise((r) => setTimeout(r, ms));
  return new Response(`slept ${ms}ms\n`);
}

export const HEAD = GET;
