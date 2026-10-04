"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  ListChecks,
  Mic,
  SearchCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HowItWorks } from "@/components/how-it-works";
import { LandingResultsPreview } from "@/components/landing-results-preview";
import { useAuth } from "@/contexts/auth-context";
import { MAX_ANONYMOUS_RESUMES } from "@/lib/evaluation-types";
import { getToken } from "@/services/auth";

// What sets the scoring apart. The upload, rank, interview flow itself is
// told once, by HowItWorks below, so these deliberately don't repeat it.
const features = [
  {
    icon: SearchCheck,
    title: "Scores you can check",
    description:
      "Every score comes with the evidence and reasoning behind it, skill by skill, so you can see why a candidate ranked where they did.",
  },
  {
    icon: ListChecks,
    title: "Must-haves count most",
    description:
      "Critical skills weigh heaviest, and each one missing pulls the score down, however strong a candidate is elsewhere.",
  },
  {
    icon: Mic,
    title: "Interviews you can verify",
    description:
      "Questions are drafted from each candidate's evaluation. You get the transcript, an assessment, and the recording when answers are spoken.",
  },
];

const noopSubscribe = () => () => {};

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // A stored token means this is probably a signed-in user about to be sent
  // to the dashboard, so hide the marketing page while auth resolves. Read via
  // useSyncExternalStore so the server render (no localStorage) still matches
  // on hydration; the server HTML can still paint for a moment before this.
  const hasToken = useSyncExternalStore(
    noopSubscribe,
    () => getToken() !== null,
    () => false
  );
  if (user || (isLoading && hasToken)) return null;

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="px-6 pt-12 pb-12 md:pt-16 md:pb-16">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <Badge
            variant="outline"
            className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 px-4 py-1.5 gap-2 text-sm font-medium shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI screening and interviews</span>
          </Badge>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Rank candidates,{" "}
            <span className="text-primary">not résumés.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your job description and resumes. Get a ranked shortlist in
            minutes. Then invite your top candidates to an AI interview, and read
            the transcript with its hiring recommendation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button asChild size="lg" className="gap-2 px-6">
              <Link href="/login">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 px-6">
              <Link href="/demo">Try it free, no sign-up</Link>
            </Button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-10 md:pt-12">
          <LandingResultsPreview />
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <Card key={f.title} className="p-6 gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <HowItWorks showInterviewStep />
        </div>
      </section>

      {/* CTA strip */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-8 gap-4">
            <h3 className="text-xl font-bold">Sign in to interview candidates</h3>
            <p className="text-sm text-muted-foreground flex-1">
              A free account adds AI interviews, unlimited resumes per run, and
              saved run history with side-by-side comparison within each run.
            </p>
            <Button asChild className="w-full gap-2">
              <Link href="/login">
                Create a free account <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>

          <Card className="p-8 gap-4">
            <h3 className="text-xl font-bold">Just want to try it?</h3>
            <p className="text-sm text-muted-foreground flex-1">
              No account needed. Evaluate up to {MAX_ANONYMOUS_RESUMES} resumes
              against a job description and get results by email and a
              shareable link.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href="/demo">
                Try it free <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        </div>
      </section>

      <footer className="border-t px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            <span className="font-medium text-foreground">Recruit AI</span>
            <span>· AI resume screening and interviews</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/demo" className="hover:text-foreground transition-colors">
              Try it free
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
