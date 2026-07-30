import { ArrowRight, PlayCircle } from "lucide-react";
import Link from "next/link";

import { DemoNotice } from "@/components/demo-notice";
import { DEMO_TOKEN, DEMO_VIDEO_URL } from "@/lib/demo";

export type DemoBannerVariant = "submit" | "results" | "login";

/**
 * Introduces demo mode and explains why the backend-backed features return
 * saved data or nothing at all.
 *
 * "submit" sets expectations before the visitor fills the form; "results"
 * describes what they are already looking at; "login" explains why sign-in
 * is visible but inert.
 */
const COPY: Record<DemoBannerVariant, React.ReactNode> = {
  submit: (
    <>
      Fill in the form and submit to see sample results. The backend is powered
      down to keep hosting costs at zero, so your files aren&apos;t processed
      &mdash; you&apos;ll see a saved run of five sample resumes instead.
    </>
  ),
  results: (
    <>
      You&apos;re viewing a saved evaluation of five sample resumes. The backend
      is powered down to keep hosting costs at zero, so new submissions
      aren&apos;t processed. Everything on this page is real output from the
      scoring pipeline.
    </>
  ),
  login: (
    <>
      Signing in saves your evaluation history to your account. The backend is
      powered down to keep hosting costs at zero, so sign-in is unavailable
      here.
    </>
  ),
};

export function DemoBanner({
  variant = "results",
  bare = false,
  className = "",
}: {
  variant?: DemoBannerVariant;
  /** Drop the card styling when the banner already sits inside a container. */
  bare?: boolean;
  className?: string;
}) {
  return (
    <DemoNotice size={bare ? "bare" : "banner"} className={className}>
      <p className="font-semibold">Demo mode</p>
      <p className="text-muted-foreground leading-relaxed">{COPY[variant]}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-0.5">
        {variant !== "results" && (
          <Link
            href={`/evaluation?token=${DEMO_TOKEN}`}
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <ArrowRight className="w-4 h-4" />
            Skip to the results
          </Link>
        )}
        <a
          href={DEMO_VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <PlayCircle className="w-4 h-4" />
          Watch the full walkthrough
        </a>
      </div>
    </DemoNotice>
  );
}
