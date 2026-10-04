import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    title: "Upload",
    description: "Paste your job description and upload multiple candidate resumes in PDF format.",
  },
  {
    number: 2,
    title: "Scoring",
    description: "Each resume is scored on skills, experience and education against your job description.",
  },
  {
    number: 3,
    title: "Results",
    description: "Get an email when it's done, then see every candidate ranked by match score.",
  },
];

const interviewStep = {
  number: 4,
  title: "Interview",
  description: "Invite top candidates to an AI interview and get a transcript with a hiring recommendation.",
};

/**
 * Shared by the landing page and /demo.
 *
 * The interview step is opt-in and off by default because anonymous demo users
 * cannot create interviews, so advertising it there would promise the one
 * thing that flow deliberately excludes.
 *
 * components/dashboard-onboarding.tsx copies this step markup.
 */
export function HowItWorks({
  showInterviewStep = false,
}: {
  showInterviewStep?: boolean;
}) {
  const visibleSteps = showInterviewStep ? [...steps, interviewStep] : steps;

  return (
    <div className="bg-card rounded-3xl px-6 py-6 sm:px-8 shadow-sm border">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-primary text-xl">✦</span>
        <h2 className="font-bold text-foreground tracking-tight text-lg">How it works</h2>
      </div>
      {/* Four steps go 2x2 until there is room for ~200px each. */}
      <ol
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-6",
          showInterviewStep ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
        )}
      >
        {visibleSteps.map((step) => (
          <li key={step.number}>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 ring-1 ring-primary/25 text-primary flex items-center justify-center text-xs font-bold">
                {step.number}
              </div>
              <h3 className="font-bold text-foreground leading-tight">{step.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-2 pl-9 leading-relaxed">{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
