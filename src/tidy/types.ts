export type TidyProposal = {
  tags: string[];
  body: string;
  /** `null` (or an omitted model field) means retain the page title. */
  title: string | null;
};

export type TidyModelInput = {
  title: string;
  tags: string[];
  body: string;
};
