/** Closed topic vocabulary. Exact strings only. */
export const TOPIC_VOCABULARY = [
  "Learning Science and Cognition",
  "Motivation and Self Regulation",
  "Pedagogy and Instructional Design",
  "Assessment Feedback and Evaluation",
  "Curriculum Differentiation and Enrichment",
  "High Potential and High Ability Education",
  "Child and Adolescent Development",
  "Wellbeing Mental Health and Trauma",
  "Neurodiversity Inclusion and Disability",
  "Literacy Language and Communication",
  "Critical Creative and Higher Order Thinking",
  "Research Methods and Evidence Literacy",
  "Educational Leadership and Change",
  "Policy Ethics and Governance",
  "Technology AI and Digital Learning",
  "Sociocultural Diversity and Equity",
  "Classroom Culture and Engagement",
  "Teacher Practice and Professional Learning",
  "Higher Education and Academic Practice",
  "Philosophy Knowledge and Society",
] as const;

const LOOKUP = new Map(TOPIC_VOCABULARY.map(tag => [tag.toLowerCase(), tag]));

export function canonicalTopicTag(tag: string) {
  return LOOKUP.get(tag.trim().toLowerCase()) ?? null;
}
