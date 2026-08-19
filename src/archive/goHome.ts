export type HubView = "list" | "graph" | "page" | "compose" | "coach" | "podcast" | "quiz" | "wiki";

export type HubHomeState<PageT = unknown, ComposeT = unknown> = {
  view: HubView;
  query: string;
  keywordFilter: string;
  activePage: PageT | null;
  compose: ComposeT | null;
};

export function goHome<PageT, ComposeT>(state: HubHomeState<PageT, ComposeT>): HubHomeState<PageT, ComposeT> {
  return {
    ...state,
    view: "list",
    query: "",
    keywordFilter: "",
    activePage: null,
    compose: null,
  };
}
