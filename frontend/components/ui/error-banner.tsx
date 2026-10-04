import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Inline error message: something the user tried failed. Red because
 * something broke (see frontend/CLAUDE.md), and `role="alert"` so a screen
 * reader announces it when it appears.
 *
 * `size="sm"` is for dense panels such as the run page's interview column.
 */
function ErrorBanner({
  size = "default",
  className,
  children,
}: {
  size?: "default" | "sm"
  className?: string
  children: React.ReactNode
}) {
  const sm = size === "sm"
  return (
    <div
      role="alert"
      className={cn(
        "bg-error border border-error-edge text-error-foreground flex items-start gap-2",
        sm ? "text-xs px-3 py-2 rounded-lg" : "text-sm px-4 py-3 rounded-xl",
        className
      )}
    >
      <X className={cn("shrink-0 mt-0.5", sm ? "w-3.5 h-3.5" : "w-4 h-4")} />
      <p className="font-medium">{children}</p>
    </div>
  )
}

export { ErrorBanner }
