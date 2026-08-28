# Knowledge Graph Layout — Research Brief

**Purpose:** spec for the Show All / Tags graph. The layout is not the problem. The edge set is.

**Target look:** dense, single connected mass; visible edges everywhere; node size scaled
by connectedness; labels on the important nodes only; colour = detected community, not
category.

**Failure mode this forbids:** ~20 evenly-spaced blobs of hundreds of dots with no edges
inside them. That is a scatter plot of unconnected points pulled toward a per-tag centroid.

---

## 1. Acceptance metrics

| Metric | Target |
|---|---|
| Node count | same as tagged notes |
| Edge count | 15,000–35,000 on a ~4,000-note vault |
| Mean degree | 6–12 |
| Median degree | 5–10 |
| Orphans (degree 0) | 0 |
| Connected components | **1** |
| Largest component % | > 99% |

## 2. Edge sources (merged, never tag cliques)

1. **Explicit links** — `connected` / wikilinks when present on the manifest. Weight 1.0.
2. **Lexical / semantic kNN** — title + excerpt + tags, top-k (8) per note, union-symmetrised.
   Embeddings (`text-embedding-3-small`) are the preferred long-term scorer; the runtime
   uses the same pipeline with a cached lexical stand-in so a 4,000-note vault stays
   offline and incremental. Do not embed raw bodies.
3. **Tags, not cliques** — IDF-weighted shared tags (`1 / log(1 + freq)`). Large tags
   only contribute kNN, never all-pairs.
4. **MST backbone** — maximum spanning tree over scored candidates, force-included.
   This is what makes components = 1 and orphans = 0.
5. **Degree cap ~30** — never drop MST edges.

## 3. Layout

- Seed one cloud, not per-tag islands.
- Gravity toward the centre (`forceX` / `forceY`), not a tag centroid.
- `forceManyBody().distanceMax` of a few hundred px so disconnected leftovers cannot
  fly to opposite corners.
- Colour = Louvain community. Size = `base + k * sqrt(degree)`. Labels = top nodes
  per community, then more on zoom.

## 4. Forbidden

- Tag / category cliques
- Tuning repulsion / pull to fix a connectivity problem
- A single global similarity threshold with no per-node top-k
- Labelling 4,000 nodes
- Running ForceAtlas2 live on every page load as the only layout
