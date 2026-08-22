/** Locked hub display date: always `dd/mm/yy`. */
export function formatDisplayDate(value: string | Date | null | undefined): string;

/** Inclusive range. Same day (or a missing end) collapses to one date. */
export function formatDisplayDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string;
