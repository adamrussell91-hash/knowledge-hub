import { optionPickerHtml } from "../ui/optionPicker";
import { normalizeTopicTags } from "./applyTags";
import { TOPIC_VOCABULARY } from "./vocabulary";

export function remainingTopicTags(tags: string[]) {
  const selected = new Set(normalizeTopicTags(tags).map(tag => tag.toLowerCase()));
  return TOPIC_VOCABULARY.filter(tag => !selected.has(tag.toLowerCase()));
}

export function topicTagPickerHtml(tags: string[], query: string, open: boolean) {
  const selected = normalizeTopicTags(tags);
  return optionPickerHtml({
    selected,
    options: [...TOPIC_VOCABULARY],
    query,
    open,
    searchId: "compose-tag-search",
    searchLabel: "Find a tag",
    searchPlaceholder: "Start typing a topic…",
    emptyLabel: "No tags match that.",
    countLabel: `${selected.length} of 3`,
    capHint: "3 of 3 — remove one to change.",
    addLabel: selected.length ? "Add another" : "Add a tag",
    atCap: selected.length >= 3,
    selectedAttr: "data-tag-pill",
    optionAttr: "data-tag-option",
  });
}
