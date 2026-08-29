/**
 * One-shot parser for the Notion university export markdown.
 * Run: npx tsx scripts/parse-university-export.ts <export.md> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseUniversityExport } from "../src/university/timeline/parseExport";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: parse-university-export.ts <export.md> <out.json>");
  process.exit(1);
}

const catalogue = parseUniversityExport(readFileSync(input, "utf8"));
writeFileSync(output, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(
  `${catalogue.degrees.length} degrees, ${catalogue.degrees.reduce((n, d) => n + d.units.length, 0)} units, ${catalogue.degrees.reduce((n, d) => n + d.units.reduce((m, u) => m + u.assessments.length, 0), 0)} assessments`,
);
