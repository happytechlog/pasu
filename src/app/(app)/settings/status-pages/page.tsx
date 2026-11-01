import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/server/session";
import { listStatusPages } from "@/server/status-pages";
import { ConfirmSubmit } from "../../monitors/confirm-submit";
import { deleteStatusPageAction } from "./actions";

export default function StatusPagesPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">상태 페이지</h1>
        <Button render={<Link href="/settings/status-pages/new" />} nativeButton={false}>
          상태 페이지 추가
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        고른 모니터의 현재 상태와 90일 가동률을 로그인 없이 볼 수 있는 페이지입니다. URL과 에러 내용은 공개되지 않습니다.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <StatusPageList />
      </Suspense>
    </main>
  );
}

async function StatusPageList() {
  await requireUser();
  const rows = await listStatusPages();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        아직 상태 페이지가 없습니다. 오른쪽 위의 <strong>상태 페이지 추가</strong>로 만드세요.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>제목</TableHead>
          <TableHead>공개 주소</TableHead>
          <TableHead className="text-right">모니터</TableHead>
          <TableHead className="text-right">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.title}</TableCell>
            <TableCell>
              <a href={`/status/${p.slug}`} target="_blank" rel="noopener" className="font-mono text-xs hover:underline">
                /status/{p.slug} ↗
              </a>
            </TableCell>
            <TableCell className="text-right tabular-nums">{p.monitorCount}개</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/settings/status-pages/${p.id}`} />}
                  nativeButton={false}
                >
                  수정
                </Button>
                <form action={deleteStatusPageAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit variant="destructive" size="sm" message={`'${p.title}' 상태 페이지를 삭제할까요?`}>
                    삭제
                  </ConfirmSubmit>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
