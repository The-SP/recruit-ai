import type {
  AddCandidatesResponse,
  BatchStatus,
  CandidateBreakdown,
  RetryFailedResponse,
  SubmitBatchResponse,
} from "@/services/batch";

/**
 * Demo mode serves a saved evaluation instead of calling the API, so the site
 * stays fully browsable when the backend is powered down to avoid hosting
 * costs. Enabled by setting NEXT_PUBLIC_DEMO_MODE=true at build time.
 */
export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Token the demo evaluation is served under. */
export const DEMO_TOKEN = "demo";

export const DEMO_VIDEO_URL = "https://youtu.be/LePLLOD3vfg";

/**
 * Latency applied to demo responses. Without it, results appear instantly on
 * navigation, which reads as a hardcoded page rather than a fetch.
 */
const DEMO_LATENCY_MS = 400;

/**
 * Fixtures are loaded through dynamic import so they are code-split into a
 * chunk that only demo builds ever request. A static import would bundle the
 * saved evaluation into production output, where it is dead weight.
 */
async function loadFixtures() {
  const [status, johnSmith, michaelJohnson, janeDoe, davidBrown, emilyDavis] =
    await Promise.all([
      import("./demo-data/status.json"),
      import("./demo-data/candidates/9556299e-6195-436a-a273-b8c12aaa9dde.json"),
      import("./demo-data/candidates/eab91c40-4a73-47f8-a63f-99c248505d34.json"),
      import("./demo-data/candidates/c1bf5b87-e816-4449-9179-3a3da5f9118a.json"),
      import("./demo-data/candidates/71ac2e0a-77fc-41c7-bc42-51ce1fae6fd9.json"),
      import("./demo-data/candidates/76ef7c9f-0f4c-40ad-b900-b846b7ce7b32.json"),
    ]);

  const breakdowns = [
    johnSmith.default,
    michaelJohnson.default,
    janeDoe.default,
    davidBrown.default,
    emilyDavis.default,
  ] as unknown as CandidateBreakdown[];

  return {
    status: status.default as unknown as BatchStatus,
    breakdownsById: new Map(breakdowns.map((b) => [b.candidate_id, b])),
  };
}

let fixturesPromise: ReturnType<typeof loadFixtures> | null = null;

function fixtures() {
  fixturesPromise ??= loadFixtures();
  return fixturesPromise;
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS)
  );
}

/**
 * Raised by demo stubs for actions that cannot work without a backend
 * (uploading resumes, retrying failed items). Callers render the message
 * as an informational notice rather than an error.
 */
export class DemoModeError extends Error {
  constructor(
    message = "This is a demo with saved sample data, so new uploads aren't processed."
  ) {
    super(message);
    this.name = "DemoModeError";
  }
}

export async function demoSubmitBatch(): Promise<SubmitBatchResponse> {
  return delay({ token: DEMO_TOKEN, uploaded: 0, failed: 0, errors: [] });
}

export async function demoGetBatchStatus(): Promise<BatchStatus> {
  const { status } = await fixtures();
  return delay(status);
}

export async function demoGetCandidateBreakdown(
  candidateId: string
): Promise<CandidateBreakdown> {
  const { breakdownsById } = await fixtures();
  const breakdown = breakdownsById.get(candidateId);
  if (!breakdown) {
    throw new DemoModeError("No saved breakdown for this candidate.");
  }
  return delay(breakdown);
}

export async function demoAddCandidates(): Promise<AddCandidatesResponse> {
  throw new DemoModeError();
}

export async function demoRetryFailed(): Promise<RetryFailedResponse> {
  throw new DemoModeError();
}

/** No saved interviews in the demo fixtures: every candidate shows the
 * invite button, and pressing it raises the notice below. */
export async function demoGetInterview(): Promise<null> {
  return delay(null);
}

export async function demoCreateInterview(): Promise<never> {
  throw new DemoModeError(
    "This is a demo with saved sample data, so interview invites can't be created."
  );
}
