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
    description: "Receive an email when processing is complete. See ranked candidates with match scores",
  },
];

export function HowItWorks() {
  return (
    <div className="bg-card rounded-3xl p-8 max-w-3xl mx-auto shadow-sm border">
      <div className="flex items-center gap-2 mb-8">
        <span className="text-primary text-xl">✦</span>
        <h2 className="font-bold text-foreground tracking-tight text-lg">How it works</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
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