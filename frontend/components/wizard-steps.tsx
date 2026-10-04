import { Check } from "lucide-react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

/**
 * Numbered step indicator for the multi-step flows: the new-evaluation wizard
 * and the interview review page. Shared so the two can't drift apart again.
 * `current` is 1-based.
 */
export function WizardSteps({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((title, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <Fragment key={title}>
            {i > 0 && <li aria-hidden className="h-px flex-1 bg-border" />}
            <li
              className="flex items-center gap-3 min-w-0"
              aria-current={active ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                  done || active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "border bg-card text-muted-foreground"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  !done && !active && "text-muted-foreground"
                )}
              >
                {title}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
