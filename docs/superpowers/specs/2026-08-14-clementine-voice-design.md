# Clementine the person — Design Spec (#2)

**Date:** 2026-08-14
**Status:** Draft — awaiting Adam review
**Depends on:** `2026-08-14-clementine-research-kernel-design.md` (spec #1). Kernel is live at `https://knowledge-hub-research.adamrussell91.workers.dev` with the R2 corpus uploaded.
**Component:** Personality, jobs, and Knowledge Hub surfaces. Teaching Hub consumes the same identity; that repo is not this one.

## Goal

Professor Clementine Haig is one person who accompanies Adam from school to university. She sounds the same everywhere. What she is *allowed to do* changes by workplace.

- **Teaching Hub** = school. Lessons, classroom thinking, practitioner register.
- **Knowledge Hub** = university. Archive, argument, APA, MEd. The Alchemist rail is the bridge between the two workplaces.

She is not a search engine. The research kernel from spec #1 stays a JSON archive tool. Clementine *uses* it.

## Non-goals

- Changing `ResearchFinding` / `ResearchResult` shapes.
- Live-fetching the Notion personality page at request time (outage = mute; also slow).
- Notion Central Node coordination, University PDF note-writing, or setting Notion properties.
- Browser holding `RESEARCH_KERNEL_SHARED_SECRET`.
- Replacing Knowledge Hub’s archive list / graph / reader.
- Implementing Teaching Hub in this repo.

## Source of truth for identity

Canonical prose today: Notion page **Professor Clementine Haig** (`61303a0b-73a4-48a7-bad6-0c121a488ce8`), under Agent Personalities.

Git is what both apps load. After this spec, the identity lives in files in this repo. If Notion and git diverge, git wins for deployed behaviour; Notion is updated when Adam edits the character on purpose, then the files are copied again.

Copy these sections from Notion into git (identity only — not session protocols that assume a Notion workspace):

- Overview
- Who You Are (voice, distinctive patterns, example phrases)
- Adam's Academic Context (programme, APA 7th, ADHD starting blocks, English-teacher register shift)
- Voice Checklist

Do **not** copy into the shared identity file: Central Node, University Reading Protocol (Notion PDF pages), or “search the Knowledge Hub Notion database.” Those are Notion-agent duties. On the web, archive search is the kernel.

## Three prompt layers

One identity, two jobs, stacked at call time.

```
prompts/
  clementine-voice.md          identity — both workplaces
  clementine-university.md     Knowledge Hub job + diagnostic protocols
  clementine-school.md         Teaching Hub job (exported for that repo)
```

A tiny assembler (pure TypeScript, unit-tested) concatenates:

`voice + job + surface instructions + user/task payload`

If you strip the headings and cannot tell who is talking, the assembler failed.

### University job (Knowledge Hub)

- Primary diagnostic: what are you arguing, not what are you writing about.
- Knowledge Hub archive first, via the kernel, never invented citations.
- APA 7th when referencing is in play.
- ADHD: something on the page beats a perfect sentence that does not exist.
- She may offer these protocols when the draft warrants them. She names the protocol in one sentence, says why now, and asks. She does not wait to be asked.
  - Reverse Outline
  - Argument Stress Test
  - Register Comparison
  - Thesis Evolution Tracker
  - The Editors (three separate passes, no merged brief)
- She does not dump ten comments. One primary observation, optionally one secondary.

### School job (Teaching Hub)

- Classroom and lesson thinking; practitioner voice is allowed there.
- May still pull from the archive (kernel) so school work is fed by what he has already read.
- Does not run MEd draft-review protocols unless Adam has brought a university assessment into that chat on purpose.

## Knowledge Hub surfaces

Three surfaces, all her, all in this product. Different functions.

### 1. Alchemist rail (existing UI)

**Job:** school–university bridge. Paste a lesson / learning intention; she finds non-obvious links into the archive (Icons of Depth and Complexity), in her voice.

Keep the existing connection JSON (`icon`, `summary`, `sourcePageId`, …). Change the *prose* (`summary`, `whyNonObvious`) and the system prompt. The rail copy should stop sounding like a generic tool (“Lesson Alchemist” can stay as the workplace name; the speaking voice is Clementine).

Today this is `netlify/functions/lesson-alchemist.ts` (`buildAlchemistPrompt`). Production still needs a later Functions deploy for live Alchemist to pick this up; local preview stays lexical until then. That deploy is not this spec’s Worker work.

### 2. Research write-ups (kernel)

**Job:** structured archive findings. Schema unchanged. `analysis`, `gaps`, and `followUpQueries` are written as Clementine: diagnose, then prescribe; no waffle; no fake warmth.

`src/research/synthesize.ts` prepends `clementine-voice.md` plus a short “you are filing a research brief, return JSON only” constraint. Findings stay citeable (`pageId`, `stance`, `excerpt`). She must not break JSON to make a joke.

### 3. Writing-coach chat (new)

**Job:** university supervisor. Drafts, thesis, the protocols above. This is a conversation, not a JSON card list.

**UI:** new rail on Knowledge Hub (not stuffed into Alchemist). Chat thread, paste/draft box, optional “use this as working thesis.” When she pulls the archive, show findings as citations under her message (kernel cards), not as if she hallucinated the pages.

**Backend:** a session-authenticated Knowledge Hub API (Netlify function, same cookie as the rest of the site). That function:

1. Assembles `voice + university job + chat history + working thesis`.
2. Calls Anthropic for the conversational reply.
3. When she needs the archive, the **function** calls the Worker (`x-research-kernel-secret` server-side) with `query` and `documentContext` = working thesis / draft excerpt.
4. Returns her prose plus any `ResearchResult` to the browser.

The Pages app never sees the kernel secret. CORS on the Worker should eventually allow Teaching Hub’s origin; Knowledge Hub talks to the kernel only through its own API.

**Thesis:** the working claim is an opaque string passed as `documentContext` (spec #1 already supports this). First sitting: stored on the coach session (function/DO or in-memory per thread) and shown in the rail. Cross-week persistence (Thesis Evolution Tracker log with dates) is sitting 2 of this spec, not a blocker for first chat.

**Protocols:** sitting 1 is prompt-only (she offers them in chat and runs them in prose). No separate `/protocol/reverse_outline` routes until the chat is real.

## Architecture

```
Notion personality page  →  (manual copy)  →  prompts/clementine-*.md
                                                    |
                    +-------------------------------+------------------+
                    |                               |                  |
                    v                               v                  v
            synthesize.ts                    lesson-alchemist     coach function
            (JSON brief, her tone)           (connections JSON,   (chat + tools)
                                              her tone)                 |
                                                                        v
                                                         Worker /quick_research
                                                         /deep_research
                                                         (secret header)
```

| Piece | Talks like her? | Calls kernel? | Auth |
| --- | --- | --- | --- |
| Worker retrieve + JSON schema | analysis fields only | it *is* the kernel | shared secret |
| Alchemist function | yes | no (own retrieve today; may switch to kernel later, not required for sitting 1) | site session |
| Coach function | yes | yes, server-side | site session |
| Knowledge Hub browser | displays her | no | passphrase cookie |
| Teaching Hub (other repo) | yes, same voice file | yes, its backend | its own auth + kernel secret |

Alchemist sitting 1 does **not** have to be rewritten onto the Worker. Voice change is the point. Pointing Alchemist at `/quick_research` is a later cleanup if the two retrievers drift.

## Error handling

- Kernel failure during a coach turn: she says the archive pull failed, in character, and continues with what she has. Do not empty the chat.
- Empty retrieval: she says the archive did not give her anything usable (gaps), not “no results found.”
- Prompt files missing at runtime: fail the request; do not silently fall back to the generic “research assistant” wording.

## Testing

- Assembler: given voice + university job, output contains locked phrases from the voice file and does not contain Central Node / Notion PDF protocol text.
- `buildSynthesisPrompt` / `buildAlchemistPrompt`: include voice markers; still parse as JSON with existing parsers.
- Coach handler: secret is read from env and sent to the Worker mock; it is never present in the JSON returned to the client.
- No live Anthropic/OpenAI in unit tests (same pattern as spec #1).

## Phased delivery (this repo)

1. **Voice pack + assembler.** Files + tests. Kernel synthesis and Alchemist prompts switched over.
2. **Coach chat.** New rail + session-authenticated function + kernel calls + working thesis as `documentContext`.
3. **Thesis log.** Persist versions with dates so Thesis Evolution Tracker is real across sessions.
4. **Teaching Hub.** Copy voice + school job into that repo; its backend calls the Worker. Out of this repo’s PRs.

Sitting 1 is shippable without Teaching Hub. She will already sound like herself on Knowledge Hub Alchemist and in research briefs; the coach rail is the university office.

## Open items (judgment calls, locked unless Adam objects)

- Git, not live Notion, is what production loads.
- Coach and Alchemist stay two rails.
- Kernel secret stays off the browser.
- University Reading Protocol stays Notion-only.
- Teaching Hub work happens in the Teaching Hub repo after sitting 1.
