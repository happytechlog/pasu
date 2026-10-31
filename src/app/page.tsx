import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// cacheComponents is on: request-time data must render inside <Suspense>.
async function DbStatus() {
  await connection();
  let ok = true;
  let message = "연결됨";
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    ok = false;
    message = (err as Error).message;
  }
  return (
    <>
      <span className={ok ? "text-green-600" : "text-red-600"}>●</span> 데이터베이스: {message}
    </>
  );
}

// Placeholder until the dashboard is built (stage 5).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Uptime Monitor</h1>
      <p className="text-muted-foreground">1단계 뼈대: 대시보드는 이후 단계에서 구현됩니다.</p>
      <div className="rounded-lg border p-4">
        <Suspense fallback="데이터베이스: 확인 중…">
          <DbStatus />
        </Suspense>
      </div>
    </main>
  );
}
