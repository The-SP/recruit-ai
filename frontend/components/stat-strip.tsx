import { Skeleton } from "@/components/ui/skeleton";
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
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  /** Small muted text on the value's line, e.g. a year after a date. */
  suffix?: string;
  /** Small muted line under the value. */
  hint?: string;
  /** "warn" marks an operational problem: the value turns destructive. */
  tone?: "warn";
  loading: boolean;
  /** Extra content under the value, e.g. a progress bar. */
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card px-5 py-4">
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
                tone === "warn" && "text-destructive"
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
}
