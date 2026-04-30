import { HowItWorks } from "@/components/how-it-works";
import { SubmitForm } from "@/components/submit-form";
import { Hero } from "@/components/hero";

export default function DemoPage() {
  return (
    <main className="min-h-screen">
      <Hero />
      <section className="px-6 pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="max-w-5xl mx-auto space-y-20">
          <HowItWorks />
          <div id="submit" className="scroll-mt-24">
            <SubmitForm />
          </div>
        </div>
      </section>
    </main>
  );
}
