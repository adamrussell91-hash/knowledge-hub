# Clementine Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Professor Clementine Haig the speaking voice of Knowledge Hub (Alchemist, research briefs, and a new writing-coach rail) without putting the research kernel secret in the browser.

**Architecture:** Identity lives in `prompts/clementine-*.md`. A pure assembler concatenates voice + job + surface + payload. Worker synthesis and the Alchemist function prepend that pack. A session-authenticated Netlify coach function talks to Anthropic and, server-side, to the research Worker.

**Tech Stack:** TypeScript, Vitest, Netlify Functions, existing Anthropic + kernel HTTP, Vite Pages app.

**Scope:** Sitting 1 of `docs/superpowers/specs/2026-08-14-clementine-voice-design.md`. Out of scope: thesis log persistence, Teaching Hub repo, pointing Alchemist at `/quick_research`.

---

## File structure

- Create: `prompts/clementine-voice.md` — identity (Overview, Who You Are, Adam's Academic Context, Voice Checklist). No Central Node, no University Reading Protocol, no Notion-database search.
- Create: `prompts/clementine-university.md` — Knowledge Hub job + diagnostic protocols (prompt-only).
- Create: `prompts/clementine-school.md` — Teaching Hub export; not wired in this repo’s UI.
- Create: `src/clementine/assemble.ts` — `assembleClementinePrompt`; throws if voice/job empty.
- Create: `src/clementine/assemble.test.ts`
- Create: `src/clementine/loadFromDisk.ts` — Node `fs` loader for Netlify; throws if file missing/blank.
- Create: `src/clementine/pack.ts` — Vite/Wrangler text imports of the markdown files (Worker bundle).
- Create: `netlify/functions/clementine-coach.ts` + `clementine-coach.test.ts`
- Create: `netlify/handlers/clementine-coach.ts`
- Modify: `src/research/synthesize.ts` — prepend voice + university + JSON-only surface.
- Modify: `netlify/functions/lesson-alchemist.ts` — prepend voice + university + Alchemist surface.
- Modify: `src/api/client.ts`, `src/main.ts`, `src/style.css`, `netlify.toml`, `.env.example`, `vite.config.ts`, `worker/wrangler.jsonc`.

---

### Task 1: Voice pack + assembler

**Files:**
- Create: `prompts/clementine-voice.md`
- Create: `prompts/clementine-university.md`
- Create: `prompts/clementine-school.md`
- Create: `src/clementine/assemble.ts`
- Test: `src/clementine/assemble.test.ts`

- [ ] **Step 1: Write the failing assembler test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleClementinePrompt } from "./assemble";

const prompt = (name: string) => readFileSync(join(process.cwd(), "prompts", name), "utf8");

describe("assembleClementinePrompt", () => {
  it("locks voice phrases and excludes Notion-only duties", () => {
    const assembled = assembleClementinePrompt({
      voice: prompt("clementine-voice.md"),
      job: prompt("clementine-university.md"),
      surface: "You are filing a research brief. Return JSON only.",
      payload: "Query: stoicism",
    });
    expect(assembled).toContain("Professor Clementine Haig");
    expect(assembled).toContain("diagnose before she prescribes");
    expect(assembled).toContain("UNSW Master of Education");
    expect(assembled).toContain("APA 7th");
    expect(assembled).toContain("Reverse Outline");
    expect(assembled).toContain("Return JSON only");
    expect(assembled).not.toMatch(/Central Node/i);
    expect(assembled).not.toMatch(/University Reading Protocol/i);
    expect(assembled).not.toMatch(/search the Knowledge Hub Notion/i);
  });

  it("throws when the voice file is missing", () => {
    expect(() =>
      assembleClementinePrompt({ voice: "", job: "job", surface: "s", payload: "p" }),
    ).toThrow(/clementine-voice\.md/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clementine/assemble.test.ts`
Expected: FAIL (module or prompt files missing)

- [ ] **Step 3: Write markdown + assembler**

`assembleClementinePrompt` concatenates `voice + job + surface + payload` with blank lines. Empty `voice` or `job` throws `Prompt file missing: <name>`. Copy identity from Notion page `61303a0b-73a4-48a7-bad6-0c121a488ce8` (sections listed in the spec only).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clementine/assemble.test.ts`
Expected: PASS

---

### Task 2: Bundle prompts for Worker + Netlify disk load

**Files:**
- Create: `src/clementine/pack.ts`
- Create: `src/clementine/loadFromDisk.ts`
- Create: `src/clementine/loadFromDisk.test.ts`
- Modify: `vite.config.ts` — markdown-as-string plugin
- Modify: `worker/wrangler.jsonc` — Text rule for `**/*.md`
- Modify: `netlify.toml` — `included_files` for prompts

- [ ] **Step 1: Failing test for disk loader**

```ts
import { describe, expect, it } from "vitest";
import { loadPromptFile } from "./loadFromDisk";

it("loads clementine-voice.md from prompts/", () => {
  expect(loadPromptFile("clementine-voice.md")).toContain("Professor Clementine Haig");
});

it("throws when the file is absent", () => {
  expect(() => loadPromptFile("clementine-missing.md")).toThrow(/clementine-missing\.md/);
});
```

- [ ] **Step 2: Implement `loadPromptFile` via `readFileSync(join(process.cwd(), "prompts", name))`.** `pack.ts` default-imports the three markdown files so Wrangler/Vite inline them for `synthesize.ts`.

- [ ] **Step 3: Pass tests**

Run: `npx vitest run src/clementine/loadFromDisk.test.ts`

---

### Task 3: Synthesis prompt uses Clementine

**Files:**
- Modify: `src/research/synthesize.ts`
- Modify: `src/research/synthesize.test.ts`

- [ ] **Step 1: Extend tests**

```ts
it("speaks as Clementine and still demands JSON only", () => {
  const prompt = buildSynthesisPrompt({
    query: "Is CBT stoic?",
    sources: [{ pageId: "p1", title: "Notes", excerpt: "Epictetus" }],
  });
  expect(prompt).toContain("Professor Clementine Haig");
  expect(prompt).toContain("Return only JSON");
  expect(prompt).toContain("research assistant"); // must NOT — fail then remove generic wording
});
```

The last assertion should be `expect(prompt).not.toContain("research assistant")` after the implementation. First watch the existing generic wording fail the Clementine assertion.

- [ ] **Step 2: `buildSynthesisPrompt` calls `assembleClementinePrompt` with `CLEMENTINE_VOICE`, `CLEMENTINE_UNIVERSITY`, surface “you are filing a research brief, return JSON only; do not break JSON to make a joke”, then the existing query/sources/schema block.** Missing pack throws (no silent generic fallback).

- [ ] **Step 3: Pass `npx vitest run src/research/synthesize.test.ts`**

---

### Task 4: Alchemist prompt uses Clementine

**Files:**
- Modify: `netlify/functions/lesson-alchemist.ts`
- Modify: `netlify/functions/lesson-alchemist.test.ts`

- [ ] **Step 1: Assert `buildAlchemistPrompt` contains `Professor Clementine Haig` and Icons of Depth and Complexity; JSON array shape unchanged.

- [ ] **Step 2: Load voice+university from disk (Netlify cwd). Surface: school–university bridge; she writes `summary` and `whyNonObvious` in her voice; return JSON array only.

- [ ] **Step 3: Pass `npx vitest run netlify/functions/lesson-alchemist.test.ts`**

---

### Task 5: Coach turn (pure) + Netlify handler

**Files:**
- Create: `src/clementine/coachTurn.ts`
- Create: `src/clementine/coachTurn.test.ts`
- Create: `netlify/functions/clementine-coach.ts`
- Create: `netlify/functions/clementine-coach.test.ts`
- Create: `netlify/handlers/clementine-coach.ts`
- Modify: `netlify.toml` redirect `/api/clementine-coach`
- Modify: `.env.example` — `RESEARCH_KERNEL_URL`

- [ ] **Step 1: Failing tests for `runCoachTurn`**

Behaviours:
1. Completer is called with assembled voice + university + chat history + working thesis.
2. Kernel `fetchImpl` is invoked with `x-research-kernel-secret` and `{ query, documentContext }`.
3. Returned JSON to the caller is `{ reply, research }` and must not contain the secret string.
4. Kernel 502: still returns a reply; `archiveFailed: true`; reply instructed to say the archive pull failed in character.
5. Empty findings: surface tells her the archive did not give anything usable (gaps), not “no results found.”
6. Empty voice throws before any fetch.

No live Anthropic: inject `complete` and `fetchImpl`.

- [ ] **Step 2: Implement `runCoachTurn`.** Each turn: optional `/quick_research` with `query` = latest user message and `documentContext` = working thesis / draft excerpt. Then `complete(system, messages)`.

- [ ] **Step 3: Handler uses `requireSession`, reads `ANTHROPIC_API_KEY`, `RESEARCH_KERNEL_SHARED_SECRET`, `RESEARCH_KERNEL_URL` (default `https://knowledge-hub-research.adamrussell91.workers.dev`). Handler test: cookie session; secret in env; parsed body has no secret.

- [ ] **Step 4: Pass coach tests**

---

### Task 6: Coach rail UI

**Files:**
- Modify: `src/api/client.ts` — `runCoach`, types
- Modify: `src/api/client.test.ts` — POST `/clementine-coach` with credentials; body has no kernel secret
- Modify: `src/main.ts` — new rail view `coach`
- Modify: `src/style.css` — chat thread, draft box, thesis field, citation cards under messages

- [ ] **Step 1: Client test for `runCoach` posting `{ messages, workingThesis, draft }` to `/clementine-coach`.

- [ ] **Step 2: Rail labelled for Clementine (university office). Chat thread, paste/draft, optional working thesis. Findings render as citation cards (existing alchemist-card pattern), opening the archive page. Local preview: still POST the API (needs Netlify); surface a clear error if the function is down. Do not call the Worker from the browser.

- [ ] **Step 3: `npx vitest run src/api/client.test.ts src/clementine netlify/functions/clementine-coach.test.ts`

---

### Task 7: Full unit verification

- [ ] Run: `npm test`
- [ ] Confirm assembler, synthesis, alchemist, coach, client tests pass.
- [ ] Do not commit unless Adam asks.

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Voice / university / school markdown | 1 |
| Assembler + locked phrases / no Notion duties | 1 |
| Git not live Notion | 1 |
| Synthesis voice + JSON | 3 |
| Alchemist voice, connection JSON unchanged | 4 |
| Coach rail + session function + kernel server-side | 5–6 |
| Secret never in client JSON | 5–6 |
| Kernel failure / empty retrieval in character | 5 |
| Missing prompts fail the request | 1, 3, 5 |
| Thesis as documentContext, in-memory in the rail | 5–6 |
| Protocols prompt-only | 1 (university md) |
| Teaching Hub / thesis log | out of sitting 1 |
