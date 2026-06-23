# Bingo Catalog Bench

Minimal **Vite + React** app for fair performance benchmarking of the imperative
`CatalogTicket` + `TicketStore` catalog pattern — without Next.js framework overhead.

Extracted from `virtual-ticket-grid` `/bingo-catalog` with a POC-style shell
(~25 lines in `App.tsx`, simple controls, no PerformanceStats, no App Router).

## Compare against

| App | Path | Stack |
|-----|------|-------|
| Reference POC | `~/Documents/personal/bingo-ticket-poc-main` | Vite · different ticket design |
| Next.js demo | `~/Documents/personal/virtual-ticket-grid` `/bingo-catalog` | Next.js 16 · same catalog code |
| **This bench** | here | Vite · **same catalog code** as virtual-ticket-grid |

## Scripts

```bash
bun install   # or npm install
bun run dev   # http://localhost:5173
bun run build && bun run preview   # production trace (match POC methodology)
```

## Benchmark protocol

1. `bun run build && bun run preview`
2. Open the preview URL
3. Click **+1000 (perf)** once (single DOM jump — same as POC trace)
4. Record Chrome Performance at 1× CPU during scroll
5. Compare heap baseline and Avg CPU vs `bingo-ticket-poc-main`

## Architecture (unchanged from virtual-ticket-grid)

- Imperative `CatalogTicket` with `cloneNode` placeholder
- `TicketStore` EventBus outside React
- One-line passive scroll handler
- `mountCatalogTickets` — 50 nodes per RAF on large adds
- Flat CSS · opaque catalog background · no containment hints

## Source sync

When you improve catalog code in `virtual-ticket-grid`, copy these paths:

```
src/components/bingo-catalog/**
src/lib/createTicket.ts
src/lib/ticketDesign.ts  (minimal subset here)
src/types/ticket.ts      (minimal subset here)
```
