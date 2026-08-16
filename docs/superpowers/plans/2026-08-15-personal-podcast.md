# Personal Podcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Knowledge Hub Podcast rail where Clementine Haig and Ann O’Tation record cue-based episodes from the existing archive (one-off modes plus a planned series), with git-stored voices, R2 filing, typed interrupt, and optional TTS.

**Architecture:** Pure functions in `src/podcast/` (select, ground, script, seriesPlan, speak). A `PodcastSession` Durable Object generates asynchronously (script, then TTS batches). Netlify session-proxies `/api/podcast/*` to the existing research Worker with `x-research-kernel-secret`. The browser never holds that secret. Ann’s identity lives in `prompts/annotation-voice.md` and is imported through `src/clementine/pack.ts` (Worker has no `node:fs`).

**Tech Stack:** TypeScript, Vitest, Zod, Netlify Functions, Cloudflare Worker + Durable Object + Workers AI Aura TTS, existing Vite rail.

**Spec:** `docs/superpowers/specs/2026-08-15-personal-podcast-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `prompts/annotation-voice.md` | Ann O’Tation identity (git canonical) |
| `prompts/clementine-podcast.md` | Clementine’s podcast job (not coach protocols) |
| `src/clementine/pack.ts` | Import markdown for Worker |
| `src/clementine/assemble.ts` | Existing assembler; podcast uses it twice (both hosts) |
| `src/podcast/schema.ts` | Zod episode / series / dials |
| `src/podcast/ground.ts` | Citation validity |
| `src/podcast/select.ts` | Retrieve query, caps, Recap window, Connector OR |
| `src/podcast/script.ts` | Prompt + parse turns |
| `src/podcast/seriesPlan.ts` | Bible + grounded slots |
| `src/podcast/memory.ts` | One-off vs series memory pick |
| `src/podcast/speak.ts` | TTS per turn (injected) |
| `src/podcast/http.ts` | Worker HTTP router for podcast |
| `src/podcast/run.ts` | Kernel glue: retrieve + script + persist |
| `worker/src/podcastSession.ts` | DO: generate + TTS alarms |
| `worker/src/index.ts` | Dispatch research vs podcast |
| `worker/wrangler.jsonc` | `PODCAST_SESSION` + `AI` binding |
| `netlify/functions/podcast.ts` | Session proxy + signed audio GET |
| `netlify/handlers/podcast.ts` | Re-export |
| `netlify.toml` | `/api/podcast/*` |
| `src/api/client.ts` | Podcast client |
| `src/main.ts` + `src/style.css` | Rail, commission, player, library |

Do not change Research behaviour except adding Worker routes beside it.

---

### Task 1: Episode and series schema

**Files:**
- Create: `src/podcast/schema.ts`
- Test: `src/podcast/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PodcastEpisodeSchema, PodcastSeriesSchema } from "./schema";

describe("podcast schema", () => {
  it("defaults memory to empty and allows a series pointer", () => {
    const episode = PodcastEpisodeSchema.parse({
      id: "ep_1",
      created_at: "2026-08-15T00:00:00.000Z",
      status: "running",
      mode: "recap",
      modeDial: { cadence: "weekly" },
      dials: {},
      sourcePageIds: ["p1"],
      turns: [],
    });
    expect(episode.memory).toBe("");
    expect(episode.dials.length).toBe("standard");
    expect(episode.dials.chicken).toBe(1);
  });

  it("rejects a series with fewer than 3 slots", () => {
    expect(() =>
      PodcastSeriesSchema.parse({
        id: "ser_1",
        created_at: "2026-08-15T00:00:00.000Z",
        topic: "SDT",
        cadence: "weekly",
        dials: {},
        showTitle: "Autonomy Hours",
        openingRitual: "Clementine pours tea.",
        vibe: "Seminar, not a recap dump.",
        runningMotifs: [],
        slots: [
          { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
          { index: 2, title: "Needs", throughLine: "Three needs", mode: "recap", sourcePageIds: ["p1"] },
        ],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/podcast/schema.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
import { z } from "zod";

export const PodcastModeSchema = z.enum(["recap", "connector", "quiz", "debate"]);
export type PodcastMode = z.infer<typeof PodcastModeSchema>;

export const PodcastDialsSchema = z.object({
  length: z.enum(["short", "standard", "deep"]).default("standard"),
  complexity: z.enum(["plain", "academic"]).default("academic"),
  citationDensity: z.enum(["light", "normal", "heavy"]).default("normal"),
  formality: z.enum(["dry-academic", "staffroom", "mates"]).default("staffroom"),
  banter: z.enum(["low", "medium", "high"]).default("medium"),
  disagreement: z.enum(["mild", "medium", "sharp"]).default("medium"),
  chicken: z.number().int().min(0).max(3).default(1),
  pacing: z.enum(["linger", "even", "race"]).default("even"),
  interruption: z.enum(["finish-thought", "immediate"]).default("finish-thought"),
});
export type PodcastDials = z.infer<typeof PodcastDialsSchema>;

export const PodcastSpeakerSchema = z.enum(["clementine", "ann"]);
export const PodcastTurnKindSchema = z.enum([
  "content",
  "banter",
  "quiz-prompt",
  "model-answer",
  "interrupt",
  "cue",
  "empty",
]);

export const PodcastCitationSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  sourceUrl: z.string().optional(),
});

export const PodcastTurnSchema = z.object({
  id: z.string(),
  speaker: PodcastSpeakerSchema.optional(),
  kind: PodcastTurnKindSchema,
  text: z.string(),
  citations: z.array(PodcastCitationSchema).default([]),
  audioKey: z.string().optional(),
});
export type PodcastTurn = z.infer<typeof PodcastTurnSchema>;

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  status: z.enum(["running", "ready", "error", "cancelled"]),
  mode: PodcastModeSchema,
  scope: z
    .object({
      area: z.enum(["university", "notes"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  modeDial: z.record(z.string()).default({}),
  dials: PodcastDialsSchema,
  sourcePageIds: z.array(z.string()),
  turns: z.array(PodcastTurnSchema),
  memory: z.string().default(""),
  seriesId: z.string().optional(),
  episodeIndex: z.number().int().positive().optional(),
  showTitle: z.string().optional(),
  error: z.string().optional(),
});
export type PodcastEpisode = z.infer<typeof PodcastEpisodeSchema>;

export const SeriesSlotSchema = z.object({
  index: z.number().int().positive(),
  title: z.string(),
  throughLine: z.string(),
  mode: PodcastModeSchema,
  sourcePageIds: z.array(z.string()),
  episodeId: z.string().optional(),
});

export const PodcastSeriesSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  topic: z.string().min(1),
  scope: z
    .object({
      area: z.enum(["university", "notes"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  cadence: z.enum(["weekly", "monthly", "half-yearly", "yearly"]),
  dials: PodcastDialsSchema,
  showTitle: z.string().min(1),
  openingRitual: z.string().min(1),
  vibe: z.string().min(1),
  runningMotifs: z.array(z.string()).default([]),
  slots: z.array(SeriesSlotSchema).min(3).max(12),
});
export type PodcastSeries = z.infer<typeof PodcastSeriesSchema>;

export const noteCap = (length: PodcastDials["length"], pacing: PodcastDials["pacing"]) => {
  const base = { short: 12, standard: 24, deep: 40 }[length];
  if (pacing === "linger") return Math.max(6, Math.floor(base * 0.6));
  if (pacing === "race") return base;
  return base;
};

export const turnCap = (length: PodcastDials["length"]) =>
  ({ short: 24, standard: 48, deep: 90 }[length]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/podcast/schema.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/podcast/schema.ts src/podcast/schema.test.ts
git commit -m "Add podcast episode and series schemas."
```

---

### Task 2: Grounding

**Files:**
- Create: `src/podcast/ground.ts`
- Test: `src/podcast/ground.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { groundTurns } from "./ground";
import type { PodcastTurn } from "./schema";

const turn = (overrides: Partial<PodcastTurn>): PodcastTurn => ({
  id: "t1",
  speaker: "clementine",
  kind: "content",
  text: "Deci named three needs.",
  citations: [{ pageId: "p1", title: "SDT" }],
  ...overrides,
});

describe("groundTurns", () => {
  it("keeps content cited from the source set", () => {
    const { kept, dropped } = groundTurns([turn({})], ["p1"]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops content that cites a page outside the source set", () => {
    const { kept, dropped } = groundTurns([turn({ citations: [{ pageId: "x", title: "Web" }] })], ["p1"]);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual(["t1"]);
  });

  it("drops banter that names a title not in the source set", () => {
    const { kept } = groundTurns(
      [turn({ kind: "banter", text: "As we said in 'Quantum Cheese' last week.", citations: [] })],
      ["p1"],
    );
    expect(kept).toHaveLength(0);
  });

  it("allows empty turns without citations", () => {
    const { kept } = groundTurns(
      [turn({ kind: "empty", text: "Nothing new this week.", citations: [] })],
      [],
    );
    expect(kept).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/podcast/ground.test.ts`

Expected: FAIL — `groundTurns` not defined.

- [ ] **Step 3: Minimal implementation**

```ts
import type { PodcastTurn } from "./schema";

const CITED_KINDS = new Set(["content", "model-answer", "interrupt"]);

export function groundTurns(turns: PodcastTurn[], sourcePageIds: string[]) {
  const allowed = new Set(sourcePageIds);
  const titles = new Map<string, string>();
  const kept: PodcastTurn[] = [];
  const dropped: string[] = [];
  for (const turn of turns) {
    const ids = turn.citations.map(c => c.pageId);
    const citedOk = ids.every(id => allowed.has(id));
    if (CITED_KINDS.has(turn.kind)) {
      if (!ids.length || !citedOk) {
        dropped.push(turn.id);
        continue;
      }
    } else if (!citedOk) {
      dropped.push(turn.id);
      continue;
    }
    const named = [...allowed].some(() => false);
    void named;
    const foreignTitle = turn.citations.some(c => !allowed.has(c.pageId));
    if (foreignTitle) {
      dropped.push(turn.id);
      continue;
    }
    kept.push(turn);
    for (const c of turn.citations) titles.set(c.pageId, c.title);
  }
  const knownTitles = [...titles.values()].map(t => t.toLowerCase());
  const filtered = kept.filter(turn => {
    if (CITED_KINDS.has(turn.kind)) return true;
    const quoted = turn.text.match(/'([^']+)'|"([^"]+)"/g) ?? [];
    return quoted.every(raw => {
      const title = raw.slice(1, -1).toLowerCase();
      return knownTitles.includes(title);
    });
  });
  const lost = kept.filter(t => !filtered.includes(t)).map(t => t.id);
  return { kept: filtered, dropped: [...dropped, ...lost] };
}
```

Fix the banter rule properly: if the turn text contains a `'Title'` / `"Title"` that is not in `source` titles passed in, drop it. Change the function to accept source records:

```ts
export function groundTurns(
  turns: PodcastTurn[],
  sources: { pageId: string; title: string }[],
) {
  const allowed = new Set(sources.map(s => s.pageId));
  const titles = new Set(sources.map(s => s.title.toLowerCase()));
  const kept: PodcastTurn[] = [];
  const dropped: string[] = [];
  for (const turn of turns) {
    const ids = turn.citations.map(c => c.pageId);
    if (CITED_KINDS.has(turn.kind) && (!ids.length || ids.some(id => !allowed.has(id)))) {
      dropped.push(turn.id);
      continue;
    }
    if (ids.some(id => !allowed.has(id))) {
      dropped.push(turn.id);
      continue;
    }
    const quoted = [...turn.text.matchAll(/'([^']+)'|"([^"]+)"/g)].map(m => (m[1] ?? m[2] ?? "").toLowerCase());
    if (quoted.some(title => title && !titles.has(title))) {
      dropped.push(turn.id);
      continue;
    }
    kept.push(turn);
  }
  return { kept, dropped };
}
```

Update the tests to pass `{ pageId, title }[]` instead of id lists.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/podcast/ground.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/podcast/ground.ts src/podcast/ground.test.ts
git commit -m "Reject podcast turns that are not grounded in retrieved notes."
```

---

### Task 3: Ann and Clementine podcast prompts in git

**Files:**
- Create: `prompts/annotation-voice.md`
- Create: `prompts/clementine-podcast.md`
- Modify: `src/clementine/pack.ts`
- Modify: `src/clementine/loadFromDisk.test.ts`
- Test: `src/podcast/script.test.ts` (prompt builder in Task 4; this task only pack + file tests)

- [ ] **Step 1: Write the failing test** (extend `loadFromDisk.test.ts`)

```ts
it("keeps Ann O’Tation in git, not Notion protocols", () => {
  const text = loadPromptFile("annotation-voice.md");
  expect(text).toContain("Ann O’Tation");
  expect(text).toContain("Let me annotate that for you");
  expect(text).not.toMatch(/Central Node/i);
  expect(text).not.toMatch(/Lesson Reflections Database/i);
});

it("gives Clementine a podcast job that is not the coach protocols", () => {
  const text = loadPromptFile("clementine-podcast.md");
  expect(text).toContain("podcast");
  expect(text).not.toContain("Reverse Outline");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/clementine/loadFromDisk.test.ts`

Expected: FAIL — files missing.

- [ ] **Step 3: Write the prompt files**

`prompts/clementine-podcast.md`:

```md
# Clementine — podcast job

You are co-hosting a private podcast with Ann O’Tation for Adam, over his Knowledge Hub notes only.

You lead on argument, warrant, and academic precision. Ann close-reads the notes as texts. Do not run writing-coach protocols (Reverse Outline, Argument Stress Test, Register Comparison, The Editors). Do not invent sources. If a claim is not in the provided notes, do not say it.

Return only JSON turns as specified in the surface instructions. Do not break JSON to make a joke.
```

`prompts/annotation-voice.md` — identity only (Overview + voice). Must include:

- She is **Ann O’Tation**: retired literary critic, veteran teaching mentor, close reader of practice.
- Precision over volume; one sharp insight beats ten generic ones.
- Voice: dry, sharp, literary-craft metaphors (acts, pacing, revision), no exclamation marks, never “Great lesson,” never the word “feedback” (readings / annotations).
- Signatures: “Let me annotate that for you.” “Every lesson is a narrative. Where was the turn?” “That is a first-draft move. Let us revise.”
- Never copy Central Node, lesson-reflection DB schema, or Teaching Dashboard protocols.

Keep it under ~150 lines. This file is the canonical copy after Notion is deleted.

Export from `pack.ts`:

```ts
import ANNOTATION_VOICE from "../../prompts/annotation-voice.md";
import CLEMENTINE_PODCAST from "../../prompts/clementine-podcast.md";

export const annotationVoice = requirePrompt("annotation-voice.md", ANNOTATION_VOICE);
export const clementinePodcast = requirePrompt("clementine-podcast.md", CLEMENTINE_PODCAST);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/clementine/loadFromDisk.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prompts/annotation-voice.md prompts/clementine-podcast.md src/clementine/pack.ts src/clementine/loadFromDisk.test.ts
git commit -m "Store Ann O’Tation and Clementine’s podcast job in git."
```

---

### Task 4: Select notes

**Files:**
- Create: `src/podcast/select.ts`
- Test: `src/podcast/select.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { connectorScope, recapCutoff, selectQuery } from "./select";

describe("podcast select", () => {
  it("builds a recap query from tags", () => {
    expect(selectQuery({ mode: "recap", scope: { tags: ["sdt"] }, modeDial: {} })).toContain("sdt");
  });

  it("ors connector clusters", () => {
    expect(connectorScope(["sdt", "dmgt"])).toEqual({ tags: ["sdt", "dmgt"], tagMatch: "any" });
  });

  it("uses the later of cadence window and last recap", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const weekly = recapCutoff({ cadence: "weekly", lastRecapAt: "2026-08-01T00:00:00.000Z", now });
    expect(weekly).toBe(Date.parse("2026-08-08T00:00:00.000Z"));
    const recent = recapCutoff({ cadence: "weekly", lastRecapAt: "2026-08-14T00:00:00.000Z", now });
    expect(recent).toBe(Date.parse("2026-08-14T00:00:00.000Z"));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/podcast/select.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { ResearchScope } from "../research/scope";
import type { PodcastMode } from "./schema";

export type TagMatch = "all" | "any";

export function selectQuery(input: {
  mode: PodcastMode;
  scope?: ResearchScope;
  modeDial: Record<string, string>;
  topic?: string;
}) {
  if (input.topic?.trim()) return input.topic.trim();
  if (input.mode === "connector") return `${input.modeDial.clusterA ?? ""} ${input.modeDial.clusterB ?? ""}`.trim();
  if (input.mode === "debate") return `${input.modeDial.positionA ?? ""} ${input.modeDial.positionB ?? ""}`.trim();
  const tags = input.scope?.tags?.join(" ") ?? "";
  if (input.mode === "recap") return `what is new in ${tags || "the archive"}`;
  return tags || "hub notes";
}

export function connectorScope(clusters: [string, string]): ResearchScope & { tagMatch: TagMatch } {
  return { tags: [clusters[0], clusters[1]], tagMatch: "any" };
}

const CADENCE_MS = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  "half-yearly": 182 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

export function recapCutoff(input: {
  cadence: keyof typeof CADENCE_MS;
  lastRecapAt?: string;
  now: number;
}) {
  const windowStart = input.now - CADENCE_MS[input.cadence];
  const last = input.lastRecapAt ? Date.parse(input.lastRecapAt) : 0;
  return Math.max(windowStart, last || windowStart);
}

export function filterByUpdatedAt<T extends { updated_at: string }>(pages: T[], cutoffMs: number) {
  return pages.filter(page => Date.parse(page.updated_at) >= cutoffMs);
}
```

Add `applyScope` in the same file that AND-filters tags unless `tagMatch === "any"` (then a page needs **any** listed tag). Do not change `src/research/scope.ts` AND behaviour.

- [ ] **Step 4: Tests pass**

Run: `npx vitest run src/podcast/select.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/podcast/select.ts src/podcast/select.test.ts
git commit -m "Select podcast notes by mode, including connector OR and recap windows."
```

---

### Task 5: Script prompt and JSON parse

**Files:**
- Create: `src/podcast/script.ts`
- Test: `src/podcast/script.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildPodcastPrompt, parsePodcastScript } from "./script";

describe("podcast script", () => {
  it("names both hosts and forbids the open web", () => {
    const prompt = buildPodcastPrompt({
      mode: "recap",
      dials: { length: "short", complexity: "academic", citationDensity: "normal", formality: "staffroom", banter: "medium", disagreement: "mild", chicken: 1, pacing: "even", interruption: "finish-thought" },
      modeDial: { cadence: "weekly" },
      notes: [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
      memories: [],
    });
    expect(prompt).toContain("Professor Clementine Haig");
    expect(prompt).toContain("Ann O’Tation");
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("p1");
    expect(prompt).not.toMatch(/search the web/i);
  });

  it("injects series bible when present", () => {
    const prompt = buildPodcastPrompt({
      mode: "recap",
      dials: { length: "standard", complexity: "academic", citationDensity: "normal", formality: "staffroom", banter: "medium", disagreement: "mild", chicken: 1, pacing: "even", interruption: "finish-thought" },
      modeDial: {},
      notes: [{ pageId: "p1", title: "SDT", excerpt: "needs" }],
      memories: ["Ep 1 mapped the three needs."],
      bible: { showTitle: "Autonomy Hours", openingRitual: "Tea first.", vibe: "Seminar.", runningMotifs: ["the third need hiding"] },
    });
    expect(prompt).toContain("Autonomy Hours");
    expect(prompt).toContain("Tea first.");
    expect(prompt).toContain("Ep 1 mapped the three needs.");
  });

  it("parses turns and ignores junk", () => {
    const turns = parsePodcastScript(`{"turns":[{"id":"1","speaker":"clementine","kind":"content","text":"Hello","citations":[{"pageId":"p1","title":"SDT"}]}]}`);
    expect(turns[0]?.speaker).toBe("clementine");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `buildPodcastPrompt` using `assembleClementinePrompt` with `voice` + `clementinePodcast` as job, then append `annotationVoice` as extra surface, then JSON instructions listing the turn schema. `parsePodcastScript` JSON.parse + `z.array(PodcastTurnSchema)` with id default `crypto.randomUUID()` if missing.**

If the model wraps JSON in fences, strip them.

- [ ] **Step 4: PASS**

Run: `npx vitest run src/podcast/script.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/podcast/script.ts src/podcast/script.test.ts
git commit -m "Build a two-host podcast script prompt that stays inside the archive."
```

---

### Task 6: Series planner

**Files:**
- Create: `src/podcast/seriesPlan.ts`
- Test: `src/podcast/seriesPlan.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { groundSeriesPlan } from "./seriesPlan";

const notes = [
  { pageId: "p1", title: "Needs" },
  { pageId: "p2", title: "Causality orientations" },
  { pageId: "p3", title: "Classroom SDT" },
];

describe("groundSeriesPlan", () => {
  it("keeps slots that only cite retrieved notes", () => {
    const plan = groundSeriesPlan(
      {
        showTitle: "Autonomy Hours",
        openingRitual: "Tea.",
        vibe: "Seminar.",
        runningMotifs: [],
        episodes: [
          { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
          { index: 2, title: "Orientations", throughLine: "Causality", mode: "recap", sourcePageIds: ["p2"] },
          { index: 3, title: "Classroom", throughLine: "Practice", mode: "quiz", sourcePageIds: ["p3"] },
        ],
      },
      notes,
      8,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.slots).toHaveLength(3);
  });

  it("fails when fewer than 3 honest slots remain", () => {
    const plan = groundSeriesPlan(
      {
        showTitle: "X",
        openingRitual: "Tea.",
        vibe: "Seminar.",
        runningMotifs: [],
        episodes: [
          { index: 1, title: "Map", throughLine: "What", mode: "recap", sourcePageIds: ["nope"] },
          { index: 2, title: "Map2", throughLine: "What", mode: "recap", sourcePageIds: ["nope"] },
          { index: 3, title: "Map3", throughLine: "What", mode: "recap", sourcePageIds: ["p1"] },
        ],
      },
      notes,
      8,
    );
    expect(plan.ok).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL then implement**

`groundSeriesPlan` drops slots whose ids are not in `notes`. If remaining `< 3`, return `{ ok: false, gap: string }`. Do not invent filler slots. Also export `buildSeriesPlanPrompt(topic, notes, episodeCount)` that demands JSON-only bible + episodes.

- [ ] **Step 3: PASS + commit**

```bash
git add src/podcast/seriesPlan.ts src/podcast/seriesPlan.test.ts
git commit -m "Plan a podcast series only from notes the archive actually has."
```

---

### Task 7: Memory pick

**Files:**
- Create: `src/podcast/memory.ts`
- Test: `src/podcast/memory.test.ts`

- [ ] **Step 1–4: TDD**

```ts
export function pickMemories(input: {
  seriesId?: string;
  scopeTags?: string[];
  episodes: { seriesId?: string; scope?: { tags?: string[] }; memory: string; created_at: string }[];
}) {
  const withMemory = input.episodes.filter(e => e.memory.trim());
  if (input.seriesId) {
    return withMemory
      .filter(e => e.seriesId === input.seriesId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(e => e.memory);
  }
  const tagged = withMemory.filter(e => {
    if (!input.scopeTags?.length) return true;
    return input.scopeTags.some(tag => e.scope?.tags?.includes(tag));
  });
  return tagged.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3).map(e => e.memory);
}
```

Test: series returns all matching in chronological order; one-off returns max 3.

- [ ] **Step 5: Commit**

```bash
git add src/podcast/memory.ts src/podcast/memory.test.ts
git commit -m "Load series bibles from every prior episode, not a random overlap."
```

---

### Task 8: Speak (injected TTS)

**Files:**
- Create: `src/podcast/speak.ts`
- Test: `src/podcast/speak.test.ts`

- [ ] **TDD:** `speakTurns(turns, { tts, put })` skips `cue` and `empty` without audio; maps `clementine` → `asteria`, `ann` → `luna` (Aura voice ids — if Aura-2 uses different names, keep the mapping in one constant `VOICE_BY_SPEAKER` and assert those keys). Retry once on throw. Unset `audioKey` after two failures.

```ts
export const VOICE_BY_SPEAKER = { clementine: "asteria", ann: "luna" } as const;

export async function speakTurns(
  turns: PodcastTurn[],
  episodeId: string,
  deps: {
    tts: (input: { text: string; voice: string }) => Promise<ArrayBuffer>;
    put: (key: string, bytes: ArrayBuffer) => Promise<void>;
  },
) {
  const next = [];
  for (const turn of turns) {
    if (turn.kind === "cue" || !turn.speaker || !turn.text.trim()) {
      next.push(turn);
      continue;
    }
    const key = `podcast/audio/${episodeId}/${turn.id}`;
    let bytes: ArrayBuffer | null = null;
    for (let attempt = 0; attempt < 2 && !bytes; attempt++) {
      try {
        bytes = await deps.tts({ text: turn.text, voice: VOICE_BY_SPEAKER[turn.speaker] });
      } catch {
        bytes = null;
      }
    }
    if (bytes) {
      await deps.put(key, bytes);
      next.push({ ...turn, audioKey: key });
    } else next.push(turn);
  }
  return next;
}
```

Commit: `Record podcast turns with two fixed Aura voices.`

---

### Task 9: Worker HTTP for podcast

**Files:**
- Create: `src/podcast/http.ts`
- Test: `src/podcast/http.test.ts`
- Modify: `worker/src/index.ts`
- Create: `worker/src/podcastSession.ts`
- Modify: `worker/wrangler.jsonc`

Follow `src/research/http.ts` + `ResearchSession` patterns.

Bindings:

```ts
export type PodcastBindings = {
  secret: string;
  allowedOrigin: string;
  startEpisode: (body: unknown) => Promise<PodcastEpisode>;
  startSeries: (body: unknown) => Promise<{ series: PodcastSeries; episode: PodcastEpisode }>;
  nextInSeries: (seriesId: string) => Promise<PodcastEpisode>;
  getEpisode: (id: string) => Promise<PodcastEpisode | null>;
  getSeries: (id: string) => Promise<PodcastSeries | null>;
  listIndex: () => Promise<{ episodes: unknown[]; series: unknown[] }>;
  interrupt: (id: string, body: unknown) => Promise<PodcastEpisode | { error: string; status: number }>;
  answer: (id: string, body: unknown) => Promise<PodcastEpisode | { error: string; status: number }>;
};
```

Routes (secret required, same 401 as research):

- `POST /podcast/start`
- `POST /podcast/series/start`
- `POST /podcast/series/:id/next`
- `GET /podcast/series/:id`
- `GET /podcast/:id`
- `POST /podcast/:id/interrupt`
- `POST /podcast/:id/answer`
- `GET /podcast/index`

Tests: missing secret → 401; start forwards body; 409 when interrupt binding returns status 409.

`PodcastSession` DO: `POST /start` with `{ episodeId, ...commission }` runs retrieve+script synchronously enough to persist `turns` without audio, status `running`, then `setAlarm` for TTS batches of 8 turns. `GET /` returns episode JSON from `this.state.storage`. Persist episode JSON to R2 `podcast/episodes/${id}.json` on each save. Update `podcast/index.json`.

`wrangler.jsonc`: add

```jsonc
"ai": { "binding": "AI" },
"durable_objects": {
  "bindings": [
    { "name": "RESEARCH_SESSION", "class_name": "ResearchSession" },
    { "name": "PODCAST_SESSION", "class_name": "PodcastSession" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["ResearchSession"] },
  { "tag": "v2", "new_sqlite_classes": ["PodcastSession"] }
]
```

`worker/src/index.ts`: if pathname includes `/podcast`, `handlePodcastRequest`, else existing research handler. Export `PodcastSession`.

`run.ts` can wait until Task 10 if you keep HTTP bindings as closures in `index.ts` like research already does.

Commit: `Route podcast sessions on the research worker without exposing the kernel secret.`

---

### Task 10: Kernel run (retrieve + script, no live models in tests)

**Files:**
- Create: `src/podcast/run.ts`
- Test: `src/podcast/run.test.ts`

Inject `retrieve`, `complete` (Claude JSON), `listEpisodes`, `readPageUpdatedAt`.

Tests:

- Recap with no pages after cutoff → episode `ready` with one `empty` turn.
- Happy path: retrieve 2 notes → complete returns turns → ground keeps them → status `running` (TTS later) or `ready` if `speak` is a no-op in tests.

Commit: `Generate a grounded podcast script from retrieved Hub notes.`

---

### Task 11: Netlify session proxy

**Files:**
- Create: `netlify/functions/podcast.ts`
- Create: `netlify/functions/podcast.test.ts`
- Create: `netlify/handlers/podcast.ts` (`export { handler } from "../functions/podcast"`)
- Modify: `netlify.toml`

Mirror `research.ts`. Also handle `GET /api/podcast/:episodeId/audio/:turnId`: load episode JSON via kernel GET, find `audioKey`, sign R2 GET like `attachments-get.ts` (300s). Do not stream bytes through Netlify.

Redirects (specific paths before `/:episodeId`):

```toml
[[redirects]]
  from = "/api/podcast/series/start"
  to = "/.netlify/functions/podcast"
  status = 200

[[redirects]]
  from = "/api/podcast/series/*/next"
  to = "/.netlify/functions/podcast"
  status = 200

[[redirects]]
  from = "/api/podcast/series/*"
  to = "/.netlify/functions/podcast"
  status = 200

[[redirects]]
  from = "/api/podcast/start"
  to = "/.netlify/functions/podcast"
  status = 200

[[redirects]]
  from = "/api/podcast"
  to = "/.netlify/functions/podcast"
  status = 200

[[redirects]]
  from = "/api/podcast/*"
  to = "/.netlify/functions/podcast"
  status = 200
```

Tests: no cookie → 401; POST start → worker `/podcast/start` with secret header; response body never contains secret.

`included_files` in netlify.toml: add `prompts/annotation-voice.md` and `prompts/clementine-podcast.md` only if this function reads them (it should not — Worker pack does). Leave included_files unchanged unless needed.

Commit: `Proxy podcast through the signed-in Netlify session.`

---

### Task 12: Browser client

**Files:**
- Modify: `src/api/client.ts`
- Test: `src/api/client.test.ts` (follow existing research tests)

Add:

```ts
export const startPodcast = (body: unknown) =>
  apiFetch<PodcastEpisode>("/podcast/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const startPodcastSeries = (body: unknown) =>
  apiFetch<{ series: PodcastSeries; episode: PodcastEpisode }>("/podcast/series/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const nextPodcastEpisode = (seriesId: string) =>
  apiFetch<PodcastEpisode>(`/podcast/series/${encodeURIComponent(seriesId)}/next`, { method: "POST", body: "{}" });

export const getPodcast = (id: string) => apiFetch<PodcastEpisode>(`/podcast/${encodeURIComponent(id)}`);
export const listPodcasts = () => apiFetch<{ episodes: PodcastEpisode[]; series: PodcastSeries[] }>("/podcast");
export const interruptPodcast = (id: string, body: { afterTurn: string; question: string }) =>
  apiFetch<PodcastEpisode>(`/podcast/${encodeURIComponent(id)}/interrupt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const answerPodcastQuiz = (id: string, body: { afterTurn: string; text: string }) =>
  apiFetch<PodcastEpisode>(`/podcast/${encodeURIComponent(id)}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const getPodcastAudioUrl = (episodeId: string, turnId: string) =>
  apiFetch<{ url: string }>(`/podcast/${encodeURIComponent(episodeId)}/audio/${encodeURIComponent(turnId)}`);
```

Local preview: if `USE_LOCAL_DATA`, throw the same “needs the Netlify API” error Research uses (banner already exists).

Commit: `Call podcast APIs with credentials and never the kernel secret.`

---

### Task 13: Podcast rail — commission + library

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

- [ ] Add `view = "podcast"`, rail button **Podcast** after Research (reuse `icons.research` or a simple waveform SVG consistent with existing 24px icons — no emoji).
- [ ] Commission: toggle One-off | Series.
  - One-off: mode radios, mode dial, area, tag multi-select (include unit-code tags), Advanced `<details>`.
  - Series: topic text, run length 4–12 default 8, cadence, same scope + Advanced. No mode radios (planner assigns).
- [ ] Generate → poll `getPodcast` every 2s until `ready` | `error` | `cancelled`.
- [ ] Library from `listPodcasts`: series cards with `showTitle` and `recorded/total`; one-offs as `mode · date`.
- [ ] Local banner unchanged.
- [ ] CSS: Warm Cotton, glass-panel, existing form controls. Player in Task 14.

Commit: `Add a Podcast rail to commission one-offs and series.`

---

### Task 14: Cue player

**Files:**
- Create: `src/podcast/player.ts`
- Test: `src/podcast/player.test.ts`
- Modify: `src/main.ts`

Player state machine (pure, easy to test):

```ts
export function nextAction(
  state: { playing: boolean; index: number; pendingInterrupt?: string },
  event: "play" | "pause" | "ended" | "interrupt" | "immediate-stop",
  turns: { id: string; kind: string }[],
  sensitivity: "finish-thought" | "immediate",
) { ... }
```

- `ended` advances index; skip `cue` with no audio.
- `interrupt` + finish-thought sets `pendingInterrupt` until `ended`.
- `interrupt` + immediate returns `stop-now`.
- Quiz: if `turns[index].kind === "quiz-prompt"` and event is `ended`, return `wait-answer` (do not auto-advance).

Wire `<audio>` in `main.ts`: on play, `getPodcastAudioUrl` for current turn with `audioKey`; citations are buttons `data-open-page`. Transcript lists all turns. Interrupt textarea + submit.

Commit: `Play podcasts as a cue list so interrupts can splice in.`

---

### Task 15: Interrupt + quiz answer on the kernel

**Files:**
- Modify: `src/podcast/run.ts`
- Test: `src/podcast/run.test.ts`

- Interrupt while `status === "running"` → `{ status: 409 }`.
- Else retrieve restricted to `sourcePageIds` first; if empty hits, retrieve original scope.
- Complete 1–3 `interrupt` turns; ground; speak; splice after `afterTurn`.
- Quiz `answer`: find pending `quiz-prompt` after that turn; complete `model-answer` or short host reaction; splice.

Commit: `Answer mid-episode questions from the episode’s notes, not the open web.`

---

### Task 16: Series next + Worker TTS alarm

**Files:**
- Modify: `worker/src/podcastSession.ts`
- Modify: `src/podcast/run.ts`

- `nextInSeries`: 409 if previous slot not `ready`/`cancelled`; 422 if no remaining slots.
- Load bible + `pickMemories({ seriesId })`; generate that slot.
- Alarm: `speakTurns` in batches of 8 via `env.AI.run("@cf/deepgram/aura-1", { text, voice })` (adjust to the current Workers AI speech API; keep `speak.ts` deps so tests stay fake). When all turns processed, write `memory` (Claude one-liner from transcript, ≤200 words, no new claims) and `status: "ready"`.

Commit: `Continue a series one episode at a time and record audio in the background.`

---

## Self-review vs spec

| Spec | Task |
| --- | --- |
| No upload; archive only | 4, 10 |
| Four modes + dials | 1, 5, 13 |
| Clementine + Ann from git | 3, 5 |
| Cue playlist + interrupt | 14, 15 |
| File transcript/citations/memory | 9, 10, 7 |
| Series plan then episode 1 | 6, 9, 16 |
| Aura TTS two voices | 8, 16 |
| Session proxy, no browser secret | 9, 11, 12 |
| Recap empty-state | 10 |
| Quiz pause | 14, 15 |
| Chicken dial | 1, 5 (prompt payload) |
| R2 not GitHub | 9 |

Ops (not code): enable Workers AI on the account; deploy worker (`npm run research:deploy`) after Task 9+. Same “no casual Netlify deploy” constraint as the rest of the Hub unless Adam cuts a release.
