# Knowledge Graph Layout — Show All / Tags

**Purpose:** spec for the Show All / Tags graph.

**Target look:** the twenty closed topic tags are the hubs. Notes sit with their
tag. A note may link to at most **3 other notes**. The overview is geography
(hubs + dots + home spokes). Note–note edges and note titles appear only in a
one-hop neighborhood — click a note to see its connections.

**Failure mode this forbids:** a 15,000-edge similarity hairball with no places
to stand, and dummy MST bridges that join unrelated notes just to make
“1 component” look good.

---

## 1. Acceptance metrics

| Metric | Target |
|---|---|
| Hubs | the closed topic vocabulary present in the vault (≤ 20) |
| Notes | one leaf per tagged note |
| Note-to-note degree | **≤ 3** |
| Note-to-note edge count | ≤ 1.5 × notes |
| Tag cliques | never |
| Forced MST join of leftover components | never |
| Note titles on the canvas | never (hover tooltip only) |

## 2. Edge sources

1. **Spoke** — note → each of its topic hubs. These are the geography.
2. **Note–note** — IDF-weighted shared tags plus lexical kNN, **k = 3**, then a
   hard degree cap of 3. No dummy 0.01 bridges. No all-pairs on a popular tag.

## 3. Layout

- Seed notes around their primary tag hub.
- Colour = that hub’s swatch.
- Size = `base + k * sqrt(note-to-note degree)`.
- Labels = topic hubs on the overview; selected note + its linked notes in the
  neighborhood.
- Overview draws home spokes only. Note–note edges wait for hover or click.

## 4. Forbidden

- Tag / category cliques
- A global “make it one component” MST
- Labelling 4,000 notes on the overview
- Treating “kinda similar” as an unbounded edge set
