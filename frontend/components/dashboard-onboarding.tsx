import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "Paste a job description",
    body: "We extract the skills, experience and education it asks for.",
  },
  {
    title: "Upload resumes",
    body: "Drop in candidate PDFs. Each one is parsed and scored against the role.",
  },
  {
    title: "Review ranked matches",
    body: "See every candidate's score, hire signal and a full breakdown.",
  },
  {
    title: "Run AI interviews",
    body: "Invite your top candidates to an AI interview and get an assessment.",
  },
];

/** First-run dashboard: shown in place of stats and tables until a run exists. */
export function DashboardOnboarding() {
  return (
    <Card className="p-8 gap-8">
      {/* The button sits top-right, the same spot the page-header CTA takes
          once the user has runs, so it doesn't move when they graduate. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Get started</h2>
        <Button asChild className="gap-1.5">
          <Link href="/dashboard/new">
            <Plus className="w-4 h-4" />
            New evaluation
          </Link>
        </Button>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-6">
        {/* Same step markup as components/how-it-works.tsx, so the dashboard
            matches the landing page and /demo. */}
        {steps.map((step, i) => (
          <li key={step.title}>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 ring-1 ring-primary/25 text-primary flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>
              <h3 className="font-bold text-foreground leading-tight">{step.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-2 pl-9 leading-relaxed">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
