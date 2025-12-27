import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-zinc-200">
      <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <Link href="/" className="text-xl font-bold text-blue-600">
          Recruit AI
        </Link>
        <Link
          href="/evaluation"
          className="text-sm font-medium text-zinc-600 hover:text-blue-600 transition-colors"
        >
          View Results
        </Link>
      </div>
    </header>
  );
}