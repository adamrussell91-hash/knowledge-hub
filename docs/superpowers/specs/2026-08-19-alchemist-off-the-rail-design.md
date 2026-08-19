# Knowledge Hub — Alchemist off the rail

**Date:** 2026-08-19  
**Status:** Approved for implementation planning  
**Product name:** Knowledge Hub  
**Slice:** Remove the Alchemist workplace; keep `/api/lesson-alchemist`; add `#page/<id>` so Teaching Hub Alchemy Lab can open a note  
**Depends on:** Existing `netlify/functions/lesson-alchemist.ts`, session sign-in, `openPage`  
**Product spec:** Teaching Hub `docs/superpowers/specs/2026-08-19-alchemy-lab-design.md`  
**Not this slice:** Coach → Research rail; moving Alchemist onto the research Worker; changing retrieval/prompt behaviour

## Goal

Knowledge Hub is the archive. Teaching Hub is the Alchemy Lab workplace. This repo keeps the function Teaching Hub already needs, drops the rail that pretended the Lab lived here, and makes archive notes addressable from another site.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Rail | No Alchemist item, view, or `renderAlchemist` |
| API | Keep `POST /api/lesson-alchemist` (secret + CORS + retrieval + Clementine JSON) |
| Client helper | Delete `runAlchemist` from `src/api/client.ts`. The Netlify function is the only Alchemist entry. |
| Deep link | `#page/<pageId>` |
| CSS | Keep `.alchemist*` rules used by wiki, podcast, quiz, and coach |

## Rail removal

From `src/main.ts` (and only there for the workplace):

- Drop `"alchemist"` from the `View` union
- Drop the rail button, icon, `data-nav` mapping, `renderAlchemist`, and alchemist UI state
- Stop importing `runAlchemist` / `AlchemistConnection` if unused

Do not delete `netlify/functions/lesson-alchemist.ts`, `netlify/handlers/lesson-alchemist.ts`, `netlify/functions/lesson-alchemist.test.ts`, or the `/api/lesson-alchemist` redirect in `netlify.toml`.

Do not retarget wiki/podcast/quiz/coach markup that reuses `.alchemist` as a layout class.

If a stale client still has `view === "alchemist"` in memory, it cannot: the union is gone. There is no URL for that view today.

## `#page/<id>`

Knowledge Hub has no path router today. `boot()` always lands on the archive list after `listPages()`. Sign-in does not change the URL, so a Lab link survives the passphrase gate if boot honours the hash afterwards.

Pure helper (unit-tested):

```ts
pageIdFromHash(hash: string): string | null
```

- Accept `#page/<id>` where `id` is a non-empty page id (`[^#/?\s]+`)
- Reject `#page/`, `#alchemist`, `#/page/x`, query strings, extra path segments
- Decode the id (`decodeURIComponent`)

On a successful `boot()` (entries loaded), if `pageIdFromHash(location.hash)` is set, `openPage(id)` instead of staying on list. If `getPage` fails, toast `That note isn't in the archive.`, stay on the list, leave the hash.

Listen to `hashchange` after boot. Same apply rules.

`openPage` sets `location.hash = #page/<id>` so in-hub opens and Lab links share one address. Switching to a non-page rail (`list`, `graph`, `compose`, `coach`, `podcast`, `quiz`, `wiki`) clears a `#page/` hash only (do not clobber unrelated hashes).

Local preview (`USE_LOCAL_DATA`) uses the same hash behaviour.

## API unchanged

Teaching Hub’s proxy sends `x-alchemist-secret` and `{ lessonText }`. No session cookie on that hop. Do not switch this function onto teacher session auth in this slice.

`TEACHING_HUB_ORIGIN` may stay as CORS for the function; the Lab path is server-to-server and does not rely on it.

Prompt, Icons of Depth and Complexity JSON shape, retrieval fallback, and `mode` (`synthesis` | `retrieval` | `empty`) stay as they are.

## Testing

- `pageIdFromHash` cases above
- Rail render (or a small shell helper) has no `data-nav="alchemist"` and no “Alchemist” label
- `npx vitest run netlify/functions/lesson-alchemist.test.ts` still passes
- Full unit suite + production build

## Out of scope

- Research rail replacing Coach
- Worker `/alchemist`
- Changing `ALCHEMIST_SHARED_SECRET` or embedding keys
- Pretty `/notes/:id` paths (hash only)
