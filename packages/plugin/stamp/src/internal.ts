/** @embedpdf/plugin-stamp/internal — the PDF conventions a library file follows; not for application code. */
export * from './host-contract';
export { createStampController } from './controller';
export { initialStampState, stampReducer } from './model';
export {
  parseStampKey,
  stampKey,
  customStampName,
  assetIdFor,
  stampLibraryPieceInfo,
  stampPieceInfo,
  stampKindToPdfName,
  libraryKindToPdfName,
  libraryKindFromPdfName,
  STAMP_LIBRARY_PIECEINFO_APP,
  STAMP_PIECEINFO_APP,
  STAMP_PIECEINFO_VERSION,
} from './convention';
export type { StampKey } from './convention';
