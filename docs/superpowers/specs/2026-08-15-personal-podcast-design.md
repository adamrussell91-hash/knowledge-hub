# Personal podcast — Design Spec

**Date:** 2026-08-15  
**Status:** Approved design, ready for implementation planning  
**Depends on:** `2026-08-14-clementine-research-kernel-design.md`, `2026-08-14-clementine-voice-design.md`, `2026-08-15-research-rail-design.md`  
**Supersedes:** the Research-rail non-goal “personal podcast”

## Goal

Adam presses play on a two-host show built only from the University + Notes archive already in the Hub. Professor Clementine Haig and Ann O’Tation talk from tagged notes, not from the open web. He can interrupt mid-episode and get an answer cited to a real page. When it finishes, the episode is filed with transcript, citations, and a short memory the next episode can use. A **series** can plan a through-line (for example eight weekly shows on self-determination theory), lock a show identity, and generate episode 1 now — later episodes continue that same show.

This is a new rail, not a Research mode. Research stays a brief. Podcast is a conversation you listen to.

## Non-goals

- File picking, paste-in corpora, or any source outside Hub pages
- RSS / public podcast / sharing links
- Live microphone barge-in (v1 interrupt is typed)
- Host pairing picker, third guest, Vera, Hammond, or any host other than Clementine + Ann
- Generating every episode of a series up front (plan the arc; record one episode at a time)
- Reading Ann or Clementine identity from Notion at runtime (Notion will go away; git is the only copy)
- Browser Speech Synthesis as the product voice
- Writing episode audio or full transcripts into `knowledge-hub-data` GitHub pages
- Putting `RESEARCH_KERNEL_SHARED_SECRET` in the browser
- Rebuilding the vector index as part of episode generate
- Belief/idea timeline, capture, wiki, or revision-quiz product (Quiz here is a podcast *mode*, not a flashcard product)

## Hosts

Fixed pairing.

| Host | Job in the show | Voice source |
| --- | --- | --- |
| **Professor Clementine Haig** | Argument, warrant, academic precision. Lead host. | `prompts/clementine-voice.md` + a new `prompts/clementine-podcast.md` surface (not the coach protocols) |
| **Ann O’Tation** | Close reading of the notes as texts: structure, subtext, classroom craft, HPGE when the notes warrant it. | `prompts/annotation-voice.md` — **canonical copy in git**. Seeded once from Notion page `31ef794f-8476-804f-a270-d0f105c80e91` (Overview + Voice and Tone + verbal signatures + “Ann’s Rules” only). Do not copy Central Node, lesson-reflection writes, Teaching Dashboard protocols, or database schemas. After that file exists, never fetch Notion for her voice. |

`src/clementine/pack.ts` imports both prompt files (Worker cannot use `node:fs`). Missing or empty files fail the request. If a content turn cannot be tied to a retrieved page, that turn is invalid — silence beats invention.

TTS: Cloudflare Workers AI Deepgram Aura (`@cf/deepgram/aura-1` or `aura-2-en`). Two distinct Aura voices, one per host, chosen once in code and documented in the implementation plan. Same speaker always uses the same voice.

## Surfaces

Rail becomes **Archive · Uni · Notes · Graph · Research · Podcast**.

Podcast workplace:

1. **Commission** — one-off episode **or** series. Scope, mode (one-off) or topic + length of run (series), mode dial where needed, Advanced dials. Generate.
2. **Player** — cue playlist, now-playing line, citations for the current turn, interrupt box, transcript. Series player shows show title + “Episode n of N”.
3. **Library** — one-off episodes plus series grouped under the show title, with **Next episode** on a series that still has unrecorded slots.

Local Vite preview: same constraint as Research. Show the existing local-banner; do not call the Worker from the browser.

## Commission flow

No upload. Corpus is the synced archive.

### 1. Scope

Reuse `ResearchScope` (`area?`, `tags?`) and the existing tag list from the loaded manifest.

- **Area:** All / University / Notes.
- **Focus:** optional multi-select of tags. Unit codes are tags (the graph already treats `/^[A-Z]{2,}\d/i` as non-topic); they appear in this picker, they just do not appear as graph hubs.
- **Theme cluster:** optional. A cluster is a topic keyword from `topicKeywords()` (same definition as the graph). Picking a cluster adds that tag to `scope.tags`.

Default tag matching is **AND**, same as Research: every selected tag must be on the page. **Connector is the exception:** its two clusters match pages that have *either* tag (OR), then the script argues the overlap and the friction. Empty scope = whole archive. Retrieve still ranks; it does not dump every page into the script.

### 2. Mode (exactly one)

| Mode | What the episode is | Extra dial |
| --- | --- | --- |
| **Recap** | What is new in this scope | **Cadence:** weekly / monthly / half-yearly / yearly. Include pages whose `updated_at` is within that window, or since the last Recap episode with the same scope+cadence, whichever is later. If nothing is new, do not invent; return a `ready` episode with a single `empty` turn that says so. That turn may cite a previous episode memory in `text` but `citations` stay empty — memories are not evidence. |
| **Cross-tag Connector** | Overlap and friction between two clusters | **Two clusters** required (two topic tags). Retrieve pages that have either tag; the script’s job is the intersection and the conflict. |
| **Socratic Quiz** | Hosts question Adam from the scoped notes | No extra dial. Player **pauses** after each `quiz-prompt` turn until he types an answer or skips. Skip → hosts give the note-grounded model answer, then continue. |
| **Debate** | Hosts argue two positions | **Two positions** (short strings). Clementine takes position A, Ann takes position B, unless the notes clearly invert that — still two sides, still cited. Retrieve for both strings inside the same scope. |

### 3. Advanced dials (defaults in parentheses)

These change prompt + retrieval budget. They do not add hosts.

**Content**

- **Length:** short 5–8 min / **standard ~15** / deep 30+. Maps to note cap and turn cap, not wall-clock of the model: short ≤12 notes / ≤24 turns; standard ≤24 notes / ≤48 turns; deep ≤40 notes / ≤90 turns. Deep may run a second retrieve round using the first script’s named gaps (same idea as research deep, cap 2 rounds).
- **Complexity:** plain / **academic**.
- **Citation density:** light / **normal** / footnote-heavy. Light: cite in metadata only, hosts rarely name the note. Heavy: hosts name the note title when they use it.

**Tone**

- **Formality:** dry-academic / **staffroom** / mates.
- **Banter:** low / **medium** / high. High still cannot introduce uncited claims.
- **Disagreement:** mild / **medium** / sharp. Sharp is the Debate default; Recap default is mild.
- **Chicken (flavour):** 0–3, default **1**. 0 = no tangents, no cues. 1 = rare wry aside that still points at a note. 2–3 = occasional `cue` turns (short non-speech marker in the transcript, optional one-shot sound later) and weirder but still grounded asides. Chicken never authorises a claim without a `pageId`.

**Structure**

- **Pacing:** linger (fewer notes, more turns each) / **even** / race (more notes, shorter turns).
- **Interruption sensitivity:** **finish-thought** (complete the current cue, then handle the interrupt) / immediate (abort current audio).

Host count and pairing are not controls in v1.

### 4. Series (optional wrapper)

A series is not a fifth speaking mode. It is a **season bible** plus a queue of episode slots. Each recorded episode still uses one of Recap / Connector / Quiz / Debate (the planner assigns the slot’s mode).

**Commission a series**

- **Topic** required (free text, e.g. “self-determination theory”). Used as the retrieve query.
- **Scope** as above (area / tags / cluster). Empty scope still ranks the whole archive against the topic.
- **Run length:** 4–12 slots, default **8**.
- **Cadence:** weekly / monthly / half-yearly / yearly. Default **weekly**. This is show rhythm and “Next episode” labelling, not a cron job. Adam presses Next; we do not auto-record while he sleeps.
- Advanced dials apply to the whole series (same chicken, formality, length per episode, etc.).

**Plan, then record episode 1**

1. Retrieve with a **series budget** (Length deep cap: ≤40 notes), topic as query, scope applied.
2. Claude returns JSON only: `showTitle`, `openingRitual` (how every episode starts), `vibe` (2–3 sentences: this show’s consistent voice), `runningMotifs` (0–3 phrases the hosts may callback — still not facts), `episodes[]` with `{ index, title, throughLine, mode, sourcePageIds }`.
3. Ground the plan: every `sourcePageIds` value must be in the retrieved set; `mode` must be one of the four; slot count may be **less than requested** if the notes cannot honestly fill N episodes (minimum 3, otherwise fail with a named gap, do not pad).
4. Persist the series. Immediately start generation of slot 1 only.

**Continuing the show**

`POST .../series/:id/next` records the next unrecorded slot. Script prompt includes the bible (`showTitle`, `openingRitual`, `vibe`, `runningMotifs`) plus memories of **all prior episodes in this series** (not the generic last-three overlap rule). Citations remain Hub pages. Hosts open with the ritual so it sounds like the same programme, not a new random chat.

If the slot’s assigned `sourcePageIds` now fail to load, re-retrieve inside series scope using that slot’s `throughLine` as query; still ground.

One-off episodes do not get a bible. Their memory rule stays “last three overlapping.”

## Architecture

Same auth pattern as Research. Browser never holds the kernel secret.

```
Browser (session cookie)
  POST /api/podcast/start                 { scope?, mode, modeDial, dials }
  POST /api/podcast/series/start          { topic, scope?, episodeCount, cadence, dials }
  POST /api/podcast/series/:seriesId/next
  GET  /api/podcast/series/:seriesId
  GET  /api/podcast/:episodeId
  POST /api/podcast/:episodeId/interrupt   { afterTurn, question }
  POST /api/podcast/:episodeId/answer      { afterTurn, text }
  GET  /api/podcast                       // library: episodes + series
  GET  /api/podcast/:episodeId/audio/:turnId
        │
        ▼
Netlify (session) → Worker
  POST /podcast/start
  POST /podcast/series/start
  POST /podcast/series/:id/next
  GET  /podcast/series/:id
  GET  /podcast/:episodeId
  POST /podcast/:episodeId/interrupt
  POST /podcast/:episodeId/answer
  GET  /podcast/index
```

New Durable Object class `PodcastSession` (thin; logic in `src/podcast/`). Generation is too slow for one HTTP request: start returns `{ episodeId, status: "running" }`; the browser polls like deep research. Round 1 of work is retrieve + script. Alarms then TTS remaining turns in batches and persist audio to R2.

Do not proxy audio bytes through Netlify. Sign GET the way attachments already do, or serve from the Worker with the same secret-gated route the Netlify function calls internally — implementation plan picks one; the browser only ever hits `/api/podcast/...`.

### Why a cue playlist, not one MP3

Interrupt and Quiz need to stop between thoughts. The episode is an ordered list of **cues**. The player plays cue N’s audio, then N+1. Interrupt inserts new cues after the current one and continues.

### Why R2, not GitHub pages

Audio and full transcripts are large and are not Hub notes. Source of truth:

```
podcast/index.json
podcast/series/<seriesId>.json
podcast/episodes/<episodeId>.json
podcast/audio/<episodeId>/<turnId>
```

same bucket `knowledge-hub-archive`. Library reads `podcast/index.json`. Vector/Clementine research corpus is unchanged.

## Data

### Script schema

```ts
type PodcastSpeaker = "clementine" | "ann";

type PodcastTurnKind = "content" | "banter" | "quiz-prompt" | "model-answer" | "interrupt" | "cue" | "empty";

interface PodcastCitation {
  pageId: string;
  title: string;
  sourceUrl?: string;
}

interface PodcastTurn {
  id: string;
  speaker: PodcastSpeaker; // omitted for kind === "cue"
  kind: PodcastTurnKind;
  text: string;
  citations: PodcastCitation[]; // required non-empty for content | model-answer | interrupt answers
  audioKey?: string;            // set once TTS lands
}

interface PodcastEpisode {
  id: string;
  created_at: string;
  status: "running" | "ready" | "error" | "cancelled";
  mode: "recap" | "connector" | "quiz" | "debate";
  scope?: ResearchScope;
  modeDial: Record<string, string>;
  dials: PodcastDials;
  sourcePageIds: string[];
  turns: PodcastTurn[];
  memory: string;
  seriesId?: string;
  episodeIndex?: number;        // 1-based when seriesId set
  showTitle?: string;
  error?: string;
}

interface SeriesSlot {
  index: number;                // 1-based
  title: string;
  throughLine: string;
  mode: "recap" | "connector" | "quiz" | "debate";
  sourcePageIds: string[];
  episodeId?: string;           // set once that slot is recording or ready
}

interface PodcastSeries {
  id: string;
  created_at: string;
  topic: string;
  scope?: ResearchScope;
  cadence: "weekly" | "monthly" | "half-yearly" | "yearly";
  dials: PodcastDials;
  showTitle: string;
  openingRitual: string;
  vibe: string;
  runningMotifs: string[];
  slots: SeriesSlot[];
}
```

Grounding rule (enforced in `src/podcast/ground.ts`, unit-tested): every `content`, `model-answer`, and interrupt-answer turn must have `citations` whose `pageId`s are a subset of `sourcePageIds`. `banter`, `cue`, `quiz-prompt`, and `empty` may have empty citations but must not mention a note title that is not in `sourcePageIds`. Failed grounding → regenerate that turn once; still failing → drop the turn.

`updated_at` for Recap: page JSON already has it. Lexical `manifest` today does not. Recap filtering reads `updated_at` from `research/pages/<id>.json` (or Hub page fetch) for candidates after scope+retrieve, not from the graph.

### Memory

When an episode becomes `ready`, write `memory` (what was argued, which tensions, which notes).

- **One-off:** `/podcast/start` loads the last **three** ready episodes whose scope overlaps (same area if set; any shared tag if tags set; else any).
- **Series:** the script loads memories of **every prior episode in that series**, plus the bible. Overlapping one-offs are not mixed in.

Memories go into the prompt as “previous shows,” not as citable sources. Citations remain Hub pages only.

## Generation loop

Pure functions in `src/podcast/` so the DO stays thin.

1. **Select** — `hybridRetrieve` with a query derived from mode (Recap: “what changed in these tags”; Connector: both cluster names; Quiz: scope tags; Debate: both positions). Apply scope. Apply Recap date window. Cap by Length + Pacing.
2. **Fetch bodies** — existing `fetchPageBody` for the winners only.
3. **Script** — one Claude call (two for deep length if round 1 names gaps). Prompt = Clementine voice + Ann voice + podcast surface + retrieved notes + memories + dials (+ series bible when present). Output JSON turns only. Series scripts must honour `openingRitual` on turn 1.
4. **Ground** — `ground.ts`.
5. **Speak** — TTS per turn, skip `cue` (no audio, player shows a beat). Persist `audioKey`.
6. **Memory** — short summary from the grounded script, no new claims.

Cancel: clear the DO alarm; keep whatever turns already have audio; status `cancelled` is playable.

## Interrupt

Typed box on the player. Sensitivity:

- **finish-thought:** wait until the current cue ends, then pause.
- **immediate:** stop current audio now.

Then `POST .../interrupt` with `afterTurn` + `question`. Worker retrieves **first** inside `sourcePageIds` (the episode’s notes). If that is empty, retrieve in the original scope. Answer is 1–3 new turns (both hosts allowed), grounded, TTS’d, spliced after `afterTurn`. Player plays those, then continues the original list.

If the notes do not contain the answer, hosts say so and cite the closest note or name the gap. They do not guess.

Quiz answers use `/answer` instead of `/interrupt` so the model can mark the attempt against the pending `quiz-prompt` and then either continue or insert a `model-answer`.

## UI behaviour

- Commission does not POST without a mode (one-off) or without a topic (series). Connector without two clusters and Debate without two positions do not POST. Series run length outside 4–12 does not POST.
- Generate disables the button; poll ~2s; series start may show “planning the season” then “writing episode 1” then “recording turn n/m”.
- Player: play/pause, skip cue, current speaker name, current citations as buttons that open the archive page (existing reader). Series: eyebrow is `showTitle`; h1 is the episode title.
- Interrupt field visible while `ready` or while playing a `cancelled`/`ready` episode.
- Library lists one-offs as `mode · scope · date`. Series list as `showTitle` with slot progress (`3 / 8`). Next episode is enabled when the previous slot is `ready` or `cancelled`.
- Errors: unauthenticated → same login gate. Kernel 401/502 → “Podcast failed.” Keep commission form. Empty Recap window → `ready` episode with one `empty` turn, not a generic failure. Series that cannot plan at least 3 grounded slots → 422 with a gap message, no empty season.

Warm Cotton tokens, rail pattern, glass panels — same family as Research. Player is a workplace, not a marketing waveform.

## Error handling

- Missing prompt files → fail the request (existing Clementine rule). No generic-host fallback.
- TTS failure on a turn: retry once; still fail → leave `audioKey` unset and skip that cue in the player with visible “couldn’t record this line” in the transcript. Do not delete the episode.
- Poll 404 → stop polling, show error.
- Interrupt while `running` (still generating) → 409; client keeps the typed question until `ready`.

## Testing

No live Anthropic, OpenAI, or Workers AI.

- Scope + Recap date window; Connector OR-of-two-tags; empty Recap window yields empty-state episode.
- Series planner: slots only use retrieved page ids; requested 8 with only two honest notes → fail, not pad; openingRitual present.
- `ground.ts`: uncited content dropped; banter cannot name a foreign title; interrupt citations subset of `sourcePageIds`.
- Script prompt includes both identities from **git pack**, forbids web knowledge, JSON-only; series prompt includes bible.
- Worker HTTP: start/poll/interrupt/series require secret; Netlify proxy: no session → 401; body never includes the secret.
- Client: all `/api/podcast/*` with credentials; audio URLs are API URLs, not Worker URLs.
- Player: finish-thought vs immediate; Quiz pause until answer or skip.

## Phased delivery

1. **Kernel + script:** schema, select, ground, one-off script JSON, episode JSON in R2, Netlify proxy, poll. Transcript readable before audio exists.
2. **Ann + Clementine podcast prompts in git pack** (so Worker can speak).
3. **Series planner + next episode.**
4. **TTS + cue player:** Aura voices, signed audio, play/pause/skip.
5. **Podcast rail UI:** commission (one-off + series) + advanced dials + library.
6. **Interrupt + Quiz pause + memory.**

Worker deploy is required for live Podcast, same as Research.

## Isolation

| Unit | Does | Talks to |
| --- | --- | --- |
| `src/podcast/select.ts` | Mode-aware retrieve + caps + Connector OR | `hybridRetrieve`, page bodies |
| `src/podcast/script.ts` | Claude → turns | prompt pack, retrieved notes, optional bible |
| `src/podcast/seriesPlan.ts` | Topic → grounded slot list + bible | retrieve + Claude |
| `src/podcast/ground.ts` | Citation validity | episode `sourcePageIds` |
| `src/podcast/speak.ts` | TTS + R2 keys | Workers AI, R2 |
| `worker/src/podcastSession.ts` | Schedule, persist | the units above |
| Netlify `/api/podcast/*` | Cookie → secret header | Worker |
| Browser player | Cue playlist, interrupt, series library | Netlify only |
