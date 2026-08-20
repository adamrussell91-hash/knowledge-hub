export type HubFilterOption = { value: string; label: string };

export type HubFilterControl = {
  el: HTMLButtonElement;
  getValue: () => string;
  setValue: (value: string) => void;
  setOptions: (options: HubFilterOption[], selected?: string) => void;
  dispose: () => void;
};

export function createHubFilter(options?: {
  key?: string;
  label?: string;
  defaultValue?: string;
  options?: Array<HubFilterOption | string>;
  value?: string;
  onChange?: (value: string) => void;
}): HubFilterControl;

export function bindHubFilter(
  btn: HTMLButtonElement,
  options?: { onChange?: (value: string) => void }
): HubFilterControl;
