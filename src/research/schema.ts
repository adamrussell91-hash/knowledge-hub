import { z } from "zod";

export const StanceSchema = z.enum(["supports", "complicates", "extends", "related"]);
export type Stance = z.infer<typeof StanceSchema>;

export const SourceTypeSchema = z.enum(["empirical", "conceptual", "review", "methods", "practice", "unknown"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const ClaimRelationshipSchema = z.enum(["direct", "indirect", "interpretive"]);
export type ClaimRelationship = z.infer<typeof ClaimRelationshipSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ResearchStatusSchema = z.enum(["running", "done", "error", "cancelled"]);
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;

export const ResearchFindingSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  sourceUrl: z.string(),
  excerpt: z.string(),
  stance: StanceSchema,
  analysis: z.string(),
  sourceType: SourceTypeSchema.optional().catch(undefined),
  population: z.string().optional(),
  method: z.string().optional(),
  keyFinding: z.string().optional(),
  claimRelationship: ClaimRelationshipSchema.optional().catch(undefined),
  confidence: ConfidenceSchema.optional().catch(undefined),
  limitation: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

export const ResearchResultSchema = z.object({
  query: z.string(),
  round: z.number().int().nonnegative(),
  status: ResearchStatusSchema,
  findings: z.array(ResearchFindingSchema),
  gaps: z.array(z.string()),
  followUpQueries: z.array(z.string()),
  error: z.string().optional(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

export function toResearchResult(input: ResearchResult): ResearchResult {
  return ResearchResultSchema.parse(input);
}
