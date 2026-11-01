import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/lib/db";

// Applies drizzle/*.sql migrations. Uses the same journal table as
// `drizzle-kit migrate` (drizzle.__drizzle_migrations), so the two are
// interchangeable. In Docker this runs as the one-shot `migrate` service
// before web and worker start; it needs no drizzle-kit at runtime.
const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve("drizzle");

async function main() {
  const started = Date.now();
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log(`[migrate] done in ${Date.now() - started}ms`);
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
