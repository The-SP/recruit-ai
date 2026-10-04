"use client";

import { ExternalLink, LogOut } from "lucide-react";

import { GoogleIcon } from "@/components/google-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";

function userInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-4 p-6">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="border-t px-6 py-3 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account and sign-in details.
        </p>
      </div>

      {isLoading || !user ? (
        <ProfileSkeleton />
      ) : (
        <Card className="gap-0 py-0 overflow-hidden">
          <div className="flex items-center gap-4 p-6">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarImage
                src={user.avatar_url ?? undefined}
                alt={user.full_name ?? "User"}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback className="text-lg font-bold bg-muted text-foreground">
                {userInitials(user.full_name ?? user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-lg font-semibold truncate">
                  {user.full_name ?? user.email}
                </p>
                {user.is_admin && <Badge variant="outline">Admin</Badge>}
              </div>
              {user.full_name && (
                <p className="text-sm text-muted-foreground truncate" title={user.email}>
                  {user.email}
                </p>
              )}
            </div>
          </div>

          <dl className="border-t px-6 divide-y">
            <DetailRow label="Sign-in method">
              <span className="inline-flex items-center gap-2">
                <GoogleIcon className="w-4 h-4" />
                Google
              </span>
            </DetailRow>
            <DetailRow label="Member since">
              {new Date(user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </DetailRow>
          </dl>

          <div className="border-t bg-muted/40 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Your name and photo come from your Google account.{" "}
              <a
                href="https://myaccount.google.com/personal-info"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                Manage on Google
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <Button variant="outline" size="lg" className="gap-2 shrink-0 w-full sm:w-auto" onClick={logout}>
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
