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
| Edge count | 24720 | 15,000–35,000 |
| Mean degree | 11.66 | 6–12 |
| Median degree | 10 | 5–10 |
| Orphans | 0 | 0 |
| Connected components | 1 | 1 |
| Largest component % | 100 | > 99 |
| Build time | 6.8s | interactive-enough |

Degree histogram is a long tail: most notes sit at 8–12 neighbours, with 313 nodes at 20+.
