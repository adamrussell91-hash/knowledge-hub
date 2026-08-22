import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "./vocabulary";
import { remainingTopicTags, topicTagPickerHtml } from "./tagPicker";

describe("topic tag picker", () => {
  it("does not dump the closed list onto the form when closed", () => {
    const html = topicTagPickerHtml([], "", false);
    expect(html).toContain("Add a tag");
    expect(html).not.toContain("data-tag-option");
    expect(html).not.toContain("data-picker-list");
    expect(html).not.toContain(TOPIC_VOCABULARY[0]);
  });

  it("shows only remaining tags in the open catalog", () => {
    const html = topicTagPickerHtml([TOPIC_VOCABULARY[0]!], "", true);
    expect(html).toContain(TOPIC_VOCABULARY[0]);
    expect(html).toContain("data-tag-pill");
    expect(html).toContain(TOPIC_VOCABULARY[1]);
    expect(html.match(/data-tag-option/g)?.length).toBe(TOPIC_VOCABULARY.length - 1);
  });

  it("keeps only unused vocabulary entries for the catalog", () => {
    expect(remainingTopicTags([TOPIC_VOCABULARY[0]!])).toEqual([...TOPIC_VOCABULARY.slice(1)]);
  });
});
