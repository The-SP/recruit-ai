"use client";

import { LogOut, Mail, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

export default function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      {user && (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-5">
              <Avatar className="h-16 w-16 shrink-0">
                <AvatarImage
                  src={user.avatar_url ?? undefined}
                  alt={user.full_name ?? "User"}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground">
                  {userInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xl font-bold truncate">
                  {user.full_name ?? "Anonymous"}
                </p>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {user.email}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Full name</p>
                  <p className="text-sm font-medium">
                    {user.full_name ?? <span className="text-muted-foreground italic">Not set</span>}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs text-muted-foreground font-bold">G</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sign-in method</p>
                  <p className="text-sm font-medium">Google OAuth</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs text-muted-foreground font-bold">#</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Member since</p>
                  <p className="text-sm font-medium">
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </>
      )}
    </div>
  );
}
