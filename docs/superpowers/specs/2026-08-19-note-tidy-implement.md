# IMPLEMENT THIS: Knowledge Hub note tidy (Clean up + midnight pass)

You are implementing this in `/Users/adamrussell/Projects/knowledge-hub`. Do not invent a second design. Do not add a Netlify function. Read this whole file before touching code.

**Product:** Knowledge Hub archive notes (`pages/{id}.json` in `knowledge-hub-data`).
**Date:** 2026-08-19

---

## 0. NETLIFY SECRETS SCANNER — READ THIS FIRST

Netlify will **refuse the deploy** if an env var is marked “contains secret values” and that **same string already exists** in git, `.env.example`, `netlify.toml`, wrangler config, or bundled JS. That is a scanner false positive, not a leak.

### Hard bans

- **Do not create `netlify/functions/tidy.ts` or any new Netlify function / redirect / scheduled function for tidy.** Zero Netlify invocations for this feature.
- **Do not add tidy secrets (or any new secrets) to the Netlify UI.** Tidy secrets live on **Cloudflare Worker secrets** and **GitHub Actions secrets** only.
- **Do not put real secrets in git, `.env.example` values, `netlify.toml` `[build.environment]`, wrangler `vars`, logs, or any `VITE_*` variable.**
- **Do not set `VITE_*` on the Netlify Functions site.** `VITE_*` is GitHub Pages / local Vite only (see `.github/workflows/pages.yml`).
- **Do not put a public URL in a Netlify env var marked as secret** just because it lives in the env panel.

Public origins (not secrets): `SITE_ORIGIN`, `TEACHING_HUB_ORIGIN`, `RESEARCH_KERNEL_URL`, Worker/tidy hostname, `GITHUB_DATA_REPO`, `R2_BUCKET`. If a public URL must appear as a Netlify env key at all, it is **Contains secret values = No**, and it is listed in:

```
SECRETS_SCAN_OMIT_KEYS = "SITE_ORIGIN,R2_BUCKET,…"
```

Today `netlify.toml` has `SECRETS_SCAN_OMIT_KEYS = "SITE_ORIGIN,R2_BUCKET"`. **Do not add Worker URLs to Netlify env at all.** Hardcode the public tidy origin in the client the same way `DEFAULT_PRODUCTION_API_BASE` is hardcoded in `src/api/config.ts`.

Real secrets (must never appear in repo or `VITE_*`): `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `GITHUB_DATA_REPO_TOKEN` / `DATA_REPO_TOKEN`, passphrase hashes, `ALCHEMIST_SHARED_SECRET`, `RESEARCH_KERNEL_SHARED_SECRET`.

If a Netlify deploy fails with secrets scanning: un-secret the **public URL** keys first. Do not omit real secrets from the scan. If a real secret was committed, rotate it.

---

## 1. What you are building

Adam opens a note and clicks a **very quiet** “Clean up” control. That runs a **level C** tidy protocol (tags + headings + layout + line spacing + readable prose) and **applies immediately**. Reload the page.

A **GitHub Action** (not Netlify) also runs around midnight AEST, tidies **up to 20** notes (prefer messy; skip already-clean / recently tidied), applies immediately, commits to `knowledge-hub-data`.

No review queue. No confirm card. Apply on click / apply on the job.

---

## 2. Locked decisions

| Topic | Choice |
| --- | --- |
| Scope | Level C: tags, headings, markdown layout, exploded line spacing, prose rewrite |
| Apply | Immediate. Skip the write if the result is unchanged |
| Button | Subtle ghost control on the **reader** page, not a primary pill, not in hub-utilities |
| Live button backend | **Cloudflare Worker** `POST /tidy` `{ id }` |
| Midnight | **GitHub Actions** workflow, same family as `.github/workflows/curator.yml` (`cron` ~ `17 14 * * *` = 00:17 AEST) |
| Netlify | **Zero** tidy traffic. Login may stay on Netlify. Do not add `/api/tidy` |
| Local preview | Vite `POST /local-data/tidy` writing `migrated/data-repo` (same as other local writes) |
| Data | Page JSON + `manifest.json` in `knowledge-hub-data`. Do not require this Mac. No `~/Documents` / `~/Desktop` |
| Title | Keep unless it is clearly a Notion filename dump |
| Tags | Subject of the note, not “how this relates to a teaching degree.” **One is enough.** Two only if genuinely two subjects. Never pad to 3–6 |
| Structural tags | Keep `Note`, unit codes (`/^[A-Z]{2,}\d/i`), and other non-topic tags from `isTopicKeyword` in `src/archive/keywordGraph.ts`. Replace **topic** tags only |
| Quiz harvest | Must not destroy `Q:` / `A:` / `Question:` / `Answer:` / `Explain:` blocks or heading structure `src/quiz/harvest.ts` relies on |
| Facts | May rewrite for readability. Must not invent facts or drop citations |
| Design kit | `design-kit/AGENTS.md`. Closed tokens. `.btn.btn--ghost` only. No new colours / type / icon kit |

Caesar example: *Caesar's Insights on Gallic and Germanic Cultures* tagged Educational Psychology / History of Education / Sociocultural Influences on Education → topic tag **History** (maybe Classics). Keep `Note` / unit codes.

---

## 3. Architecture

```
reader [Clean up] --> Worker POST /tidy {id}
                      --> Claude (prompt: prompts/tidy.md)
                      --> GitHub Contents write pages/{id}.json + manifest.json
                      --> return saved page --> client reloads

cron 17 14 * * * --> GitHub Action
                      --> scripts/run-tidy.ts --scan --count 20 --data-dir data-repo
                      --> same core --> git commit/push knowledge-hub-data

npm run dev --> Vite POST /local-data/tidy --> same core --> migrated/data-repo
```

Shared core lives in `src/tidy/` and **must run in Cloudflare Workers** (fetch-based, no `node:fs` in the core). The Action and Vite plugin are the only Node I/O wrappers.

### Auth for the button (no Netlify tidy function)

`kh_session` is set by `netlify/functions/auth-login.ts` as host-only on `knowledge-api.adam-russell.com`, so `*.workers.dev` never sees it.

1. Give the existing Worker a custom hostname under `adam-russell.com` (e.g. `knowledge-tidy.adam-russell.com` routing to `knowledge-hub-research`). Public URL — not a secret.
2. Change login **and** logout `Set-Cookie` to include `Domain=.adam-russell.com` (keep `HttpOnly; Secure; SameSite=None; Path=/`). This is a small edit to existing auth functions, not a new function.
3. Worker `POST /tidy` verifies `kh_session` with the **same** `SESSION_SECRET` (Cloudflare **secret**, never wrangler `vars`, never git).
4. CORS: allow `https://knowledge-hub.adam-russell.com` with credentials. Reuse the site origin pattern; do not invent a new CORS kit.

Client: `fetch(tidyOrigin + "/tidy", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })`.

Hardcode `DEFAULT_PRODUCTION_TIDY_ORIGIN` next to `DEFAULT_PRODUCTION_API_BASE`. Local Vite uses same-origin `/local-data/tidy` and does not call the Worker.

Do **not** put `SESSION_SECRET` or the data-repo PAT in the browser. Do **not** add `VITE_SESSION_SECRET`.

### Worker secrets (wrangler secret put — never commit)

Copy existing values; do not paste them into chat, files, or `.env.example`:

- `SESSION_SECRET` (same as Netlify login — verify cookie only)
- `ANTHROPIC_API_KEY` (likely already on the Worker)
- `GITHUB_DATA_REPO_TOKEN` (write to `knowledge-hub-data`)

Public wrangler `vars` only: `GITHUB_DATA_REPO` = `adamrussell91-hash/knowledge-hub-data`, tidy/CORS origin if needed. **Not secrets.**

### GitHub Action secrets

Already used by curator: `ANTHROPIC_API_KEY`, `DATA_REPO_TOKEN`. Reuse. Do not add them to Netlify. Do not print them in logs.

---

## 4. Tidy protocol (`src/tidy`)

One Claude call per note. Model: `claude-haiku-4-5` unless a note body is huge and Haiku truncates — then same call shape, do not switch stacks. Return JSON only:

```json
{ "tags": ["History"], "body": "# … markdown …", "title": null }
```

`title` omitted/null means keep. Cap topic tags at **2** in code even if the model returns more (`applyTopicTags` in the spirit of the abandoned retag work).

### Deterministic pre-pass (no model)

Run before Claude; if the page is already clean **and** topic tags look sane, midnight **skips** the model call:

Messy signals (any one is enough to call Claude):

- More than 2 topic keywords
- Topic tags that look education-padded on a non-education note (overlap with education vocabulary while title/body look like History/Classics/etc. is a *hint*, not a hard classifier — when unsure, call Claude)
- 3+ consecutive blank lines
- A leading `#` heading that duplicates `page.title`
- Extreme single-line paragraph spam (e.g. many 1-sentence paragraphs in a row)

Clean skip: none of the above, and last tidy timestamp in `_tidy/state.json` is newer than `updated_at` (already tidied, user has not edited since).

### Prompt rules (`prompts/tidy.md`)

Import into the Worker the same way as `src/clementine/pack.ts` (`import TIDY from "../../prompts/tidy.md"`). Do not use `loadPromptFile` (node:fs) inside Worker code.

- Subject-first tags from a vocabulary list (education labels **plus** History, Classics, Philosophy, Neuroscience, Biology, Psychology, Literature, …). New Title Case tag only when nothing fits.
- Collapse exploded line spacing / Notion blank-line storms into normal markdown (`\n{3,}` → `\n\n`; do not leave every sentence as its own paragraph unless it is a list or quote).
- Fix heading hierarchy. Drop duplicate `# Title` that the reader already shows as `h1.reader__title`.
- Repair lists, quotes, leftover Notion junk.
- Do not invent facts. Do not drop citations. Preserve quiz Q/A blocks and useful headings.
- Do not force three tags.

Vocabulary: `src/tidy/vocabulary.ts` (or `src/tagging/vocabulary.ts` if you keep that name). Seed from existing graph majors plus general subjects listed above.

Apply: `applyTopicTags(existing, proposed)` keeps structural tags, Title-cases topics, caps at 2, dedupes.

Body: use the model body; optionally run a tiny deterministic collapse of `\n{3,}` after parse so spacing cannot regress.

Skip write when `topicTagsEqual` and body (normalized) unchanged.

---

## 5. Data artifacts (data repo)

`_tidy/state.json`:

```json
{
  "lastRunAt": "2026-08-19T14:17:00.000Z",
  "tidied": {
    "page_notion_abc": "2026-08-19T14:17:05.000Z"
  }
}
```

Midnight: prefer pages **not** in `tidied` (or tidied older than page `updated_at`), with messy signals first, then random fill to **20**. Cap 20. One note at a time sequentially. On error, record and continue. Advance/commit state even if some errors.

Writes: `pages/{id}.json` (full Page schema, bump `updated_at`) and matching `manifest.json` tags/excerpt. Reuse the idea of `netlify/functions/_lib/savePageRecord.ts` but **do not import Netlify handler types into the Worker**. Extract a fetch-based saver if needed. `githubWrite.ts` uses `Buffer` — Worker already has `nodejs_compat`; keep it fetch-based.

R2 `research/pages/{id}.json` can go stale until the next `sync-research-r2`. **v1: data repo is enough.** Optional: if `ARCHIVE` is bound on the Worker, also put the page JSON under `research/pages/{id}.json`. Do not fail the tidy if R2 put fails.

Do not rebuild the vector index in this slice.

---

## 6. UI (reader only)

File: `src/main.ts` `renderPage`.

In `.reader__actions`, after Edit, add:

```html
<button class="btn btn--ghost reader__tidy" data-tidy type="button">Clean up</button>
```

- Quiet: existing `.btn.btn--ghost`, smaller/muted if needed via existing tokens only (`--text-sm`, `--muted` / `--shallow`). **No new CSS variables. No new palette. No broom icon kit.**
- Do **not** put it in `.hub-utilities` (those are refresh + sign out only).
- While running: disable, label `Cleaning up…`
- Success: replace `activePage` with the returned page, refresh `entries` tags if the list cache is in memory, re-render
- Failure: toast the error, leave the page as-is
- Local banner already explains live API; local tidy **should work** via Vite

Production client origin: hardcoded tidy hostname. Local: `/local-data/tidy`.

---

## 7. Files to add / touch (expected)

Add:

- `prompts/tidy.md`
- `src/tidy/` — vocabulary, applyTags, messy detection, proposeTidy (prompt + parse), types
- `src/tidy/*.test.ts` — Caesar fixture; structural tags kept; 1–2 cap; skip-if-clean; Q/A preserved in a fixture; JSON parse
- `scripts/run-tidy.ts` + `scripts/run-tidy.test.ts` — `--id`, `--scan --count 20`, resume/state
- `.github/workflows/tidy.yml` — schedule + `workflow_dispatch` with optional `page_id` input
- Worker route `POST /tidy` in `worker/src/index.ts` (or a `worker/src/tidy.ts` imported there)
- Vite handler in `vite.localData.ts` for `POST /local-data/tidy`
- Client `tidyPage(id)` in `src/api/client.ts` (or a small `src/api/tidyClient.ts`)
- `package.json` script `"tidy": "tsx scripts/run-tidy.ts"`

Touch:

- `src/main.ts` — button
- `src/style.css` — only if ghost needs a reader-specific quieting using **existing tokens**
- `netlify/functions/auth-login.ts` + `auth-logout.ts` — `Domain=.adam-russell.com` on the cookie
- `worker/wrangler.jsonc` — **vars for public names only**; secrets via `wrangler secret`
- `worker/` md glob already includes `**/*.md` — tidy prompt import must work
- `netlify.toml` `[functions] included_files` — **do not add tidy.md there** (Netlify does not run tidy). Do not add a `/api/tidy` redirect.

Do **not** touch Teaching Hub. Do **not** store paths under `~/Documents` or `~/Desktop`.

---

## 8. Tests (TDD)

Write failing tests first.

Must-haves:

- Caesar page: education trio → `History` (or Classics), `Note` survives, unit code survives
- `applyTopicTags` caps at 2; Title Case
- Parser rejects empty tags / invented JSON garbage
- Messy detector: triple blank lines true; tidy duplicate H1 true; clean short note false
- Prompt file exists and says one tag is enough / no padding / preserve Q/A
- `run-tidy` scan cap 20; skip unchanged; writes manifest
- Client: production `tidyPage` does **not** call `knowledge-api.adam-russell.com` / `/api/tidy`
- Grep/unit: **no** `netlify/functions/tidy` and **no** `/api/tidy` redirect in `netlify.toml`
- Auth cookie tests still pass with Domain attribute
- Worker handler test: missing cookie → 401; valid session + mocked Claude → save called

Run: `npx vitest run src/tidy scripts/run-tidy.test.ts` plus any worker/client tests you add, then `npm test` and `npm run build`.

---

## 9. Out of scope

- Wiki curator / linking
- Vector index rebuild
- Confirm-card review queue
- Netlify scheduled functions
- Auto-tidy on every page view
- New design tokens or a custom Clean up icon set

---

## 10. Implementation order

1. Core + tests (tags apply, parse, messy, Caesar).
2. `prompts/tidy.md`.
3. `scripts/run-tidy.ts` + Action workflow (midnight path).
4. Worker `POST /tidy` + cookie Domain + client `tidyPage`.
5. Vite local route.
6. Reader button.
7. Verify no Netlify tidy function, no secrets in git/`VITE_*`/`netlify.toml` build.environment, public origins hardcoded.

When done: say which hostname Adam must attach in Cloudflare DNS for the Worker, which three `wrangler secret put` names to set (no values), and that Netlify env should be left alone.
