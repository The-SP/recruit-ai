import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // bg-muted, not bg-accent: accent is the brand green, which reads as
      // filled content rather than absent content. muted is the theme's
      // neutral in both light and dark.
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
