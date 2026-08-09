import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    title: "Upload",
    description: "Paste your job description and upload multiple candidate resumes in PDF format.",
  },
  {
    number: 2,
    title: "AI Analysis",
    description: "Our advanced LLMs analyze each resume against specific job requirements and skills.",
  },
  {
    number: 3,
    title: "View Results",
    description: "Receive an email when processing is complete. See ranked candidates with match scores.",
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
 */
export function HowItWorks({
  showInterviewStep = false,
}: {
  showInterviewStep?: boolean;
}) {
  const visibleSteps = showInterviewStep ? [...steps, interviewStep] : steps;

  return (
    <div className="bg-card rounded-3xl p-8 max-w-3xl mx-auto shadow-sm border">
      <div className="flex items-center gap-2 mb-8">
        <span className="text-primary text-xl">✦</span>
        <h2 className="font-bold text-foreground tracking-tight text-lg">How it works</h2>
      </div>
      {/* Four steps go 2x2 rather than 4-up: this card is max-w-3xl, so four
          columns would leave ~150px per step. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-8",
          showInterviewStep ? "md:grid-cols-2" : "md:grid-cols-3"
        )}
      >
        {visibleSteps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-sm shadow-primary/20">
              {step.number}
            </div>
            <div>
              <h3 className="font-bold text-foreground leading-tight">{step.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
