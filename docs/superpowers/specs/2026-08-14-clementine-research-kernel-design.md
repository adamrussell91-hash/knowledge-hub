# Clementine Research Kernel — Design Spec

**Date:** 2026-08-14
**Status:** Approved design, ready for implementation planning
**Component:** New — lives inside the existing `knowledge-hub` repo, new Cloudflare deploy target

## Goal

A shared research kernel that both a fast (\"quick pull\") and a deep (\"real research session\") mode call identically — same retrieval, same output schema, same auth. The only difference between the two is how many rounds run and how long the caller waits. This is spec #1 of two: it defines the kernel and its tool surface only. Clementine's voice, restored diagnostic protocols, and thesis persistence are spec #2, deliberately out of scope here — this doc should be buildable by someone (or something) with zero knowledge of who Clementine is or how she talks.

**Non-goal of this spec:** anything about Clementine's personality, Teaching Hub's chat UI, or the working-thesis persistence record. This kernel just needs to expose the tool surface below; spec #2 decides who calls it and why.

## Architecture principle

Anthropic is the brain on both paths (same synthesis logic, same output schema). Cloudflare is the clock (a Worker HTTP route for the single-call fast path, a Durable Object for the multi-round deep path). No Netlify background functions — deep mode needs real session state across rounds that outlives a single HTTP request, which a Durable Object gives natively and a polling Netlify background function would only approximate. No proxying through Knowledge Hub's existing Netlify functions — those exist to serve authenticated browser sessions; this kernel is a separate, service-to-service consumer of the same underlying data, with its own auth.

## Repo layout

New code lives inside the existing `knowledge-hub` repo (not a new sibling repo), so it shares `src/domain/page.ts`, `src/lib/lexicalRetrieve.ts`, and the index/manifest shapes already defined by `scripts/build-index.ts` and `netlify/functions/_lib/dataRepo.ts`, instead of duplicating them.

```
knowledge-hub/
  src/
    domain/page.ts            existing — untouched
    lib/lexicalRetrieve.ts    existing — reused directly as the keyword half of hybrid search
    research/                 NEW — pure TypeScript kernel, fetch-based only, no node:fs / no Node-only APIs
                               (must run identically under the Cloudflare Workers runtime and Node)
      schema.ts               ResearchFinding / ResearchResult types + zod schemas
      hybridRetrieve.ts       keyword (via lexicalRetrieve) + OpenAI vector search, rank-fused
      fetchPageBody.ts        R2 page-mirror fetch, GitHub Contents API as fallback only
      synthesize.ts           the Claude call — one function, used for the fast path's single call
                               and for each round of the deep path
      round.ts                pure function: runs exactly one round of the deep loop (gather → gaps →
                               follow-ups → rank → analysis). This is the ONLY thing the Durable
                               Object calls — keeps the DO class itself thin and keeps round logic
                               unit-testable outside the Workers runtime.
  worker/                     NEW — separate Cloudflare deploy target, does not affect Netlify build
    wrangler.toml
    src/
      index.ts                Worker entry point / router — see Tool surface below
      researchSession.ts      Durable Object class — thin; delegates all logic to src/research/round.ts
  scripts/
    build-index.ts            existing, unchanged
    sync-research-r2.ts       NEW — manual step, run after migrate + build-index, pushes the three
                               R2 artifacts described below
  netlify/functions/          existing, unchanged — this spec adds nothing here
```

Netlify's build (`publish = "dist"`, `functions = "netlify/functions"`) does not look inside `worker/`, so the two deploy targets coexist in one repo without interfering. `worker/` is deployed independently via `wrangler deploy`.

## Data path

**Problem this solves:** hybrid search cannot re-list and re-embed the ~3,700-page archive on every call — that would blow both the fast path's latency budget and the deep loop's per-round cost. Everything the kernel needs at query time must be pre-built and cheap to read.

R2 bucket: reuse the existing `knowledge-hub-archive` bucket (already provisioned for attachments), under a new key prefix so it doesn't collide with existing attachment keys:

```
research/index.json           OpenAI embeddings (text-embedding-3-small) — output of scripts/build-index.ts, uploaded by
                               sync-research-r2.ts. One entry per page: { pageId, title, vector }.
research/manifest.json        Lexical search fields, mirrored from knowledge-hub-data/manifest.json
                               (title, tags, excerpt, area per page) — same shape lexicalRetrieve.ts
                               already consumes.
research/pages/<pageId>.json  Full page bodies, mirrored — the fetch target for the 20–30 winning
                               candidates' full text (fetchPageBody.ts).
```

**Per-request work is only ever:**
1. Embed the query text with OpenAI `text-embedding-3-small` (the one thing that legitimately must happen live, since it changes every call).
2. Rank against the in-memory corpus. `research/index.json` and `research/manifest.json` are loaded from R2 **once per Worker isolate** (and reused for the life of that isolate / DO); they are not parsed on every request.
3. Fetch full bodies for the top ~20–30 candidates from `research/pages/*.json` in R2. GitHub's Contents API is a fallback only, for the rare case a page is missing from the mirror because `sync-research-r2.ts` hasn't been re-run since the last migration — not a request-time dependency in the normal case.

`sync-research-r2.ts` is a manual script, run by Adam alongside the existing manual `npm run migrate` / `npm run build-index`, not part of `npm run build`. It re-syncs all three R2 artifacts from the current `knowledge-hub-data` manifest + pages + freshly built index.

## Tool surface

This is what any caller (Teaching Hub, or anything else later) actually calls. Four routes, one shared output schema.

```
POST /quick_research
  in:  { query: string, documentContext?: string }
  out: ResearchResult   (round: 1, status: "done")
  — single retrieve + single synthesize call. Target: a few seconds.

POST /deep_research/start
  in:  { query: string, documentContext?: string }
  out: { sessionId: string, status: "running", result: ResearchResult }
  — creates a Durable Object keyed by a new sessionId. Round 1 runs INLINE before this responds
    (it is literally the same work as /quick_research), so the caller gets real findings
    immediately, not an empty acknowledgement. The DO then schedules round 2 via its Alarm API
    and returns.

GET /deep_research/:sessionId
  out: ResearchResult   (status: "running" | "done" | "error" | "cancelled", round: n, accumulated findings)
  — poll target. findings accumulate round over round; they are not deduplicated
    until status flips to "done" (or the session errors / is cancelled).

POST /deep_research/:sessionId/cancel
  out: { status: "cancelled" }
  — clears the DO's pending Alarm. Whatever findings exist at cancel time are kept and returned
    by subsequent GETs.
```

`documentContext` is an opaque string on both `quick_research` and `deep_research/start`. It gets passed straight into `synthesize()` so stance/analysis is judged against what the caller is actually arguing, not just topical overlap with the query. This spec does not define where the string comes from (a pasted draft excerpt, a persisted working thesis, or nothing) — that's entirely spec #2's decision.

### Shared schema (`src/research/schema.ts`)

```ts
interface ResearchFinding {
  pageId: string;
  title: string;
  sourceUrl: string;       // source_notion_url — citation target
  excerpt: string;
  stance: "supports" | "complicates" | "extends" | "related";
  analysis: string;        // why, specifically in relation to query/documentContext
}

interface ResearchResult {
  query: string;
  round: number;
  status: "running" | "done" | "error" | "cancelled";
  findings: ResearchFinding[];
  gaps: string[];            // threads Claude names as not yet covered
  followUpQueries: string[]; // deep mode acts on these automatically; fast mode just surfaces them
  error?: string;            // present only when status === "error"
}
```

Both `quick_research` and every round of `deep_research` return exactly this shape. There is no separate "fast schema" and "deep schema" — one schema, two calling patterns.

## Deep mode — the loop

One Durable Object instance per session. `researchSession.ts` (the DO class) is intentionally thin: its only job is scheduling and persisting state via `this.state.storage`; all decision logic lives in `src/research/round.ts`, called once per round, so the loop itself is unit-testable without spinning up the Workers runtime.

Each round is exactly one retrieve + one synthesize (the same work as `/quick_research`):

1. **Gather** — `hybridRetrieve(query)` on round 1; on round 2+, retrieve each `followUpQueries` value from the *previous* round (not issued and re-fetched inside the same round).
2. **Synthesize** — one Claude call assigns `stance` + `analysis`, names `gaps`, and proposes 1–3 `followUpQueries` for the *next* round.
3. **Produce** — if this is the final round (`finalize` for quick mode, empty follow-ups, round cap, or time cap): dedupe findings by `pageId` and set `status: "done"`. Otherwise keep `status: "running"` and schedule the next round via Alarm.

`/deep_research/start` runs round 1 inline — identical to `/quick_research` except it does not finalize if follow-ups remain, so the caller gets real findings immediately and the DO continues.

**Stop conditions** (hard caps, enforced in `round.ts`, not left to the DO's judgment):
- Round cap: default 5 rounds.
- Wall-clock cap: default 3 minutes total session time.
- Whichever is hit first (or empty follow-ups) ends the loop and finalizes with whatever findings exist.

`cancel` simply clears the DO's pending Alarm; no in-flight round is interrupted mid-call, it just doesn't schedule the next one.

## Auth

Same pattern as the existing `lesson-alchemist` function (shared-secret header + CORS origin allow-list), applied to this kernel with its own distinct secret rather than reusing Alchemist's value — same shape, different capability:

- `RESEARCH_KERNEL_SHARED_SECRET` — checked against a request header (e.g. `x-research-kernel-secret`) on every route.
- `TEACHING_HUB_ORIGIN` (or a broader allow-list if other callers are added later) — CORS origin check, same as Alchemist.
- `ANTHROPIC_API_KEY`, `EMBEDDINGS_API_KEY` (OpenAI embeddings) — duplicated into Cloudflare Worker secrets (`wrangler secret put`), same values as already provisioned on Netlify.
- R2 access — native Worker-to-R2 binding in `wrangler.toml`, no separate key needed.
- GitHub token — only required if the Contents API fallback path is exercised; not needed for the normal R2-mirror path.

If literal secret reuse (same value as `ALCHEMIST_SHARED_SECRET`) is actually preferred over a distinct one, that's a one-line change to the env var name — flagged here as a judgment call, not a hard requirement.

## Error handling

- Any failure in OpenAI embedding, R2 read, or the Anthropic call during a round → session `status` is set to `"error"` with the reason stored; the loop stops. A partial result is never reported as `"done"`.
- `quick_research` failures return an HTTP error directly (it's a single synchronous call); there's no session to mark.

## Testing

- Everything in `src/research/` is pure, fetch-stubbed, and unit-tested the same way `lesson-alchemist.test.ts` already tests `buildAlchemistPrompt` / `parseConnectionsJson` — no live network calls in tests.
- `round.ts` specifically is tested as a plain function (given a fake `hybridRetrieve`/`synthesize`, does one round produce the right next state?), so the Durable Object runtime (`wrangler dev` / Miniflare) only needs to be exercised for the thin routing/scheduling layer, not the loop logic itself.
- `/quick_research` gets an integration test against fixtures, mirroring the existing `search.test.ts` pattern.

## Open items for whoever implements this

- Confirm secret-reuse-vs-new-secret call above before wiring env vars.
- `sync-research-r2.ts` needs write credentials to R2 — same account already used for the attachments bucket; confirm binding/credential setup with Adam before first deploy.
- Round cap (5) and time cap (3 min) are defaults proposed in this spec, not yet battle-tested against real Anthropic/OpenAI-embedding latency — treat as configurable constants, not hardcoded literals, so they're easy to tune after the first real deep-research run.
