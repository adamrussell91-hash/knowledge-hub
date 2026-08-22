import { describe, expect, it } from "vitest";
import { plainExcerpt, stripMarkdownForExcerpt } from "./plainExcerpt";

describe("stripMarkdownForExcerpt", () => {
  it("strips bold markers and list dashes from a stored Nexus excerpt", () => {
    expect(
      stripMarkdownForExcerpt(
        "**Religious Texts and Early Christianity** **Jewish and Christian Texts** - **Mishnah and Talmud**: Jewish legal codes. - Early Christianity ...",
      ),
    ).toBe(
      "Religious Texts and Early Christianity Jewish and Christian Texts Mishnah and Talmud: Jewish legal codes. Early Christianity ...",
    );
  });

  it("strips a leading list dash after the excerpt has already been collapsed", () => {
    expect(
      stripMarkdownForExcerpt(
        "- Key Idea: - Much of human interaction involves trying to figure out what others are thinking",
      ),
    ).toBe("Key Idea: Much of human interaction involves trying to figure out what others are thinking");
  });

  it("keeps hyphenated words", () => {
    expect(stripMarkdownForExcerpt("A well-known **claim**.")).toBe("A well-known claim.");
  });

  it("strips headings, fences, and links from a full body", () => {
    expect(
      stripMarkdownForExcerpt("# Title\n\n```js\nignore()\n```\nSee [Mishnah](https://example.com) and `code`."),
    ).toBe("See Mishnah and code.");
  });
});

describe("plainExcerpt", () => {
  it("caps length after stripping", () => {
    expect(plainExcerpt("**Hello** world", 5)).toBe("Hello");
  });
});
