# Podcast Natural Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace essay-like podcast scripts with an always-on writer/editor pipeline, podcast-only host identities, and a deterministic gate for fourth-wall and episode-frame failures.

**Architecture:** The existing archive retrieval and grounding pipeline remains intact. A writer call produces a draft from podcast-only host prompts; an editor call rewrites the entire draft for spoken dialogue; the edited turns are parsed, grounded, capped, and checked locally before TTS. Interrupt and quiz follow-ups remain single-call but use a short naturalness addendum and reject fourth-wall leakage.

**Tech Stack:** TypeScript, imported Markdown prompts via Vite, Zod podcast schemas, Vitest, existing Claude completion dependency, Cloudflare Worker orchestration.

**Spec:** `docs/superpowers/specs/2026-08-16-podcast-natural-dialogue-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `prompts/clementine-podcast.md` | Clementine’s podcast-only idiolect and the complete writer protocol |
| `prompts/ann-podcast.md` | Ann’s podcast-only idiolect and skeptic/close-reader stance |
| `prompts/podcast-editor.md` | Mandatory second-pass spoken-dialogue rewrite protocol |
| `src/clementine/pack.ts` | Import and validate the three podcast prompt files |
| `src/podcast/script.ts` | Build writer/editor prompts and parse turn JSON |
| `src/podcast/script.test.ts` | Prompt assembly and parsing tests |
| `src/podcast/naturalness.ts` | Pure critical-defect checks and fourth-wall filtering |
| `src/podcast/naturalness.test.ts` | Naturalness gate fixtures |
| `src/podcast/run.ts` | Writer → editor → ground → gate orchestration; follow-up filtering |
| `src/podcast/run.test.ts` | Two-pass and follow-up behaviour tests |
| `src/clementine/loadFromDisk.test.ts` | Prove the new prompt files exist on disk |
| `worker/src/index.ts` | Return quiz follow-up validation failures without persisting bad turns |
| `worker/src/podcastSession.ts` | Raise the script-stage timeout so two Claude calls fit |

Do not modify TTS, UI, dials, series schemas, grounding rules, R2 storage, or the non-podcast coach prompts.

---

### Task 1: Add podcast-only prompt identities and editor protocol

**Files:**
- Create: `prompts/ann-podcast.md`
- Create: `prompts/podcast-editor.md`
- Modify: `prompts/clementine-podcast.md`
- Modify: `src/clementine/pack.ts`
- Test: `src/podcast/script.test.ts`
- Test: `src/clementine/loadFromDisk.test.ts`

- [ ] **Step 1: Write the failing prompt-pack and disk tests**

Add imports and a focused test to `src/podcast/script.test.ts`:

```ts
import { annPodcast, clementinePodcast, podcastEditor } from "../clementine/pack";

it("loads podcast-only host and editor protocols", () => {
  expect(clementinePodcast).toMatch(/reply to the immediately preceding turn/i);
  expect(clementinePodcast).toMatch(/never address Adam/i);
  expect(annPodcast).toMatch(/skeptic|complicat/i);
  expect(annPodcast).toMatch(/short/i);
  expect(podcastEditor).toMatch(/rewrite the entire episode/i);
  expect(podcastEditor).toMatch(/read-aloud/i);
});
```

Add to `src/clementine/loadFromDisk.test.ts`:

```ts
it("loads the podcast-only prompt files from prompts/", () => {
  expect(loadPromptFile("clementine-podcast.md")).toMatch(/never address Adam/i);
  expect(loadPromptFile("ann-podcast.md")).toMatch(/co-host/i);
  expect(loadPromptFile("podcast-editor.md")).toMatch(/rewrite the entire/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run src/podcast/script.test.ts src/clementine/loadFromDisk.test.ts
```

Expected: FAIL because `annPodcast` / `podcastEditor` are not exported and the new prompt files are absent.

- [ ] **Step 3: Expand Clementine’s podcast job**

Replace `prompts/clementine-podcast.md` with:

```markdown
# Professor Clementine Haig — podcast host

You are Professor Clementine Haig, lead host of a private, archive-grounded
podcast with Ann O’Tation. This is a broadcast surface, not academic coaching.
Never discuss the requester’s draft, essay, paper, assignment, thesis, or act of
writing. Never address Adam by name. Speak to Ann and to an implied listener.

## Clementine’s idiolect

- Lead by synthesising claims and making the warrant explicit.
- Build occasional longer qualifying clauses, then restate the point plainly.
- State archive-supported claims with confidence; do not hedge automatically.
- Use dry, weathered asides sparingly. Do not manufacture polished aphorisms.
- Default to connecting ideas. Ann defaults to testing or complicating them.

## Natural-dialogue protocol

Apply every rule together:

1. Make each turn reply to the immediately preceding turn’s specific word,
   claim, concession, or question before advancing the topic.
2. Keep the two idiolects recognisably different. A listener should know the
   speaker even without the label.
3. Vary turn length sharply: one-line reactions and real follow-up questions
   mixed with occasional three-to-five-sentence builds. A longer build may
   occur no more often than every third or fourth turn.
4. Use controlled spoken repair occasionally: a false start, a simpler
   restatement, or a light “so”, “I mean”, or “look”. Never perform um/uh spam.
5. Choose at most one governing metaphor for the episode. Return to it two or
   three times at most. Never switch to an unrelated metaphor family.
6. Paraphrase sources in speech. Use short conversational handles, never full
   bibliography-style titles. Citation metadata still carries exact titles.
   With light citation density, keep names in metadata; with normal density,
   use short handles when useful; with heavy density, use handles more often
   but still never recite full titles.
7. Never break the fourth wall. Do not name Adam or turn the episode into
   advice about his writing.
8. Give the episode a cold open that says what today is about and why it
   matters, at least one genuine point of friction, and a clear closing beat.
9. Avoid written-page tricks: dramatic fragment sequences, proverb-like
   aphorisms, stacked em dashes, repeated tricolons, and mechanical “And…”
   openings.
10. Before returning JSON, perform a silent read-aloud pass. Rewrite any line
    that only works as typed and revised prose.

Use only the supplied archive notes. Do not use the open web or invent sources.
Return only the JSON shape required by the surface instructions.
```

- [ ] **Step 4: Add Ann’s podcast-only profile**

Create `prompts/ann-podcast.md`:

```markdown
# Ann O’Tation — podcast co-host

You are Ann O’Tation, Clementine’s co-host and the archive’s close reader. This
is a broadcast surface, not lesson mentoring or writing coaching. Never address
Adam by name and never advise the listener about an essay, paper, or draft.

## Ann’s idiolect

- Default to skepticism and complication: ask whether the notes really support
  Clementine’s synthesis, notice omissions, and test overconfident language.
- Speak in shorter bursts than Clementine. Use an occasional clipped sentence,
  interruption, or “wait” when a claim needs examining.
- Restate Clementine’s point only when checking that you understood it.
- Use literary-craft language only when it is the observation itself: pacing,
  the turn, subtext, first draft, motif, white space. Do not bolt metaphors onto
  every remark.
- Say “I’m not sure” when the archive is ambiguous. Do not hedge a strong
  textual observation.
- React to the immediately preceding line before introducing another source or
  idea.

Use only the supplied archive notes. Paraphrase source names in speech; exact
titles belong in citation metadata. Do not use the open web or invent sources.
```

- [ ] **Step 5: Add the mandatory editorial rewrite protocol**

Create `prompts/podcast-editor.md`:

```markdown
# Podcast spoken-dialogue editor

Rewrite the entire supplied episode. Return a full replacement JSON turn list,
not comments, an audit, or a patch. Preserve only note-grounded factual claims
and valid citation metadata. Do not invent sources or use the open web.

## Editorial pass

1. Remove every fourth-wall leak: no “Adam”, no requester address, and no
   discussion of the listener’s draft, essay, paper, assignment, or writing.
2. Make Clementine the synthesizer with longer qualifying builds and Ann the
   shorter skeptic/close reader. Their names must not be interchangeable.
3. Make each turn answer the immediately preceding turn before moving on.
4. Mix one-line reactions and questions with occasional longer turns. Break up
   consecutive paragraph-sized monologues.
5. Add only light, purposeful spoken repair: a false start, brief restatement,
   interruption, or trailing handoff. Do not add filler as decoration.
6. Keep one metaphor family at most. Remove decorative or mixed metaphors.
7. Replace full source-title recitations with conversational handles while
   preserving exact titles in `citations`. Honour citation density: metadata
   only for light, occasional short handles for normal, and more frequent short
   handles for heavy.
8. Ensure the first speaking turn is a cold open: what the episode is about and
   why it matters. Ensure the final speaking turn contains a natural closing
   cue such as “we’ll leave it there”, “next time”, or “that’s where we’ll
   stop”.
9. Remove proverb-like aphorisms, dramatic fragment sequences, stacked em
   dashes, repeated tricolons, and mechanical “And…” openings.
10. Perform a silent read-aloud check on every line. If a person would need to
    have written and revised it before saying it, simplify it.

Respect the mode, dials, turn cap, quiz turn kinds, and any series opening
ritual. Return JSON only in the schema stated by the surface instructions.
```

- [ ] **Step 6: Import and validate the new prompts**

Update `src/clementine/pack.ts`:

```ts
import CLEMENTINE_VOICE from "../../prompts/clementine-voice.md";
import CLEMENTINE_UNIVERSITY from "../../prompts/clementine-university.md";
import CLEMENTINE_SCHOOL from "../../prompts/clementine-school.md";
import CLEMENTINE_PODCAST from "../../prompts/clementine-podcast.md";
import ANN_PODCAST from "../../prompts/ann-podcast.md";
import PODCAST_EDITOR from "../../prompts/podcast-editor.md";
import ANNOTATION_VOICE from "../../prompts/annotation-voice.md";

function requirePrompt(name: string, text: string): string {
  if (!text.trim()) throw new Error(`Prompt file missing: ${name}`);
  return text;
}

export const voice = requirePrompt("clementine-voice.md", CLEMENTINE_VOICE);
export const university = requirePrompt("clementine-university.md", CLEMENTINE_UNIVERSITY);
export const school = requirePrompt("clementine-school.md", CLEMENTINE_SCHOOL);
export const clementinePodcast = requirePrompt("clementine-podcast.md", CLEMENTINE_PODCAST);
export const annPodcast = requirePrompt("ann-podcast.md", ANN_PODCAST);
export const podcastEditor = requirePrompt("podcast-editor.md", PODCAST_EDITOR);
export const annotationVoice = requirePrompt("annotation-voice.md", ANNOTATION_VOICE);
```

- [ ] **Step 7: Run the prompt-pack and disk tests**

Run:

```bash
npx vitest run src/podcast/script.test.ts src/clementine/loadFromDisk.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prompts/clementine-podcast.md prompts/ann-podcast.md prompts/podcast-editor.md src/clementine/pack.ts src/podcast/script.test.ts src/clementine/loadFromDisk.test.ts
git commit -m "Add podcast-only host and editor protocols."
```

---

### Task 2: Build separate writer and editor prompts

**Files:**
- Modify: `src/podcast/script.ts:1-68`
- Modify: `src/podcast/script.test.ts:17-65`

- [ ] **Step 1: Write failing writer/editor prompt tests**

Update the import and add these tests in `src/podcast/script.test.ts`:

```ts
import { buildPodcastEditorPrompt, buildPodcastPrompt, parsePodcastScript } from "./script";

it("uses podcast identities without coaching context", () => {
  const prompt = buildPodcastPrompt({
    mode: "recap",
    dials,
    modeDial: { cadence: "weekly" },
    notes: [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
    memories: [],
  });

  expect(prompt).toContain("Professor Clementine Haig");
  expect(prompt).toContain("Ann O’Tation");
  expect(prompt).toMatch(/reply to the immediately preceding turn/i);
  expect(prompt).not.toMatch(/academic writing coach/i);
  expect(prompt).not.toContain("Adam's Academic Context");
  expect(prompt).not.toMatch(/lesson mentor in this surface/i);
});

it("builds an editor prompt from the draft and archive notes", () => {
  const prompt = buildPodcastEditorPrompt({
    mode: "recap",
    dials,
    modeDial: { cadence: "weekly" },
    notes: [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
    draft: [{
      id: "draft-1",
      speaker: "clementine",
      kind: "content",
      text: "A manuscript needs a spine.",
      citations: [{ pageId: "p1", title: "SDT" }],
    }],
  });

  expect(prompt).toMatch(/rewrite the entire supplied episode/i);
  expect(prompt).toMatch(/read-aloud/i);
  expect(prompt).toMatch(/cold open/i);
  expect(prompt).toMatch(/paraphrase/i);
  expect(prompt).toContain("draft-1");
  expect(prompt).toContain("A manuscript needs a spine.");
  expect(prompt).toContain("p1");
  expect(prompt).not.toMatch(/academic writing coach/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/podcast/script.test.ts
```

Expected: FAIL because `buildPodcastEditorPrompt` does not exist and the writer still includes coaching prompts.

- [ ] **Step 3: Refactor prompt inputs and podcast-safe assembly**

In `src/podcast/script.ts`, replace the prompt imports and define a shared input:

```ts
import { z } from "zod";
import { assembleClementinePrompt } from "../clementine/assemble";
import { annPodcast, clementinePodcast, podcastEditor } from "../clementine/pack";
import {
  PodcastTurnSchema,
  turnCap,
  type PodcastDials,
  type PodcastMode,
  type PodcastTurn,
} from "./schema";

const PODCAST_VOICE =
  "You are Professor Clementine Haig, co-hosting an archive-grounded podcast with Ann O’Tation.";

export type PodcastPromptInput = {
  mode: PodcastMode;
  dials: PodcastDials;
  modeDial: Record<string, string>;
  notes: PodcastScriptNote[];
  bible?: PodcastBible;
};
```

Keep `memories` writer-only:

```ts
export type PodcastWriterPromptInput = PodcastPromptInput & {
  memories: string[];
};
```

- [ ] **Step 4: Extract deterministic prompt payload helpers**

Add above `buildPodcastPrompt`:

```ts
function noteLines(notes: PodcastScriptNote[]): string {
  return notes
    .map(note => `- ${note.pageId} "${note.title}": ${note.excerpt}`)
    .join("\n");
}

function bibleLines(bible?: PodcastBible): string {
  if (!bible) return "";
  return [
    "Series bible:",
    `showTitle: ${bible.showTitle}`,
    `openingRitual: ${bible.openingRitual}`,
    `vibe: ${bible.vibe}`,
    `runningMotifs: ${bible.runningMotifs.join("; ") || "(none)"}`,
    "Honour openingRitual on turn 1 so this sounds like the same programme.",
  ].join("\n");
}

function jsonSurface(turnLimit: number): string {
  return [
    "Do not use the open web. Do not invent sources.",
    "Return only JSON. JSON-only. Do not wrap the response in markdown.",
    "Each turn must include: id, speaker (clementine | ann), kind (content | banter | quiz-prompt | model-answer | interrupt | cue | empty), text, citations (array of { pageId, title, sourceUrl? }).",
    `Write at most ${turnLimit} turns. Turns past that are discarded.`,
  ].join(" ");
}
```

- [ ] **Step 5: Replace the writer builder**

Implement:

```ts
export function buildPodcastPrompt(input: PodcastWriterPromptInput): string {
  const memories = input.memories.length
    ? `Previous shows (not citable):\n${input.memories.map(memory => `- ${memory}`).join("\n")}`
    : "Previous shows: none.";

  return assembleClementinePrompt({
    voice: PODCAST_VOICE,
    job: clementinePodcast,
    surface: [annPodcast, jsonSurface(turnCap(input.dials.length))].join("\n\n"),
    payload: [
      `Mode: ${input.mode}`,
      `Mode dials: ${JSON.stringify(input.modeDial)}`,
      `Dials: ${JSON.stringify(input.dials)}`,
      `Notes:\n${noteLines(input.notes) || "(none)"}`,
      memories,
      bibleLines(input.bible),
    ].filter(Boolean).join("\n\n"),
  });
}
```

- [ ] **Step 6: Add the editor builder**

Implement:

```ts
export function buildPodcastEditorPrompt(
  input: PodcastPromptInput & { draft: PodcastTurn[] },
): string {
  return assembleClementinePrompt({
    voice: PODCAST_VOICE,
    job: podcastEditor,
    surface: [
      annPodcast,
      "This is the mandatory editorial pass. Preserve valid turn kinds and citations.",
      jsonSurface(turnCap(input.dials.length)),
    ].join("\n\n"),
    payload: [
      `Mode: ${input.mode}`,
      `Mode dials: ${JSON.stringify(input.modeDial)}`,
      `Dials: ${JSON.stringify(input.dials)}`,
      `Notes:\n${noteLines(input.notes) || "(none)"}`,
      bibleLines(input.bible),
      `Draft turns:\n${JSON.stringify({ turns: input.draft })}`,
    ].filter(Boolean).join("\n\n"),
  });
}
```

- [ ] **Step 7: Run script tests**

Run:

```bash
npx vitest run src/podcast/script.test.ts
```

Expected: PASS, including existing JSON recovery tests.

- [ ] **Step 8: Commit**

```bash
git add src/podcast/script.ts src/podcast/script.test.ts
git commit -m "Build separate podcast writer and editor prompts."
```

---

### Task 3: Add the deterministic critical-defect gate

**Files:**
- Create: `src/podcast/naturalness.ts`
- Create: `src/podcast/naturalness.test.ts`

- [ ] **Step 1: Write failing naturalness tests**

Create `src/podcast/naturalness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PodcastTurn } from "./schema";
import {
  breaksFourthWall,
  filterFourthWallTurns,
  podcastNaturalnessError,
} from "./naturalness";

const turn = (id: string, text: string, kind: PodcastTurn["kind"] = "content"): PodcastTurn => ({
  id,
  speaker: "clementine",
  kind,
  text,
  citations: kind === "empty" ? [] : [{ pageId: "p1", title: "SDT" }],
});

describe("podcast naturalness gate", () => {
  it.each([
    "Adam, this is the point.",
    "Your essay needs a stronger warrant.",
    "If you're writing across both clusters, cite this.",
    "When you write the paper, anchor the claim.",
  ])("detects a fourth-wall leak: %s", text => {
    expect(breaksFourthWall(text)).toBe(true);
  });

  it("accepts a framed episode", () => {
    expect(podcastNaturalnessError([
      turn("open", "Today we're looking at why autonomy gets mistaken for independence."),
      turn("close", "That's where we'll stop for today."),
    ])).toBeNull();
  });

  it("rejects a mid-argument opening", () => {
    expect(podcastNaturalnessError([
      turn("open", "And the second study makes the same point."),
      turn("close", "We'll leave it there."),
    ])).toMatch(/opening/i);
  });

  it("rejects a missing closing beat", () => {
    expect(podcastNaturalnessError([
      turn("open", "Today we're looking at autonomy."),
      turn("last", "The second note complicates that claim."),
    ])).toMatch(/closing/i);
  });

  it("allows the empty Recap state when requested", () => {
    expect(podcastNaturalnessError(
      [turn("empty", "Nothing new in the archive this period.", "empty")],
      { allowEmpty: true },
    )).toBeNull();
  });

  it("removes only fourth-wall turns from a follow-up", () => {
    const safe = turn("safe", "The note supports autonomy.");
    expect(filterFourthWallTurns([
      turn("bad", "Adam, your paper needs this."),
      safe,
    ])).toEqual([safe]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/podcast/naturalness.test.ts
```

Expected: FAIL because `./naturalness` does not exist.

- [ ] **Step 3: Implement the pure gate**

Create `src/podcast/naturalness.ts`:

```ts
import type { PodcastTurn } from "./schema";

const FOURTH_WALL_PATTERNS = [
  /\badam\b/i,
  /\byour\s+(?:draft|essay|paper|assignment|thesis)\b/i,
  /\b(?:when|if)\s+you(?:'re| are)?\s+writ(?:e|ing)\b/i,
  /\byou(?:'ll| will)\s+need\s+to\s+(?:write|cite|anchor|argue)\b/i,
];

const CONTINUATION_OPEN = /^(?:and|but|also|so anyway)\b/i;

const CLOSING_CUES = [
  "next time",
  "leave it there",
  "that's the show",
  "enough for today",
  "wrap up",
  "wrap this",
  "until next",
  "sign off",
  "we'll stop",
  "that's where we'll stop",
];

const SPEAKING_KINDS = new Set<PodcastTurn["kind"]>([
  "content",
  "banter",
  "quiz-prompt",
  "model-answer",
  "interrupt",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").trim();
}

export function breaksFourthWall(text: string): boolean {
  return FOURTH_WALL_PATTERNS.some(pattern => pattern.test(text));
}

export function filterFourthWallTurns(turns: PodcastTurn[]): PodcastTurn[] {
  return turns.filter(turn => !breaksFourthWall(turn.text));
}

export function podcastNaturalnessError(
  turns: readonly PodcastTurn[],
  options: { allowEmpty?: boolean } = {},
): string | null {
  if (turns.some(turn => breaksFourthWall(turn.text))) {
    return "Podcast script broke the fourth wall";
  }

  if (options.allowEmpty && turns.length > 0 && turns.every(turn => turn.kind === "empty")) {
    return null;
  }

  const speaking = turns.filter(
    turn => SPEAKING_KINDS.has(turn.kind) && turn.text.trim().length > 0,
  );
  if (!speaking.length) return "Podcast script contains no usable speaking turns";

  if (CONTINUATION_OPEN.test(normalize(speaking[0]!.text))) {
    return "Podcast script is missing a cold opening";
  }

  const closing = normalize(speaking.at(-1)!.text);
  if (!CLOSING_CUES.some(cue => closing.includes(cue))) {
    return "Podcast script is missing a closing beat";
  }

  return null;
}
```

- [ ] **Step 4: Run naturalness tests**

Run:

```bash
npx vitest run src/podcast/naturalness.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/podcast/naturalness.ts src/podcast/naturalness.test.ts
git commit -m "Gate premise-breaking podcast dialogue defects."
```

---

### Task 4: Run every non-empty episode through the editor

**Files:**
- Modify: `src/podcast/run.ts:1-186`
- Modify: `src/podcast/run.test.ts:1-163`

- [ ] **Step 1: Add a two-pass completion helper to the tests**

Add near `scriptJson` in `src/podcast/run.test.ts`:

```ts
function completionSequence(...responses: string[]) {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    complete: async (prompt: string) => {
      prompts.push(prompt);
      const response = responses[index];
      index += 1;
      if (response === undefined) throw new Error(`Unexpected completion ${index}`);
      return response;
    },
  };
}

const framedTurns = [
  {
    id: "edited-open",
    speaker: "clementine",
    kind: "content",
    text: "Today we're looking at why autonomy gets confused with independence.",
    citations: [{ pageId: "p1", title: "SDT" }],
  },
  {
    id: "edited-close",
    speaker: "ann",
    kind: "content",
    text: "That's where we'll stop for today.",
    citations: [{ pageId: "p1", title: "SDT" }],
  },
];
```

- [ ] **Step 2: Replace the happy-path test with an explicit writer/editor assertion**

Use:

```ts
it("uses the editor output as the grounded episode transcript", async () => {
  const completions = completionSequence(
    scriptJson([{
      id: "draft-only",
      speaker: "clementine",
      kind: "content",
      text: "A static draft.",
      citations: [{ pageId: "p1", title: "SDT" }],
    }]),
    scriptJson(framedTurns),
  );

  const episode = await runGenerate(
    { mode: "quiz", scope: { tags: ["sdt"] }, modeDial: {}, dials, now },
    {
      retrieve: async () => notes,
      complete: completions.complete,
      listEpisodes: async () => [],
      id: () => "ep_ok",
      nowIso: () => "2026-08-15T00:00:00.000Z",
    },
  );

  expect(completions.prompts).toHaveLength(2);
  expect(completions.prompts[1]).toContain("draft-only");
  expect(completions.prompts[1]).toMatch(/mandatory editorial pass/i);
  expect(episode.status).toBe("running");
  expect(episode.sourcePageIds).toEqual(["p1", "p2"]);
  expect(episode.turns.map(turn => turn.id)).toEqual(["edited-open", "edited-close"]);
});
```

- [ ] **Step 3: Add the failing critical-gate orchestration test**

```ts
it("returns an error episode when edited dialogue breaks the fourth wall", async () => {
  const completions = completionSequence(
    scriptJson(framedTurns),
    scriptJson([
      {
        id: "bad",
        speaker: "clementine",
        kind: "content",
        text: "Adam, your essay needs this distinction.",
        citations: [{ pageId: "p1", title: "SDT" }],
      },
      framedTurns[1],
    ]),
  );

  const episode = await runGenerate(
    { mode: "quiz", modeDial: {}, dials, now },
    {
      retrieve: async () => notes,
      complete: completions.complete,
      listEpisodes: async () => [],
      id: () => "ep_bad",
    },
  );

  expect(episode.status).toBe("error");
  expect(episode.error).toMatch(/fourth wall/i);
  expect(episode.turns).toEqual([]);
});
```

Also add:

```ts
it("errors when the editor keeps only ungrounded turns and never falls back to the writer draft", async () => {
  const completions = completionSequence(
    scriptJson([
      {
        id: "draft-only",
        speaker: "clementine",
        kind: "content",
        text: "Today we're looking at autonomy, and we'll leave it there.",
        citations: [{ pageId: "p1", title: "SDT" }],
      },
    ]),
    scriptJson([
      {
        id: "editor-web",
        speaker: "ann",
        kind: "content",
        text: "Today the open web disagrees.",
        citations: [{ pageId: "web", title: "Web" }],
      },
    ]),
  );

  const episode = await runGenerate(
    { mode: "quiz", modeDial: {}, dials, now },
    {
      retrieve: async () => notes,
      complete: completions.complete,
      listEpisodes: async () => [],
      id: () => "ep_nofallback",
    },
  );

  expect(completions.prompts).toHaveLength(2);
  expect(episode.status).toBe("error");
  expect(episode.error).toMatch(/usable speaking turns|no usable/i);
  expect(episode.turns).toEqual([]);
  expect(episode.turns.some(turn => turn.id === "draft-only")).toBe(false);
});
```

- [ ] **Step 4: Update the remaining `runGenerate` fixtures**

Keep the empty-Recap test unchanged and keep `expect(completed).toBe(0)`; it must bypass both calls.

In the note-cap test, replace the single `prompt` / `complete` mock with:

```ts
const completions = completionSequence(
  scriptJson(framedTurns),
  scriptJson(framedTurns),
);
```

Pass `complete: completions.complete`, then replace the prompt assertion with:

```ts
expect(completions.prompts).toHaveLength(2);
expect(completions.prompts[0]).not.toContain("p13");
expect(completions.prompts[1]).not.toContain("p13");
```

In the turn-cap test, make the editor fixture itself contain 30 turns and put an accepted closing cue on turn 24:

```ts
const editedScript = Array.from({ length: 30 }, (_, index) => ({
  id: `t${index + 1}`,
  speaker: index % 2 === 0 ? "clementine" : "ann",
  kind: "content",
  text:
    index === 0
      ? "Today we're looking at the three basic needs."
      : index === 23
        ? "That's where we'll stop for today."
        : "That claim changes when the second note is read beside it.",
  citations: [{ pageId: "p1", title: "SDT" }],
}));
const completions = completionSequence(
  scriptJson(framedTurns),
  scriptJson(editedScript),
);
```

Pass `complete: completions.complete`; retain:

```ts
expect(episode.turns).toHaveLength(24);
expect(episode.turns.at(-1)?.id).toBe("t24");
```

In the ungrounded-turn test, use this editor response so grounding drops only `t-bad` and the remaining turn still supplies both frame beats:

```ts
const completions = completionSequence(
  scriptJson(framedTurns),
  scriptJson([
    {
      id: "t1",
      speaker: "clementine",
      kind: "content",
      text: "Today we're looking at the three basic needs, and we'll leave it there.",
      citations: [{ pageId: "p1", title: "SDT" }],
    },
    {
      id: "t-bad",
      speaker: "ann",
      kind: "content",
      text: "The open web disagrees.",
      citations: [{ pageId: "web", title: "Web" }],
    },
  ]),
);
```

Pass `complete: completions.complete`; retain the existing `["t1"]` and source-page assertions.

- [ ] **Step 5: Run the focused test to verify it fails**

Run:

```bash
npx vitest run src/podcast/run.test.ts
```

Expected: FAIL because `runGenerate` makes only one completion and does not apply the gate.

- [ ] **Step 6: Wire writer → editor → ground → gate**

Update imports in `src/podcast/run.ts`:

```ts
import { groundTurns } from "./ground";
import { pickMemories } from "./memory";
import { podcastNaturalnessError } from "./naturalness";
import {
  PodcastDialsSchema,
  PodcastEpisodeSchema,
  PodcastSeriesSchema,
  noteCap,
  turnCap,
  type PodcastDials,
  type PodcastEpisode,
  type PodcastMode,
  type PodcastSeries,
  type PodcastTurn,
} from "./schema";
import {
  buildPodcastEditorPrompt,
  buildPodcastPrompt,
  parsePodcastScript,
} from "./script";
```

Replace the current single completion section in `runGenerate` with:

```ts
  const promptInput = {
    mode: input.mode,
    dials: input.dials,
    modeDial: input.modeDial,
    notes,
    bible: input.series?.bible,
  };
  const draft = parsePodcastScript(
    await deps.complete(buildPodcastPrompt({
      ...promptInput,
      memories,
    })),
  );
  const edited = parsePodcastScript(
    await deps.complete(buildPodcastEditorPrompt({
      ...promptInput,
      draft,
    })),
  );
  const { kept } = groundTurns(
    edited,
    notes.map(note => ({ pageId: note.pageId, title: note.title })),
  );
  const turns = kept.slice(0, turnCap(input.dials.length));
  const naturalnessError = podcastNaturalnessError(turns);

  return PodcastEpisodeSchema.parse({
    ...episodeBase(input, deps),
    status: naturalnessError ? "error" : "running",
    sourcePageIds: notes.map(note => note.pageId),
    turns: naturalnessError ? [] : turns,
    error: naturalnessError ?? undefined,
  });
```

Do not fall back to `draft` if editor parsing, grounding, or the gate fails. Zero usable speaking turns after ground must become `status: "error"`, not `running` with an empty transcript.

- [ ] **Step 7: Raise the Durable Object script timeout for two Claude calls**

Each Anthropic call already times out at 90s. Two sequential calls can exceed the current 150s script-stage budget. In `worker/src/podcastSession.ts`, change:

```ts
const GENERATE_TIMEOUT_MS = 150_000;
```

to:

```ts
const GENERATE_TIMEOUT_MS = 210_000;
```

and update the timeout message if it hard-codes the old seconds value from this constant (it already derives from `GENERATE_TIMEOUT_MS`).

If any stall/timeout test asserts `150`, update that assertion to `210`. Do not change the four-minute stall window.

- [ ] **Step 8: Run focused podcast tests**

Run:

```bash
npx vitest run src/podcast/script.test.ts src/podcast/naturalness.test.ts src/podcast/run.test.ts src/podcast/stall.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/podcast/run.ts src/podcast/run.test.ts worker/src/podcastSession.ts
git commit -m "Rewrite every podcast episode through the editor."
```

---

### Task 5: Naturalise and gate interrupt/quiz follow-ups

**Files:**
- Modify: `src/podcast/run.ts:284-388`
- Modify: `src/podcast/run.test.ts` (existing `runInterrupt` and `runQuizAnswer` suites)
- Modify: `worker/src/index.ts:124-145`

- [ ] **Step 1: Write failing follow-up prompt and rejection tests**

In the existing `runInterrupt` suite, add:

```ts
it("rejects an interrupt when every grounded turn breaks the fourth wall", async () => {
  const result = await runInterrupt(
    readyEpisode(),
    { afterTurn: "t1", question: "How does this affect the argument?" },
    {
      retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
      complete: async prompt => {
        expect(prompt).toMatch(/never address the requester by name/i);
        expect(prompt).toMatch(/paraphrase source/i);
        return scriptJson([{
          id: "bad",
          speaker: "clementine",
          kind: "interrupt",
          text: "Adam, your essay needs this claim.",
          citations: [{ pageId: "p1", title: "SDT" }],
        }]);
      },
    },
  );

  expect(result).toEqual({
    status: 422,
    error: "Podcast follow-up broke the fourth wall",
  });
});
```

In the existing `runQuizAnswer` suite, add:

```ts
it("rejects a fourth-wall quiz reaction without changing the episode", async () => {
  const episode = readyEpisode({
    turns: [{
      id: "q1",
      speaker: "ann",
      kind: "quiz-prompt",
      text: "Name one basic need.",
      citations: [],
    }],
  });
  const result = await runQuizAnswer(
    episode,
    { afterTurn: "q1", text: "Autonomy" },
    {
      retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Autonomy is a basic need." }],
      complete: async prompt => {
        expect(prompt).toMatch(/reply directly/i);
        return scriptJson([{
          id: "bad",
          speaker: "ann",
          kind: "model-answer",
          text: "Put that in your paper, Adam.",
          citations: [{ pageId: "p1", title: "SDT" }],
        }]);
      },
    },
  );

  expect(result).toEqual({
    status: 422,
    error: "Podcast follow-up broke the fourth wall",
  });
});
```

If `src/podcast/run.test.ts` still contains duplicated `runInterrupt` / `runQuizAnswer` suites, remove the exact duplicate copies before adding these tests; retain one canonical suite for each function.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/podcast/run.test.ts
```

Expected: FAIL because follow-ups do not contain naturalness instructions and quiz answers cannot return a status error.

- [ ] **Step 3: Add the shared follow-up addendum and result type**

In `src/podcast/run.ts`, import the filter:

```ts
import { filterFourthWallTurns, podcastNaturalnessError } from "./naturalness";
```

Replace the interrupt-specific conflict type with:

```ts
export type RunFollowupError = {
  status: 409 | 422;
  error: string;
};

const FOLLOWUP_NATURALNESS = [
  "This is spoken podcast dialogue: never address the requester by name and never discuss their draft, essay, paper, assignment, or writing.",
  "Reply directly to the listener question or quiz answer and react to the existing transcript.",
  "Paraphrase source names in speech; keep exact titles only in citation metadata.",
].join(" ");
```

Append `FOLLOWUP_NATURALNESS` to both `buildInterruptPrompt` and `buildQuizAnswerPrompt` before the question/answer payload.

- [ ] **Step 4: Filter grounded follow-ups and return 422 only when leakage removes all of them**

Add:

```ts
function naturalFollowupOrError(
  grounded: PodcastTurn[],
): PodcastTurn[] | RunFollowupError {
  const natural = filterFourthWallTurns(grounded);
  if (grounded.length > 0 && natural.length === 0) {
    return { status: 422, error: "Podcast follow-up broke the fourth wall" };
  }
  return natural;
}
```

Replace both run functions with:

```ts
export async function runInterrupt(
  episode: PodcastEpisode,
  input: { afterTurn: string; question: string },
  deps: RunFollowupDeps,
): Promise<PodcastEpisode | RunFollowupError> {
  if (episode.status === "running") {
    return { status: 409, error: "still generating" };
  }

  const notes = await retrieveForEpisode(episode, input.question, deps.retrieve);
  const grounded = groundAgainstNotes(
    await deps.complete(buildInterruptPrompt(episode, input.question, notes)),
    notes,
  );
  const natural = naturalFollowupOrError(grounded);
  if (!Array.isArray(natural)) return natural;
  const afterIndex = episode.turns.findIndex(turn => turn.id === input.afterTurn);
  return spliceAfter(episode, afterIndex, natural);
}

export async function runQuizAnswer(
  episode: PodcastEpisode,
  input: { afterTurn: string; text: string },
  deps: RunFollowupDeps,
): Promise<PodcastEpisode | RunFollowupError> {
  const start = episode.turns.findIndex(turn => turn.id === input.afterTurn);
  const from = start < 0 ? 0 : start;
  const quizIndex = episode.turns.findIndex(
    (turn, index) => index >= from && turn.kind === "quiz-prompt",
  );
  if (quizIndex < 0) return episode;

  const quiz = episode.turns[quizIndex]!;
  const notes = await retrieveForEpisode(episode, input.text, deps.retrieve);
  const grounded = groundAgainstNotes(
    await deps.complete(buildQuizAnswerPrompt(episode, quiz, input.text, notes)),
    notes,
  );
  const natural = naturalFollowupOrError(grounded);
  if (!Array.isArray(natural)) return natural;
  return spliceAfter(episode, quizIndex, natural);
}
```

Wholly ungrounded output remains an empty insertion with no new error. A grounded response whose every turn is removed for fourth-wall leakage returns 422.

- [ ] **Step 5: Propagate quiz follow-up errors in the Worker**

In `worker/src/index.ts`, update `answerEpisode`:

```ts
  const result = await runQuizAnswer(
    episode,
    followupInput(body, "text") as { afterTurn: string; text: string },
    podcastKernelDeps(env),
  );
  if (isPodcastStatusError(result)) return result;
  return saveEpisode(env, markEpisodeRecording(result));
```

`interruptEpisode` already has the equivalent check.

- [ ] **Step 6: Run follow-up and Worker-adjacent tests/build**

Run:

```bash
npx vitest run src/podcast/run.test.ts src/podcast/http.test.ts
npm run build
```

Expected: tests PASS; Vite build PASS with no TypeScript/import errors.

- [ ] **Step 7: Commit**

```bash
git add src/podcast/run.ts src/podcast/run.test.ts worker/src/index.ts
git commit -m "Reject fourth-wall leaks in podcast follow-ups."
```

---

### Task 6: Full verification

**Files:**
- Verify only; no new feature files

- [ ] **Step 1: Run all unit tests**

Run:

```bash
npm run test:unit
```

Expected: all `src` Vitest suites PASS.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all configured Vitest suites PASS.

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build
```

Expected: Vite build completes and `dist/index.html` is copied to `dist/404.html`.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git log --oneline -6
```

Expected: no whitespace errors; only the planned prompt, podcast, Worker, test, spec/plan files are changed; implementation commits are present.

Do not deploy in this plan. Live behaviour changes only after the existing Worker deployment workflow is run separately.
