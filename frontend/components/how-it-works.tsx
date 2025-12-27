const steps = [
  {
    number: 1,
    title: "Upload",
    description: "Paste your job description and upload resume PDFs",
  },
  {
    number: 2,
    title: "Get Notified",
    description: "Receive an email when processing is complete",
  },
  {
    number: 3,
    title: "View Results",
    description: "See ranked candidates with match scores",
  },
];

export function HowItWorks() {
  return (
    <div className="bg-white rounded-xl p-6 max-w-3xl mx-auto shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-blue-600">✦</span>
        <h2 className="font-semibold text-zinc-900">How it works</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
              {step.number}
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">{step.title}</h3>
              <p className="text-sm text-zinc-600 mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}