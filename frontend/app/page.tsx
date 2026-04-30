"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Sparkles, Zap, Shield, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HowItWorks } from "@/components/how-it-works";
import { useAuth } from "@/contexts/auth-context";

const features = [
  {
    icon: Zap,
    title: "Instant Ranking",
    description:
      "Upload resumes and get AI-ranked candidates against your JD in minutes, not hours.",
  },
  {
    icon: BarChart3,
    title: "Detailed Breakdowns",
    description:
      "Skills, experience, and education scored separately with evidence and reasoning.",
  },
  {
    icon: Shield,
    title: "Consistent & Unbiased",
    description:
      "Same evaluation criteria applied to every candidate, every time.",
  },
];

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="px-6 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <Badge
            variant="outline"
            className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 px-4 py-1.5 gap-2 text-sm font-medium shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Powered Resume Screening</span>
          </Badge>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Rank candidates,{" "}
            <span className="text-primary">not résumés.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your job description and resumes. Get a ranked shortlist with
            detailed AI scoring in minutes — skills, experience, and education all
            evaluated consistently.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button asChild size="lg" className="gap-2 px-6">
              <Link href="/login">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 px-6">
              <Link href="/demo">Try demo without signing up</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <Card
              key={f.title}
              className="p-6 space-y-3 hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
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
          <HowItWorks />
        </div>
      </section>

      {/* CTA strip */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-8 space-y-4 border-primary/20 bg-primary/5">
            <h3 className="text-xl font-bold">Sign in to save results</h3>
            <p className="text-sm text-muted-foreground">
              Track all your evaluation runs, revisit results anytime, and see
              cross-run stats on your dashboard.
            </p>
            <Button asChild className="w-full gap-2">
              <Link href="/login">
                Sign in with Google <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>

          <Card className="p-8 space-y-4">
            <h3 className="text-xl font-bold">Just want to try it?</h3>
            <p className="text-sm text-muted-foreground">
              No account needed. Submit a batch and get results via a shareable
              link — no data saved to your profile.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href="/demo">
                Try demo <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        </div>
      </section>
    </main>
  );
}
