export type ChatHatId =
  | "scoping"
  | "synthesis"
  | "evidence"
  | "contested"
  | "internalExternal"
  | "methods"
  | "writing";

export type ChatScope = "narrow" | "standard" | "wide";
export type ChatDepth = "single" | "verified" | "iterative" | "exhaustive";
export type KernelPath = "quick" | "deep";

export type ChatHat = {
  id: ChatHatId;
  label: string;
  plan: string;
  defaultScope: ChatScope;
  defaultDepth: ChatDepth;
};

export const SCOPES: ChatScope[] = ["narrow", "standard", "wide"];
export const DEPTHS: ChatDepth[] = ["single", "verified", "iterative", "exhaustive"];

export const CHAT_HATS: ChatHat[] = [
  {
    id: "scoping",
    label: "Scoping",
    defaultScope: "wide",
    defaultDepth: "single",
    plan: "Wide sweep, few bodies. Clusters + counts + one exemplar each + gaps. Cheap map, not an essay.",
  },
  {
    id: "synthesis",
    label: "Thematic synthesis",
    defaultScope: "standard",
    defaultDepth: "single",
    plan: "Retrieve, read top bodies, write a structured brief. Every claim carries an archive page id. Never invent a page.",
  },
  {
    id: "evidence",
    label: "Evidence check",
    defaultScope: "narrow",
    defaultDepth: "verified",
    plan: "Take the claim. Search paraphrase, key entity, and negation. Classify supports / contradicts / silent. Verdict with contradictions first.",
  },
  {
    id: "contested",
    label: "Contested ground",
    defaultScope: "narrow",
    defaultDepth: "verified",
    plan: "Negation is first-class. Return disagreement pairs, sorted by how hard they clash, not by relevance.",
  },
  {
    id: "internalExternal",
    label: "Internal-then-external",
    defaultScope: "standard",
    defaultDepth: "single",
    plan: "Internal archive first plus an honest coverage read. If thin, say so. Do not search the web unless the user clicked Search outside. External hits never look like archive citations.",
  },
  {
    id: "methods",
    label: "Methods",
    defaultScope: "narrow",
    defaultDepth: "single",
    plan: "Filter to methods-tagged notes first, then search only inside that set. A methods question cannot be answered from a content note.",
  },
  {
    id: "writing",
    label: "Writing",
    defaultScope: "standard",
    defaultDepth: "single",
    plan: "University writing-coach conversation. Thesis and draft if present. Protocols in prose (reverse outline, stress test, editors). You may pull the archive; do not silently become Synthesis.",
  },
];

export function hatById(id: ChatHatId): ChatHat {
  const hat = CHAT_HATS.find(item => item.id === id);
  if (!hat) throw new Error(`Unknown chat hat: ${id}`);
  return hat;
}

export function isChatHatId(value: string): value is ChatHatId {
  return CHAT_HATS.some(hat => hat.id === value);
}

function kernelFor(depth: ChatDepth): KernelPath {
  return depth === "iterative" || depth === "exhaustive" ? "deep" : "quick";
}

export function resolveChatPlan(
  hatId: ChatHatId,
  overrides: { scope?: ChatScope; depth?: ChatDepth } = {},
) {
  const hat = hatById(hatId);
  const scope = overrides.scope ?? hat.defaultScope;
  const depth = overrides.depth ?? hat.defaultDepth;
  return { hat, scope, depth, kernel: kernelFor(depth) };
}
