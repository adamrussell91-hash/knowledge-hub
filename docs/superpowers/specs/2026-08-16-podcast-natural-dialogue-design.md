# Podcast natural dialogue — Design Spec

**Date:** 2026-08-16  
**Status:** Approved design, ready for implementation planning  
**Depends on:** `2026-08-15-personal-podcast-design.md`  
**Extends:** podcast script generation in `src/podcast/script.ts` + `src/podcast/run.ts`

## Goal

Episodes must sound like two people talking, not an essay chopped into turns. Generation always runs a writer pass then an editorial rewrite pass, then a deterministic naturalness gate that fails the episode on premise-breaking defects (fourth-wall leaks, missing episode frame) rather than shipping a static research summary voiced by two labels.

## Problem

The working podcast pipeline produces grammatically valid JSON turns that fail as speech:

- Hosts address the requester by name or discuss “writing the paper” (fourth wall collapses).
- Clementine and Ann share one written register because coaching identities (`clementine-voice.md`, `annotation-voice.md`) dominate the prompt and both are coach/mentor surfaces.
- Turns are monologue paragraphs: no reply-to-prior-line, no turn-length variation, no light disfluency, mixed metaphors, title-recitation citations, written aphorisms, stacked em-dashes.
- There is no cold open or sign-off; scripts start and stop mid-argument.
- Grounding only checks citations; nothing checks conversational quality.

## Non-goals

- Changing TTS, player UI, commission dials, series bible shape, Netlify/Worker auth, or R2 layout
- Changing coach/mentor behaviour outside Podcast (`clementine-voice.md`, `annotation-voice.md` stay as-is for those surfaces)
- A third outline-planning model call before drafting
- Automatic regenerate loops after a failed naturalness gate (episode becomes `error` with a clear reason; Adam re-commissions)
- Soft style scoring that fails episodes for em-dash density or “And…” openers (editor owns those; gate owns only critical defects)
- Applying the full two-pass editor to interrupt/quiz follow-ups (those stay single-call + a short naturalness addendum)

## Approach

**Two-pass writer / editor pipeline (always editor).**

1. Writer drafts from podcast-only host profiles + notes + dials + optional bible.
2. Editor always rewrites the full transcript for spoken dialogue against the natural-dialogue protocol.
3. Existing `groundTurns` runs on the editor output.
4. Deterministic naturalness gate fails only on critical defects.

## Host surfaces

### Keep unchanged (non-podcast)

| File | Role |
| --- | --- |
| `prompts/clementine-voice.md` | Coach identity for writing surfaces |
| `prompts/annotation-voice.md` | Mentor identity for annotation surfaces |

### Podcast-only

| File | Role |
| --- | --- |
| `prompts/clementine-podcast.md` | Expand: lead-host speech profile + full natural-dialogue protocol (see Protocol below). Not coaching. Never address Adam by name. |
| `prompts/ann-podcast.md` | **New.** Ann as co-host close-reading archive texts: short clipped sentences, literary-craft metaphors only when earned, skeptic/complicator default, no lesson-mentor protocols, never address Adam by name. |
| `prompts/podcast-editor.md` | **New.** Always-on editorial rewrite job: rewrite the draft as speech against the checklist; return full replacement JSON turns, not a patch. |

`src/clementine/pack.ts` exports all three. Missing/empty files fail the request (same rule as today).

### Idiolect defaults (encoded in the podcast prompts)

| Host | Stance | Cadence | Certainty |
| --- | --- | --- | --- |
| Clementine | Synthesizer / lead; builds warrants | Longer qualifying clauses; dry asides | States claims flatly when notes support them |
| Ann | Skeptic / close reader; complicates | Short bursts; names structure (“the turn”, “act two”) | Hedges when the text is ambiguous; pushes for evidence |

If speaker names were swapped, a reader should still tell who spoke. Opposite defaults create friction without requiring Debate mode.

## Natural-dialogue protocol (writer + editor)

Encode the following as hard rules in `clementine-podcast.md` and as rewrite criteria in `podcast-editor.md`. Follow together, not selectively.

1. **Two distinct idiolects** before drafting (see table above).
2. **Turns reply to the prior line’s specific content**, not the topic in general. Opening moves: react, push back, partial concede, or ask a real clarifying question.
3. **Vary turn length sharply** — one-line reactions mixed with occasional 3–5 sentence builds; monologue turns no more often than every third or fourth turn.
4. **Controlled disfluency** — occasional false starts, trailing off, restating simply; light “so” / “I mean” / “look”; never caricature um/uh spam.
5. **One governing metaphor per episode** — introduce once, return 2–3 times, never mix unrelated metaphor families.
6. **Paraphrase sources** — conversational handles (“the CESE episode”, “Reis and Renzulli”), not full document titles recited as footnotes. Prefer describing what a source says. Citation metadata in JSON still carries `pageId` / `title`; speech does not recite titles unless `citationDensity` is `heavy`, and even then use short handles.
7. **Never break the fourth wall** — hosts talk to each other and an implied listener; never to the requester by name; never reference the act of writing an essay/paper/draft for the listener.
8. **Episode shape** — cold open (what today + why it matters), at least one moment of friction/tension, clear close (summary beat, forward look, or sign-off).
9. **Ban written-prose tricks** — fragment-as-punctuation drama, proverb-aphorisms, stacked em-dashes every turn, tricolon overload, mechanical “And…” turn openers.
10. **Read-aloud pass** — editor simulates speaking each line; rewrite anything that only works as typed prose.

### Dial interaction

Existing dials still apply. Naturalness does not override grounding or mode rules.

- **Formality / banter / disagreement / chicken** shape how sharp and playful the rewrite may be; they never authorise uncited claims or fourth-wall address.
- **Citation density:** light = cite in metadata, rarely name notes in speech; normal = short handles; heavy = short handles more often — still not bibliography titles.
- **Complexity:** plain vs academic affects vocabulary, not turn uniformity or essay cadence.
- Series **openingRitual** remains mandatory on turn 1 when a bible is present; it counts as (or precedes) the cold open.

## Generation pipeline

```
retrieve notes → pick memories (+ bible if series)
       │
       ▼
  Writer Claude call  (buildPodcastPrompt)
       │
       ▼
  Editor Claude call  (buildPodcastEditorPrompt)  ← always
       │
       ▼
  parsePodcastScript → groundTurns
       │
       ▼
  naturalnessGate
       │
       ├─ pass → status running, turns ready for TTS (unchanged)
       └─ fail critical → status error, named reason, no TTS
```

### Writer prompt (`buildPodcastPrompt`)

Assemble:

- Clementine podcast job (expanded protocol + lead profile)
- Ann podcast profile (`ann-podcast.md`) as co-host surface (replace appending full `annotation-voice.md`)
- Existing JSON surface rules (turn schema, turn cap, no open web, archive notes only)
- Mode, dials, notes, memories, optional bible

Do not inject `clementine-voice.md` coaching identity into podcast generation. The podcast job file is the sole Clementine identity for this surface. Change `buildPodcastPrompt` so the assemble `voice` layer is **not** `prompts/clementine-voice.md`; use a one-line podcast identity stub (e.g. “You are Professor Clementine Haig, co-hosting an archive-grounded podcast.”) or fold identity entirely into `clementine-podcast.md` and pass that stub as `voice`. Coach checklists and “Adam’s draft” framing must not appear in the writer prompt.

### Editor prompt (`buildPodcastEditorPrompt`)

Inputs: notes (for grounding context), dials, mode, optional bible ritual reminder, **full draft turns as transcript**.

Instructions: rewrite the entire episode as spoken dialogue against the protocol checklist; preserve factual claims that are note-grounded; do not invent sources; return JSON turns only (full replacement). Honour turn cap. Preserve required kinds for Quiz/Debate/Recap empty cases.

### Interrupt / quiz follow-ups

Remain **one** Claude call. Append a short naturalness addendum to those prompts:

- No fourth wall / no addressing the requester by name
- Paraphrase sources; reply to the question or quiz attempt
- Keep 1–3 turns; still ground

Do not run the full editor pass on spliced turns (latency). Naturalness gate still scans inserted text for fourth-wall leaks; leaky turns are dropped. If nothing remains to insert, fail the follow-up with a clear error without corrupting the prior episode transcript.

## Naturalness gate

New pure module: `src/podcast/naturalness.ts`.

### Critical failures (episode → `error`)

| Check | Rule |
| --- | --- |
| Fourth wall | Turn text matches requester address patterns: `\bAdam\b`, and phrases that treat the listener as the paper author (“your draft”, “your essay”, “your paper”, “when you write”, “if you’re writing”, etc.). Case-insensitive where appropriate. |
| Episode frame — open | After ground, take the first speaking turn (`content` \| `banter` \| `quiz-prompt`; skip `cue`). Fail if missing/blank. Fail if that turn’s text starts with a bare continuation opener (`And`, `But`, `Also`, `So anyway`) — mid-argument start. Series: turn 1 must still honour `openingRitual` (prompt-enforced; gate only checks the continuation-opener rule + non-empty). |
| Episode frame — close | After ground, take the last speaking turn (same kinds; skip `cue` / `empty`). Fail if missing/blank. Fail unless the text matches at least one closing cue (case-insensitive substring list defined in code and tests), e.g. `next time`, `leave it there`, `that’s the show`, `enough for today`, `wrap up`, `wrap this`, `until next`, `sign off`, `we’ll stop`, `that’s where we’ll stop`. Writer/editor prompts must produce a close that hits this list. |
| Empty script | Zero turns kept after ground → error (existing failure modes may already cover this; align messages). |

### Non-failing (editor responsibility only)

Em-dash density, “And…” openers, metaphor mix, identical idiolect, missing disfluency, title recitation in speech. Do not regex-fail these.

### Quiz / empty Recap

- Recap empty-state single `empty` turn: skip open/close frame checks; still run fourth-wall check.
- Quiz episodes: frame checks still apply around quiz-prompt sequences; cold open before first quiz-prompt; close after the last instructional beat.

## Error handling

- Editor or writer returns unparseable JSON → existing parse errors; episode `error` with preview.
- Editor output fails ground entirely → `error` (do not fall back to writer draft).
- Naturalness critical fail → `error` with a short reason string, e.g. `Podcast script broke the fourth wall` or `Podcast script missing episode open/close`.
- No silent fallback to the writer draft when the editor or gate fails.

## Testing

No live Anthropic calls.

- Prompt pack: Ann podcast + editor prompts required; writer prompt contains natural-dialogue rules, both host names, forbids open web; **does not** include coach-only phrases that instruct addressing Adam’s draft as the listener.
- `buildPodcastEditorPrompt`: includes draft transcript + checklist anchors (fourth wall, cold open, paraphrase).
- `naturalness.ts`: fixtures for Adam-address, essay-address, missing close, good minimal episode, Recap empty skip-frame.
- `runGenerate`: `complete` called twice; persists only editor-grounded turns when gate passes; gate failure sets `status: "error"` and does not leave `running` with bad turns.
- Interrupt prompt contains naturalness addendum; fourth-wall interrupt turns dropped.

## Isolation

| Unit | Does | Talks to |
| --- | --- | --- |
| `prompts/clementine-podcast.md` | Lead host + protocol | pack |
| `prompts/ann-podcast.md` | Ann co-host profile | pack |
| `prompts/podcast-editor.md` | Editorial rewrite job | pack |
| `src/podcast/script.ts` | Writer + editor prompt builders; parse | pack, schema |
| `src/podcast/naturalness.ts` | Critical gate | turns only |
| `src/podcast/run.ts` | Writer → editor → ground → gate | script, ground, naturalness, deps.complete |
| `src/podcast/ground.ts` | Unchanged citation validity | sources |

## Phased delivery

1. Prompt files + pack exports + writer prompt swap (drop coach voice from podcast assemble).
2. Editor prompt builder + `runGenerate` two-pass wiring.
3. Naturalness gate + fail-critical behaviour.
4. Interrupt/quiz naturalness addendum.
5. Unit tests for all of the above.

Worker deploy required for live behaviour (same as Podcast today).

## Acceptance criteria

- Regenerated episodes no longer address Adam or the act of writing his paper in host dialogue.
- Hosts are instructionally distinct (idiolect + stance) in the podcast prompts.
- Every non-empty episode is rewritten by the editor before TTS.
- Critical naturalness failures surface as episode `error`, not a playable static essay.
- Citations remain grounded to archive `pageId`s; open web still forbidden.
