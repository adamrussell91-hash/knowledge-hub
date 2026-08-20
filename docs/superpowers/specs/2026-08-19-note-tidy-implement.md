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
| Tags | **Closed list in §2a only.** Pick the labels that actually fit. **One is enough.** Two or three only if the note genuinely spans that many. **Never more than 3** from this list. Never pad. Never invent a new tag name. |
| Structural tags | Keep `Note`, unit codes (`/^[A-Z]{2,}\d/i`), and other non-topic tags (`isTopicKeyword` is false). These do **not** count toward the 3. Replace **topic** tags only. Drop any old topic string that is not in §2a. |
| Quiz harvest | Must not destroy `Q:` / `A:` / `Question:` / `Answer:` / `Explain:` blocks or heading structure `src/quiz/harvest.ts` relies on |
| Facts | May rewrite for readability. Must not invent facts or drop citations |
| Design kit | `design-kit/AGENTS.md`. Closed tokens. `.btn.btn--ghost` only. No new colours / type / icon kit |
| Archive | **One pool.** No University vs Notes in the rail, filters, compose, quiz, or podcast. See §2b |
| Rail brand | **Knowledge Hub** always returns home (unfiltered archive list). See §2c |

Caesar example: *Caesar's Insights on Gallic and Germanic Cultures* tagged Educational Psychology / History of Education / Sociocultural Influences on Education → **Philosophy Knowledge and Society** (broader humanities). Keep `Note` / unit codes. Do not invent `History` or `Classics`.

---

## 2a. Tag vocabulary (closed — exact strings)

Put this list in `src/tidy/vocabulary.ts` and paste the names + when-to-use lines into `prompts/tidy.md`. Use these strings **verbatim**. Do not add ampersands, hyphens, or synonyms as extra tags. The model may only return names from this list.

| Tag | Use for |
| --- | --- |
| Learning Science and Cognition | memory, attention, cognitive load, retrieval practice, metacognition, neuroscience, psychology of learning and cognition |
| Motivation and Self Regulation | goal setting, autonomy, expectancy value, mindset, self regulated learning, persistence and learner agency |
| Pedagogy and Instructional Design | lesson design, explicit teaching, scaffolding, questioning, classroom routines, instructional strategies and teaching models |
| Assessment Feedback and Evaluation | formative assessment, rubrics, feedback, evaluation, diagnostic testing, academic judgement and evidence of learning |
| Curriculum Differentiation and Enrichment | curriculum models, extension, enrichment, curriculum design, differentiation, individualisation and advanced learning pathways |
| High Potential and High Ability Education | identification, talent development, acceleration, curriculum for high ability learners, social emotional needs and program design |
| Child and Adolescent Development | lifespan development, adolescent identity, developmental psychology, youth transitions, attachment, family context and maturation |
| Wellbeing Mental Health and Trauma | student wellbeing, mental health, trauma informed practice, emotional regulation, risk, resilience and school based support |
| Neurodiversity Inclusion and Disability | autism, ADHD, special education, inclusive practice, reasonable adjustments, learner variability and disability frameworks |
| Literacy Language and Communication | reading, writing, vocabulary, comprehension, disciplinary literacy, communication skills and English pedagogy |
| Critical Creative and Higher Order Thinking | creativity, problem solving, critical thinking, philosophical dialogue, inquiry, reasoning, argument and intellectual risk |
| Research Methods and Evidence Literacy | qualitative methods, quantitative methods, statistics, research design, validity, reliability, literature reviews and evidence appraisal |
| Educational Leadership and Change | leadership theory, organisational change, coaching, mentoring, implementation, professional culture and school improvement |
| Policy Ethics and Governance | education policy, legal issues, ethics, professional standards, governance, institutional accountability and sector debates |
| Technology AI and Digital Learning | ICT, educational technology, ethical AI, online learning, digital pedagogy, platform design and technology futures |
| Sociocultural Diversity and Equity | culture, class, gender, Indigenous education, social justice, access, community context and structural inequity |
| Classroom Culture and Engagement | behaviour, classroom climate, student engagement, relationships, belonging, participation and learning environment |
| Teacher Practice and Professional Learning | teacher development, professional learning, reflective practice, HALT style evidence, coaching cycles and practitioner inquiry |
| Higher Education and Academic Practice | university learning, academic transition, capstone work, scholarly writing, higher education pedagogy and research training |
| Philosophy Knowledge and Society | epistemology, philosophy of education, ethics, political thought, social theory, knowledge theory and **broader humanities** material |

Humanities / classics / history-of-ideas notes that are not actually about schooling → `Philosophy Knowledge and Society`. Do not reopen a general History/Classics/Biology list.

`applyTopicTags`: map proposed names case-insensitively onto this list; **drop** anything not in the list; cap at 3; dedupe. Do not Title-Case invent.

---

## 2b. One archive — no University / Notes split

The hub is **Knowledge**. There is no product distinction between university pages and notes.

**UI (must delete, not hide with CSS):**

- Rail: drop the Uni and Notes items (`data-nav="university"`, `data-nav="notes"`). Keep Archive, Graph, Coach, Podcast, Quiz, Wiki.
- Archive toolbar: drop the University and Notes filter chips. Keep search as kit `.hub-search`. Keyword chips from tags may stay as `.hub-chip`. “All” chip only if other chips exist; otherwise search is enough.
- Compose: drop the Area `<select>` (`#compose-area`). Do not ask Uni vs Notes.
- Quiz and Podcast: drop area pickers. Scope is the whole archive (plus tags if the user picked tags). `ResearchScope.area` / quiz `area` filters are unused in the UI — do not send `area: "university"` or `area: "notes"` from those rails.
- Empty copy: do not say “University pages stay in the archive.”
- List title: **Archive** (or the active keyword). Never “University” / “Notes”.
- `src/main.rail.test.ts`: assert there is no `data-nav="university"` or `data-nav="notes"`.

**Data (do not mass-rewrite 3,700 files):**

- Leave `Page.area` in the Zod schema as `"university" | "notes"` so existing JSON still parses.
- Ignore `area` for listing, graph, search, tidy scan, quiz, podcast, coach.
- New/saved pages still need a valid `area` for the schema: write `"notes"` as the leftover required field if you must write something. Do not add a third enum value `"knowledge"` in this slice (that would invalidate old files).
- Tidy scan: whole archive. **No** `--area notes` default. No Notes-first pass.

Clementine university vs school **prompts** (voice) stay as they are — that is her register, not an archive split.

---

## 2c. Knowledge Hub brand always goes home

The rail title **Knowledge Hub** (`.rail__brand`, kit equivalent `.hub-rail__brand`) is a control, not static text. Clicking it from **any** view — open note, compose, graph, coach, podcast, quiz, wiki, filtered list — returns **home**.

Home means:

- `view = "list"`
- no open page, no compose
- no keyword filter, no search query
- full archive (no area filter)
- leave podcast/quiz/wiki rails (`leavePodcastRail` / `leaveQuizRail` / `leaveWikiRail`)
- clear `#page/…` hash (`clearPageHash`)

Markup: `<button type="button" class="rail__brand" data-home aria-label="Knowledge Hub home">Knowledge Hub</button>` (or wrap the existing brand so it still looks like the kit micro-brand: single line, CSS uppercase). Do not restyle it as a hero. Do not put it in `.hub-utilities`.

Wire it in `shell()` so every screen gets it (all views go through `shell`).

Tests: brand exists; click (or the go-home helper) resets the state above; works when `view === "page"` and when `view === "quiz"`.

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
{ "tags": ["Philosophy Knowledge and Society"], "body": "# … markdown …", "title": null }
```

`title` omitted/null means keep. Cap topic tags at **3** in code even if the model returns more. Every returned tag must be a §2a string.

### Deterministic pre-pass (no model)

Run before Claude; if the page is already clean **and** topic tags look sane, midnight **skips** the model call:

Messy signals (any one is enough to call Claude):

- More than 3 topic keywords, **or** any topic tag not in the §2a list (old Notion labels like `Educational Psychology` / `History of Education` count as messy)
- 3+ consecutive blank lines
- A leading `#` heading that duplicates `page.title`
- Extreme single-line paragraph spam (e.g. many 1-sentence paragraphs in a row)

Clean skip: none of the above, and last tidy timestamp in `_tidy/state.json` is newer than `updated_at` (already tidied, user has not edited since).

### Prompt rules (`prompts/tidy.md`)

Import into the Worker the same way as `src/clementine/pack.ts` (`import TIDY from "../../prompts/tidy.md"`). Do not use `loadPromptFile` (node:fs) inside Worker code.

- Tags from the §2a closed list only. One is enough; at most three. Do not pad. Do not invent names. Humanities that are not schooling → `Philosophy Knowledge and Society`.
- Collapse exploded line spacing / Notion blank-line storms into normal markdown (`\n{3,}` → `\n\n`; do not leave every sentence as its own paragraph unless it is a list or quote).
- Fix heading hierarchy. Drop duplicate `# Title` that the reader already shows as `h1.reader__title`.
- Repair lists, quotes, leftover Notion junk.
- Do not invent facts. Do not drop citations. Preserve quiz Q/A blocks and useful headings.
- Do not force three tags. Three is a maximum, not a target.

Vocabulary: `src/tidy/vocabulary.ts` — the 20 exact strings from §2a, plus the when-to-use blurbs for the prompt.

Apply: `applyTopicTags(existing, proposed)` keeps structural tags, maps/drops to §2a, caps at 3, dedupes.

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
- `src/tidy/*.test.ts` — Caesar fixture → `Philosophy Knowledge and Society`; structural tags kept; cap 3; unknown tags dropped; skip-if-clean; Q/A preserved; JSON parse; scan is not area-filtered
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

- Caesar page: education trio → `Philosophy Knowledge and Society`, `Note` survives, unit code survives
- `applyTopicTags` caps at 3; drops unknown labels; does not invent `History`
- Parser rejects empty tags / invented JSON garbage
- Messy detector: triple blank lines true; tidy duplicate H1 true; clean short note false
- Prompt file exists and contains all 20 §2a names, says one tag is enough, at most three, no padding, preserve Q/A
- `run-tidy` scan cap 20; skip unchanged; writes manifest
- Client: production `tidyPage` does **not** call `knowledge-api.adam-russell.com` / `/api/tidy`
- Grep/unit: **no** `netlify/functions/tidy` and **no** `/api/tidy` redirect in `netlify.toml`
- Rail has no Uni/Notes nav; compose has no area select
- Knowledge Hub brand control returns to the unfiltered archive list from a page view
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
6. Reader button + one-archive UI (no Uni/Notes) + brand → home.
7. Verify no Netlify tidy function, no secrets in git/`VITE_*`/`netlify.toml` build.environment, public origins hardcoded.

When done: say which hostname Adam must attach in Cloudflare DNS for the Worker, which three `wrangler secret put` names to set (no values), and that Netlify env should be left alone.
