function fold(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hide excerpts that are the title again, or just a longer/shorter cut of it. */
export function cardSupportingText(title: string, excerpt: string) {
  const heading = title.trim();
  const supporting = excerpt.trim();
  if (!supporting) return "";
  const titleFold = fold(heading);
  const excerptFold = fold(supporting);
  if (!excerptFold || !titleFold) return "";
  if (excerptFold === titleFold) return "";
  if (excerptFold.startsWith(titleFold) || titleFold.startsWith(excerptFold)) return "";
  return supporting;
}
