/**
 * Confirmation copy for the destructive actions, in one place because three
 * surfaces delete a run (history, dashboard, run detail) and must not describe
 * the consequences differently.
 *
 * Both name what is actually destroyed. Deletion cascades past the rows the
 * user can see: the stored resumes, and any interview with its recordings.
 */

export function runDeleteDescription(run: {
  job_title?: string | null;
  total_count: number;
}): React.ReactNode {
  const title = run.job_title?.trim() || "this untitled run";
  const count = run.total_count;
  return (
    <>
      Deleting <span className="font-medium text-foreground">{title}</span>{" "}
      permanently removes {count} {count === 1 ? "candidate" : "candidates"},
      their resumes and scores, and any interviews with their recordings. This
      cannot be undone.
    </>
  );
}

export function candidateDeleteDescription(name: string | null): React.ReactNode {
  const who = name?.trim() || "this candidate";
  return (
    <>
      Removing <span className="font-medium text-foreground">{who}</span> from
      this run permanently deletes their resume, score breakdown, and any
      interview with its recordings. This cannot be undone.
    </>
  );
}
