"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * Top-bar breadcrumbs for the signed-in app.
 *
 * Static segments come from the route table in buildCrumbs. Dynamic ones (a
 * run's job title, a candidate's name) are unknown to the layout, so the page
 * that has fetched them registers a label with useBreadcrumbLabel(id, label).
 * Labels are cached for the session and never removed, so navigating from a
 * run into one of its candidates keeps the run's title in the trail even
 * though the candidate page never fetches the run.
 */

type Labels = Record<string, string>;

const BreadcrumbLabelsContext = createContext<{
  labels: Labels;
  setLabel: (id: string, label: string) => void;
} | null>(null);

export function BreadcrumbLabelsProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Labels>({});
  const setLabel = useCallback((id: string, label: string) => {
    setLabels((prev) => (prev[id] === label ? prev : { ...prev, [id]: label }));
  }, []);
  return (
    <BreadcrumbLabelsContext.Provider value={{ labels, setLabel }}>
      {children}
    </BreadcrumbLabelsContext.Provider>
  );
}

/** Register a human label for a dynamic route segment (a run or candidate id). */
export function useBreadcrumbLabel(id: string, label: string | null | undefined) {
  const ctx = useContext(BreadcrumbLabelsContext);
  const setLabel = ctx?.setLabel;
  useEffect(() => {
    if (setLabel && label) setLabel(id, label);
  }, [setLabel, id, label]);
}

interface Crumb {
  label: string;
  href: string;
}

function buildCrumbs(pathname: string, labels: Labels): Crumb[] {
  const [root, id, sub, subId, , leaf] = pathname.split("/").filter(Boolean);

  switch (root) {
    case "dashboard":
      return [
        { label: "Dashboard", href: "/dashboard" },
        ...(id === "new" ? [{ label: "New evaluation", href: "/dashboard/new" }] : []),
      ];
    case "history":
      return [{ label: "History", href: "/history" }];
    case "profile":
      return [{ label: "Profile", href: "/profile" }];
    case "admin":
      return [
        { label: "Admin", href: "/admin" },
        ...(id === "users" ? [{ label: "Users", href: "/admin/users" }] : []),
        ...(id === "runs" ? [{ label: "All runs", href: "/admin/runs" }] : []),
      ];
    case "evaluation": {
      if (!id) return [];
      const runHref = `/evaluation/${id}`;
      const crumbs: Crumb[] = [
        { label: "History", href: "/history" },
        { label: labels[id] ?? "Evaluation", href: runHref },
      ];
      if (sub === "interview-template") {
        crumbs.push({ label: "Interview template", href: `${runHref}/interview-template` });
      } else if (sub === "candidate" && subId) {
        const interviewHref = `${runHref}/candidate/${subId}/interview`;
        crumbs.push({ label: labels[subId] ?? "Candidate", href: interviewHref });
        if (leaf === "review") {
          crumbs.push({ label: "Review questions", href: `${interviewHref}/review` });
        }
      }
      return crumbs;
    }
    default:
      return [];
  }
}

export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const ctx = useContext(BreadcrumbLabelsContext);
  const crumbs = buildCrumbs(pathname, ctx?.labels ?? {});
  if (crumbs.length === 0) return null;

  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  return (
    <>
      {/* Phones: the full trail can't fit beside the two buttons, so show a
          back link to the parent, or the page name on top-level pages. */}
      <div className="md:hidden min-w-0">
        {parent ? (
          <Link
            href={parent.href}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">{parent.label}</span>
          </Link>
        ) : (
          <p className="text-sm font-medium truncate">{current.label}</p>
        )}
      </div>

      <Breadcrumb className="hidden md:block min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, i) => (
            <Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {crumb === current ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="truncate">
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
