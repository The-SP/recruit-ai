import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 py-20 text-center">
      <div className="space-y-6 max-w-md mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5 border border-primary/20 mb-2">
          <SearchX className="w-8 h-8 text-primary" />
        </div>
        <p className="text-8xl md:text-9xl font-black text-primary leading-none tracking-tighter">
          404
        </p>
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
            Page not found
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Looks like this page took a wrong turn. Let&apos;s get you back on
            track.
          </p>
        </div>
        <div className="pt-2">
          <Button asChild size="lg">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
