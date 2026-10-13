import type { AuditEvent, SequenceDocument } from './model';

/** A bounded convenience journal, not an immutable experimental audit trail.
 * Old files are never compacted on import. Only a new operation rolls the journal;
 * the omitted count survives save/reopen and undo restores the exact prior state.
 */
export const MAX_HISTORY_EVENTS = 500;
export const HISTORY_BYTE_BUDGET = 512_000;
export function appendHistory(
  before: Pick<SequenceDocument, 'history' | 'historyOmitted'>,
  event: AuditEvent
): { history: AuditEvent[]; historyOmitted: number; notices: string[] } {
  const events = [...before.history, event];
  const encoder = new TextEncoder();
  // Indent at document depth and count UTF-8, not JS characters. This bounds the
  // pretty-printed journal rather than just its compact representation.
  const weights = events.map(e => encoder.encode(JSON.stringify(e, null, 2).replace(/^/gm, '    ')).length + 2);
  let bytes = weights.reduce((sum, weight) => sum + weight, 4);
  let drop = 0;
  while (events.length - drop > MAX_HISTORY_EVENTS || (bytes > HISTORY_BYTE_BUDGET && events.length - drop > 1)) {
    bytes -= weights[drop++];
  }
  const historyOmitted = before.historyOmitted + drop;
  if (!Number.isSafeInteger(historyOmitted)) throw new Error('Journal counter exceeds the supported integer range.');
  return {
    history: events.slice(drop), historyOmitted,
    notices: drop ? [`Journal retention: ${drop} older operation description(s) removed from this document; ${historyOmitted} omitted in total. Sequence, features, oligos and source archive are unchanged by retention. Keep earlier exports for the older descriptions.`] : []
  };
}
