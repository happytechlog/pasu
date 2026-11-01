import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/session";
import { signOutAction } from "../(auth)/actions";

// The session is read inside <Suspense> (not at the layout's top level) so the
// shell prerenders and {children} isn't held behind the request.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold">
            Uptime Monitor
          </Link>
          <Suspense fallback={<div className="flex-1" />}>
            <UserNav />
          </Suspense>
        </div>
      </header>
      {children}
    </>
  );
}

async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return <div className="flex-1" />;

  return (
    <>
      <nav className="flex flex-1 items-center gap-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          모니터
        </Link>
        <Link href="/settings/status-pages" className="hover:text-foreground">
          상태페이지
        </Link>
        <Link href="/settings/alerts" className="hover:text-foreground">
          알림채널
        </Link>
        {user.role === "admin" && (
          <Link href="/settings/users" className="hover:text-foreground">
            사용자
          </Link>
        )}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{user.name}</span>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            로그아웃
          </Button>
        </form>
      </div>
    </>
  );
}
