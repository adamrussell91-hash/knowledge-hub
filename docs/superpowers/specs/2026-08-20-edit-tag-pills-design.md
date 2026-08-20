# Edit-mode topic tags as selectable pills

## Goal

In Knowledge Hub edit (and new-note) mode, topic tags are chosen from the closed 20-tag vocabulary as toggle pills — grey off, navy on — not typed as free text. Notes stay consistent with Tidy.

## Decisions

- Closed list only. No text field. No way to add a tag that is not in `TOPIC_VOCABULARY`.
- At most three topic tags. A fourth tap does nothing; remaining pills stay grey.
- All 20 tags are always visible as pills (not a dropdown, not a selected-only row).
- Structural tags (`Note`, unit codes, other non-topic tags) stay on the note and are never shown as pills.
- Selected pills share one colour (navy). This is on/off, not a per-tag rainbow.

## Interaction

Edit/new note replaces `#compose-tags` (comma-separated `<input>`) with a fieldset of 20 `<button type="button">` pills, one per `TOPIC_VOCABULARY` entry, in list order.

- Label: **Tags**. Quiet hint: “Up to 3.”
- Grey pill: not selected. Navy pill: selected. `aria-pressed` matches state.
- Tap grey → select if fewer than three topic tags are on. Tap navy → clear.
- Fourth tap: no-op. No toast.
- Focus: Wave `:focus-visible`, same as other hub controls.

Opening a note maps existing tags onto the closed list (case-insensitive via `canonicalTopicTag`). Unknown topic tags are not selected and are dropped on save.

## Visual

Hub tokens only. No new CSS variables. Hub-only class in `src/style.css` (e.g. `.tag-pill`).

| State | Tokens |
| --- | --- |
| Off | `--shallow` fill, `--navy` text |
| On | `--navy` fill, `--on-dark` text |
| Shape | `border-radius: 999px` (pill) |
| Type | Inter, existing `--text-sm` / `--weight-medium` |
| Focus | Wave ring |

Do not copy quiz `.understand__pill` hex colours. Do not use High Sea for selected tags.

## Data and save

Compose keeps the note’s full tag list. Pills only toggle topic tags through existing Tidy helpers.

- `toggleTopicTag(existing, tapped)` lives next to `applyTopicTags` in `src/tidy/applyTags.ts`.
  - If `tapped` is already a selected topic tag, remove it (structural unchanged).
  - If fewer than three topic tags are selected, add it via `applyTopicTags`.
  - If three are already selected and `tapped` is new, return `existing` unchanged.
- Save writes `applyTopicTags(existing, selectedTopics)`: structural tags unchanged, unknown topics dropped, at most three topics, case folded onto the closed list.
- The compose form no longer uses `parseTagList` or a comma-separated string for tags. `ComposeState.tags` is the full `string[]`. `parseTagList` may remain for other callers.

New notes start with no topic tags. Structural tags are not invented.

## Tests

Unit tests on `toggleTopicTag` (and save still going through `applyTopicTags`):

- Select a closed-list tag → applied; structural tags stay.
- Clear a selected tag → removed.
- A fourth topic tag is ignored; the first three stay.
- Unknown / typo tags are dropped; case folds onto the closed list.

Do not add click tests in `main.ts`.

## Out of scope

- Reader view chips (stay as they are).
- Podcast / quiz tag checkboxes.
- Adding or renaming vocabulary entries.
- Graph colours, Tidy behaviour, other hubs.

## Files

- `src/tidy/applyTags.ts` — `toggleTopicTag`
- `src/tidy/applyTags.test.ts` — cases above
- `src/tidy/vocabulary.ts` — read-only source of the 20 pills
- `src/main.ts` — compose field + state + save
- `src/style.css` — `.tag-pill` using kit tokens
