import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-zinc-200">
      <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-blue-600 p-1.5 rounded-lg group-hover:bg-blue-700 transition-colors">
            <BriefcaseBusiness className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-blue-600">Recruit AI</span>
        </Link>
        <Link
          href="/evaluation"
          className="text-sm font-semibold text-zinc-600 hover:text-blue-600 transition-colors bg-zinc-50 hover:bg-blue-50 px-4 py-2 rounded-full border border-zinc-200 hover:border-blue-200"
        >
          View Results
        </Link>
      </div>
    </header>
  );
}