import type { Page } from "../domain/page";
import type { LexicalDoc } from "../lib/lexicalRetrieve";
import { blockedIdsFor } from "./apply";
import { rankCandidates, type VectorHit } from "./candidates";
import { capChanged, parseNameStatus } from "./changedPages";
import { parseJudgements, type JudgedLink } from "./propose";
import {
  appendProposals,
  dropDismissedMentioning,
  dropPairsMentioning,
  makeProposal,
  stripConnected,
} from "./proposals";
import { CuratorStateSchema, type DismissedPair, type PendingProposal } from "./schema";

export type CorpusEntry = {
  pageId: string;
  title: string;
  excerpt: string;
  vector: ArrayLike<number>;
};

export type CuratorIO = {
  gitNameStatus: (fromSha: string) => Promise<string>;
  headSha: () => Promise<string>;
  readState: () => Promise<unknown>;
  writeState: (state: { lastProcessedSha: string }) => Promise<void>;
  readPending: () => Promise<PendingProposal[]>;
  writePending: (pending: PendingProposal[]) => Promise<void>;
  readDismissed: () => Promise<DismissedPair[]>;
  writeDismissed: (dismissed: DismissedPair[]) => Promise<void>;
  readPage: (id: string) => Promise<Page | null>;
  writePage: (page: Page) => Promise<void>;
  listPageIds: () => Promise<string[]>;
  corpus: CorpusEntry[];
  lexicalDocs?: LexicalDoc[];
  embed: (text: string) => Promise<number[]>;
  judge: (note: Page, candidates: VectorHit[]) => Promise<JudgedLink[]>;
  now: () => string;
  excerpt: (body: string) => string;
};

export function excerptLine(body: string) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 157);
}

/** git's empty tree — first curator run diffs the whole tree, then RUN_CAP slices it. */
export const GIT_EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export async function runCurator(io: CuratorIO) {
  const parsed = CuratorStateSchema.safeParse(await io.readState());
  if (!parsed.success) throw new Error("curator state missing lastProcessedSha");
  const fromSha = parsed.data.lastProcessedSha;
  const head = await io.headSha();
  if (fromSha === head) {
    return { processed: 0, proposed: 0, heldBack: 0 };
  }

  const { process, deleted } = capChanged(parseNameStatus(await io.gitNameStatus(fromSha)));
  let pending = await io.readPending();
  let dismissed = await io.readDismissed();
  let proposed = 0;
  let heldBack = 0;

  for (const gone of deleted) {
    pending = dropPairsMentioning(pending, gone.id);
    dismissed = dropDismissedMentioning(dismissed, gone.id);
    const ids = await io.listPageIds();
    for (const id of ids) {
      const page = await io.readPage(id);
      if (!(page?.connected ?? []).includes(gone.id)) continue;
      await io.writePage({ ...page, connected: stripConnected(page.connected, gone.id) });
    }
  }

  const incoming: PendingProposal[] = [];
  for (const change of process) {
    const page = await io.readPage(change.id);
    if (!page) continue;
    const query = `${page.title}\n\n${io.excerpt(page.body)}`;
    const useLexical = !io.corpus.some(entry => entry.vector.length);
    const vector = useLexical ? [] : await io.embed(query);
    const skip = blockedIdsFor(page.id, pending, dismissed);
    for (const item of incoming) {
      if (item.noteA === page.id) skip.add(item.noteB);
      if (item.noteB === page.id) skip.add(item.noteA);
    }
    const { linking, heldBack: held } = rankCandidates({
      sourceId: page.id,
      sourceVector: vector,
      corpus: io.corpus,
      connected: page.connected ?? [],
      skip,
      query,
      lexicalDocs: io.lexicalDocs,
    });
    heldBack += held.length;
    const judgements = await io.judge(page, linking);
    const byId = new Map(linking.map(hit => [hit.pageId, hit]));
    for (const judgement of judgements) {
      const hit = byId.get(judgement.pageId);
      if (!hit) continue;
      incoming.push(
        makeProposal({
          noteA: page.id,
          noteB: hit.pageId,
          titleA: page.title,
          titleB: hit.title,
          excerptA: io.excerpt(page.body),
          excerptB: hit.excerpt || io.excerpt(""),
          relation: judgement.relation,
          rationale: judgement.rationale,
          proposedAt: io.now(),
        }),
      );
    }
  }

  const nextPending = appendProposals(pending, incoming);
  proposed = nextPending.length - pending.length;
  await io.writePending(nextPending);
  await io.writeDismissed(dismissed);
  await io.writeState({ lastProcessedSha: head });
  return { processed: process.length, proposed, heldBack };
}

export { parseJudgements };
