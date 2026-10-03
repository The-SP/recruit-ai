# Frontend UI conventions

Loaded alongside the root `CLAUDE.md` when working in `frontend/`. These are decisions, not style preferences, so keep new UI consistent with them.

## Product rule

**Never compare candidates across runs.** A score only means something against the job description it was scored on, so a recruiter's runs for different roles are not comparable. Dashboard-level features stay per-run: no global "top candidates", no averages or score distributions across all runs. Per-run aggregates (e.g. a run's top match) are fine.

## Copy and colour

- **Sentence case everywhere:** headings, buttons, nav items, table headers, stat labels ("New evaluation", "Job title", "Total runs").
- **Colour carries meaning, not decoration:**
  - green (`primary`) is the page's primary action;
  - red (`destructive`, a true red) means something broke;
  - amber means it is waiting on the user.

## Layout patterns

- **Page header:** title + subtitle on the left, primary CTA top-right, no icon tile. Hide the header CTA when an empty state on the page carries its own (see the dashboard's onboarding and `/history`'s empty state).
- **Clickable table rows** use a real link stretched over the row (`after:absolute after:inset-0` on the link, `relative` on the row), never `onClick` on `<tr>`, so cmd/middle-click, the status-bar URL and keyboard focus keep working. Any other control in the row needs `relative z-10` to sit above the overlay.

## Shared components

Reuse these rather than rebuilding them per page:

- `components/runs-table.tsx`: the owned-runs table on the dashboard and `/history`.
- `components/stat-strip.tsx`: `StatStrip` / `StatCell` on the dashboard and `/admin`. Pass grid columns as full literal classes (`"sm:grid-cols-2 xl:grid-cols-4"`) so Tailwind can see them.
- `components/dashboard-onboarding.tsx` copies its step markup from `components/how-it-works.tsx`; change both together.

## Debugging

The dev overlay's errors can be read without a browser: the Next.js dev server exposes an MCP endpoint.

```bash
curl -s -X POST http://localhost:3000/_next/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_errors","arguments":{}}}'
```

Check the stack's file paths before fixing anything: errors from `chrome-extension://` URLs are browser extensions, not the app.
