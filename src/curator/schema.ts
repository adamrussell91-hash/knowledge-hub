import { z } from "zod";

export const RELATIONS = ["related", "builds-on", "contrasts-with"] as const;
export type Relation = (typeof RELATIONS)[number];

export const CANDIDATE_CAP = 15;
export const RUN_CAP = 50;
export const LINK_FLOOR = 0.35;
export const DUPLICATE_HOLD = 0.92;

export const CuratorStateSchema = z.object({
  lastProcessedSha: z.string(),
});
export type CuratorState = z.infer<typeof CuratorStateSchema>;

export const PendingProposalSchema = z.object({
  id: z.string(),
  noteA: z.string(),
  noteB: z.string(),
  titleA: z.string(),
  titleB: z.string(),
  excerptA: z.string(),
  excerptB: z.string(),
  relation: z.enum(RELATIONS),
  rationale: z.string(),
  proposedAt: z.string(),
});
export type PendingProposal = z.infer<typeof PendingProposalSchema>;

export const DismissedPairSchema = z.object({
  noteA: z.string(),
  noteB: z.string(),
  dismissedAt: z.string(),
});
export type DismissedPair = z.infer<typeof DismissedPairSchema>;

export function pairKey(a: string, b: string) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

export function proposalId(a: string, b: string) {
  return pairKey(a, b);
}
