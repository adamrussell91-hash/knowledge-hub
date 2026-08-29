# Knowledge Hub — AGENTS

Knowledge Hub is a private personal knowledge archive. It is a **Vite + TypeScript single-page app** (deployed to GitHub Pages) backed by **Netlify Functions** for the API (auth, page save, attachments, search, Clementine chat/coach, podcast, quiz, tidy) and a **Cloudflare Worker** (`worker/`) for the research kernel. Data (notes) lives in a separate private GitHub data repo in production; locally it comes from seed fixtures.

For hub UI work, follow the design-kit rules in `design-kit/AGENTS.md` before touching styles.

## Cursor Cloud specific instructions

Node 22 is the supported runtime (matches `.github/workflows/pages.yml`). Dependencies are installed automatically by the environment update script (`npm ci`).

### Services and how to run them

- **Frontend SPA (primary dev flow):** `npm run dev` starts Vite on `http://localhost:5173`. In dev mode the app runs against **local data** (`USE_LOCAL_DATA` is true whenever `import.meta.env.DEV` and not test mode), so it does NOT call the Netlify API — features that need the live API (chat, save, uploads, podcast, tidy against production) intentionally throw with a message like "needs the live API".
- **Netlify Functions API (optional):** requires the Netlify CLI (`npx netlify dev`, serves on port `8888` and proxies Vite at `targetPort` 5173) which is not a project dependency, plus secrets. Without `GITHUB_DATA_REPO`/`GITHUB_DATA_REPO_TOKEN` the functions fall back to `fixtures/seed.json` (`FixtureRepo`), but chat/coach/podcast still need `ANTHROPIC_API_KEY`, and auth needs `KNOWLEDGE_HUB_PASSPHRASE_HASH`/`SESSION_SECRET`. See `.env.example`.
- **Research Worker (optional):** `npm run research:dev` (`wrangler dev --config worker/wrangler.jsonc`).

### Seeding local data for the dev server (non-obvious)

The Vite dev server serves notes from `migrated/data-repo/` via the `/local-data/*` middleware (`vite.localData.ts`). That directory is **gitignored** and does not exist on a fresh checkout, so the archive loads empty until seeded. To populate it from the committed fixtures (`fixtures/seed.json`), run a one-off script that reuses `toManifestEntry` from `netlify/functions/_lib/dataRepo.ts` to write `migrated/data-repo/manifest.json` and `migrated/data-repo/pages/<id>.json`. This is a per-machine convenience, not a dependency — keep it out of the update script.

### Lint / test / build

- There is **no ESLint/Prettier config and no `lint` script**; do not invent one. `tsc --noEmit` is NOT a gate and currently reports pre-existing type errors (the build uses Vite/esbuild, which does not full-type-check).
- Tests: `npm test` (Vitest, `vitest run`; ~742 tests). Subsets: `npm run test:unit`, `npm run test:integration`. `npm run test:browser` (Playwright) has no committed `playwright.config.*` and is not part of the standard flow.
- Build: `npm run build` (`vite build` + copies `dist/index.html` to `dist/404.html`).
- CI gate (`.github/workflows/pages.yml`) is `npm ci` → `npm test` → `npm run build`.
