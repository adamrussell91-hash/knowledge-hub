import { describe, expect, it } from "vitest";
import { blockedIdsFor, approveProposal, dismissProposal } from "./apply";
import { rankCandidates } from "./candidates";
import { capChanged, parseNameStatus } from "./changedPages";
import { parseJudgements } from "./propose";
import { appendProposals, makeProposal } from "./proposals";
import { DUPLICATE_HOLD, pairKey } from "./schema";
import { excerptLine, runCurator, type CuratorIO } from "./run";
import type { Page } from "../domain/page";

const now = "2026-08-15T00:00:00.000Z";

function page(id: string, extra: Partial<Page> = {}): Page {
  return {
    id,
    title: id,
    area: "notes",
    tags: [],
    body: `Body of ${id}`,
    connected: [],
    attachments: [],
    source_notion_id: id,
    source_notion_url: `https://notion.so/${id}`,
    created_at: now,
    updated_at: now,
    schema_version: 1,
    ...extra,
  };
}

describe("parseNameStatus", () => {
  it("reads added, modified, and deleted page files", () => {
    expect(
      parseNameStatus("A\tpages/page_a.json\nM\tpages/page_b.json\nD\tpages/page_c.json\nM\tmanifest.json\n"),
    ).toEqual([
      { id: "page_a", status: "A" },
      { id: "page_b", status: "M" },
      { id: "page_c", status: "D" },
    ]);
  });
});

describe("capChanged", () => {
  it("caps work notes and keeps deletions separate", () => {
    const { process, deferred, deleted } = capChanged(
      [
        { id: "a", status: "A" },
        { id: "b", status: "M" },
        { id: "c", status: "D" },
      ],
      1,
    );
    expect(process).toEqual([{ id: "a", status: "A" }]);
    expect(deferred).toEqual([{ id: "b", status: "M" }]);
    expect(deleted).toEqual([{ id: "c", status: "D" }]);
  });
});

describe("rankCandidates", () => {
  const source = [1, 0];
  const corpus = [
    { pageId: "self", title: "Self", vector: [1, 0], excerpt: "x" },
    { pageId: "linked", title: "Linked", vector: [0.99, 0.1], excerpt: "x" },
    { pageId: "near", title: "Near", vector: [0.999, 0.001], excerpt: "dup" },
    { pageId: "related", title: "Related", vector: [0.8, 0.6], excerpt: "rel" },
    { pageId: "noise", title: "Noise", vector: [0, 1], excerpt: "n" },
  ];

  it("falls back to lexical ranking when the vector corpus is empty", () => {
    const { linking, heldBack } = rankCandidates({
      sourceId: "duty",
      sourceVector: [],
      corpus: [],
      connected: [],
      skip: new Set(),
      query: "Inherited duty in Irish poetry",
      lexicalDocs: [
        { id: "heaney", title: "Heaney", excerpt: "Inherited duty in the poem" },
        { id: "duty", title: "Duty", excerpt: "Inherited duty" },
        { id: "maths", title: "Fractions", excerpt: "Common denominators" },
      ],
    });
    expect(heldBack).toEqual([]);
    expect(linking.map(hit => hit.pageId)).toEqual(["heaney"]);
  });

  it("drops self, already-linked, and below-floor hits, and holds near-duplicates", () => {
    const { linking, heldBack } = rankCandidates({
      sourceId: "self",
      sourceVector: source,
      corpus,
      connected: ["linked"],
      skip: new Set(),
      floor: 0.2,
    });
    expect(linking.map(hit => hit.pageId)).toEqual(["related"]);
    expect(heldBack[0]?.pageId).toBe("near");
    expect((heldBack[0]?.score ?? 0) >= DUPLICATE_HOLD).toBe(true);
  });
});

describe("proposals", () => {
  it("dedupes unordered pairs when appending", () => {
    const first = makeProposal({
      noteA: "b",
      noteB: "a",
      titleA: "B",
      titleB: "A",
      excerptA: "eb",
      excerptB: "ea",
      relation: "related",
      rationale: "same thread",
      proposedAt: now,
    });
    expect(first.id).toBe(pairKey("a", "b"));
    expect(first.noteA).toBe("a");
    expect(first.titleA).toBe("A");
    const again = makeProposal({
      noteA: "a",
      noteB: "b",
      titleA: "A",
      titleB: "B",
      excerptA: "ea",
      excerptB: "eb",
      relation: "builds-on",
      rationale: "other",
      proposedAt: now,
    });
    expect(appendProposals([first], [again])).toHaveLength(1);
  });
});

describe("parseJudgements", () => {
  it("keeps related candidates and drops unknown ids", () => {
    const judged = parseJudgements(
      `{"proposals":[{"pageId":"keep","related":true,"relation":"contrasts-with","rationale":"foil"},{"pageId":"skip","related":false,"relation":"related","rationale":"no"},{"pageId":"ghost","related":true,"relation":"related","rationale":"x"}]}`,
      new Set(["keep", "skip"]),
    );
    expect(judged).toEqual([{ pageId: "keep", related: true, relation: "contrasts-with", rationale: "foil" }]);
  });

  it("returns nothing for invalid JSON", () => {
    expect(parseJudgements("not json", new Set(["a"]))).toEqual([]);
  });
});

describe("approve and dismiss", () => {
  const proposal = makeProposal({
    noteA: "a",
    noteB: "b",
    titleA: "A",
    titleB: "B",
    excerptA: "ea",
    excerptB: "eb",
    relation: "related",
    rationale: "link",
    proposedAt: now,
  });

  it("writes bidirectional connected and removes the pending item", () => {
    const result = approveProposal([proposal], page("a"), page("b"), proposal.id);
    expect(result?.pageA.connected).toEqual(["b"]);
    expect(result?.pageB.connected).toEqual(["a"]);
    expect(result?.pending).toEqual([]);
  });

  it("records dismissed pairs so they can be skipped later", () => {
    const result = dismissProposal([proposal], [], proposal.id, now);
    expect(result?.pending).toEqual([]);
    expect(result?.dismissed).toEqual([{ noteA: "a", noteB: "b", dismissedAt: now }]);
    expect(blockedIdsFor("a", [], result?.dismissed ?? []).has("b")).toBe(true);
  });
});

describe("runCurator", () => {
  it("proposes judged links, then is a no-op on the same SHA", async () => {
    const pages = new Map([
      ["page_a", page("page_a", { title: "Duty", body: "Inherited duty" })],
      ["page_b", page("page_b", { title: "Heaney", body: "Inherited duty in the poem" })],
    ]);
    let state = { lastProcessedSha: "sha0" };
    let pending: ReturnType<typeof makeProposal>[] = [];
    let dismissed: { noteA: string; noteB: string; dismissedAt: string }[] = [];
    let writes = 0;
    const io: CuratorIO = {
      gitNameStatus: async () => "A\tpages/page_a.json\n",
      headSha: async () => "sha1",
      readState: async () => state,
      writeState: async next => {
        state = next;
        writes += 1;
      },
      readPending: async () => pending,
      writePending: async next => {
        pending = next;
      },
      readDismissed: async () => dismissed,
      writeDismissed: async next => {
        dismissed = next;
      },
      readPage: async id => pages.get(id) ?? null,
      writePage: async next => {
        pages.set(next.id, next);
      },
      listPageIds: async () => [...pages.keys()],
      corpus: [
        { pageId: "page_a", title: "Duty", excerpt: "Inherited duty", vector: [1, 0] },
        { pageId: "page_b", title: "Heaney", excerpt: "Inherited duty in the poem", vector: [0.8, 0.6] },
      ],
      embed: async () => [1, 0],
      judge: async (_note, candidates) =>
        candidates.map(hit => ({
          pageId: hit.pageId,
          related: true,
          relation: "related" as const,
          rationale: "shared duty",
        })),
      now: () => now,
      excerpt: excerptLine,
    };

    const first = await runCurator(io);
    expect(first.proposed).toBe(1);
    expect(pending[0]?.noteA).toBe("page_a");
    expect(pending[0]?.noteB).toBe("page_b");
    expect(state.lastProcessedSha).toBe("sha1");

    const second = await runCurator({ ...io, gitNameStatus: async () => "A\tpages/page_a.json\n" });
    expect(second.processed).toBe(0);
    expect(second.proposed).toBe(0);
    expect(pending).toHaveLength(1);
    expect(writes).toBe(1);
  });

  it("proposes lexical matches when the vector corpus is empty", async () => {
    const pages = new Map([
      ["page_a", page("page_a", { title: "Duty", body: "Inherited duty" })],
      ["page_b", page("page_b", { title: "Heaney", body: "Inherited duty in the poem" })],
    ]);
    let state = { lastProcessedSha: "sha0" };
    let pending: ReturnType<typeof makeProposal>[] = [];
    const io: CuratorIO = {
      gitNameStatus: async () => "A\tpages/page_a.json\n",
      headSha: async () => "sha1",
      readState: async () => state,
      writeState: async next => {
        state = next;
      },
      readPending: async () => pending,
      writePending: async next => {
        pending = next;
      },
      readDismissed: async () => [],
      writeDismissed: async () => undefined,
      readPage: async id => pages.get(id) ?? null,
      writePage: async next => {
        pages.set(next.id, next);
      },
      listPageIds: async () => [...pages.keys()],
      corpus: [],
      lexicalDocs: [
        { id: "page_a", title: "Duty", excerpt: "Inherited duty" },
        { id: "page_b", title: "Heaney", excerpt: "Inherited duty in the poem" },
      ],
      embed: async () => {
        throw new Error("embeddings should not run without a vector corpus");
      },
      judge: async (_note, candidates) =>
        candidates.map(hit => ({
          pageId: hit.pageId,
          related: true,
          relation: "related" as const,
          rationale: "shared duty",
        })),
      now: () => now,
      excerpt: excerptLine,
    };

    const result = await runCurator(io);
    expect(result.proposed).toBe(1);
    expect(pending[0]?.noteB).toBe("page_b");
  });

  it("strips connected references when a page is deleted", async () => {
    const pages = new Map([
      ["keep", page("keep", { connected: ["gone"] })],
      ["gone", page("gone")],
    ]);
    let state = { lastProcessedSha: "sha0" };
    let pending = [
      makeProposal({
        noteA: "keep",
        noteB: "gone",
        titleA: "Keep",
        titleB: "Gone",
        excerptA: "k",
        excerptB: "g",
        relation: "related",
        rationale: "old",
        proposedAt: now,
      }),
    ];
    const io: CuratorIO = {
      gitNameStatus: async () => "D\tpages/gone.json\n",
      headSha: async () => "sha1",
      readState: async () => state,
      writeState: async next => {
        state = next;
      },
      readPending: async () => pending,
      writePending: async next => {
        pending = next;
      },
      readDismissed: async () => [],
      writeDismissed: async () => undefined,
      readPage: async id => pages.get(id) ?? null,
      writePage: async next => {
        pages.set(next.id, next);
      },
      listPageIds: async () => [...pages.keys()].filter(id => id !== "gone"),
      corpus: [],
      embed: async () => [1, 0],
      judge: async () => [],
      now: () => now,
      excerpt: excerptLine,
    };
    await runCurator(io);
    expect(pages.get("keep")?.connected).toEqual([]);
    expect(pending).toEqual([]);
    expect(state.lastProcessedSha).toBe("sha1");
  });
});
