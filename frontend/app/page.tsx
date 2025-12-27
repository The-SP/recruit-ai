import { HowItWorks } from "@/components/how-it-works";
import { SubmitForm } from "@/components/submit-form";

export default function Home() {
  return (
    <main className="px-6 py-12">
      <h1 className="text-3xl md:text-4xl font-bold text-center text-blue-700 mb-3">
          AI-Powered Resume Screening
        </h1>
        <p className="text-center text-zinc-600 mb-10 max-w-md mx-auto">
          Score and rank candidates against your job requirements in minutes
        </p>

        <div className="space-y-8">
          <HowItWorks />
          <SubmitForm />
        </div>
      </main>
  );
}