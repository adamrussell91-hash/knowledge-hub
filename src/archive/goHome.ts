import { emptyOriginFilter, type OriginFilterState } from "./originFilter";

export type HubView = "list" | "graph" | "page" | "compose" | "chat" | "podcast" | "quiz";

export type HubHomeState<PageT = unknown, ComposeT = unknown> = {
  view: HubView;
  query: string;
  keywordFilter: string;
  originFilter: OriginFilterState;
  activePage: PageT | null;
  compose: ComposeT | null;
};

export function goHome<PageT, ComposeT>(state: HubHomeState<PageT, ComposeT>): HubHomeState<PageT, ComposeT> {
  return {
    ...state,
    view: "list",
    query: "",
    keywordFilter: "",
    originFilter: emptyOriginFilter(),
    activePage: null,
    compose: null,
  };
}
