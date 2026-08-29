# Show All tags graph — connectivity metrics

Measured with `npx tsx scripts/graph-metrics.ts` against `knowledge-hub-data/manifest.json`.

## After (topic hubs, note degree ≤ 3)

| Metric | Value |
|---|---|
| Topic hubs | 20 |
| Notes | 4240 |
| Note-to-note links | 5051 |
| Max note-to-note degree | 3 |
| Mean note-to-note degree | 2.38 |
| Spokes (note → tag) | 9787 |
| Build time | ~0.6s |

The 20 closed topic tags are the geography. A note may link to at most three other notes.
The overview hides those note–note edges until a note is hovered or selected.
