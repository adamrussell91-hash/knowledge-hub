# Show All tags graph — connectivity metrics

Measured with `npx tsx scripts/graph-metrics.ts` against `knowledge-hub-data/manifest.json`.

## Baseline (old tags view)

The previous builder capped overlap edges at 800 and pulled every note toward a
per-tag centroid. On this vault that produced the screenshot blobs:

| Metric | Value |
|---|---|
| Node count | ~4240 tagged notes, no hubs |
| Edge count | ≤ 800 |
| Mean degree | < 0.4 |
| Median degree | 0 |
| Orphans | ~4000 |
| Connected components | hundreds of isolated notes plus a few fragments |
| Largest component % | tiny |

## After (this change)

| Metric | Value | Target |
|---|---|---|
| Node count | 4240 | same |
| Edge count | 15495 | 12,000–25,000 |
| Mean degree | 7.31 | 6–12 |
| Median degree | 7 | 5–10 |
| Orphans | 0 | 0 |
| Connected components | 1 | 1 |
| Largest component % | 100 | > 99 |
| Build time | 0.85s | interactive-enough |

Degree histogram is a long tail: most notes sit at 5–9 neighbours. The canvas then draws a zoom-budgeted subset (about 2,200 edges when zoomed out) as batched straight lines, with no note-name labels.
