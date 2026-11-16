import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PAGE_SIZE } from "@/components/list-pagination";
import { ApiError } from "@/services/api";

export interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * Loads one ?page= of a list and keeps it in step with the URL.
 *
 * `fetchPage` and `hrefFor` MUST be stable (wrap them in useCallback over the
 * page's filters): the fetch re-runs whenever either changes identity, so an
 * inline arrow would refetch on every render. Changing a filter is therefore
 * what triggers a refetch, with no separate dependency list to keep in sync.
 *
 * - A response for a page or filter that has since changed is dropped, so a
 *   fast click can't leave the slower request's rows on screen.
 * - `shownPage` is the page `items` belongs to; it lags `page` while the next
 *   page loads, so the "Showing X–Y" range never mixes old rows with the new
 *   page number.
 * - A page past the end (stale link, or the last row on the last page was
 *   deleted) is replaced with the real last page instead of an empty table.
 */
export function usePagedList<T>({
  page,
  fetchPage,
  hrefFor,
  errorMessage,
}: {
  page: number;
  fetchPage: (limit: number, offset: number) => Promise<Paged<T>>;
  hrefFor: (page: number) => string;
  errorMessage: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [shownPage, setShownPage] = useState(page);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (signal: { cancelled: boolean }) =>
      fetchPage(PAGE_SIZE, (page - 1) * PAGE_SIZE)
        .then((res) => {
          if (signal.cancelled) return;
          if (res.items.length === 0 && res.total > 0) {
            router.replace(hrefFor(Math.ceil(res.total / PAGE_SIZE)));
            return;
          }
          setItems(res.items);
          setTotal(res.total);
          setShownPage(page);
          setError(null);
        })
        .catch((err) => {
          if (signal.cancelled) return;
          setError(err instanceof ApiError ? err.message : errorMessage);
        })
        .finally(() => {
          if (!signal.cancelled) setLoading(false);
        }),
    [page, fetchPage, hrefFor, errorMessage, router]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  /** Refetch the current page in place, e.g. after deleting a row. */
  const reload = useCallback(() => load({ cancelled: false }), [load]);

  /**
   * Swap the rows for the full loading state. Call it from the event handler
   * that changes a filter (not from an effect: setState in an effect body
   * cascades renders), when the old rows would be misleading to keep showing.
   */
  const showLoading = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  return { items, total, shownPage, loading, error, reload, showLoading };
}
