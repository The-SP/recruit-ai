import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 300;

/**
 * A search box whose committed value lives in the URL (`q`).
 *
 * Typing updates the input immediately and writes the trimmed value to the
 * URL after a pause, so each keystroke doesn't fire its own request. `hrefFor`
 * builds the URL for a new query (normally resetting to page 1) and MUST be
 * stable: wrap it in useCallback, or every render restarts the debounce.
 *
 * Back/forward can change `q` under the input; the input follows it, unless
 * `q` is just our own debounced write of what is already typed, so a trailing
 * space mid-word isn't eaten.
 */
export function useUrlSearch(q: string, hrefFor: (q: string) => string) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [prevQ, setPrevQ] = useState(q);

  if (q !== prevQ) {
    setPrevQ(q);
    if (q !== search.trim()) setSearch(q);
  }

  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const id = setTimeout(() => router.replace(hrefFor(next)), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, q, hrefFor, router]);

  return [search, setSearch] as const;
}
