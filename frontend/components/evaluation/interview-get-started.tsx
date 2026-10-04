"use client";

import Link from "next/link";

/**
 * Stands in for InterviewStatsStrip on a run with no interviews yet, when
 * every funnel count would be a dash. Step numbers are neutral rather than
 * the green HowItWorks uses: the one green on this tab is the suggested row's
 * "Set up" button just below, and the card points at it.
 */
export function InterviewGetStarted({ templateHref }: { templateHref: string }) {
  const steps = [
    {
      title: "Check the template",
      description: (
        <>
          Optional. Set fixed questions and focus areas for every interview in
          this run in the{" "}
          <Link
            href={templateHref}
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            interview template
          </Link>
          .
        </>
      ),
    },
    {
      title: "Set up an interview",
      description:
        "Questions are drafted from the candidate's evaluation. Review and edit them before anything is sent.",
    },
    {
      title: "Send the link, then assess",
      description:
        "Share the invite link. Once the candidate finishes, run the assessment for a transcript and a recommendation.",
    },
  ];

  return (
    <div className="bg-card rounded-2xl border shadow-sm p-6">
      <h2 className="font-semibold text-foreground">Interview your top candidates</h2>
      <p className="text-sm text-muted-foreground mt-1">
        No interviews in this run yet. Start with the highlighted candidate
        below, or any other.
      </p>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-7">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
