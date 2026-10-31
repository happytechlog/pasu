import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";

// Stage 1 stub: verifies DB connectivity. The check loop is added in stage 4.
async function main() {
  await db.execute(sql`select 1`);
  console.log("[worker] connected to database. check loop not implemented yet.");
  await pool.end();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
