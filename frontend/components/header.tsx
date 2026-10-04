"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LogOut } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTH_PREFIXES = ["/dashboard", "/history", "/profile", "/evaluation/", "/admin"];

function UserAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? "User"}
        width={32}
        height={32}
        className="rounded-full"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = name
    ? name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  return (
    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
      {initials}
    </div>
  );
}

export function Header() {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();

  if (AUTH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
      {/* Matches the page below it: the anonymous results page is as wide
          as the owned run page, so its header widens with it. */}
      <div
        className={cn(
          "flex items-center justify-between px-6 py-4 mx-auto w-full",
          pathname === "/evaluation" ? "max-w-7xl" : "max-w-5xl"
        )}
      >
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary p-1.5 rounded-lg group-hover:bg-primary/90 transition-colors">
            <Briefcase className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-primary">Recruit AI</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/demo"
            className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors bg-muted/50 hover:bg-primary/5 px-4 py-2 rounded-full border hover:border-primary/20"
          >
            Try it free
          </Link>

          {!isLoading && (
            user ? (
              <div className="flex items-center gap-2">
                <Link href="/history" className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/50 hover:bg-primary/5 hover:border-primary/20 transition-colors">
                  <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} />
                  <span className="text-sm font-medium max-w-[120px] truncate">
                    {user.full_name ?? user.email}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="rounded-full"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : pathname !== "/login" && (
              <Link
                href="/login"
                className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors bg-muted/50 hover:bg-primary/5 px-4 py-2 rounded-full border hover:border-primary/20"
              >
                Sign in
              </Link>
            )
          )}

          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
