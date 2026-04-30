"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  User,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Evaluation", href: "/dashboard/new", icon: Plus },
  { label: "History", href: "/history", icon: History },
  { label: "Profile", href: "/profile", icon: User },
];

function UserInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="bg-primary p-1.5 rounded-lg group-hover:bg-primary/90 transition-colors">
            <Briefcase className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-primary">Recruit AI</span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <SidebarSeparator className="mb-3" />
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage
                src={user.avatar_url ?? undefined}
                alt={user.full_name ?? "User"}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {UserInitials(user.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.full_name ?? "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="h-8 w-8 shrink-0 rounded-full"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
