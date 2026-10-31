// Dev-only target for verifying down detection. 404 in production.
// GET /api/test/fail            → 503
// GET /api/test/fail?status=500 → 500
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not Found", { status: 404 });
  const status = Number(new URL(request.url).searchParams.get("status") ?? 503);
  const code = Number.isInteger(status) && status >= 200 && status <= 599 ? status : 503;
  return new Response(`test response ${code}\n`, { status: code });
}

export const HEAD = GET;
