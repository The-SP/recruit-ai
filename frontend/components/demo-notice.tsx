import { Sparkles } from "lucide-react";

/**
 * Shared shell for every demo-mode message. Styled as an informational notice
 * rather than an error: the backend being off is a cost decision, not a
 * failure, so these must not read like something went wrong.
 *
 * The "banner" size introduces demo mode up front; "inline" is the lighter
 * form used for messages raised in response to an action. "bare" keeps the
 * icon and layout but drops the card styling, for when the notice already sits
 * inside a container of its own (a dialog) and a second border would read as
 * two stacked cards.
 */
export function DemoNotice({
  size = "inline",
  className = "",
  children,
}: {
  size?: "banner" | "inline" | "bare";
  className?: string;
  children: React.ReactNode;
}) {
  const isWide = size === "banner" || size === "bare";

  const shell = {
    banner: "bg-primary/5 border border-primary/20 p-4 rounded-2xl gap-3 text-foreground",
    bare: "gap-3 text-foreground",
    inline: "bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl gap-2.5",
  }[size];

  return (
    <div className={`text-sm flex items-start ${shell} ${className}`}>
      <Sparkles
        className={`shrink-0 mt-0.5 text-primary ${isWide ? "w-5 h-5" : "w-4 h-4"}`}
      />
      {isWide ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <p className="text-muted-foreground font-medium">{children}</p>
      )}
    </div>
  );
}
