# Organic Show All Graph Design

## Goal

Redesign the archive’s Show All graph as an organic, clustered knowledge map inspired by the supplied reference while retaining the Knowledge Hub’s light visual system and existing interactions.

## Scope

This change affects only Show All layout and settling behavior. It does not add a brain silhouette, dark or neon styling, structural-role labels, a legend, or new graph analysis concepts.

## Layout

Major topic hubs are fixed cluster anchors distributed around a loose, deterministic ring. Anchor distance scales with each cluster’s note population so adjacent clusters have enough room for their note clouds and do not overlap.

Each note is seeded near its primary hub. Strong local attraction keeps notes within that hub’s cluster, while collision forces create irregular, readable clouds instead of concentric circles.

Minor-topic nodes remain associated with their owning major hub and settle within the same local cluster.

## Connection Balance

Primary hub-to-note spokes provide local cohesion. Cross-note overlap links remain visible as bridges, but use weaker force strength and longer target distance so they cannot pull separate clusters into one mass.

Overlap links remain capped at the existing maximum and retain subdued rendering. The node and cluster structure must remain visually dominant over connections.

Major hubs remain fixed at anchor positions whose spacing includes the estimated cluster footprints. Adaptive spoke lengths keep busier note clouds wider, while local target forces and weak overlaps keep each cloud near its own anchor. Node-level collision prevents individual hubs and notes from covering one another.

## Motion

Show All begins from deterministic seeded positions, runs a short force simulation, then freezes every node at its settled position. This produces an organic layout without ongoing drift.

The same archive data produces the same initial seeds and effectively stable final placement. Existing pan, zoom, hover, search, note selection, and preview behavior remain unchanged.

## Performance and Fallbacks

The simulation runs only for Show All and only during initial settling. It stops after a fixed tick budget rather than waiting indefinitely for alpha decay. Empty archives and clusters with one note remain valid.

The existing overlap-edge cap bounds link-force work. No archive data or layout state is persisted locally.

## Testing

Unit tests verify:

- major anchors are sufficiently separated;
- larger clusters receive more anchor clearance and wider local spokes;
- notes seed near their primary hub without occupying identical coordinates;
- overlap links are weaker and longer than local spokes;
- a dense cross-linked multi-hub simulation remains separated and locks every node after the tick budget;
- existing search, hover, click, zoom, and graph-mode behavior remain passing.
