import { pairKey, type DismissedPair, type PendingProposal, type Relation } from "./schema";

export function skipKeys(pending: PendingProposal[], dismissed: DismissedPair[]) {
  return new Set([
    ...pending.map(item => pairKey(item.noteA, item.noteB)),
    ...dismissed.map(item => pairKey(item.noteA, item.noteB)),
  ]);
}

export function appendProposals(
  existing: PendingProposal[],
  incoming: PendingProposal[],
): PendingProposal[] {
  const seen = new Set(existing.map(item => pairKey(item.noteA, item.noteB)));
  const next = [...existing];
  for (const item of incoming) {
    const key = pairKey(item.noteA, item.noteB);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

export function dropPairsMentioning(proposals: PendingProposal[], pageId: string) {
  return proposals.filter(item => item.noteA !== pageId && item.noteB !== pageId);
}

export function dropDismissedMentioning(dismissed: DismissedPair[], pageId: string) {
  return dismissed.filter(item => item.noteA !== pageId && item.noteB !== pageId);
}

export function linkBoth(a: string[] | undefined, b: string[] | undefined, idA: string, idB: string) {
  return {
    a: [...new Set([...(a ?? []).filter(id => id !== idB), idB])],
    b: [...new Set([...(b ?? []).filter(id => id !== idA), idA])],
  };
}

export function stripConnected(ids: string[] | undefined, deletedId: string) {
  return (ids ?? []).filter(id => id !== deletedId);
}

export function makeProposal(input: {
  noteA: string;
  noteB: string;
  titleA: string;
  titleB: string;
  excerptA: string;
  excerptB: string;
  relation: Relation;
  rationale: string;
  proposedAt: string;
}): PendingProposal {
  const [noteA, noteB] = input.noteA < input.noteB ? [input.noteA, input.noteB] : [input.noteB, input.noteA];
  const swapped = noteA !== input.noteA;
  return {
    id: pairKey(input.noteA, input.noteB),
    noteA,
    noteB,
    titleA: swapped ? input.titleB : input.titleA,
    titleB: swapped ? input.titleA : input.titleB,
    excerptA: swapped ? input.excerptB : input.excerptA,
    excerptB: swapped ? input.excerptA : input.excerptB,
    relation: input.relation,
    rationale: input.rationale,
    proposedAt: input.proposedAt,
  };
}
