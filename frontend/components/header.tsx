import Link from "next/link";
import { Briefcase } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary p-1.5 rounded-lg group-hover:bg-primary/90 transition-colors">
            <Briefcase className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-primary">Recruit AI</span>
        </Link>
        <Link
          href="/evaluation"
          className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors bg-muted/50 hover:bg-primary/5 px-4 py-2 rounded-full border hover:border-primary/20"
        >
          View Results
        </Link>
      </div>
    </header>
  );
}