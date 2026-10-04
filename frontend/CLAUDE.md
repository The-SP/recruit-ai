# Frontend UI conventions

Loaded alongside the root `CLAUDE.md` when working in `frontend/`. These are decisions, not style preferences, so keep new UI consistent with them.

## Product rule

**Never compare candidates across runs.** A score only means something against the job description it was scored on, so a recruiter's runs for different roles are not comparable. Dashboard-level features stay per-run: no global "top candidates", no averages or score distributions across all runs. Per-run aggregates (e.g. a run's top match) are fine.

## Copy and colour

- **Sentence case everywhere:** headings, buttons, nav items, table headers, stat labels ("New evaluation", "Job title", "Total runs").
- **Colour carries meaning, not decoration:**
  - green (`primary`) is the page's primary action;
  - red (`destructive`, a true red) means something broke;
  - amber means it is waiting on the user;
  - active/selected states (open menu, expanded row, "best" value) are neutral: `text-foreground` on `bg-muted`, not green.
- **That rule is about solid green.** Soft green tints are brand accents and stay, especially on marketing pages: the hero badge, the ✦ glyph, feature icon tiles (`bg-primary/10 text-primary`) and step-number circles (`bg-primary/15 ring-1 ring-primary/25 text-primary`). Don't neutralize them to "save" green for the CTA.

## Layout patterns

- **Page wrapper:** `components/dashboard-layout.tsx` already renders the `<main>` and its padding (`p-4 md:p-6`). A page under `app/(dashboard)/` starts with a plain `<div className="max-w-… mx-auto">`: no `<main>` of its own and no `px-*`/`py-*`, or the padding doubles and the title sits far below the top bar. Pages outside the group (`/demo`, `/evaluation?token=`, `/interview`) have no layout padding and keep their own.
- **Page header:** title + subtitle on the left, primary CTA top-right, no icon tile. Hide the header CTA when an empty state on the page carries its own (see the dashboard's onboarding and `/history`'s empty state).
- **Breadcrumbs** live in the top bar (`components/dashboard-breadcrumbs.tsx`). A new page under `app/(dashboard)/` must be added to `buildCrumbs`, and a page with a dynamic id must call `useBreadcrumbLabel(id, label)` once it has fetched the name; otherwise the trail is blank or falls back to "Evaluation"/"Candidate". On phones the trail collapses to a back link to the parent.
- **Query params on pages outside the group:** `useSearchParams` in a client page needs a Suspense boundary, which prerenders as blank. Read `searchParams` in a server `page.tsx` and pass them as props to a client component instead, as `/login` does (`app/login/page.tsx` → `login-card.tsx`).
- **`localStorage` during render** (e.g. "is there a token?") must go through `useSyncExternalStore` with a server snapshot, or the server HTML and first client render disagree and hydration fails. See the token check in `app/page.tsx`.
- **Clickable table rows** use a real link stretched over the row (`after:absolute after:inset-0` on the link, `relative` on the row), never `onClick` on `<tr>`, so cmd/middle-click, the status-bar URL and keyboard focus keep working. Any other control in the row needs `relative z-10` to sit above the overlay.

## Shared components

Reuse these rather than rebuilding them per page:

- `components/runs-table.tsx`: the owned-runs table on the dashboard and `/history`.
- `components/stat-strip.tsx`: `StatStrip` / `StatCell` on the dashboard and `/admin`. Pass grid columns as full literal classes (`"sm:grid-cols-2 xl:grid-cols-4"`) so Tailwind can see them.
- `components/google-icon.tsx`: Google's multicolour "G", used by the login button and the profile's sign-in row. Size it with `className`.
- `components/dashboard-onboarding.tsx` copies its step markup from `components/how-it-works.tsx`; change both together.
- `components/submit-form.tsx` (`/demo`) mirrors the new-evaluation wizard's field markup, input sizes and "Start evaluation" button; change both together.
- shadcn `Card` already puts `gap-6` between its children, so `space-y-*` on a card stacks with it and doubles the spacing. Set `gap-*` on the card instead.
- shadcn `Progress` has a `bg-primary/20` track; add `bg-muted` when the bar colour varies, or amber/red bars sit on a green wash.
- When a `Tooltip` wraps a Radix trigger, style open state with `aria-expanded:`, not `data-[state=open]:`: both write `data-state` and the tooltip's can win.

## Debugging

The dev overlay's errors can be read without a browser: the Next.js dev server exposes an MCP endpoint.

```bash
curl -s -X POST http://localhost:3000/_next/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_errors","arguments":{}}}'
```

Check the stack's file paths before fixing anything: errors from `chrome-extension://` URLs are browser extensions, not the app.
