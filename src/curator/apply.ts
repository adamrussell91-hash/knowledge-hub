import type { Page } from "../domain/page";
import { linkBoth, skipKeys } from "./proposals";
import { pairKey, type DismissedPair, type PendingProposal } from "./schema";

export function approveProposal(
  pending: PendingProposal[],
  pageA: Page,
  pageB: Page,
  id: string,
): { pending: PendingProposal[]; pageA: Page; pageB: Page } | null {
  const item = pending.find(row => row.id === id);
  if (!item) return null;
  if (
    !(
      (pageA.id === item.noteA && pageB.id === item.noteB) ||
      (pageA.id === item.noteB && pageB.id === item.noteA)
    )
  ) {
    return null;
  }
  const linked = linkBoth(pageA.connected, pageB.connected, item.noteA, item.noteB);
  const aConnected = pageA.id === item.noteA ? linked.a : linked.b;
  const bConnected = pageB.id === item.noteB ? linked.b : linked.a;
  return {
    pending: pending.filter(row => row.id !== id),
    pageA: { ...pageA, connected: aConnected },
    pageB: { ...pageB, connected: bConnected },
  };
}

export function dismissProposal(
  pending: PendingProposal[],
  dismissed: DismissedPair[],
  id: string,
  dismissedAt: string,
): { pending: PendingProposal[]; dismissed: DismissedPair[] } | null {
  const item = pending.find(row => row.id === id);
  if (!item) return null;
  const nextDismissed = dismissed.some(row => pairKey(row.noteA, row.noteB) === pairKey(item.noteA, item.noteB))
    ? dismissed
    : [...dismissed, { noteA: item.noteA, noteB: item.noteB, dismissedAt }];
  return {
    pending: pending.filter(row => row.id !== id),
    dismissed: nextDismissed,
  };
}

export function blockedIdsFor(sourceId: string, pending: PendingProposal[], dismissed: DismissedPair[]) {
  const keys = skipKeys(pending, dismissed);
  const ids = new Set<string>();
  for (const key of keys) {
    const [left, right] = key.split("||");
    if (left === sourceId && right) ids.add(right);
    if (right === sourceId && left) ids.add(left);
  }
  return ids;
}
