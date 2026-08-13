import type { IndexEntry } from "../../../scripts/build-index";
function cosine(a: number[], b: number[]) { const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0); const magnitude = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)); const divisor = magnitude(a) * magnitude(b); return divisor ? dot / divisor : 0; }
export function topKBySimilarity(entries: IndexEntry[], vector: number[], k: number) { return [...entries].sort((a, b) => cosine(b.vector, vector) - cosine(a.vector, vector)).slice(0, k); }
