export type WheelIntent = "zoom" | "pan" | "scroll";

export function wheelIntent(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  deltaX: number;
  deltaY: number;
}): WheelIntent {
  if (event.ctrlKey || event.metaKey) return "zoom";
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) + 1) return "pan";
  return "scroll";
}

export function wheelPanPixels(event: { shiftKey: boolean; deltaX: number; deltaY: number }) {
  return event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
}
