import { describe, expect, it } from "vitest";
import { lexicalRetrieve, tokenize } from "./lexicalRetrieve";

describe("lexicalRetrieve", () => {
  it("ranks title and tag matches above weak excerpt noise", () => {
    expect(tokenize("The French Revolution & entropy")).toEqual(["french", "revolution", "entropy"]);

    const hits = lexicalRetrieve(
      [
        {
          id: "1",
          title: "Classroom entropy metaphors",
          excerpt: "Using thermodynamics language in history lessons",
          tags: ["Pedagogy & Instructional Design"],
        },
        {
          id: "2",
          title: "Attendance policy",
          excerpt: "French class lists and parent contact notes",
          tags: ["Educational Leadership & Policy"],
        },
        {
          id: "3",
          title: "French Revolution timeline",
          excerpt: "Causes, phases, and outcomes for Year 9",
          tags: ["History of Education", "Sociocultural Influences on Education"],
        },
      ],
      "French Revolution depth and complexity",
      2,
    );

    expect(hits[0]?.id).toBe("3");
    expect(hits.length).toBeGreaterThan(0);
  });
});
