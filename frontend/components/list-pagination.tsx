import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/** Rows per page on every ?page=-paged list. */
export const PAGE_SIZE = 20;

// ?page= is 1-based; anything missing or malformed means page 1.
export function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * `path` plus the non-empty `params`, with `page` dropped when it is 1 so the
 * first page has one canonical URL.
 */
export function pageHref(
  path: string,
  page: number,
  params: Record<string, string | undefined> = {}
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  if (page > 1) qs.set("page", String(page));
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

// First, last, and a window around the current page; null marks a gap.
function pageWindow(current: number, totalPages: number): (number | null)[] {
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const disabledLink = "pointer-events-none opacity-50";

/**
 * "Showing 21–40 of N" plus page links, for a list paged via ?page=.
 *
 * `page` is the page in the URL (drives the links, so a click highlights
 * immediately); `shownPage`/`shownCount` describe the rows actually on
 * screen, which lag behind while the next page loads. The links are only
 * drawn when there is more than one page.
 */
export function ListPagination({
  hrefFor,
  page,
  pageSize,
  total,
  shownPage,
  shownCount,
}: {
  hrefFor: (page: number) => string;
  page: number;
  pageSize: number;
  total: number;
  shownPage: number;
  shownCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = (shownPage - 1) * pageSize + 1;
  const rangeEnd = (shownPage - 1) * pageSize + shownCount;
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground tabular-nums">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={hrefFor(page - 1)}
                aria-disabled={atStart}
                tabIndex={atStart ? -1 : undefined}
                className={atStart ? disabledLink : undefined}
              />
            </PaginationItem>
            {pageWindow(page, totalPages).map((p, i) =>
              p === null ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink href={hrefFor(p)} isActive={p === page}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                href={hrefFor(page + 1)}
                aria-disabled={atEnd}
                tabIndex={atEnd ? -1 : undefined}
                className={atEnd ? disabledLink : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
