export { ChangeApplier, FILE_SPACE, type AppliedChange, type ChangeSpace } from './ChangeApplier';
export {
  ChangeLedger,
  changeLedgerOf,
  type ChangeOutcome,
  type KeptResult,
  type UndoUnavailableReason,
} from './ChangeLedger';
export type { ChangeRecord, ReverseStep } from './ChangeRecord';
export { packChangeRecord, unpackChangeRecord, type PackedChangeRecord } from './recordCodec';
