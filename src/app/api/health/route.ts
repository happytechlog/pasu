import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    // Public endpoint: the driver's message can include the DB host, port and
    // user name, so it only goes to the server log.
    console.error("health check: db unreachable", err);
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
