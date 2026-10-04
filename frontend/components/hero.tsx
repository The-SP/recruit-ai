import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MAX_ANONYMOUS_RESUMES } from "@/lib/evaluation-types";

/** The /demo hero. The landing page has its own, since it sells sign-up. */
export function Hero() {
  return (
    <section className="px-6 pt-12 pb-6 md:pt-16 md:pb-8">
      <div className="max-w-5xl mx-auto text-center space-y-6">
        <Badge
          variant="outline"
          className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 hover:text-primary px-4 py-1.5 gap-2 text-sm font-medium shadow-sm transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Free trial, no sign-up</span>
        </Badge>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground">
          Rank your first <span className="text-primary">shortlist.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Paste a job description and upload up to {MAX_ANONYMOUS_RESUMES} resumes.
          Each candidate is scored on skills, experience and education, and the
          ranked results arrive by email.
        </p>
      </div>
    </section>
  );
}
