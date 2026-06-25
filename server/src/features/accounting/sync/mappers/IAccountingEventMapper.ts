import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';

/**
 * Maps a single kind of AccountingEvent to a balanced PostEntryInput.
 *
 * The mapper owns the chart-of-accounts knowledge (which account debits/credits)
 * AND the money boundary (float currency → integer cents). It must NOT re-implement
 * the balance invariant — it only constructs equal legs; PostingService.postEntry
 * is the authority that validates Σdébito === Σcrédito.
 */
export interface IAccountingEventMapper {
  /** The event.sourceType this mapper handles (registry key). */
  readonly sourceType: AccountingEvent['sourceType'];
  /** Build the balanced posting input. Throws ValidationError on bad money. */
  map(event: AccountingEvent): PostEntryInput;
}
