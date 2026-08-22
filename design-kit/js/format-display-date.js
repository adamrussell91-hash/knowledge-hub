/** Locked hub display date: always `dd/mm/yy`. Do not invent another format. */

const SYDNEY_TZ = 'Australia/Sydney';
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function fromYmd(year, month, day) {
  return `${pad2(day)}/${pad2(month)}/${String(year).slice(-2)}`;
}

function fromInstant(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SYDNEY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return fromYmd(Number(parts.year), Number(parts.month), Number(parts.day));
}

/**
 * Format a calendar day for the UI.
 *
 * Accepts `YYYY-MM-DD` (no timezone shift), `Date`, or an ISO timestamp
 * (Sydney calendar day). Empty / null → `''`. Unparseable strings pass through.
 *
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
export function formatDisplayDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : fromInstant(value);
  }
  const text = String(value).trim();
  if (!text) return '';
  const key = DATE_KEY.exec(text);
  if (key) return fromYmd(Number(key[1]), Number(key[2]), Number(key[3]));
  const ms = Date.parse(text);
  if (!Number.isNaN(ms)) return fromInstant(new Date(ms));
  return text;
}

/**
 * Inclusive range. Same day (or a missing end) collapses to one date.
 *
 * @param {string | Date | null | undefined} start
 * @param {string | Date | null | undefined} end
 * @returns {string}
 */
export function formatDisplayDateRange(start, end) {
  const left = formatDisplayDate(start);
  const right = formatDisplayDate(end);
  if (!left) return right;
  if (!right || left === right) return left;
  return `${left} – ${right}`;
}
