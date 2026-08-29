import { describe, expect, it } from "vitest";
import { parseUniversityExport } from "./parseExport";

const SAMPLE = `# University degrees

Generated on 2026-08-28T21:02:19+10:00 in Sydney local time.

## 1. Graduate Certificate in Child and Adolescent

### Degree properties

| Property | Value |
|:--|:--|
| Dates | {"end": "2019-12-31", "start": "2018-01-31"} |
| Description | Graduate Certificate in Child and Adolescent Welfare from Charles Sturt University |
| Name | Graduate Certificate in Child and Adolescent |
| Place | {"name": "Charles Sturt University"} |
| Status | Completed |
| Uni Type | Degree |

### Units

#### 1.1 PSY482 - Psychology of Human Development

| Property | Value |
|:--|:--|
| Dates | {"end": "2018-06-21", "start": "2018-02-01"} |
| GPA Calculator | 6 |
| Grade Scale | Distinction |
| Name | PSY482 - Psychology of Human Development |
| Status | Completed |
| Uni Type | Unit |

##### Assessments

###### 1.1.1 Assessment 1 - Essay

| Property | Value |
|:--|:--|
| Description | Exploring Gifted Education |
| GPA Calculator | Not recorded |
| Grade Scale | Not recorded |
| Name | Assessment 1 - Essay |
| Status | Completed |
| Uni Type | Assessment |
| Unit Number | PSY482 |
`;

describe("parseUniversityExport", () => {
  it("expands truncated degree titles and keeps unit grades plus nested assessments", () => {
    const catalogue = parseUniversityExport(SAMPLE);
    expect(catalogue.degrees).toHaveLength(1);
    const degree = catalogue.degrees[0]!;
    expect(degree.title).toBe("Graduate Certificate in Child and Adolescent Welfare");
    expect(degree.institution).toBe("Charles Sturt University");
    expect(parseUniversityExport(SAMPLE.replaceAll("Charles Sturt University", "Victoria University")).degrees[0]?.title).toBe(
      "Graduate Certificate in Child and Adolescent Mental Health",
    );
    expect(degree.units[0]?.code).toBe("PSY482");
    expect(degree.units[0]?.gpaPoints).toBe(6);
    expect(degree.units[0]?.grade).toBe("Distinction");
    expect(degree.units[0]?.assessments[0]?.title).toBe("Assessment 1 - Essay");
    expect(degree.units[0]?.assessments[0]?.kind).toBe("assessment");
  });
});
