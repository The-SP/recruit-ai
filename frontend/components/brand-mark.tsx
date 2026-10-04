import { Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";

/** The logo tile and wordmark. Not a link itself: callers wrap it in one
 * (with `group` for the hover tint) or, on the candidate interview, don't. */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span className="flex items-center gap-2">
      <span className="bg-primary p-1.5 rounded-lg group-hover:bg-primary/90 transition-colors">
        <Briefcase
          className={cn("text-primary-foreground", size === "lg" ? "w-5 h-5" : "w-4 h-4")}
        />
      </span>
      <span className={cn("font-bold text-primary", size === "lg" ? "text-xl" : "text-lg")}>
        Recruit AI
      </span>
    </span>
  );
}
