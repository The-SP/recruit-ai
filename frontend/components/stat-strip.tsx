import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A row of stats in one frame, shared by the dashboard and the admin overview.
 *
 * The 1px gap over a border-coloured background draws the dividers, so they
 * stay correct at any column count. Pass the grid columns via `className` as
 * full literal classes (e.g. "sm:grid-cols-2 xl:grid-cols-4") so Tailwind can
 * see them.
 */
export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px bg-border border rounded-2xl overflow-hidden shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCell({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  tone,
  loading,
  children,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  /** Small muted text on the value's line, e.g. a year after a date. */
  suffix?: string;
  /** Small muted line under the value. */
  hint?: string;
  /** "warn" marks an operational problem: the value turns destructive.
   *  "attention" marks work waiting on the user: the value turns amber. */
  tone?: "warn" | "attention";
  loading: boolean;
  /** Extra content under the value, e.g. a progress bar. */
  children?: React.ReactNode;
  /** Shown on hovering the cell, e.g. how the stat is defined. */
  tooltip?: string;
}) {
  const cell = (
    <div className={cn("bg-card px-5 py-4", tooltip && "cursor-help")}>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-7 w-16 mt-1.5" />
      ) : (
        <>
          <p className="mt-1 whitespace-nowrap">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                tone === "warn" && "text-destructive",
                // warning-foreground is pale in light mode (it's meant for
                // text on bg-warning), so light mode borrows the edge colour.
                tone === "attention" && "text-warning-edge dark:text-warning-foreground"
              )}
            >
              {value}
            </span>
            {suffix && (
              <span className="ml-1.5 text-xs text-muted-foreground">{suffix}</span>
            )}
          </p>
          {children}
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </>
      )}
    </div>
  );

  if (!tooltip) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Counts read better as an em dash than a zero in these strips. */
export function countOrDash(value: number): string | number {
  return value > 0 ? value : "—";
}
